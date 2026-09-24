use std::path::Path;
use std::io::{BufReader, Cursor, Read, Seek, SeekFrom};
use std::sync::Mutex;
use std::num::NonZeroUsize;
use std::sync::LazyLock;
use image::{ImageFormat, RgbaImage};
use thumb_rs::{get_thumbnail, ThumbnailScale};
use anyhow::{Context, Result};
use lru::LruCache;

// In-memory LRU cache holding up to 10,000 thumbnail/preview JPEGs (~200MB RAM)
// Provides instantaneous ~0.01ms responses on repeat requests or grid scrolls
static THUMBNAIL_CACHE: LazyLock<Mutex<LruCache<String, Vec<u8>>>> = LazyLock::new(|| {
    Mutex::new(LruCache::new(NonZeroUsize::new(10000).unwrap()))
});

pub fn find_companion_jpeg(raw_path: &Path) -> Option<std::path::PathBuf> {
    let ext = raw_path.extension().and_then(|e| e.to_str())?.to_lowercase();
    let raw_exts = ["cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", "pef", "3fr", "x3f", "nrw", "rwl", "fff", "iiq", "crw", "erf"];
    if !raw_exts.contains(&ext.as_str()) {
        return None;
    }
    for candidate in &["jpg", "JPG", "jpeg", "JPEG"] {
        let companion = raw_path.with_extension(candidate);
        if companion.is_file() {
            return Some(companion);
        }
    }
    None
}

pub fn read_exif_orientation(path: &Path) -> Option<u32> {
    let file = std::fs::File::open(path).ok()?;
    let mut bufreader = std::io::BufReader::new(file);
    let exifreader = exif::Reader::new();
    let exif = exifreader.read_from_container(&mut bufreader).ok()?;
    let field = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)?;
    field.value.get_uint(0)
}

pub fn get_effective_orientation(path: &Path) -> Option<u32> {
    // 1. Check sidecar .rrdata first
    let sidecar_state = crate::culling::read_sidecar(path);
    if let Some(o) = sidecar_state.orientation {
        return Some(o);
    }
    // 2. Check image file EXIF directly (primary source of truth!)
    if let Some(o) = read_exif_orientation(path) {
        return Some(o);
    }
    // 3. Fall back to companion JPEG EXIF only if raw file had no readable EXIF
    if let Some(companion) = find_companion_jpeg(path) {
        if let Some(o) = read_exif_orientation(&companion) {
            return Some(o);
        }
    }
    None
}

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
    let target_deg = orientation_to_degrees(target_orient.unwrap_or(1));
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

    // If existing JPEG had an APP1 segment, skip it so we don't have conflicting EXIF blocks.
    // In JPEG syntax (ISO/IEC 10918-1 B.1.1.4):
    // Marker FF E1 is 2 bytes (bytes 2..3).
    // app1_len is 2 bytes (bytes 4..5), and its value includes the 2 length bytes.
    // Therefore, the payload ends at index 4 + app1_len.
    // The next marker begins at index 4 + app1_len.
    if jpeg_bytes.len() > 4 && jpeg_bytes[2] == 0xFF && jpeg_bytes[3] == 0xE1 {
        let app1_len = ((jpeg_bytes[4] as usize) << 8) | (jpeg_bytes[5] as usize);
        let mut skip_to = (4 + app1_len).min(jpeg_bytes.len());
        // Verify skip_to lands on a valid JPEG marker prefix (0xFF)
        while skip_to < jpeg_bytes.len() && jpeg_bytes[skip_to] != 0xFF {
            skip_to += 1;
        }
        out.extend_from_slice(&jpeg_bytes[skip_to..]);
    } else {
        out.extend_from_slice(&jpeg_bytes[2..]);
    }
    out
}

pub fn extract_largest_embedded_jpeg(path: &Path, target_orient: Option<u32>) -> Option<Vec<u8>> {
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
            let search_limit = (start + 65536).min(data.len());
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
    let mut bufreader = BufReader::new(&mut file);
    let exifreader = exif::Reader::new();
    let exif_res = exifreader.read_from_container(&mut bufreader).ok();

    let mut thumb_bytes = None;

    // 1. Try standard EXIF IFD1 thumbnail (fastest for Canon / Sony)
    if let Some(ref exif) = exif_res {
        if let Some(off_val) = exif.get_field(exif::Tag::JPEGInterchangeFormat, exif::In::THUMBNAIL).and_then(|f| f.value.get_uint(0)) {
            if let Some(len_val) = exif.get_field(exif::Tag::JPEGInterchangeFormatLength, exif::In::THUMBNAIL).and_then(|f| f.value.get_uint(0)) {
                let off = off_val as u64;
                let len = len_val as usize;

                if (off as usize) + len <= exif.buf().len() {
                    let slice = &exif.buf()[off as usize..(off as usize) + len];
                    if slice.len() >= 2 && slice[0] == 0xFF && slice[1] == 0xD8 {
                        thumb_bytes = Some(slice.to_vec());
                    }
                }

                if thumb_bytes.is_none() {
                    if file.seek(SeekFrom::Start(off)).is_ok() {
                        let mut bytes = vec![0u8; len];
                        if file.read_exact(&mut bytes).is_ok() && bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xD8 {
                            thumb_bytes = Some(bytes);
                        }
                    }
                }
            }
        }
    }

    // 2. Fallback for DNG (Ricoh GR, Leica, DJI, etc.) and other RAWs without IFD1 JPEGInterchangeFormat:
    // Scan the first 4 MB for an embedded preview JPEG (Ricoh GR DNG has a 720x480 preview at ~95KB)
    if thumb_bytes.is_none() {
        let _ = file.seek(SeekFrom::Start(0));
        let mut data = vec![0u8; 4 * 1024 * 1024];
        if let Ok(n) = file.read(&mut data) {
            data.truncate(n);
            let pattern = [0xFF, 0xD8, 0xFF];
            let mut pos = 0;
            while pos + 3 <= data.len() {
                if let Some(offset) = data[pos..].windows(3).position(|w| w == pattern) {
                    let start = pos + offset;
                    let search_limit = (start + 65536).min(data.len());
                    let mut sof_pos = start + 2;
                    let mut dims = None;
                    while sof_pos + 8 < search_limit {
                        if data[sof_pos] == 0xFF && (data[sof_pos+1] == 0xC0 || data[sof_pos+1] == 0xC2) {
                            let h = ((data[sof_pos+5] as usize) << 8) | (data[sof_pos+6] as usize);
                            let w = ((data[sof_pos+7] as usize) << 8) | (data[sof_pos+8] as usize);
                            dims = Some((w, h));
                            break;
                        }
                        sof_pos += 1;
                    }

                    if let Some((w, h)) = dims {
                        if w >= 160 && h >= 120 {
                            let mut end = start + 500;
                            while end + 1 < data.len() {
                                if data[end] == 0xFF && data[end+1] == 0xD9 {
                                    thumb_bytes = Some(data[start..=end+1].to_vec());
                                    break;
                                }
                                end += 1;
                            }
                            if thumb_bytes.is_some() {
                                break;
                            }
                        }
                    }
                    pos = start + 1000;
                } else {
                    break;
                }
            }
        }
    }

    let raw_bytes = thumb_bytes?;

    let eff_orient = target_orient.or_else(|| {
        exif_res.as_ref().and_then(|exif| {
            exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
                .and_then(|f| f.value.get_uint(0))
        })
    }).unwrap_or(1);

    if eff_orient == 1 {
        Some(raw_bytes)
    } else {
        let deg = orientation_to_degrees(eff_orient);
        if deg == 0 {
            Some(raw_bytes)
        } else if let Ok(img) = image::load_from_memory(&raw_bytes) {
            let rotated = rotate_by_degrees(img, deg);
            let rgb = rotated.into_rgb8();
            let mut out = Cursor::new(Vec::with_capacity(raw_bytes.len()));
            if rgb.write_to(&mut out, ImageFormat::Jpeg).is_ok() {
                Some(out.into_inner())
            } else {
                Some(inject_orientation_into_jpeg(&raw_bytes, eff_orient as u16))
            }
        } else {
            Some(inject_orientation_into_jpeg(&raw_bytes, eff_orient as u16))
        }
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
        _ => 384,
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

pub fn get_preview_jpeg_with_orient(
    path: &Path,
    scale: u32,
    target_orient: Option<u32>,
) -> Result<Vec<u8>> {
    let resolved_orient = target_orient.or_else(|| get_effective_orientation(path));
    let mtime = std::fs::metadata(path).and_then(|m| m.modified()).ok();
    let cache_key = format!("{}:{}:{}:{:?}", path.to_string_lossy(), scale, resolved_orient.unwrap_or(1), mtime);
    
    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

    // Fast-path 1: For PNG and WebP files, decode directly with pure-Rust image decoder!
    // This avoids Windows Shell / OS thumbnail delays, 32x32 generic file icons,
    // and network share thumbnail blocks.
    if ext == "png" || ext == "webp" {
        if let Some(raster_bytes) = extract_raster_thumbnail(path, scale, resolved_orient) {
            if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                cache.put(cache_key, raster_bytes.clone());
            }
            return Ok(raster_bytes);
        }
    }

    // Fast-path 2:
    // For scale == 0: directly use extract_embedded_thumbnail (160x120 for Sony/Canon, 720x480 for DNG).
    if scale == 0 {
        if let Some(fast_bytes) = extract_embedded_thumbnail(path, resolved_orient) {
            if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                cache.put(cache_key, fast_bytes.clone());
            }
            return Ok(fast_bytes);
        }
    }
    
    // Standard path: Use thumb_rs with requested scale (minimum scale 1, since scale 0 produces a 16x16 icon)
    let thumb_scale = ThumbnailScale(scale.max(1));
    let thumb_res = get_thumbnail(path, thumb_scale);

    // If thumb_rs returned a generic OS file icon (e.g. <=32px or transparent first pixel) or failed:
    let is_file_icon = match &thumb_res {
        Ok(t) => t.width <= 32 || t.height <= 32 || (t.rgba.len() >= 4 && t.rgba[3] == 0),
        Err(_) => true,
    };

    if is_file_icon {
        // Fallback 1: Extract embedded thumbnail from RAW/DNG (720x480 or 160x120)
        if let Some(fast_bytes) = extract_embedded_thumbnail(path, resolved_orient) {
            if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                cache.put(cache_key, fast_bytes.clone());
            }
            return Ok(fast_bytes);
        }

        // Fallback 2: Extract largest embedded JPEG directly from RAW container
        if let Some(full_bytes) = extract_largest_embedded_jpeg(path, resolved_orient) {
            if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                cache.put(cache_key, full_bytes.clone());
            }
            return Ok(full_bytes);
        }

        // Fallback 3: Standard raster images (PNG, JPG, WebP, TIFF, BMP) decoded directly in pure Rust!
        if let Some(raster_bytes) = extract_raster_thumbnail(path, scale, resolved_orient) {
            if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                cache.put(cache_key, raster_bytes.clone());
            }
            return Ok(raster_bytes);
        }
    }

    let thumb = thumb_res.map_err(|e| anyhow::anyhow!("thumb_rs error: {:?}", e))?;
        
    let img = RgbaImage::from_raw(thumb.width, thumb.height, thumb.rgba)
        .context("Failed to construct RgbaImage from raw bytes")?;
    let dyn_img = image::DynamicImage::ImageRgba8(img);
    
    let file_orient = read_exif_orientation(path);
    let rotated_img = apply_effective_orientation(dyn_img, resolved_orient, file_orient);
    let rgb_img = rotated_img.into_rgb8();
        
    let mut buffer = Cursor::new(Vec::new());
    rgb_img.write_to(&mut buffer, ImageFormat::Jpeg)
        .context("Failed to encode JPEG")?;
        
    let bytes = buffer.into_inner();
    
    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
        cache.put(cache_key, bytes.clone());
    }
        
    Ok(bytes)
}

pub fn get_preview_jpeg(path: &Path, scale: u32) -> Result<Vec<u8>> {
    get_preview_jpeg_with_orient(path, scale, None)
}

pub fn get_max_preview_jpeg_with_orient(path: &Path, explicit_orient: Option<u32>) -> Result<Vec<u8>> {
    let target_orient = explicit_orient.or_else(|| get_effective_orientation(path));
    let mtime = std::fs::metadata(path).and_then(|m| m.modified()).ok();
    let cache_key = format!("{}:fullres:{}:{:?}", path.to_string_lossy(), target_orient.unwrap_or(1), mtime);
    
    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }

    // 1. Fast path: Extract largest embedded full-res JPEG directly from RAW container
    // Provides full 20-60 MP sensor resolution in < 20ms instead of QuickLook downscaling!
    if let Some(bytes) = extract_largest_embedded_jpeg(path, target_orient) {
        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
            cache.put(cache_key, bytes.clone());
        }
        return Ok(bytes);
    }

    // macOS QLThumbnailGenerator returns a generic 1024x1024 or 512x512 file icon
    // if the requested scale is larger than the embedded preview.
    // We try descending scales to find the largest actual preview (scale 10 is ~2560px, ideal for fast 2K/4K display)
    let mut best_thumb = None;

    #[cfg(target_os = "windows")]
    let scales = [4, 2];
    #[cfg(not(target_os = "windows"))]
    let scales = [10, 8, 4, 2];

    for scale in scales {
        if let Ok(thumb) = get_thumbnail(path, ThumbnailScale(scale)) {
            if thumb.rgba.len() >= 4 && thumb.rgba[3] == 0 {
                continue;
            }
            best_thumb = Some(thumb);
            break;
        }
    }
    
    if let Some(thumb) = best_thumb {
        let img = RgbaImage::from_raw(thumb.width, thumb.height, thumb.rgba)
            .context("Failed to construct RgbaImage from raw bytes")?;
            
        let dyn_img = image::DynamicImage::ImageRgba8(img);
        let file_orient = read_exif_orientation(path);
        let rotated_img = apply_effective_orientation(dyn_img, target_orient, file_orient);
        let rgb_img = rotated_img.into_rgb8();
        
        let mut buffer = Cursor::new(Vec::new());
        rgb_img.write_to(&mut buffer, ImageFormat::Jpeg)
            .context("Failed to encode JPEG")?;
            
        let bytes = buffer.into_inner();
        
        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
            cache.put(cache_key, bytes.clone());
        }
            
        return Ok(bytes);
    }

    // Fallback: If thumb_rs could not produce a preview on Windows/macOS, extract any embedded thumbnail
    if let Some(fast_bytes) = extract_embedded_thumbnail(path, target_orient) {
        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
            cache.put(cache_key, fast_bytes.clone());
        }
        return Ok(fast_bytes);
    }

    anyhow::bail!("Failed to extract a valid preview for {:?}", path);
}

pub fn get_max_preview_jpeg(path: &Path) -> Result<Vec<u8>> {
    get_max_preview_jpeg_with_orient(path, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    #[test]
    fn test_find_companion_jpeg() {
        let temp_dir = std::env::temp_dir().join(format!("rr_thumb_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let raw_path = temp_dir.join("IMG_0001.CR3");
        let jpg_path = temp_dir.join("IMG_0001.JPG");
        
        let _ = File::create(&raw_path);
        let _ = File::create(&jpg_path);

        let companion = find_companion_jpeg(&raw_path);
        assert!(companion.is_some());
        assert!(companion.unwrap().exists());

        let non_raw = temp_dir.join("IMG_0002.png");
        assert_eq!(find_companion_jpeg(&non_raw), None);

        let _ = std::fs::remove_file(&raw_path);
        let _ = std::fs::remove_file(&jpg_path);
        let _ = std::fs::remove_dir(&temp_dir);
    }

    #[test]
    fn test_get_preview_jpeg_real_files() {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();
        
        let jpg_path = workspace_root.join("testdata").join("dest").join("2014").join("2014-08-25").join("DSC03058.JPG");
        assert!(jpg_path.exists(), "Test JPG file must exist: {:?}", jpg_path);
        let res = get_preview_jpeg(&jpg_path, 1);
        assert!(res.is_ok(), "JPG thumbnail failed: {:?}", res.err());
        assert!(!res.unwrap().is_empty());

        let arw_path = workspace_root.join("testdata").join("dest").join("2015").join("2015-03-24").join("DSC06201.ARW");
        if arw_path.exists() {
            let res = get_preview_jpeg(&arw_path, 1);
            assert!(res.is_ok(), "ARW thumbnail failed: {:?}", res.err());
            assert!(!res.unwrap().is_empty());
        }

        let cr2_path = workspace_root.join("testdata").join("dest").join("2014").join("2014-05-01").join("IMG_2978.CR2");
        if cr2_path.exists() {
            let res = get_preview_jpeg(&cr2_path, 1);
            assert!(res.is_ok(), "CR2 thumbnail failed: {:?}", res.err());
            assert!(!res.unwrap().is_empty());
        }

        let cr2_portrait = workspace_root.join("testdata").join("dest").join("2014").join("2014-05-01").join("IMG_3126.CR2");
        if cr2_portrait.exists() {
            let thumb = get_thumbnail(&cr2_portrait, ThumbnailScale(1)).unwrap();
            println!("CR2 portrait thumb: width={}, height={}", thumb.width, thumb.height);
            let res = get_max_preview_jpeg(&cr2_portrait).unwrap();
            let img = image::load_from_memory(&res).unwrap();
            println!("CR2 max preview: width={}, height={}", img.width(), img.height());
            let dng_portrait = workspace_root.join("testdata").join("dest").join("2023").join("2023-10-03").join("DSC02298.ARW");
            if dng_portrait.exists() {
                let res = get_preview_jpeg(&dng_portrait, 1).unwrap();
                let img = image::load_from_memory(&res).unwrap();
                assert!(img.height() > img.width(), "Portrait ARW thumbnail must be portrait! Got {}x{}", img.width(), img.height());

                let res2 = get_max_preview_jpeg(&dng_portrait).unwrap();
                let img2 = image::load_from_memory(&res2).unwrap();
                println!("ARW max preview: width={}, height={}", img2.width(), img2.height());
                assert_eq!(img2.width(), 6192);
                assert_eq!(img2.height(), 4128);
                // Verify EXIF orientation tag is set to 8 (portrait) for WebKit/browser auto-rotation
                let mut cursor = std::io::Cursor::new(&res2);
                let exifreader = exif::Reader::new();
                let exif = exifreader.read_from_container(&mut cursor).expect("Max preview must have EXIF");
                let orient = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY).and_then(|f| f.value.get_uint(0));
                assert_eq!(orient, Some(8), "ARW max preview must have EXIF orientation 8");
            }
        }
    }

    #[test]
    fn test_check_exif_orientations() {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();
        
        let test_files = [
            workspace_root.join("testdata/dest/2014/2014-05-01/IMG_3126.CR2"),
            workspace_root.join("testdata/dest/2014/2014-05-01/IMG_3191.CR2"),
            workspace_root.join("testdata/dest/2023/2023-10-03/DSC02298.ARW"),
            workspace_root.join("testdata/dest/2023/2023-10-03/DSC02313.ARW"),
            workspace_root.join("testdata/dest/2015/2015-03-24/DSC06201.ARW"),
            workspace_root.join("testdata/dest/2015/2015-03-24/DSC06207.ARW"),
            workspace_root.join("testdata/dest/2015/2015-03-24/DSC06208.ARW"),
            workspace_root.join("testdata/dest/2015/2015-03-24/DSC06216.ARW"),
            workspace_root.join("testdata/src/Bilder/R0002008.DNG"),
            workspace_root.join("testdata/dest/2014/2014-08-25/DSC03058.JPG"),
        ];

        for p in &test_files {
            if !p.exists() { continue; }
            let orient = read_exif_orientation(p);
            let effective = get_effective_orientation(p);
            assert!(orient.is_some() || effective.is_some());
        }
    }

    #[test]
    fn test_apply_orientation_logic() {
        use image::{Rgba, ImageBuffer};
        // Create 300x200 landscape test image
        let img = image::DynamicImage::ImageRgba8(ImageBuffer::from_pixel(300, 200, Rgba([255, 0, 0, 255])));
        assert_eq!(img.width(), 300);
        assert_eq!(img.height(), 200);

        // Orientation 6 on unrotated landscape: Should rotate to 200x300 portrait
        let rot6 = apply_effective_orientation(img.clone(), Some(6), Some(1));
        assert_eq!(rot6.width(), 200);
        assert_eq!(rot6.height(), 300);

        // Orientation 6 when thumb_rs already rotated to portrait: Should NOT rotate again
        let rot6_again = apply_effective_orientation(rot6.clone(), Some(6), Some(6));
        assert_eq!(rot6_again.width(), 200);
        assert_eq!(rot6_again.height(), 300);

        // Orientation 8 on unrotated landscape: Should rotate to 200x300 portrait
        let rot8 = apply_effective_orientation(img.clone(), Some(8), Some(1));
        assert_eq!(rot8.width(), 200);
        assert_eq!(rot8.height(), 300);

        // Orientation 1: Should remain 300x200
        let rot1 = apply_effective_orientation(img.clone(), Some(1), Some(1));
        assert_eq!(rot1.width(), 300);
        assert_eq!(rot1.height(), 200);
    }

    #[test]
    fn test_extract_embedded_thumbnail() {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();

        let jpg_path = workspace_root.join("testdata/dest/2014/2014-08-25/DSC03058.JPG");
        if jpg_path.exists() {
            let thumb = extract_embedded_thumbnail(&jpg_path, None);
            assert!(thumb.is_some(), "Must extract embedded thumbnail from JPEG");
            let bytes = thumb.unwrap();
            assert!(bytes.len() > 1000);
            assert_eq!(bytes[0], 0xFF);
            assert_eq!(bytes[1], 0xD8);
        }

        let arw_path = workspace_root.join("testdata/dest/2023/2023-10-03/DSC02298.ARW");
        if arw_path.exists() {
            let thumb = extract_embedded_thumbnail(&arw_path, None);
            assert!(thumb.is_some(), "Must extract embedded thumbnail from ARW");
            let bytes = thumb.unwrap();
            let img = image::load_from_memory(&bytes).unwrap();
            // DSC02298.ARW is orientation 8 (portrait) -> extracted thumbnail should be portrait
            assert!(img.height() > img.width(), "Rotated thumbnail must be portrait! Got {}x{}", img.width(), img.height());
        }
    }

    #[test]
    fn test_inject_orientation_into_jpeg() {
        // 1. JPEG without existing APP1
        let fake_jpeg = vec![0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xD9];
        let injected = inject_orientation_into_jpeg(&fake_jpeg, 8);
        assert!(injected.len() > fake_jpeg.len());
        let mut cursor = std::io::Cursor::new(&injected);
        let exifreader = exif::Reader::new();
        let exif = exifreader.read_from_container(&mut cursor).expect("Must read injected EXIF");
        let orient = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY).and_then(|f| f.value.get_uint(0));
        assert_eq!(orient, Some(8));

        // 2. JPEG with EXISTING APP1 segment - must cleanly replace APP1 without truncating following markers (e.g. FF DB)
        let fake_with_app1 = vec![
            0xFF, 0xD8,                         // SOI (bytes 0, 1)
            0xFF, 0xE1, 0x00, 0x08,             // APP1 marker (bytes 2, 3) + length 8 bytes (bytes 4, 5)
            b'E', b'x', b'i', b'f', 0x00, 0x00, // 6 bytes data (total 8 bytes: 2 len + 6 data) (bytes 6-11)
            0xFF, 0xDB, 0x00, 0x04, 0x11, 0x22, // Next marker: DQT at index 12 (must NOT be truncated!)
            0xFF, 0xD9                          // EOI
        ];
        let injected_replaced = inject_orientation_into_jpeg(&fake_with_app1, 6);
        let mut cursor2 = std::io::Cursor::new(&injected_replaced);
        let exif2 = exifreader.read_from_container(&mut cursor2).expect("Must read replaced EXIF");
        let orient2 = exif2.get_field(exif::Tag::Orientation, exif::In::PRIMARY).and_then(|f| f.value.get_uint(0));
        assert_eq!(orient2, Some(6));

        // Verify that FF DB is preserved immediately following the new APP1!
        let app1_new_len = ((injected_replaced[4] as usize) << 8) | (injected_replaced[5] as usize);
        let next_marker_pos = 4 + app1_new_len;
        assert_eq!(injected_replaced[next_marker_pos], 0xFF, "Next marker must start with 0xFF");
        assert_eq!(injected_replaced[next_marker_pos + 1], 0xDB, "Next marker must be 0xDB (Quantization Table)");
    }

    #[test]
    fn test_extract_largest_embedded_jpeg_sensor_resolution() {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();

        let arw_path = workspace_root.join("testdata/dest/2023/2023-10-03/DSC02298.ARW");
        if arw_path.exists() {
            let res = extract_largest_embedded_jpeg(&arw_path, Some(8));
            assert!(res.is_some(), "Must extract largest embedded JPEG from Sony ARW");
            let bytes = res.unwrap();
            let img = image::load_from_memory(&bytes).unwrap();
            // Sony A7 sensor preview is 6192x4128!
            assert_eq!(img.width(), 6192);
            assert_eq!(img.height(), 4128);
        }

        let cr2_path = workspace_root.join("testdata/dest/2014/2014-05-01/IMG_3126.CR2");
        if cr2_path.exists() {
            let res = extract_largest_embedded_jpeg(&cr2_path, Some(6));
            assert!(res.is_some(), "Must extract largest embedded JPEG from Canon CR2");
            let bytes = res.unwrap();
            let img = image::load_from_memory(&bytes).unwrap();
            // Canon EOS sensor preview is 5472x3648!
            assert_eq!(img.width(), 5472);
            assert_eq!(img.height(), 3648);
        }

        let dng_path = workspace_root.join("testdata/src/Bilder/R0002008.DNG");
        if dng_path.exists() {
            // Test scale 0 (must NOT be a 16x16 file icon!)
            let p0 = get_preview_jpeg(&dng_path, 0).expect("Must generate preview for DNG at scale 0");
            let img0 = image::load_from_memory(&p0).expect("Must decode DNG scale 0 JPEG");
            assert!(img0.width() >= 160 && img0.height() >= 120, "Scale 0 preview must not be a 16x16 icon! Got {}x{}", img0.width(), img0.height());

            // Test scale 1
            let p1 = get_preview_jpeg(&dng_path, 1).expect("Must generate preview for DNG at scale 1");
            let img1 = image::load_from_memory(&p1).expect("Must decode DNG scale 1 JPEG");
            assert!(img1.width() >= 160 && img1.height() >= 120, "Scale 1 preview must be valid photo");

            // Test embedded thumbnail direct extractor
            let thumb = extract_embedded_thumbnail(&dng_path, Some(1)).expect("Must extract embedded thumbnail from DNG");
            let img_thumb = image::load_from_memory(&thumb).expect("Must decode embedded DNG thumbnail");
            assert_eq!(img_thumb.width(), 720);
            assert_eq!(img_thumb.height(), 480);
        }
    }

    #[test]
    fn test_heic_file_handling() {
        let heic_path = std::path::Path::new("/Volumes/RICOH GR/DCIM/IMG_5195.HEIC");
        if heic_path.exists() {
            let date = crate::date_resolver::get_creation_date(heic_path);
            println!("HEIC creation date: {:?}", date);
            assert!(date.is_ok(), "Failed to get HEIC creation date: {:?}", date.err());

            let preview_scale_1 = get_preview_jpeg(heic_path, 1);
            assert!(preview_scale_1.is_ok(), "Failed to get preview at scale 1: {:?}", preview_scale_1.err());
            let bytes = preview_scale_1.unwrap();
            let img = image::load_from_memory(&bytes).expect("Decoded scale 1 JPEG");
            println!("HEIC scale 1 preview dimensions: {}x{}", img.width(), img.height());
            assert!(img.width() > 32 && img.height() > 32, "Thumbnail too small: {}x{}", img.width(), img.height());

            let max_preview = get_max_preview_jpeg(heic_path);
            assert!(max_preview.is_ok(), "Failed to get max preview: {:?}", max_preview.err());
            let max_bytes = max_preview.unwrap();
            let max_img = image::load_from_memory(&max_bytes).expect("Decoded max preview JPEG");
            println!("HEIC max preview dimensions: {}x{}", max_img.width(), max_img.height());
            assert!(max_img.width() >= 1000, "Max preview should be high-res: {}x{}", max_img.width(), max_img.height());

            let meta = crate::metadata_resolver::get_image_metadata(heic_path);
            println!("HEIC metadata: camera={:?}, lens={:?}, iso={:?}, shutter={:?}, aperture={:?}, lat={:?}, lon={:?}",
                meta.camera, meta.lens, meta.iso, meta.shutter, meta.aperture, meta.latitude, meta.longitude);
        }
    }

    #[test]
    fn test_video_thumbnail() {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();
        let video_path = workspace_root.join("testdata/dest/2025/2025-06-24/DJI_20250624215644_0019_D.MP4");
        if video_path.exists() {
            // Test standard grid thumbnail (scale 1)
            let thumb1 = get_preview_jpeg(&video_path, 1).expect("Video thumbnail at scale 1 must succeed");
            let img1 = image::load_from_memory(&thumb1).expect("Decoded scale 1 JPEG");
            assert!(img1.width() > 32 && img1.height() > 32, "Thumbnail must be valid dimensions, got {}x{}", img1.width(), img1.height());
            
            // Verify not a black blank frame
            let rgb = img1.to_rgb8();
            let mut sum: u64 = 0;
            for p in rgb.pixels() {
                sum += (p[0] as u64 + p[1] as u64 + p[2] as u64) / 3;
            }
            let avg_lum = sum / (rgb.width() as u64 * rgb.height() as u64);
            assert!(avg_lum > 0, "Video thumbnail should not be completely black");

            // Test small scale 0 thumbnail
            let thumb0 = get_preview_jpeg(&video_path, 0).expect("Video thumbnail at scale 0 must succeed");
            let img0 = image::load_from_memory(&thumb0).expect("Decoded scale 0 JPEG");
            assert!(img0.width() > 32 && img0.height() > 32);

            // Test full-res poster frame preview (scale 10 / max)
            let max_thumb = get_max_preview_jpeg(&video_path).expect("Video max preview must succeed");
            let img_max = image::load_from_memory(&max_thumb).expect("Decoded max preview JPEG");
            assert!(img_max.width() >= 1200, "Max preview should be high resolution poster frame, got {}x{}", img_max.width(), img_max.height());
        }
    }

    #[test]
    fn test_thumbnail_png() {
        let temp_dir = std::env::temp_dir().join(format!("rapidready_test_png_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        // 1. Opaque PNG
        let png_path = temp_dir.join("test_opaque.png");
        let img = image::RgbImage::from_fn(400, 300, |x, y| {
            image::Rgb([(x % 255) as u8, (y % 255) as u8, 128])
        });
        img.save(&png_path).unwrap();

        let thumb_res = thumb_rs::get_thumbnail(&png_path, thumb_rs::ThumbnailScale(1));
        println!("Opaque PNG thumb_rs result: {:?}", thumb_res.as_ref().map(|t| (t.width, t.height, t.rgba.len())));
        let preview = get_preview_jpeg(&png_path, 1);
        println!("Opaque PNG get_preview_jpeg: {:?}", preview.as_ref().map(|b| b.len()));

        // 2. Transparent PNG (pixel 0,0 transparent)
        let png_trans_path = temp_dir.join("test_trans.png");
        let img_trans = image::RgbaImage::from_fn(400, 300, |x, y| {
            if x < 50 && y < 50 {
                image::Rgba([0, 0, 0, 0])
            } else {
                image::Rgba([200, 100, 50, 255])
            }
        });
        img_trans.save(&png_trans_path).unwrap();

        let thumb_trans_res = thumb_rs::get_thumbnail(&png_trans_path, thumb_rs::ThumbnailScale(1));
        println!("Transparent PNG thumb_rs result: {:?}", thumb_trans_res.as_ref().map(|t| (t.width, t.height, t.rgba.len())));
        let preview_trans = get_preview_jpeg(&png_trans_path, 1);
        println!("Transparent PNG get_preview_jpeg: {:?}", preview_trans.as_ref().map(|b| b.len()));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_user_files_inspection() {
        let files = [
            r"C:\Users\ole\Pictures\2026\2026-09-22\R0002848.DNG",
            r"C:\Users\ole\Pictures\2026\2026-09-22\R0002845.DNG",
            r"C:\Users\ole\Pictures\2026\2026-09-22\R0002844.DNG",
        ];

        for f in &files {
            let path = Path::new(f);
            println!("\n========================================================");
            println!("Testing file: {:?}", path);
            if !path.exists() {
                println!("File does not exist!");
                continue;
            }
            let file_size = std::fs::metadata(path).unwrap().len();
            println!("File size: {} MB", file_size / (1024 * 1024));

            for orient_test in [None, Some(1), Some(6), Some(8)] {
                let max_preview = get_max_preview_jpeg_with_orient(path, orient_test);
                match max_preview {
                    Ok(bytes) => {
                        assert!(!bytes.is_empty(), "Preview bytes should not be empty");
                        let img = image::load_from_memory(&bytes).expect("Preview must decode cleanly for all orientations");
                        assert!(img.width() >= 1000 && img.height() >= 1000, "Preview must be full-res");
                    }
                    Err(e) => {
                        panic!("Failed to extract preview for {:?} with orient {:?}: {:?}", path, orient_test, e);
                    }
                }
            }
        }
    }
}


