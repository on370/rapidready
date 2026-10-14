use std::path::Path;
use std::io::{Cursor, Read, Seek, SeekFrom};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::num::NonZeroUsize;
use std::sync::LazyLock;
use image::{ImageFormat, RgbaImage};
use thumb_rs::{get_thumbnail, ThumbnailScale};
use anyhow::{Context, Result};
use lru::LruCache;

pub static WARMUP_TOKEN: AtomicU64 = AtomicU64::new(0);

pub fn cancel_warmup_cache() {
    WARMUP_TOKEN.fetch_add(1, Ordering::SeqCst);
}

static ACTIVE_VIEWPORT_REQUESTS: AtomicUsize = AtomicUsize::new(0);
static LAST_VIEWPORT_ACTIVITY: AtomicU64 = AtomicU64::new(0);
static ACTIVE_FOLDER: Mutex<Option<String>> = Mutex::new(None);

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub struct ViewportRequestGuard;

impl Drop for ViewportRequestGuard {
    fn drop(&mut self) {
        ACTIVE_VIEWPORT_REQUESTS.fetch_sub(1, Ordering::SeqCst);
        LAST_VIEWPORT_ACTIVITY.store(now_millis(), Ordering::SeqCst);
    }
}

/// Registers an active interactive viewport request from Tauri protocol handler.
/// While this guard is held (and for 200ms following), background thumbnail generation yields.
pub fn register_viewport_request() -> ViewportRequestGuard {
    ACTIVE_VIEWPORT_REQUESTS.fetch_add(1, Ordering::SeqCst);
    LAST_VIEWPORT_ACTIVITY.store(now_millis(), Ordering::SeqCst);
    ViewportRequestGuard
}

/// Returns true if interactive viewport requests are actively in-flight or occurred within 40ms.
pub fn is_viewport_active() -> bool {
    if ACTIVE_VIEWPORT_REQUESTS.load(Ordering::Relaxed) > 0 {
        return true;
    }
    let last = LAST_VIEWPORT_ACTIVITY.load(Ordering::Relaxed);
    let now = now_millis();
    now.saturating_sub(last) < 40
}

/// Cooperatively pauses while viewport activity is taking place.
pub fn wait_while_viewport_active(controller: Option<&crate::archive::ScanController>) -> bool {
    while is_viewport_active() {
        if let Some(ctrl) = controller {
            if ctrl.is_cancelled() {
                return false;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    true
}

pub fn set_active_folder(folder: Option<String>) {
    if let Ok(mut lock) = ACTIVE_FOLDER.lock() {
        *lock = folder.map(|f| crate::archive_catalog::normalize_canonical_path(&f));
    }
}

pub fn get_active_folder() -> Option<String> {
    if let Ok(lock) = ACTIVE_FOLDER.lock() {
        lock.clone()
    } else {
        None
    }
}

static ACTIVE_VIEWPORT_PATHS: LazyLock<Mutex<Option<Vec<String>>>> = LazyLock::new(|| Mutex::new(None));

pub fn set_active_viewport_paths(paths: Vec<String>) {
    if let Ok(mut lock) = ACTIVE_VIEWPORT_PATHS.lock() {
        *lock = Some(paths);
    }
}

pub fn get_active_viewport_paths() -> Option<Vec<String>> {
    if let Ok(lock) = ACTIVE_VIEWPORT_PATHS.lock() {
        lock.clone()
    } else {
        None
    }
}

// In-memory LRU cache holding up to 10,000 thumbnail/preview JPEGs (~200MB RAM)
// Provides instantaneous ~0.01ms responses on repeat requests or grid scrolls
static THUMBNAIL_CACHE: LazyLock<Mutex<LruCache<String, Vec<u8>>>> = LazyLock::new(|| {
    Mutex::new(LruCache::new(NonZeroUsize::new(10000).unwrap()))
});

pub const RAW_EXTENSIONS: &[&str] = &[
    "cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", "pef", "3fr", "x3f", "nrw", "rwl", "fff", "iiq", "crw", "erf",
];

pub fn find_companion_jpeg(raw_path: &Path) -> Option<std::path::PathBuf> {
    let ext = raw_path.extension().and_then(|e| e.to_str())?.to_lowercase();
    if !RAW_EXTENSIONS.contains(&ext.as_str()) {
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

        for i in 0..max_safe {
            let entry = ifd_off + 2 + i * 12;
            let tag = match read_tiff_u16(buf, entry, is_le) {
                Some(t) => t,
                None => break,
            };
            let count = read_tiff_u32(buf, entry + 4, is_le).unwrap_or(0);
            let val = read_tiff_u32(buf, entry + 8, is_le).unwrap_or(0);

            match tag {
                0x0112 => {
                    let orient = read_tiff_u16(buf, entry + 8, is_le).unwrap_or(1) as u32;
                    if (1..=8).contains(&orient) && info.orientation.is_none() {
                        info.orientation = Some(orient);
                    }
                }
                0x0201 => {
                    ifd_jpeg_off = Some(base_offset + val);
                }
                0x0202 => {
                    ifd_jpeg_len = Some(val);
                }
                0x0111 => {
                    // StripOffsets: Canon CR2 / TIFF embedded preview JPEG offset
                    if ifd_jpeg_off.is_none() {
                        ifd_jpeg_off = Some(base_offset + val);
                    }
                }
                0x0117 => {
                    // StripByteCounts: Canon CR2 / TIFF embedded preview JPEG length
                    if ifd_jpeg_len.is_none() {
                        ifd_jpeg_len = Some(val);
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
                    to_visit.push(val as usize);
                }
                _ => {}
            }
        }

        if let (Some(off), Some(len)) = (ifd_jpeg_off, ifd_jpeg_len) {
            if len > 500 {
                candidates.push((off, len));
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
            candidates.iter()
                .filter(|(_, len)| *len > 1_500_000 && *len <= 3_500_000)
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
        } else if let Some(&(off, len)) = candidates.iter().filter(|(_, len)| *len <= 3_500_000).min_by_key(|(_, len)| *len) {
            info.thumb_offset = Some(off);
            info.thumb_length = Some(len);
        } else if let Some(&(off, len)) = candidates.first() {
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
    let mut header = vec![0u8; 256 * 1024];
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

    // 4. In-memory pattern scan within the 256 KB buffer (fallback for DNG / exotic RAWs)
    if thumb_bytes.is_none() {
        let pattern = [0xFF, 0xD8, 0xFF];
        let mut pos = 0;
        while pos + 3 <= header.len() {
            if let Some(offset) = header[pos..].windows(3).position(|w| w == pattern) {
                let start = pos + offset;
                let search_limit = (start + 65536).min(header.len());
                let mut sof_pos = start + 2;
                let mut dims = None;
                while sof_pos + 8 < search_limit {
                    if header[sof_pos] == 0xFF && (header[sof_pos + 1] == 0xC0 || header[sof_pos + 1] == 0xC2) {
                        let h = ((header[sof_pos + 5] as usize) << 8) | (header[sof_pos + 6] as usize);
                        let w = ((header[sof_pos + 7] as usize) << 8) | (header[sof_pos + 8] as usize);
                        dims = Some((w, h));
                        break;
                    }
                    sof_pos += 1;
                }

                if let Some((w, h)) = dims {
                    if w >= 160 && h >= 120 {
                        let mut end = start + 500;
                        while end + 1 < header.len() {
                            if header[end] == 0xFF && header[end + 1] == 0xD9 {
                                thumb_bytes = Some(header[start..=end + 1].to_vec());
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

#[cfg(target_os = "macos")]
mod imageio {
    use std::ffi::c_void;
    use std::path::Path;

    #[link(name = "ImageIO", kind = "framework")]
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        pub fn CFURLCreateFromFileSystemRepresentation(
            allocator: *const c_void,
            buffer: *const u8,
            buf_len: isize,
            is_directory: bool,
        ) -> *mut c_void;
        pub fn CGImageSourceCreateWithURL(url: *const c_void, options: *const c_void) -> *mut c_void;
        pub fn CGImageSourceCreateThumbnailAtIndex(isrc: *const c_void, index: usize, options: *const c_void) -> *mut c_void;
        pub fn CGImageDestinationCreateWithData(data: *mut c_void, uti: *const c_void, count: usize, options: *const c_void) -> *mut c_void;
        pub fn CGImageDestinationAddImage(dest: *mut c_void, image: *const c_void, properties: *const c_void);
        pub fn CGImageDestinationFinalize(dest: *mut c_void) -> bool;
        pub fn CGImageRelease(image: *const c_void);
        pub fn CFRelease(cf: *const c_void);
        #[allow(dead_code)]
        pub fn CGImageSourceCreateWithData(data: *const c_void, options: *const c_void) -> *mut c_void;
        #[allow(dead_code)]
        pub fn CFDataCreate(allocator: *const c_void, bytes: *const u8, length: isize) -> *mut c_void;
        pub fn CFDataCreateMutable(allocator: *const c_void, capacity: isize) -> *mut c_void;
        pub fn CFDataGetLength(data: *const c_void) -> isize;
        pub fn CFDataGetBytePtr(data: *const c_void) -> *const u8;
        pub fn CFDictionaryCreate(
            allocator: *const c_void,
            keys: *const *const c_void,
            values: *const *const c_void,
            num_values: isize,
            key_callbacks: *const c_void,
            val_callbacks: *const c_void,
        ) -> *mut c_void;
        pub fn CFNumberCreate(allocator: *const c_void, the_type: isize, value_ptr: *const c_void) -> *mut c_void;
        pub fn CFStringCreateWithCString(allocator: *const c_void, c_str: *const std::ffi::c_char, encoding: u32) -> *mut c_void;

        pub static kCFTypeDictionaryKeyCallBacks: c_void;
        pub static kCFTypeDictionaryValueCallBacks: c_void;
        pub static kCFBooleanTrue: *const c_void;
        pub static kCFBooleanFalse: *const c_void;

        #[allow(dead_code)]
        pub static kCGImageSourceCreateThumbnailFromImageAlways: *const c_void;
        #[allow(dead_code)]
        pub static kCGImageSourceCreateThumbnailFromImageIfAbsent: *const c_void;
        pub static kCGImageSourceCreateThumbnailWithTransform: *const c_void;
        pub static kCGImageSourceThumbnailMaxPixelSize: *const c_void;
        pub static kCGImageSourceShouldCache: *const c_void;
    }

    #[allow(dead_code)]
    pub fn extract_thumbnail_from_data(data: &[u8], max_pixel_size: u32) -> Option<Vec<u8>> {
        unsafe {
            let cf_data = CFDataCreate(std::ptr::null(), data.as_ptr(), data.len() as isize);
            if cf_data.is_null() {
                return None;
            }

            let keys = [kCGImageSourceShouldCache];
            let values = [kCFBooleanFalse];
            let src_options = CFDictionaryCreate(
                std::ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                1,
                &kCFTypeDictionaryKeyCallBacks,
                &kCFTypeDictionaryValueCallBacks,
            );

            let isrc = CGImageSourceCreateWithData(cf_data, src_options);
            if !src_options.is_null() {
                CFRelease(src_options);
            }
            CFRelease(cf_data);

            if isrc.is_null() {
                return None;
            }

            let size_val: i32 = max_pixel_size as i32;
            let cf_size = CFNumberCreate(std::ptr::null(), 3 /* kCFNumberSInt32Type */, &size_val as *const i32 as *const c_void);

            let thumb_keys = [
                kCGImageSourceCreateThumbnailFromImageAlways,
                kCGImageSourceCreateThumbnailWithTransform,
                kCGImageSourceThumbnailMaxPixelSize,
                kCGImageSourceShouldCache,
            ];
            let thumb_values = [
                kCFBooleanTrue,
                kCFBooleanFalse,
                cf_size as *const c_void,
                kCFBooleanFalse,
            ];

            let thumb_options = CFDictionaryCreate(
                std::ptr::null(),
                thumb_keys.as_ptr(),
                thumb_values.as_ptr(),
                4,
                &kCFTypeDictionaryKeyCallBacks,
                &kCFTypeDictionaryValueCallBacks,
            );

            let cg_image = CGImageSourceCreateThumbnailAtIndex(isrc, 0, thumb_options);

            if !cf_size.is_null() {
                CFRelease(cf_size);
            }
            if !thumb_options.is_null() {
                CFRelease(thumb_options);
            }
            CFRelease(isrc);

            if cg_image.is_null() {
                return None;
            }

            let mutable_data = CFDataCreateMutable(std::ptr::null(), 0);
            let uti = CFStringCreateWithCString(std::ptr::null(), c"public.jpeg".as_ptr(), 0x08000100 /* kCFStringEncodingUTF8 */);
            let dest = CGImageDestinationCreateWithData(mutable_data, uti, 1, std::ptr::null());

            CGImageDestinationAddImage(dest, cg_image, std::ptr::null());
            let success = CGImageDestinationFinalize(dest);

            CGImageRelease(cg_image);
            if !dest.is_null() {
                CFRelease(dest);
            }
            if !uti.is_null() {
                CFRelease(uti);
            }

            if !success || mutable_data.is_null() {
                if !mutable_data.is_null() {
                    CFRelease(mutable_data);
                }
                return None;
            }

            let len = CFDataGetLength(mutable_data) as usize;
            let ptr = CFDataGetBytePtr(mutable_data);
            let result = if !ptr.is_null() && len > 0 {
                let slice = std::slice::from_raw_parts(ptr, len);
                Some(slice.to_vec())
            } else {
                None
            };

            CFRelease(mutable_data);
            result
        }
    }

    pub fn extract_thumbnail(path: &Path, max_pixel_size: u32) -> Option<Vec<u8>> {
        let path_str = path.to_str()?;
        let path_bytes = path_str.as_bytes();

        unsafe {
            let url = CFURLCreateFromFileSystemRepresentation(
                std::ptr::null(),
                path_bytes.as_ptr(),
                path_bytes.len() as isize,
                false,
            );
            if url.is_null() {
                return None;
            }

            // ImageSource options: don't cache full image in memory
            let keys = [kCGImageSourceShouldCache];
            let values = [kCFBooleanFalse];
            let src_options = CFDictionaryCreate(
                std::ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                1,
                &kCFTypeDictionaryKeyCallBacks,
                &kCFTypeDictionaryValueCallBacks,
            );

            let isrc = CGImageSourceCreateWithURL(url, src_options);
            if !src_options.is_null() {
                CFRelease(src_options);
            }
            CFRelease(url);

            if isrc.is_null() {
                return None;
            }

            // Thumbnail options: always create thumbnail, with EXIF transform, max pixel size
            let size_val: i32 = max_pixel_size as i32;
            let cf_size = CFNumberCreate(std::ptr::null(), 3 /* kCFNumberSInt32Type */, &size_val as *const i32 as *const c_void);

            let thumb_keys = [
                kCGImageSourceCreateThumbnailFromImageAlways,
                kCGImageSourceCreateThumbnailWithTransform,
                kCGImageSourceThumbnailMaxPixelSize,
                kCGImageSourceShouldCache,
            ];
            let thumb_values = [
                kCFBooleanTrue,
                kCFBooleanTrue,
                cf_size as *const c_void,
                kCFBooleanFalse,
            ];

            let thumb_options = CFDictionaryCreate(
                std::ptr::null(),
                thumb_keys.as_ptr(),
                thumb_values.as_ptr(),
                4,
                &kCFTypeDictionaryKeyCallBacks,
                &kCFTypeDictionaryValueCallBacks,
            );

            let cg_image = CGImageSourceCreateThumbnailAtIndex(isrc, 0, thumb_options);

            if !cf_size.is_null() {
                CFRelease(cf_size);
            }
            if !thumb_options.is_null() {
                CFRelease(thumb_options);
            }
            CFRelease(isrc);

            if cg_image.is_null() {
                return None;
            }

            // Encode to JPEG using CGImageDestination
            let mutable_data = CFDataCreateMutable(std::ptr::null(), 0);
            let uti = CFStringCreateWithCString(std::ptr::null(), c"public.jpeg".as_ptr(), 0x08000100 /* kCFStringEncodingUTF8 */);
            let dest = CGImageDestinationCreateWithData(mutable_data, uti, 1, std::ptr::null());

            CGImageDestinationAddImage(dest, cg_image, std::ptr::null());
            let success = CGImageDestinationFinalize(dest);

            CGImageRelease(cg_image);
            if !dest.is_null() {
                CFRelease(dest);
            }
            if !uti.is_null() {
                CFRelease(uti);
            }

            if !success || mutable_data.is_null() {
                if !mutable_data.is_null() {
                    CFRelease(mutable_data);
                }
                return None;
            }

            let len = CFDataGetLength(mutable_data) as usize;
            let ptr = CFDataGetBytePtr(mutable_data);
            let result = if !ptr.is_null() && len > 0 {
                let slice = std::slice::from_raw_parts(ptr, len);
                Some(slice.to_vec())
            } else {
                None
            };

            CFRelease(mutable_data);
            result
        }
    }
}

pub fn extract_macos_imageio_thumbnail(path: &Path, max_pixel_size: u32) -> Option<Vec<u8>> {
    #[cfg(target_os = "macos")]
    {
        imageio::extract_thumbnail(path, max_pixel_size)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, max_pixel_size);
        None
    }
}

pub fn make_l1_cache_key(path: &Path, scale: u32, orient: u32, mtime_sec: i64) -> String {
    if scale >= 100 {
        format!("{}:fullres:{}:{}", path.to_string_lossy(), orient, mtime_sec)
    } else {
        format!("{}:{}:{}:{}", path.to_string_lossy(), scale, orient, mtime_sec)
    }
}

fn record_thumbnail_cache(
    cache_key: &str,
    blake3_key: Option<&str>,
    scale: u32,
    bytes: &[u8],
) {
    if let Some(key) = blake3_key {
        if let Some(chunk_cache) = crate::chunk_cache::get_global_chunk_cache() {
            let _ = chunk_cache.write_thumbnail(key, scale, bytes);
        }
    }
    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
        cache.put(cache_key.to_string(), bytes.to_vec());
    }
}

pub fn get_preview_jpeg_with_orient(
    path: &Path,
    scale: u32,
    target_orient: Option<u32>,
) -> Result<Vec<u8>> {
    get_preview_jpeg_with_orient_and_hints(path, scale, target_orient, None, None)
}

fn resolve_fast_metadata(
    path: &Path,
    target_orient: Option<u32>,
    hint_size: Option<u64>,
    hint_mtime: Option<i64>,
) -> Option<(u64, i64, u32)> {
    if let (Some(sz), Some(mt)) = (hint_size, hint_mtime) {
        let orient = target_orient.unwrap_or(1);
        Some((sz, mt, orient))
    } else if let Some((cat_sz, cat_mt, cat_orient)) = crate::archive_catalog::get_catalog_metadata_hint(path) {
        let orient = target_orient.or(cat_orient).unwrap_or(1);
        Some((cat_sz, cat_mt, orient))
    } else {
        None
    }
}

pub fn get_cached_preview_jpeg_fast(
    path: &Path,
    scale: u32,
    target_orient: Option<u32>,
    hint_size: Option<u64>,
    hint_mtime: Option<i64>,
) -> Option<Vec<u8>> {
    let fast_metadata = resolve_fast_metadata(path, target_orient, hint_size, hint_mtime);

    if let Some((fast_sz, fast_mt, fast_orient)) = fast_metadata {
        let fast_cache_key = make_l1_cache_key(path, scale, fast_orient, fast_mt);
        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
            if let Some(cached) = cache.get(&fast_cache_key) {
                return Some(cached.clone());
            }
        }
        let blake3_key = crate::chunk_cache::compute_cache_key(
            path,
            fast_sz,
            fast_mt,
            scale,
            fast_orient,
        );
        if let Some(chunk_cache) = crate::chunk_cache::get_global_chunk_cache() {
            if let Ok(Some(bytes)) = chunk_cache.read_thumbnail(&blake3_key, scale) {
                if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                    cache.put(fast_cache_key, bytes.clone());
                }
                return Some(bytes);
            }
            // Fallback for scale 2: If scale 1 is already cached in chunk cache (720px), return it!
            if scale == 2 {
                let key1 = crate::chunk_cache::compute_cache_key(path, fast_sz, fast_mt, 1, fast_orient);
                if let Ok(Some(bytes)) = chunk_cache.read_thumbnail(&key1, 1) {
                    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                        cache.put(fast_cache_key, bytes.clone());
                    }
                    return Some(bytes);
                }
            }
        }
    }
    None
}

pub fn get_preview_jpeg_with_orient_and_hints(
    path: &Path,
    scale: u32,
    target_orient: Option<u32>,
    hint_size: Option<u64>,
    hint_mtime: Option<i64>,
) -> Result<Vec<u8>> {
    let fast_metadata = resolve_fast_metadata(path, target_orient, hint_size, hint_mtime);

    // Fast path: Try resolving size, mtime, and orientation via hints or local catalog without touching NAS!
    if let Some(bytes) = get_cached_preview_jpeg_fast(path, scale, target_orient, hint_size, hint_mtime) {
        return Ok(bytes);
    }

    // Slow fallback path: File was not yet cached in L2, or metadata was not known.
    // If metadata hints were provided, avoid touching the filesystem/NAS for metadata!
    let (_file_size, _mtime_sec, _resolved_orient, blake3_key, cache_key) = if let Some((fast_sz, fast_mt, fast_orient)) = fast_metadata {
        let key = crate::chunk_cache::compute_cache_key(path, fast_sz, fast_mt, scale, fast_orient);
        let c_key = make_l1_cache_key(path, scale, fast_orient, fast_mt);
        (fast_sz, fast_mt, fast_orient, Some(key), c_key)
    } else {
        let resolved_orient = target_orient.or_else(|| get_effective_orientation(path)).unwrap_or(1);
        let meta_res = std::fs::metadata(path);
        let (sz, mt) = match &meta_res {
            Ok(m) => {
                let sec = m.modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                (m.len(), sec)
            }
            Err(_) => (0, 0),
        };
        let c_key = make_l1_cache_key(path, scale, resolved_orient, mt);
        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
            if let Some(cached) = cache.get(&c_key) {
                return Ok(cached.clone());
            }
        }
        let key = if meta_res.is_ok() {
            Some(crate::chunk_cache::compute_cache_key(path, sz, mt, scale, resolved_orient))
        } else {
            None
        };
        if let Some(ref k) = key {
            if let Some(chunk_cache) = crate::chunk_cache::get_global_chunk_cache() {
                if let Ok(Some(bytes)) = chunk_cache.read_thumbnail(k, scale) {
                    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                        cache.put(c_key.clone(), bytes.clone());
                    }
                    return Ok(bytes);
                }
                // Fallback for scale 2: If scale 1 is already cached in chunk cache (720px), return it!
                if scale == 2 && meta_res.is_ok() {
                    let k1 = crate::chunk_cache::compute_cache_key(path, sz, mt, 1, resolved_orient);
                    if let Ok(Some(bytes)) = chunk_cache.read_thumbnail(&k1, 1) {
                        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                            cache.put(c_key.clone(), bytes.clone());
                        }
                        return Ok(bytes);
                    }
                }
            }
        }
        (sz, mt, resolved_orient, key, c_key)
    };

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let is_jpeg = ext == "jpg" || ext == "jpeg";
    let is_raw = RAW_EXTENSIONS.contains(&ext.as_str());

    let target_px = match scale {
        0 => 160,
        2 => 720,
        s if s >= 100 => 2560,
        _ => 720,
    };

    // Fast-path 1: Embedded JPEG preview extraction for RAW files (< 2ms)
    // Camera RAW files (CR2, CR3, NEF, ARW, DNG) contain an embedded medium/large JPEG preview.
    // For scale 0 (micro-icons) or RAW files, extract the embedded preview:
    if is_raw || (is_jpeg && scale == 0) {
        if let Some(fast_bytes) = extract_embedded_thumbnail(path, target_orient) {
            #[cfg(target_os = "macos")]
            let final_bytes = if scale < 100 && fast_bytes.len() > 100_000 {
                let downscaled = imageio::extract_thumbnail_from_data(&fast_bytes, target_px).unwrap_or(fast_bytes);
                if _resolved_orient != 1 {
                    inject_orientation_into_jpeg(&downscaled, _resolved_orient as u16)
                } else {
                    downscaled
                }
            } else {
                fast_bytes
            };
            #[cfg(not(target_os = "macos"))]
            let final_bytes = fast_bytes;

            record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &final_bytes);
            return Ok(final_bytes);
        }
        // Only extract giant sensor previews (up to 40 MB) when high-resolution loupe/preview is actually requested!
        if is_raw && scale >= 100 {
            if let Some(full_bytes) = extract_largest_embedded_jpeg(path, target_orient) {
                record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &full_bytes);
                return Ok(full_bytes);
            }
        }
    }

    // Stufe 2: Native in-process decoders (bypasses macOS QuickLook XPC daemon bottleneck)
    #[cfg(target_os = "macos")]
    {
        // For RAW files, NEVER call ImageIO with file URLs (prevents remote network seeks and full sensor demosaic over SMB)
        if !is_raw {
            if let Some(mut imgio_bytes) = extract_macos_imageio_thumbnail(path, target_px) {
                // ImageIO already bakes the file's embedded EXIF orientation into the thumbnail.
                // Only apply delta if user explicitly changed orientation in the RapidReady sidecar.
                if let Some(sidecar_o) = crate::culling::read_sidecar(path).orientation {
                    let file_orient = read_exif_orientation(path).unwrap_or(1);
                    let file_deg = orientation_to_degrees(file_orient);
                    let target_deg = orientation_to_degrees(sidecar_o);
                    let delta_deg = (target_deg + 360 - file_deg) % 360;
                    if delta_deg != 0 {
                        let delta_tag = match delta_deg {
                            90 => 6,
                            180 => 3,
                            270 => 8,
                            _ => 1,
                        };
                        imgio_bytes = inject_orientation_into_jpeg(&imgio_bytes, delta_tag);
                    }
                }
                record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &imgio_bytes);
                return Ok(imgio_bytes);
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(raster_bytes) = extract_raster_thumbnail(path, scale, target_orient) {
            record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &raster_bytes);
            return Ok(raster_bytes);
        }
    }

    // Stufe 3: Fallback using thumb_rs for video poster frames (.mp4, .mov) or exotic container formats
    let thumb_scale = ThumbnailScale(scale.max(1));
    let thumb_res = get_thumbnail(path, thumb_scale);

    // If thumb_rs returned a generic OS file icon (e.g. <=32px) or failed:
    let is_file_icon = match &thumb_res {
        Ok(t) => t.width <= 32 || t.height <= 32,
        Err(_) => true,
    };

    if is_file_icon {
        // Fallback: Pure Rust decoder for standard raster images (PNG, WebP, JPG, JPEG)
        if let Some(raster_bytes) = extract_raster_thumbnail(path, scale, target_orient) {
            record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &raster_bytes);
            return Ok(raster_bytes);
        }
    }

    let thumb = thumb_res.map_err(|e| anyhow::anyhow!("thumb_rs error: {:?}", e))?;
        
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
    record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &bytes);
        
    Ok(bytes)
}

pub fn get_preview_jpeg(path: &Path, scale: u32) -> Result<Vec<u8>> {
    get_preview_jpeg_with_orient(path, scale, None)
}

pub fn get_max_preview_jpeg_with_orient(path: &Path, explicit_orient: Option<u32>) -> Result<Vec<u8>> {
    get_max_preview_jpeg_with_orient_and_hints(path, explicit_orient, None, None)
}

pub fn get_max_preview_jpeg_with_orient_and_hints(
    path: &Path,
    explicit_orient: Option<u32>,
    hint_size: Option<u64>,
    hint_mtime: Option<i64>,
) -> Result<Vec<u8>> {
    // Fast path: Try resolving size, mtime, and orientation via hints or local catalog without touching NAS!
    let fast_metadata = if let (Some(sz), Some(mt)) = (hint_size, hint_mtime) {
        let orient = explicit_orient.unwrap_or(1);
        Some((sz, mt, orient))
    } else if let Some((cat_sz, cat_mt, cat_orient)) = crate::archive_catalog::get_catalog_metadata_hint(path) {
        let orient = explicit_orient.or(cat_orient).unwrap_or(1);
        Some((cat_sz, cat_mt, orient))
    } else {
        None
    };

    if let Some((fast_sz, fast_mt, fast_orient)) = fast_metadata {
        let fast_cache_key = make_l1_cache_key(path, 100, fast_orient, fast_mt);
        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
            if let Some(cached) = cache.get(&fast_cache_key) {
                return Ok(cached.clone());
            }
        }
        let blake3_key = crate::chunk_cache::compute_cache_key(
            path,
            fast_sz,
            fast_mt,
            100,
            fast_orient,
        );
        if let Some(chunk_cache) = crate::chunk_cache::get_global_chunk_cache() {
            if let Ok(Some(bytes)) = chunk_cache.read_thumbnail(&blake3_key, 100) {
                if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                    cache.put(fast_cache_key, bytes.clone());
                }
                return Ok(bytes);
            }
        }
    }

    // Slow fallback path
    let (_file_size, _mtime_sec, target_orient, blake3_key, cache_key) = if let Some((fast_sz, fast_mt, fast_orient)) = fast_metadata {
        let key = crate::chunk_cache::compute_cache_key(path, fast_sz, fast_mt, 100, fast_orient);
        let c_key = make_l1_cache_key(path, 100, fast_orient, fast_mt);
        (fast_sz, fast_mt, fast_orient, Some(key), c_key)
    } else {
        let target_orient = explicit_orient.or_else(|| get_effective_orientation(path)).unwrap_or(1);
        let meta_res = std::fs::metadata(path);
        let (sz, mt) = match &meta_res {
            Ok(m) => {
                let sec = m.modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                (m.len(), sec)
            }
            Err(_) => (0, 0),
        };
        let c_key = make_l1_cache_key(path, 100, target_orient, mt);
        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
            if let Some(cached) = cache.get(&c_key) {
                return Ok(cached.clone());
            }
        }
        let key = if meta_res.is_ok() {
            Some(crate::chunk_cache::compute_cache_key(path, sz, mt, 100, target_orient))
        } else {
            None
        };
        if let Some(ref k) = key {
            if let Some(chunk_cache) = crate::chunk_cache::get_global_chunk_cache() {
                if let Ok(Some(bytes)) = chunk_cache.read_thumbnail(k, 100) {
                    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                        cache.put(c_key.clone(), bytes.clone());
                    }
                    return Ok(bytes);
                }
            }
        }
        (sz, mt, target_orient, key, c_key)
    };

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let is_raw = RAW_EXTENSIONS.contains(&ext.as_str());
    if ext == "jpg" || ext == "jpeg" {
        let bytes = std::fs::read(path).context("Failed to read JPEG")?;
        let eff_orient = target_orient;
        let out_bytes = if eff_orient != 1 {
            inject_orientation_into_jpeg(&bytes, eff_orient as u16)
        } else {
            bytes
        };
        record_thumbnail_cache(&cache_key, blake3_key.as_deref(), 100, &out_bytes);
        return Ok(out_bytes);
    }

    // 1. Fast path: Extract largest embedded full-res JPEG directly from RAW container
    // Provides full 20-60 MP sensor resolution in < 20ms instead of QuickLook downscaling!
    if let Some(bytes) = extract_largest_embedded_jpeg(path, explicit_orient) {
        record_thumbnail_cache(&cache_key, blake3_key.as_deref(), 100, &bytes);
        return Ok(bytes);
    }

    // 2. Native macOS in-process ImageIO fast path (2560px preview for HEIC, PNG, WebP, etc.)
    #[cfg(target_os = "macos")]
    {
        if !is_raw {
            if let Some(mut imgio_bytes) = extract_macos_imageio_thumbnail(path, 2560) {
                if let Some(sidecar_o) = crate::culling::read_sidecar(path).orientation {
                    let file_orient = read_exif_orientation(path).unwrap_or(1);
                    let file_deg = orientation_to_degrees(file_orient);
                    let target_deg = orientation_to_degrees(sidecar_o);
                    let delta_deg = (target_deg + 360 - file_deg) % 360;
                    if delta_deg != 0 {
                        let delta_tag = match delta_deg {
                            90 => 6,
                            180 => 3,
                            270 => 8,
                            _ => 1,
                        };
                        imgio_bytes = inject_orientation_into_jpeg(&imgio_bytes, delta_tag);
                    }
                }
                record_thumbnail_cache(&cache_key, blake3_key.as_deref(), 100, &imgio_bytes);
                return Ok(imgio_bytes);
            }
        }
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
        let rotated_img = apply_effective_orientation(dyn_img, Some(target_orient), file_orient);
        let rgb_img = rotated_img.into_rgb8();
        
        let mut buffer = Cursor::new(Vec::new());
        rgb_img.write_to(&mut buffer, ImageFormat::Jpeg)
            .context("Failed to encode JPEG")?;
            
        let bytes = buffer.into_inner();
        record_thumbnail_cache(&cache_key, blake3_key.as_deref(), 100, &bytes);
            
        return Ok(bytes);
    }

    // Fallback: If thumb_rs could not produce a preview on Windows/macOS, extract any embedded thumbnail
    if let Some(fast_bytes) = extract_embedded_thumbnail(path, explicit_orient) {
        record_thumbnail_cache(&cache_key, blake3_key.as_deref(), 100, &fast_bytes);
        return Ok(fast_bytes);
    }

    anyhow::bail!("Failed to extract a valid preview for {:?}", path);
}

pub fn get_max_preview_jpeg(path: &Path) -> Result<Vec<u8>> {
    get_max_preview_jpeg_with_orient(path, None)
}

pub fn is_thumbnail_cached(path: &Path, scale: u32, target_orient: Option<u32>) -> bool {
    is_thumbnail_cached_with_hints(path, scale, target_orient, None, None)
}

pub fn is_thumbnail_cached_with_hints(
    path: &Path,
    scale: u32,
    target_orient: Option<u32>,
    hint_size: Option<u64>,
    hint_mtime: Option<i64>,
) -> bool {
    let eff_scale = if scale >= 100 { 100 } else { scale };
    let fast_metadata = if let (Some(sz), Some(mt)) = (hint_size, hint_mtime) {
        let orient = target_orient.unwrap_or(1);
        Some((sz, mt, orient))
    } else if let Some((cat_sz, cat_mt, cat_orient)) = crate::archive_catalog::get_catalog_metadata_hint(path) {
        let orient = target_orient.or(cat_orient).unwrap_or(1);
        Some((cat_sz, cat_mt, orient))
    } else {
        None
    };

    if let Some((fast_sz, fast_mt, fast_orient)) = fast_metadata {
        let fast_cache_key = make_l1_cache_key(path, eff_scale, fast_orient, fast_mt);
        if let Ok(cache) = THUMBNAIL_CACHE.lock() {
            if cache.contains(&fast_cache_key) {
                return true;
            }
        }
        let blake3_key = crate::chunk_cache::compute_cache_key(
            path,
            fast_sz,
            fast_mt,
            eff_scale,
            fast_orient,
        );
        if let Some(chunk_cache) = crate::chunk_cache::get_global_chunk_cache() {
            if chunk_cache.has_thumbnail(&blake3_key, eff_scale) {
                return true;
            }
        }
        return false;
    }

    let resolved_orient = target_orient.or_else(|| get_effective_orientation(path));
    let meta_res = std::fs::metadata(path);
    let mtime_sec = meta_res
        .as_ref()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let cache_key = make_l1_cache_key(path, eff_scale, resolved_orient.unwrap_or(1), mtime_sec);
    if let Ok(cache) = THUMBNAIL_CACHE.lock() {
        if cache.contains(&cache_key) {
            return true;
        }
    }
    if let Ok(ref meta) = meta_res {
        let blake3_key = crate::chunk_cache::compute_cache_key(
            path,
            meta.len(),
            mtime_sec,
            eff_scale,
            resolved_orient.unwrap_or(1),
        );
        if let Some(chunk_cache) = crate::chunk_cache::get_global_chunk_cache() {
            if chunk_cache.has_thumbnail(&blake3_key, eff_scale) {
                return true;
            }
        }
    }
    false
}

pub fn get_thumbnail_bytes(path: &Path, scale: u32, target_orient: Option<u32>) -> Result<Vec<u8>> {
    if scale >= 100 {
        get_max_preview_jpeg_with_orient(path, target_orient)
    } else {
        get_preview_jpeg_with_orient(path, scale, target_orient)
    }
}

pub fn warm_thumbnail_cache_with_progress<F>(
    paths: &[String],
    scale: u32,
    token: u64,
    token_atomic: &AtomicU64,
    mut on_progress: F,
) -> usize
where
    F: FnMut(usize, usize),
{
    let total = paths.len();
    if total == 0 {
        return 0;
    }

    let mut cached_count = 0;
    for path_str in paths {
        let path = Path::new(path_str);
        if is_thumbnail_cached(path, scale, None) {
            cached_count += 1;
        }
    }
    on_progress(cached_count, total);

    let mut processed = 0;
    let mut last_reported = cached_count;
    let mut last_report_time = std::time::Instant::now();

    for path_str in paths {
        if token_atomic.load(Ordering::SeqCst) != token {
            break;
        }
        // Yield to high-priority interactive viewport requests
        while is_viewport_active() {
            if token_atomic.load(Ordering::SeqCst) != token {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        if token_atomic.load(Ordering::SeqCst) != token {
            break;
        }
        let path = Path::new(path_str);
        if !is_thumbnail_cached(path, scale, None) {
            let _ = get_thumbnail_bytes(path, scale, None);
            std::thread::yield_now();
            cached_count += 1;

            // Throttle progress events: emit at least every 5 items or 100ms, or when finished
            if cached_count - last_reported >= 5
                || last_report_time.elapsed() >= std::time::Duration::from_millis(100)
                || cached_count == total
            {
                on_progress(cached_count, total);
                last_reported = cached_count;
                last_report_time = std::time::Instant::now();
            }
        }
        processed += 1;
    }

    if cached_count != last_reported {
        on_progress(cached_count, total);
    }
    processed
}

pub fn warm_thumbnail_cache_with_token(
    paths: &[String],
    scale: u32,
    token: u64,
    token_atomic: &AtomicU64,
) -> usize {
    warm_thumbnail_cache_with_progress(paths, scale, token, token_atomic, |_, _| {})
}

pub fn warm_thumbnail_cache_sync(paths: &[String], scale: u32, token: u64) -> usize {
    warm_thumbnail_cache_with_token(paths, scale, token, &WARMUP_TOKEN)
}

/// Picasa-Model Background Thumbnail Generator Pipeline:
/// Generates micro-thumbnails (scale 1) into L2 packed binary chunks (`chunk_cache`)
/// for all candidate files in an archive root. Yields immediately whenever interactive
/// viewport requests occur.
pub fn generate_missing_thumbnails_for_archive<P>(
    catalog: &crate::archive_catalog::ArchiveCatalog,
    chunk_cache: &crate::chunk_cache::ChunkCache,
    root: &str,
    scale: u32,
    controller: &crate::archive::ScanController,
    on_progress: P,
) -> Result<usize>
where
    P: FnMut(usize, usize, &str) + Send,
{
    let candidates = catalog.get_thumbnail_candidates_for_root(root)?;
    if candidates.is_empty() {
        let _ = catalog.set_archive_indexing_status(root, true);
        return Ok(0);
    }

    let total_archive_files = candidates.len();

    // Identify candidate files missing from chunk cache
    let mut missing = Vec::new();
    for cand in candidates {
        let path_obj = Path::new(&cand.path);
        let key = crate::chunk_cache::compute_cache_key(
            path_obj,
            cand.size,
            cand.mtime,
            scale,
            cand.orientation.unwrap_or(1),
        );
        if !chunk_cache.has_thumbnail(&key, scale) {
            missing.push(cand);
        }
    }

    let total_missing = missing.len();
    let already_cached = total_archive_files.saturating_sub(total_missing);

    if total_missing == 0 {
        let _ = catalog.set_archive_indexing_status(root, true);
        let mut cb = on_progress;
        cb(total_archive_files, total_archive_files, "");
        return Ok(0);
    }

    // Prioritize active folder if set: partition so active folder items are popped first (at the end of vector)
    if let Some(active_folder) = get_active_folder() {
        let folder_str = active_folder.as_str();
        missing.sort_by_key(|cand| cand.path.starts_with(folder_str));
    }

    let queue = Mutex::new(missing);
    let completed = AtomicUsize::new(0);
    let on_progress_mutex = Mutex::new(on_progress);
    let last_report_time = Mutex::new(std::time::Instant::now());

    if let Ok(mut cb) = on_progress_mutex.lock() {
        cb(already_cached, total_archive_files, "");
    }

    let worker_count = std::thread::available_parallelism()
        .map(|n| n.get().min(4).clamp(3, 6))
        .unwrap_or(4);

    std::thread::scope(|s| {
        for _ in 0..worker_count {
            s.spawn(|| {
                loop {
                    if controller.is_cancelled() {
                        break;
                    }
                    while controller.is_paused() {
                        std::thread::sleep(std::time::Duration::from_millis(50));
                        if controller.is_cancelled() {
                            return;
                        }
                    }
                    // Cooperative preemption: yield CPU execution to interactive UI threads
                    if is_viewport_active() {
                        std::thread::yield_now();
                    }

                    // Grab a batch of up to 8 items in O(1) without holding lock during processing
                    let batch: Vec<crate::archive_catalog::ThumbnailCandidate> = {
                        let mut q = match queue.lock() {
                            Ok(guard) => guard,
                            Err(_) => break,
                        };
                        if q.is_empty() {
                            Vec::new()
                        } else {
                            let batch_size = 8.min(q.len());
                            let mut b = Vec::with_capacity(batch_size);
                            for _ in 0..batch_size {
                                if let Some(item) = q.pop() {
                                    b.push(item);
                                }
                            }
                            b
                        }
                    };

                    if batch.is_empty() {
                        break;
                    }

                    for item in batch {
                        if controller.is_cancelled() {
                            return;
                        }
                        while controller.is_paused() {
                            std::thread::sleep(std::time::Duration::from_millis(50));
                            if controller.is_cancelled() {
                                return;
                            }
                        }
                        if is_viewport_active() {
                            std::thread::yield_now();
                        }

                    let path_obj = Path::new(&item.path);
                    let key = crate::chunk_cache::compute_cache_key(
                        path_obj,
                        item.size,
                        item.mtime,
                        scale,
                        item.orientation.unwrap_or(1),
                    );

                    // Skip if thumbnail was already created (e.g. on-demand by UI rr-image handler)
                    if chunk_cache.has_thumbnail(&key, scale) {
                        let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
                        let should_report = if let Ok(mut last) = last_report_time.lock() {
                            if done == total_missing || done % 10 == 0 || last.elapsed() >= std::time::Duration::from_millis(100) {
                                *last = std::time::Instant::now();
                                true
                            } else {
                                false
                            }
                        } else {
                            false
                        };
                        if should_report {
                            if let Ok(mut cb) = on_progress_mutex.lock() {
                                cb(already_cached + done, total_archive_files, &item.path);
                            }
                        }
                        continue;
                    }

                    // Generate thumbnail and save into L2 chunk cache & L1 RAM cache (handled within get_preview_jpeg)
                    if let Ok(bytes) = get_preview_jpeg_with_orient_and_hints(
                        path_obj,
                        scale,
                        item.orientation,
                        Some(item.size),
                        Some(item.mtime),
                    ) {
                        if !chunk_cache.has_thumbnail(&key, scale) {
                            let _ = chunk_cache.write_thumbnail(&key, scale, &bytes);
                        }
                    }

                    let done = completed.fetch_add(1, Ordering::SeqCst) + 1;

                    let should_report = {
                        if let Ok(mut last) = last_report_time.lock() {
                            if done == total_missing || done % 10 == 0 || last.elapsed() >= std::time::Duration::from_millis(100) {
                                *last = std::time::Instant::now();
                                true
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    };

                    if should_report {
                        if let Ok(mut cb) = on_progress_mutex.lock() {
                            cb(already_cached + done, total_archive_files, &item.path);
                        }
                    }

                    std::thread::yield_now();
                    }
                }
            });
        }
    });

    let total_done = completed.load(Ordering::SeqCst);
    if let Ok(mut cb) = on_progress_mutex.lock() {
        cb(already_cached + total_done, total_archive_files, "");
    }

    if !controller.is_cancelled() && total_done >= total_missing {
        let _ = catalog.set_archive_indexing_status(root, true);
    }

    Ok(total_done)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    #[test]
    fn test_warmup_token_cancellation() {
        let test_token_atomic = AtomicU64::new(12345);
        let token = 12345;

        let paths: Vec<String> = (0..50).map(|i| format!("/nonexistent/photo_{}.jpg", i)).collect();

        // Invalidate token
        test_token_atomic.store(54321, Ordering::SeqCst);

        let processed = warm_thumbnail_cache_with_token(&paths, 1, token, &test_token_atomic);
        assert_eq!(processed, 0, "Warmup must abort immediately when token does not match");
    }

    #[test]
    fn test_warmup_token_active() {
        let test_token_atomic = AtomicU64::new(99999);
        let token = 99999;

        let paths: Vec<String> = vec![
            "/nonexistent/photo_a.jpg".to_string(),
            "/nonexistent/photo_b.jpg".to_string(),
        ];

        let processed = warm_thumbnail_cache_with_token(&paths, 1, token, &test_token_atomic);
        assert_eq!(processed, 2, "Warmup should process items while token matches");
    }

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
                let mut cursor = std::io::Cursor::new(&res);
                let exifreader = exif::Reader::new();
                let exif = exifreader.read_from_container(&mut cursor).expect("Thumbnail must have EXIF");
                let orient = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY).and_then(|f| f.value.get_uint(0));
                assert_eq!(orient, Some(8), "ARW thumbnail must have EXIF orientation 8 for WebKit auto-rotation");

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
    fn test_raster_thumbnail_speed() {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();
        let jpg_path = workspace_root.join("testdata/dest/2014/2014-08-25/DSC03058.JPG");
        if jpg_path.exists() {
            let start = std::time::Instant::now();
            let res = extract_raster_thumbnail(&jpg_path, 1, Some(1)).unwrap();
            let elapsed = start.elapsed();
            println!("\n>>> extract_raster_thumbnail on 4MB Sony JPG took: {:?}, output size: {} bytes", elapsed, res.len());
            assert!(!res.is_empty());
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_imageio_speed() {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();
        let jpg_path = workspace_root.join("testdata/dest/2014/2014-08-25/DSC03058.JPG");
        if jpg_path.exists() {
            // Warm-up call
            let _ = extract_macos_imageio_thumbnail(&jpg_path, 384);
            let start = std::time::Instant::now();
            let n = 10;
            for _ in 0..n {
                let res = extract_macos_imageio_thumbnail(&jpg_path, 384);
                assert!(res.is_some());
            }
            let total = start.elapsed();
            let per_img = total / n;
            println!(">>> ImageIO JPEG average: {:?}", per_img);
            assert!(per_img.as_millis() < 500);
            let cr2_path = workspace_root.join("testdata/dest/2014/2014-05-01/IMG_3126.CR2");
            if cr2_path.exists() {
                let start_cr2 = std::time::Instant::now();
                let res_cr2 = extract_macos_imageio_thumbnail(&cr2_path, 384);
                println!(">>> ImageIO on Canon CR2 RAW took: {:?}, success: {}", start_cr2.elapsed(), res_cr2.is_some());
            }
            let arw_path = workspace_root.join("testdata/dest/2023/2023-10-03/DSC02298.ARW");
            if arw_path.exists() {
                let start_arw = std::time::Instant::now();
                let res_arw = extract_macos_imageio_thumbnail(&arw_path, 384);
                println!(">>> ImageIO on Sony ARW RAW took: {:?}, success: {}", start_arw.elapsed(), res_arw.is_some());
            }
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
            let mut cursor = std::io::Cursor::new(&bytes);
            let exifreader = exif::Reader::new();
            let exif = exifreader.read_from_container(&mut cursor).expect("Must read EXIF");
            let orient = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY).and_then(|f| f.value.get_uint(0));
            // DSC02298.ARW is orientation 8 (portrait) -> extracted thumbnail should have injected EXIF orientation 8
            assert_eq!(orient, Some(8), "Rotated thumbnail must have injected EXIF orientation 8");
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
            assert!(img0.width().max(img0.height()) >= 160 && img0.width().min(img0.height()) >= 100, "Scale 0 preview must not be a 16x16 icon! Got {}x{}", img0.width(), img0.height());

            // Test scale 1
            let p1 = get_preview_jpeg(&dng_path, 1).expect("Must generate preview for DNG at scale 1");
            let img1 = image::load_from_memory(&p1).expect("Must decode DNG scale 1 JPEG");
            assert!(img1.width().max(img1.height()) >= 160, "Scale 1 preview must be valid photo");

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

    #[test]
    fn test_chunk_cache_integration() {
        let temp_dir = std::env::temp_dir().join(format!("rapidready_test_l2_cache_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db_path = temp_dir.join("catalog.db");
        let cache_dir = temp_dir.join("disk_cache");
        let chunk_cache = crate::chunk_cache::init_global_chunk_cache(&cache_dir, &db_path).unwrap();

        // Create a test image
        let img_path = temp_dir.join("test_l2.png");
        let img = image::RgbImage::from_fn(100, 100, |x, y| {
            image::Rgb([(x * 2) as u8, (y * 2) as u8, 128])
        });
        img.save(&img_path).unwrap();

        // Clear L1 memory cache
        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
            cache.clear();
        }

        // Before generation, should not be cached
        assert!(!is_thumbnail_cached(&img_path, 1, None));

        // Generate thumbnail (writes to L1 and L2 write-through)
        let thumb_bytes = get_preview_jpeg(&img_path, 1).expect("Thumbnail generation must succeed");
        assert!(!thumb_bytes.is_empty());

        // Now cached in L1 and L2
        assert!(is_thumbnail_cached(&img_path, 1, None));

        // Evict L1 RAM cache completely
        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
            cache.clear();
        }

        // Must still be reported as cached because of L2 Chunk Cache!
        assert!(is_thumbnail_cached(&img_path, 1, None), "L2 disk cache must report item as cached even after L1 RAM purge");

        // Request again: should hit L2 and re-populate L1
        let l2_bytes = get_preview_jpeg(&img_path, 1).expect("Must retrieve thumbnail from L2 chunk cache");
        assert_eq!(l2_bytes, thumb_bytes, "L2 chunk cache bytes must match original thumbnail bytes");

        // Verify chunk cache stats
        let stats = chunk_cache.get_stats().expect("Must read cache stats");
        assert!(stats.total_cached_items >= 1, "Cache stats must reflect stored thumbnail");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_viewport_request_guard_and_preemption() {
        let initial_active = ACTIVE_VIEWPORT_REQUESTS.load(Ordering::SeqCst);
        {
            let _guard = register_viewport_request();
            assert!(ACTIVE_VIEWPORT_REQUESTS.load(Ordering::SeqCst) > initial_active);
            assert!(is_viewport_active());
        }
        assert_eq!(ACTIVE_VIEWPORT_REQUESTS.load(Ordering::SeqCst), initial_active);
    }

    #[test]
    fn test_active_folder_tracking() {
        set_active_folder(Some("/Photos/2026/Iceland".to_string()));
        assert_eq!(get_active_folder(), Some("/Photos/2026/Iceland".to_string()));
        set_active_folder(None);
        assert_eq!(get_active_folder(), None);
    }

    #[test]
    fn test_generate_missing_thumbnails_for_archive() {
        let temp_dir = std::env::temp_dir().join(format!("rapidready_picasa_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let catalog_dir = temp_dir.join("catalog");
        let cache_dir = temp_dir.join("cache");
        let photos_dir = temp_dir.join("photos");
        std::fs::create_dir_all(&catalog_dir).unwrap();
        std::fs::create_dir_all(&cache_dir).unwrap();
        std::fs::create_dir_all(&photos_dir).unwrap();

        let catalog = crate::archive_catalog::ArchiveCatalog::new(&catalog_dir).unwrap();
        let chunk_cache = crate::chunk_cache::ChunkCache::new(&cache_dir, &catalog_dir.join("archive_catalog.db")).unwrap();

        // Create 3 valid test images
        let img1 = photos_dir.join("photo1.png");
        let img2 = photos_dir.join("photo2.png");
        let img3 = photos_dir.join("photo3.png");

        let dyn_img = image::DynamicImage::new_rgb8(100, 100);
        dyn_img.save(&img1).unwrap();
        dyn_img.save(&img2).unwrap();
        dyn_img.save(&img3).unwrap();

        let root_str = photos_dir.to_string_lossy().to_string();
        let files = vec![
            crate::archive::ArchiveFile {
                path: img1.to_string_lossy().to_string(),
                name: "photo1.png".to_string(),
                size: std::fs::metadata(&img1).unwrap().len(),
                date: None,
                camera: None,
                lens: None,
                iso: None,
                aperture: None,
                shutter: None,
                culling: crate::culling::CullingState::default(),
                is_raw: false,
                is_video: false,
                mtime: 100,
            },
            crate::archive::ArchiveFile {
                path: img2.to_string_lossy().to_string(),
                name: "photo2.png".to_string(),
                size: std::fs::metadata(&img2).unwrap().len(),
                date: None,
                camera: None,
                lens: None,
                iso: None,
                aperture: None,
                shutter: None,
                culling: crate::culling::CullingState::default(),
                is_raw: false,
                is_video: false,
                mtime: 100,
            },
            crate::archive::ArchiveFile {
                path: img3.to_string_lossy().to_string(),
                name: "photo3.png".to_string(),
                size: std::fs::metadata(&img3).unwrap().len(),
                date: None,
                camera: None,
                lens: None,
                iso: None,
                aperture: None,
                shutter: None,
                culling: crate::culling::CullingState::default(),
                is_raw: false,
                is_video: false,
                mtime: 100,
            },
        ];

        catalog.set_archive_indexing_status(&root_str, false).unwrap();
        catalog.upsert_archive_files(&root_str, &files, &[]).unwrap();
        assert!(!catalog.is_archive_fully_indexed(&root_str).unwrap());

        let controller = crate::archive::ScanController::new();
        let mut progress_count = 0;

        let processed = generate_missing_thumbnails_for_archive(
            &catalog,
            &chunk_cache,
            &root_str,
            1,
            &controller,
            |done, total, _| {
                progress_count += 1;
                assert!(done <= total);
            },
        ).unwrap();

        assert_eq!(processed, 3, "All 3 missing images must be thumbnailed");
        assert!(progress_count > 0);
        assert!(catalog.is_archive_fully_indexed(&root_str).unwrap());

        // Running again when all are cached should produce 0 items
        let processed2 = generate_missing_thumbnails_for_archive(
            &catalog,
            &chunk_cache,
            &root_str,
            1,
            &controller,
            |_, _, _| {},
        ).unwrap();
        assert_eq!(processed2, 0, "No thumbnails need generation when already indexed");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_parse_all_real_formats() {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();

        // 1. Sony DSC03058.JPG
        let jpg_path = workspace_root.join("testdata/dest/2014/2014-08-25/DSC03058.JPG");
        if jpg_path.exists() {
            let thumb = extract_embedded_thumbnail(&jpg_path, None).expect("Must extract JPG thumb");
            assert!(thumb.len() > 1000);
            assert_eq!(thumb[0], 0xFF);
            assert_eq!(thumb[1], 0xD8);
        }

        // 2. Google Pixel PXL JPG
        let pxl_path = workspace_root.join("testdata/JPG-Problem/original/PXL_20260314_095652377.jpg");
        if pxl_path.exists() {
            let thumb = extract_embedded_thumbnail(&pxl_path, None).expect("Must extract Pixel JPG thumb");
            assert!(thumb.len() > 1000);
            assert_eq!(thumb[0], 0xFF);
            assert_eq!(thumb[1], 0xD8);
        }

        // 3. Canon CR2 RAW
        let cr2_path = workspace_root.join("testdata/dest/2014/2014-05-01/IMG_2978.CR2");
        if cr2_path.exists() {
            let thumb = extract_embedded_thumbnail(&cr2_path, None).expect("Must extract CR2 thumb");
            assert!(thumb.len() > 1000);
            assert_eq!(thumb[0], 0xFF);
            assert_eq!(thumb[1], 0xD8);
        }

        // 4. Sony ARW RAW
        let arw_path = workspace_root.join("testdata/dest/2023/2023-10-03/DSC02298.ARW");
        if arw_path.exists() {
            let thumb = extract_embedded_thumbnail(&arw_path, None).expect("Must extract ARW thumb");
            assert!(thumb.len() > 1000);
            assert_eq!(thumb[0], 0xFF);
            assert_eq!(thumb[1], 0xD8);
            let mut cursor = std::io::Cursor::new(&thumb);
            let exifreader = exif::Reader::new();
            let exif = exifreader.read_from_container(&mut cursor).expect("Must read ARW EXIF");
            let orient = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY).and_then(|f| f.value.get_uint(0));
            assert_eq!(orient, Some(8), "ARW thumb must have EXIF orientation 8");
        }

        // 5. Ricoh / DJI DNG RAW
        let dng_path = workspace_root.join("testdata/dest/2024/2024-01-13/R0002005.DNG");
        if dng_path.exists() {
            let thumb = extract_embedded_thumbnail(&dng_path, None).expect("Must extract DNG thumb");
            assert!(thumb.len() > 1000);
            assert_eq!(thumb[0], 0xFF);
            assert_eq!(thumb[1], 0xD8);
            let mut cursor = std::io::Cursor::new(&thumb);
            let exifreader = exif::Reader::new();
            let exif = exifreader.read_from_container(&mut cursor).expect("Must read DNG EXIF");
            let orient = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY).and_then(|f| f.value.get_uint(0));
            assert_eq!(orient, Some(6), "DNG thumb must have EXIF orientation 6");
        }
    }
}


