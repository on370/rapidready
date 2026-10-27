use std::path::Path;
use std::io::{Cursor, Read, Seek, SeekFrom};
use image::ImageFormat;
use super::header_parser::{
    extract_jpeg_app1_thumbnail, find_cr3_thumbnail_in_slice, get_effective_orientation,
    parse_header_orientation, parse_tiff_header_slice, read_exif_orientation,
};
use super::RAW_EXTENSIONS;

pub fn orientation_to_degrees(tag: u32) -> u32 {
    match tag {
        1 => 0,
        6 => 90,
        3 => 180,
        8 => 270,
        _ => 0,
    }
}

pub fn rotate_by_degrees(img: image::DynamicImage, deg: u32) -> image::DynamicImage {
    match deg % 360 {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    }
}

pub fn apply_effective_orientation(
    img: image::DynamicImage,
    target_orient: Option<u32>,
    file_orient: Option<u32>,
) -> image::DynamicImage {
    let eff_target = target_orient.or(file_orient).unwrap_or(1);
    let target_deg = orientation_to_degrees(eff_target);
    let file_deg = orientation_to_degrees(file_orient.unwrap_or(1));

    // Determine what orientation thumb_rs already produced:
    // If file_deg was 90 or 270 (portrait), but img is landscape (width > height),
    // then thumb_rs did NOT apply file_deg (it left it at 0 deg).
    let current_deg = if (file_deg == 90 || file_deg == 270) && img.width() > img.height() {
        0
    } else {
        file_deg
    };

    let delta = (target_deg + 360 - (current_deg % 360)) % 360;
    rotate_by_degrees(img, delta)
}

pub fn create_exif_orientation_header(orient: u16) -> Vec<u8> {
    let mut header = Vec::with_capacity(34);
    header.extend_from_slice(&[0xFF, 0xE1]); // APP1 marker
    let length: u16 = 2 + 6 + 8 + 2 + 12 + 4; // 34 bytes
    header.extend_from_slice(&length.to_be_bytes());
    header.extend_from_slice(b"Exif\0\0");
    // TIFF header: Little-endian "II", 42, offset 8 to IFD0
    header.extend_from_slice(&[0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]);
    // IFD0: 1 tag
    header.extend_from_slice(&1u16.to_le_bytes());
    // Tag entry: Orientation (0x0112), SHORT (3), count 1, value
    header.extend_from_slice(&0x0112u16.to_le_bytes());
    header.extend_from_slice(&3u16.to_le_bytes());
    header.extend_from_slice(&1u32.to_le_bytes());
    header.extend_from_slice(&orient.to_le_bytes());
    header.extend_from_slice(&[0x00, 0x00]); // padding
    // Next IFD: 0
    header.extend_from_slice(&0u32.to_le_bytes());
    header
}

pub fn inject_orientation_into_jpeg(jpeg_bytes: &[u8], orient: u16) -> Vec<u8> {
    if jpeg_bytes.len() < 4 || jpeg_bytes[0] != 0xFF || jpeg_bytes[1] != 0xD8 {
        return jpeg_bytes.to_vec();
    }
    let app1 = create_exif_orientation_header(orient);
    let mut out = Vec::with_capacity(jpeg_bytes.len() + app1.len());
    out.extend_from_slice(&jpeg_bytes[..2]); // FF D8
    out.extend_from_slice(&app1);

    // Copy remainder of JPEG, skipping any existing APP1 segment (0xFF 0xE1)
    let mut pos = 2;
    while pos + 4 <= jpeg_bytes.len() {
        if jpeg_bytes[pos] != 0xFF {
            break;
        }
        let marker = jpeg_bytes[pos + 1];
        if marker == 0xDA || marker == 0xD9 || marker == 0x00 {
            break;
        }
        let seg_len = ((jpeg_bytes[pos + 2] as usize) << 8) | (jpeg_bytes[pos + 3] as usize);
        let next_pos = (pos + 2 + seg_len).min(jpeg_bytes.len());
        if marker == 0xE1 {
            // Skip this existing APP1 segment
            pos = next_pos;
            continue;
        }
        out.extend_from_slice(&jpeg_bytes[pos..next_pos]);
        pos = next_pos;
    }
    if pos < jpeg_bytes.len() {
        out.extend_from_slice(&jpeg_bytes[pos..]);
    }
    out
}

/// Quickly parses (width, height) of a JPEG buffer from its SOF0/SOF2 marker in < 0.001 ms.
pub fn parse_jpeg_dimensions(data: &[u8]) -> Option<(usize, usize)> {
    if data.len() < 10 || data[0] != 0xFF || data[1] != 0xD8 {
        return None;
    }
    let limit = data.len().min(65536);
    let mut pos = 2;
    while pos + 8 < limit {
        if data[pos] == 0xFF {
            let marker = data[pos + 1];
            if marker == 0xC0 || marker == 0xC2 {
                if pos + 9 <= limit {
                    let h = ((data[pos + 5] as usize) << 8) | (data[pos + 6] as usize);
                    let w = ((data[pos + 7] as usize) << 8) | (data[pos + 8] as usize);
                    if w > 0 && h > 0 {
                        return Some((w, h));
                    }
                }
            }
        }
        pos += 1;
    }
    None
}

pub fn extract_largest_embedded_jpeg(path: &Path, target_orient: Option<u32>) -> Option<Vec<u8>> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    // Only RAW containers embed full-resolution preview JPEGs. Standard raster images (JPEG, PNG, WebP)
    // must never be scanned for embedded streams (which would extract HDR gainmaps, motion photo clips, or thumbnails).
    if !RAW_EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }

    let mut file = std::fs::File::open(path).ok()?;
    let metadata = file.metadata().ok()?;
    let file_len = metadata.len() as usize;
    // Scan up to first 40MB or entire file
    let to_read = file_len.min(40 * 1024 * 1024);
    let mut data = vec![0u8; to_read];
    file.read_exact(&mut data).ok()?;

    let pattern = [0xFF, 0xD8, 0xFF];
    let mut largest_dims = (0, 0);
    let mut largest_info = None;

    let mut pos = 0;
    while pos + 3 <= data.len() {
        if let Some(offset) = data[pos..].windows(3).position(|w| w == pattern) {
            let start = pos + offset;
            let search_limit = (start + 524288).min(data.len());
            let mut sof_pos = start + 2;
            let mut dims = None;
            while sof_pos + 8 < search_limit {
                if data[sof_pos] == 0xFF && (data[sof_pos+1] == 0xC0 || data[sof_pos+1] == 0xC2) {
                    if sof_pos + 9 < search_limit {
                        let precision = data[sof_pos+4];
                        let h = ((data[sof_pos+5] as usize) << 8) | (data[sof_pos+6] as usize);
                        let w = ((data[sof_pos+7] as usize) << 8) | (data[sof_pos+8] as usize);
                        let num_components = data[sof_pos+9];
                        if precision == 8 && (num_components == 1 || num_components == 3) && w <= 16000 && h <= 16000 && w > 0 && h > 0 {
                            let aspect = (w as f32) / (h as f32);
                            if aspect >= 0.33 && aspect <= 3.0 {
                                dims = Some((w, h));
                                break;
                            }
                        }
                    }
                }
                sof_pos += 1;
            }

            if let Some((w, h)) = dims {
                if w * h > largest_dims.0 * largest_dims.1 {
                    largest_dims = (w, h);
                    largest_info = Some((start, w, h));
                }
            }
            pos = start + 1000;
        } else {
            break;
        }
    }

    let (start, w, h) = largest_info?;
    // Only accept if larger than 1200x800 to ensure high-resolution sensor preview
    if w * h < 1200 * 800 {
        return None;
    }

    // Find EOI marker FF D9
    let mut end = start + 1000;
    let mut found_end = None;
    while end + 1 < data.len() {
        if data[end] == 0xFF && data[end+1] == 0xD9 {
            found_end = Some(end + 2);
            break;
        }
        end += 1;
    }

    let jpeg_bytes = if let Some(end_pos) = found_end {
        &data[start..end_pos]
    } else {
        &data[start..]
    };

    let eff_orient = target_orient.or_else(|| get_effective_orientation(path)).unwrap_or(1);
    if eff_orient == 1 {
        Some(jpeg_bytes.to_vec())
    } else {
        Some(inject_orientation_into_jpeg(jpeg_bytes, eff_orient as u16))
    }
}

pub fn extract_embedded_thumbnail(path: &Path, target_orient: Option<u32>) -> Option<Vec<u8>> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut header = vec![0u8; 768 * 1024];
    let n = file.read(&mut header).ok()?;
    header.truncate(n);
    if header.len() < 16 {
        return None;
    }

    let mut detected_orient = None;
    let mut thumb_bytes = None;

    // 1. Standard JPEG APP1 IFD1 thumbnail
    if header.len() >= 2 && header[0] == 0xFF && header[1] == 0xD8 {
        if let Some((slice, orient)) = extract_jpeg_app1_thumbnail(&header) {
            thumb_bytes = Some(slice.to_vec());
            detected_orient = orient;
        }
    }

    // 2. Canon CR3 (ISOBMFF thmb box)
    if thumb_bytes.is_none() && header.len() >= 12 && (&header[4..8] == b"ftyp" || &header[4..8] == b"crx ") {
        if let Some(slice) = find_cr3_thumbnail_in_slice(&header) {
            if detected_orient.is_none() {
                detected_orient = parse_header_orientation(slice);
            }
            thumb_bytes = Some(slice.to_vec());
        }
    }

    // 3. TIFF-based RAW (CR2, ARW, NEF, DNG, PEF, ORF, etc.)
    if thumb_bytes.is_none() && (&header[0..2] == b"II" || &header[0..2] == b"MM") {
        let tiff_info = parse_tiff_header_slice(&header, 0);
        detected_orient = tiff_info.orientation;

        if let (Some(off), Some(len)) = (tiff_info.thumb_offset, tiff_info.thumb_length) {
            let off = off as usize;
            let len = len as usize;
            if off + len <= header.len() {
                let slice = &header[off..off + len];
                if slice.len() >= 2 && slice[0] == 0xFF && slice[1] == 0xD8 {
                    thumb_bytes = Some(slice.to_vec());
                }
            } else {
                // Exactly ONE seek and ONE read of `len` bytes
                if file.seek(SeekFrom::Start(off as u64)).is_ok() {
                    let mut data = vec![0u8; len];
                    if file.read_exact(&mut data).is_ok() && data.len() >= 2 && data[0] == 0xFF && data[1] == 0xD8 {
                        thumb_bytes = Some(data);
                    }
                }
            }
        }
    }

    // 4. Fujifilm RAF (FUJIFILMCCD-RAW)
    if thumb_bytes.is_none() && header.len() >= 92 && &header[0..16] == b"FUJIFILMCCD-RAW " {
        let jpeg_offset = u32::from_be_bytes([header[84], header[85], header[86], header[87]]) as usize;
        let jpeg_len = u32::from_be_bytes([header[88], header[89], header[90], header[91]]) as usize;
        if jpeg_offset > 0 && jpeg_len > 0 && jpeg_len <= 16 * 1024 * 1024 {
            if jpeg_offset + jpeg_len <= header.len() {
                let slice = &header[jpeg_offset..jpeg_offset + jpeg_len];
                if slice.len() >= 2 && slice[0] == 0xFF && slice[1] == 0xD8 {
                    if detected_orient.is_none() {
                        detected_orient = parse_header_orientation(slice);
                    }
                    thumb_bytes = Some(slice.to_vec());
                }
            } else if file.seek(SeekFrom::Start(jpeg_offset as u64)).is_ok() {
                let mut data = vec![0u8; jpeg_len];
                if file.read_exact(&mut data).is_ok() && data.len() >= 2 && data[0] == 0xFF && data[1] == 0xD8 {
                    if detected_orient.is_none() {
                        detected_orient = parse_header_orientation(&data);
                    }
                    thumb_bytes = Some(data);
                }
            }
        }
    }

    // 5. In-memory pattern scan within the 256 KB buffer (fallback for DNG / exotic RAWs)
    if thumb_bytes.is_none() {
        let pattern = [0xFF, 0xD8, 0xFF];
        let mut pos = 0;
        let mut best_thumb: Option<(usize, Vec<u8>)> = None;

        while pos + 4 <= header.len() {
            if let Some(offset) = header[pos..].windows(3).position(|w| w == pattern) {
                let start = pos + offset;
                if start + 4 > header.len() {
                    break;
                }
                let m3 = header[start + 3];
                // Byte 3 must be a valid JPEG marker: APPn (0xE0..=0xEF), DQT (0xDB), SOF/DHT (0xC0, 0xC2, 0xC4), COM (0xFE)
                if !matches!(m3, 0xE0..=0xEF | 0xDB | 0xC0 | 0xC2 | 0xC4 | 0xFE) {
                    pos = start + 1;
                    continue;
                }

                let search_limit = (start + 65536).min(header.len());
                let mut sof_pos = start + 2;
                let mut dims = None;

                while sof_pos + 8 < search_limit {
                    // If an EOI or another valid SOI is encountered before SOF, this candidate is invalid
                    if header[sof_pos] == 0xFF && header[sof_pos + 1] == 0xD9 {
                        break;
                    }
                    if sof_pos > start && header[sof_pos] == 0xFF && header[sof_pos + 1] == 0xD8 && sof_pos + 3 < search_limit {
                        let next_m3 = header[sof_pos + 3];
                        if matches!(next_m3, 0xE0..=0xEF | 0xDB | 0xC0 | 0xC2 | 0xC4 | 0xFE) {
                            break;
                        }
                    }

                    if header[sof_pos] == 0xFF && (header[sof_pos + 1] == 0xC0 || header[sof_pos + 1] == 0xC2) {
                        if sof_pos + 9 < search_limit {
                            let precision = header[sof_pos + 4];
                            let h = ((header[sof_pos + 5] as usize) << 8) | (header[sof_pos + 6] as usize);
                            let w = ((header[sof_pos + 7] as usize) << 8) | (header[sof_pos + 8] as usize);
                            let num_components = header[sof_pos + 9];

                            if precision == 8 && (num_components == 1 || num_components == 3) && w >= 160 && h >= 120 && w <= 16000 && h <= 16000 {
                                let aspect = (w as f32) / (h as f32);
                                if aspect >= 0.33 && aspect <= 3.0 {
                                    dims = Some((w, h));
                                    break;
                                }
                            }
                        }
                    }
                    sof_pos += 1;
                }

                if let Some((w, h)) = dims {
                    let mut end = start + 500;
                    let mut found_end = None;
                    while end + 1 < header.len() {
                        if header[end] == 0xFF && header[end + 1] == 0xD9 {
                            found_end = Some(end + 2);
                            break;
                        }
                        end += 1;
                    }

                    if let Some(end_pos) = found_end {
                        let area = w * h;
                        let is_better = match &best_thumb {
                            Some((best_area, _)) => area > *best_area,
                            None => true,
                        };
                        if is_better {
                            best_thumb = Some((area, header[start..end_pos].to_vec()));
                        }
                    }
                }
                pos = start + 1;
            } else {
                break;
            }
        }

        if let Some((_, bytes)) = best_thumb {
            thumb_bytes = Some(bytes);
        }
    }

    let raw_bytes = thumb_bytes?;

    let eff_orient = target_orient
        .or(detected_orient)
        .or_else(|| parse_header_orientation(&header))
        .unwrap_or(1);

    if eff_orient == 1 {
        Some(raw_bytes)
    } else {
        Some(inject_orientation_into_jpeg(&raw_bytes, eff_orient as u16))
    }
}

pub fn extract_raster_thumbnail(
    path: &Path,
    scale: u32,
    target_orient: Option<u32>,
) -> Option<Vec<u8>> {
    // Retry up to 3 times with 50ms pause in case writer process still holds a lock
    let mut open_res = image::ImageReader::open(path);
    for _ in 0..3 {
        if open_res.is_ok() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
        open_res = image::ImageReader::open(path);
    }
    let reader = open_res.ok()?.with_guessed_format().ok()?;
    let dyn_img = reader.decode().ok()?;

    let target_size = match scale {
        0 => 160,
        2 => 720,
        _ => 720,
    };

    let resized = dyn_img.thumbnail(target_size, target_size);
    let resolved_orient = target_orient.or_else(|| get_effective_orientation(path));
    let file_orient = read_exif_orientation(path);
    let rotated = apply_effective_orientation(resized, resolved_orient, file_orient);

    // Composite over dark card background (#18181b) if image has alpha,
    // avoiding pitch-black transparent pixel artifacts when encoding to JPEG.
    let rgb = if rotated.color().has_alpha() {
        let rgba = rotated.to_rgba8();
        let mut rgb = image::RgbImage::new(rgba.width(), rgba.height());
        for (x, y, pixel) in rgba.enumerate_pixels() {
            let a = pixel[3] as f32 / 255.0;
            // Background color #18181b (R: 24, G: 24, B: 27) matching app theme
            let r = (pixel[0] as f32 * a + 24.0 * (1.0 - a)) as u8;
            let g = (pixel[1] as f32 * a + 24.0 * (1.0 - a)) as u8;
            let b = (pixel[2] as f32 * a + 27.0 * (1.0 - a)) as u8;
            rgb.put_pixel(x, y, image::Rgb([r, g, b]));
        }
        rgb
    } else {
        rotated.into_rgb8()
    };

    let mut buffer = Cursor::new(Vec::new());
    rgb.write_to(&mut buffer, ImageFormat::Jpeg).ok()?;
    Some(buffer.into_inner())
}
