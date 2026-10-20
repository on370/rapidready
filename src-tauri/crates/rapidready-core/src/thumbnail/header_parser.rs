use std::path::Path;
use std::io::{Read, Seek, SeekFrom};
use super::find_companion_jpeg;

#[derive(Debug, Clone, Default)]
pub struct HeaderTiffInfo {
    pub thumb_offset: Option<u32>,
    pub thumb_length: Option<u32>,
    pub orientation: Option<u32>,
}

fn read_tiff_u16(buf: &[u8], offset: usize, is_le: bool) -> Option<u16> {
    if offset + 2 > buf.len() {
        return None;
    }
    let bytes = [buf[offset], buf[offset + 1]];
    Some(if is_le { u16::from_le_bytes(bytes) } else { u16::from_be_bytes(bytes) })
}

fn read_tiff_u32(buf: &[u8], offset: usize, is_le: bool) -> Option<u32> {
    if offset + 4 > buf.len() {
        return None;
    }
    let bytes = [buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]];
    Some(if is_le { u32::from_le_bytes(bytes) } else { u32::from_be_bytes(bytes) })
}

pub fn parse_tiff_header_slice(buf: &[u8], base_offset: u32) -> HeaderTiffInfo {
    if buf.len() < 8 {
        return HeaderTiffInfo::default();
    }
    let is_le = if &buf[0..2] == b"II" {
        true
    } else if &buf[0..2] == b"MM" {
        false
    } else {
        return HeaderTiffInfo::default();
    };

    let magic = read_tiff_u16(buf, 2, is_le);
    if magic != Some(42) && magic != Some(43) && magic != Some(85) && magic != Some(0x4f52) && magic != Some(0x5352) {
        return HeaderTiffInfo::default();
    }

    let ifd0 = match read_tiff_u32(buf, 4, is_le) {
        Some(off) => off as usize,
        None => return HeaderTiffInfo::default(),
    };

    let mut info = HeaderTiffInfo::default();
    let mut to_visit = vec![ifd0];
    let mut visited = std::collections::HashSet::new();
    let mut candidates: Vec<(u32, u32)> = Vec::new();

    while let Some(ifd_off) = to_visit.pop() {
        if !visited.insert(ifd_off) || ifd_off + 2 > buf.len() {
            continue;
        }
        let num_entries = match read_tiff_u16(buf, ifd_off, is_le) {
            Some(n) => n as usize,
            None => continue,
        };
        let max_safe = num_entries.min((buf.len().saturating_sub(ifd_off + 2)) / 12);

        let mut ifd_jpeg_off = None;
        let mut ifd_jpeg_len = None;
        let mut ifd_is_explicit_jpeg = false;
        let mut ifd_strip_off = None;
        let mut ifd_strip_len = None;
        let mut ifd_compression = None;

        for i in 0..max_safe {
            let entry = ifd_off + 2 + i * 12;
            let tag = match read_tiff_u16(buf, entry, is_le) {
                Some(t) => t,
                None => break,
            };
            let count = read_tiff_u32(buf, entry + 4, is_le).unwrap_or(0);
            let val = read_tiff_u32(buf, entry + 8, is_le).unwrap_or(0);

            match tag {
                0x0103 => {
                    // Tag 0x0103 is a TIFF SHORT (16-bit). Some camera firmwares (e.g. Canon EOS 350D / Digic II, Olympus)
                    // leave the upper 16 bits of the 4-byte value field uninitialized with stack garbage.
                    let comp = read_tiff_u16(buf, entry + 8, is_le).unwrap_or((val & 0xFFFF) as u16) as u32;
                    ifd_compression = Some(comp);
                }
                0x0112 => {
                    let orient = read_tiff_u16(buf, entry + 8, is_le).unwrap_or(1) as u32;
                    if (1..=8).contains(&orient) && info.orientation.is_none() {
                        info.orientation = Some(orient);
                    }
                }
                0x0201 => {
                    ifd_jpeg_off = Some(base_offset + val);
                    ifd_is_explicit_jpeg = true;
                }
                0x0202 => {
                    ifd_jpeg_len = Some(val);
                }
                0x002E => {
                    // Panasonic Lumix: JpgFromRaw offset
                    ifd_jpeg_off = Some(base_offset + val);
                    ifd_is_explicit_jpeg = true;
                }
                0x002F => {
                    // Panasonic Lumix: JpgFromRaw length
                    ifd_jpeg_len = Some(val);
                }
                0x0280 => {
                    // Olympus / Minolta: PreviewImage offset
                    ifd_jpeg_off = Some(base_offset + val);
                    ifd_is_explicit_jpeg = true;
                }
                0x0111 => {
                    // StripOffsets: Canon CR2 / TIFF embedded preview JPEG offset
                    if ifd_strip_off.is_none() {
                        ifd_strip_off = Some(base_offset + val);
                    }
                }
                0x0117 => {
                    // StripByteCounts: Canon CR2 / TIFF embedded preview JPEG length
                    if ifd_strip_len.is_none() {
                        ifd_strip_len = Some(val);
                    }
                }
                0x014A => {
                    if count == 1 {
                        to_visit.push(val as usize);
                    } else if count > 1 && count <= 16 {
                        let arr_off = val as usize;
                        for k in 0..count as usize {
                            if let Some(sub_off) = read_tiff_u32(buf, arr_off + k * 4, is_le) {
                                to_visit.push(sub_off as usize);
                            }
                        }
                    }
                }
                0x8769 => {
                    // ExifIFD
                    to_visit.push(val as usize);
                }
                _ => {}
            }
        }

        if ifd_is_explicit_jpeg {
            if let (Some(off), Some(len)) = (ifd_jpeg_off, ifd_jpeg_len) {
                if len > 500 && len <= 8_000_000 {
                    let rel_off = off.saturating_sub(base_offset) as usize;
                    let is_valid_jpeg = if rel_off + 2 <= buf.len() {
                        buf[rel_off] == 0xFF && buf[rel_off + 1] == 0xD8
                    } else {
                        true
                    };
                    if is_valid_jpeg {
                        candidates.push((off, len));
                    }
                }
            }
        } else if let (Some(off), Some(len)) = (ifd_strip_off, ifd_strip_len) {
            // StripOffsets (0x0111) is ONLY a valid JPEG stream if Compression is 6 (old JPEG) or 7 (new JPEG).
            // Uncompressed RAW sensor strips (Compression 1) or full raw sensor streams (> 8 MB) must be ignored.
            let is_jpeg_comp = matches!(ifd_compression, Some(6) | Some(7));
            if is_jpeg_comp && len > 500 && len <= 8_000_000 {
                let rel_off = off.saturating_sub(base_offset) as usize;
                let is_valid_jpeg = if rel_off + 2 <= buf.len() {
                    buf[rel_off] == 0xFF && buf[rel_off + 1] == 0xD8
                } else {
                    true
                };
                if is_valid_jpeg {
                    candidates.push((off, len));
                }
            }
        }

        let next_ptr = ifd_off + 2 + num_entries * 12;
        if next_ptr + 4 <= buf.len() {
            if let Some(next_ifd) = read_tiff_u32(buf, next_ptr, is_le) {
                if next_ifd > 0 && (next_ifd as usize) < buf.len() {
                    to_visit.push(next_ifd as usize);
                }
            }
        }
    }

    // Pick the best candidate:
    // First priority: A medium preview JPEG (40 KB .. 1.5 MB, typ. 720px - 1620px, ideal for grid & fast SMB)
    let preview_candidate = candidates.iter()
        .filter(|(_, len)| *len >= 40_000 && *len <= 1_500_000)
        .min_by_key(|(_, len)| *len)
        .or_else(|| {
            // Second priority: Large/Full preview JPEG (1.5 MB .. 8 MB) located near file start (<= 2 MB offset, e.g. Canon CR2 5472x3648 IFD0 preview at ~95 KB)
            candidates.iter()
                .filter(|(off, len)| *off <= 2_000_000 && *len > 1_500_000 && *len <= 8_000_000)
                .min_by_key(|(_, len)| *len)
        });

    if let Some(&(off, len)) = preview_candidate {
        info.thumb_offset = Some(off);
        info.thumb_length = Some(len);
    } else {
        // Fallback: A candidate whose full bytes lie entirely within the buffer (0 extra network reads!)
        let in_memory_candidate = candidates.iter().find(|(off, len)| {
            let rel_off = off.saturating_sub(base_offset) as usize;
            let rel_len = *len as usize;
            rel_off + rel_len <= buf.len()
                && buf[rel_off] == 0xFF
                && buf[rel_off + 1] == 0xD8
        });

        if let Some(&(off, len)) = in_memory_candidate {
            info.thumb_offset = Some(off);
            info.thumb_length = Some(len);
        } else if let Some(&(off, len)) = candidates.iter().filter(|(off, len)| *off <= 2_000_000 && *len <= 3_500_000).min_by_key(|(_, len)| *len) {
            info.thumb_offset = Some(off);
            info.thumb_length = Some(len);
        } else if let Some(&(off, len)) = candidates.iter().find(|(off, _)| *off <= 2_000_000) {
            info.thumb_offset = Some(off);
            info.thumb_length = Some(len);
        }
    }

    info
}

pub fn extract_jpeg_app1_thumbnail(buf: &[u8]) -> Option<(&[u8], Option<u32>)> {
    if buf.len() < 4 || buf[0] != 0xFF || buf[1] != 0xD8 {
        return None;
    }
    let mut pos = 2;
    while pos + 4 < buf.len() {
        if buf[pos] != 0xFF {
            break;
        }
        let marker = buf[pos + 1];
        if marker == 0xDA || marker == 0xD9 {
            break;
        }
        let seg_len = ((buf[pos + 2] as usize) << 8) | (buf[pos + 3] as usize);
        if pos + 2 + seg_len > buf.len() {
            break;
        }
        if marker == 0xE1 && seg_len >= 14 && &buf[pos + 4..pos + 10] == b"Exif\0\0" {
            let tiff_start = pos + 10;
            let tiff_buf = &buf[tiff_start..pos + 2 + seg_len];
            let info = parse_tiff_header_slice(tiff_buf, tiff_start as u32);
            if let (Some(off), Some(len)) = (info.thumb_offset, info.thumb_length) {
                let off = off as usize;
                let len = len as usize;
                if off + len <= buf.len() && buf[off] == 0xFF && buf[off + 1] == 0xD8 {
                    return Some((&buf[off..off + len], info.orientation));
                }
            }
            return None;
        }
        pos += 2 + seg_len;
    }
    None
}

pub fn find_cr3_thumbnail_in_slice(buf: &[u8]) -> Option<&[u8]> {
    // 1. Try finding high-resolution preview box "prvw" (typ. 1620x1080)
    if let Some(slice) = find_cr3_box_jpeg(buf, b"prvw") {
        return Some(slice);
    }
    // 2. Fallback to micro-thumbnail box "thmb" (160x120)
    find_cr3_box_jpeg(buf, b"thmb")
}

fn find_cr3_box_jpeg<'a>(buf: &'a [u8], pattern: &[u8; 4]) -> Option<&'a [u8]> {
    for i in 0..buf.len().saturating_sub(16) {
        if &buf[i..i + 4] == pattern {
            let box_start = if i >= 4 { i - 4 } else { i };
            let box_len = if i >= 4 {
                u32::from_be_bytes([buf[i - 4], buf[i - 3], buf[i - 2], buf[i - 1]]) as usize
            } else {
                buf.len() - box_start
            };
            let search_limit = (box_start + box_len).min(buf.len());
            for j in i + 4..search_limit.saturating_sub(4) {
                if buf[j] == 0xFF && buf[j + 1] == 0xD8 && buf[j + 2] == 0xFF {
                    for k in (j + 200..search_limit.saturating_sub(1)).rev() {
                        if buf[k] == 0xFF && buf[k + 1] == 0xD9 {
                            return Some(&buf[j..=k + 1]);
                        }
                    }
                }
            }
        }
    }
    None
}

pub fn parse_header_orientation(buf: &[u8]) -> Option<u32> {
    if buf.len() < 8 {
        return None;
    }
    // 0. Fujifilm RAF
    if buf.len() >= 92 && &buf[0..16] == b"FUJIFILMCCD-RAW " {
        let jpeg_offset = u32::from_be_bytes([buf[84], buf[85], buf[86], buf[87]]) as usize;
        let jpeg_len = u32::from_be_bytes([buf[88], buf[89], buf[90], buf[91]]) as usize;
        if jpeg_offset > 0 && jpeg_offset < buf.len() {
            let end = (jpeg_offset + jpeg_len).min(buf.len());
            if let Some(o) = parse_header_orientation(&buf[jpeg_offset..end]) {
                return Some(o);
            }
        }
    }
    // 1. JPEG APP1
    if buf.len() >= 4 && buf[0] == 0xFF && buf[1] == 0xD8 {
        let mut pos = 2;
        while pos + 4 < buf.len() {
            if buf[pos] != 0xFF {
                break;
            }
            let marker = buf[pos + 1];
            if marker == 0xDA || marker == 0xD9 {
                break;
            }
            let seg_len = ((buf[pos + 2] as usize) << 8) | (buf[pos + 3] as usize);
            if pos + 2 + seg_len > buf.len() {
                break;
            }
            if marker == 0xE1 && seg_len >= 14 && &buf[pos + 4..pos + 10] == b"Exif\0\0" {
                let tiff_start = pos + 10;
                let tiff_buf = &buf[tiff_start..pos + 2 + seg_len];
                let info = parse_tiff_header_slice(tiff_buf, 0);
                if info.orientation.is_some() {
                    return info.orientation;
                }
            }
            pos += 2 + seg_len;
        }
    }
    // 2. TIFF / RAW
    if &buf[0..2] == b"II" || &buf[0..2] == b"MM" {
        let info = parse_tiff_header_slice(buf, 0);
        if info.orientation.is_some() {
            return info.orientation;
        }
    }
    // 3. Fallback to kamadak-exif read_raw on header slice (only for TIFF containers)
    if &buf[0..2] == b"II" || &buf[0..2] == b"MM" {
        let mut reader = exif::Reader::new();
        reader.continue_on_error(true);
        let exif = match reader.read_raw(buf.to_vec()) {
            Ok(e) => e,
            Err(exif::Error::PartialResult(pr)) => pr.into_inner().0,
            Err(_) => return None,
        };
        let field = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)?;
        return field.value.get_uint(0);
    }
    None
}

pub fn read_exif_orientation(path: &Path) -> Option<u32> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut header = vec![0u8; 256 * 1024];
    let n = file.read(&mut header).ok()?;
    header.truncate(n);
    if let Some(o) = parse_header_orientation(&header) {
        return Some(o);
    }

    // For TIFF/RAW files (Sony ARW, Canon CR2, Nikon NEF, DNG, etc.):
    // NEVER call read_from_container on TIFFs over SMB because kamadak-exif unconditionally
    // executes `read_to_end` downloading the ENTIRE 25-45 MB file over SMB!
    if header.len() >= 2 && (&header[0..2] == b"II" || &header[0..2] == b"MM") {
        let mut large_buf = vec![0u8; 2 * 1024 * 1024];
        if file.seek(SeekFrom::Start(0)).is_ok() {
            if let Ok(n2) = file.read(&mut large_buf) {
                large_buf.truncate(n2);
                if let Some(o) = parse_header_orientation(&large_buf) {
                    return Some(o);
                }
            }
        }
        return None;
    }

    // Only for non-TIFF containers (JPEG, HEIF, PNG, WebP) where read_from_container
    // is safe and only parses metadata boxes without reading to EOF:
    let _ = file.seek(SeekFrom::Start(0));
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
