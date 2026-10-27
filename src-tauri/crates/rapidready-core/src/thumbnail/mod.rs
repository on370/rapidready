use std::path::Path;
use std::io::Cursor;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::num::NonZeroUsize;
use std::sync::LazyLock;
use std::collections::HashSet;
use image::{ImageFormat, RgbaImage};
use thumb_rs::{get_thumbnail, ThumbnailScale};
use anyhow::{Context, Result};
use lru::LruCache;

pub mod header_parser;
pub mod jpeg_extract;
pub mod imageio_ffi;
pub mod worker;
#[cfg(test)]
mod tests;

pub use header_parser::*;
pub use jpeg_extract::*;
pub use imageio_ffi::*;
pub use worker::*;

#[cfg(target_os = "macos")]
use imageio_ffi::imageio;

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
    now.saturating_sub(last) < 250
}

/// Cooperatively pauses while viewport activity is taking place, periodically executing a poll callback.
pub fn wait_while_viewport_active_with_poll<F: FnMut()>(
    controller: Option<&crate::archive::ScanController>,
    mut poll: F,
) -> bool {
    let mut last_poll = std::time::Instant::now();
    if is_viewport_active() {
        poll();
    }
    while is_viewport_active() {
        if let Some(ctrl) = controller {
            if ctrl.is_cancelled() {
                return false;
            }
        }
        if last_poll.elapsed() >= std::time::Duration::from_millis(200) {
            poll();
            last_poll = std::time::Instant::now();
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    poll();
    true
}

/// Cooperatively pauses while viewport activity is taking place.
pub fn wait_while_viewport_active(controller: Option<&crate::archive::ScanController>) -> bool {
    wait_while_viewport_active_with_poll(controller, || {})
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

#[derive(Clone, Debug)]
pub(super) struct ActiveViewport {
    pub(super) paths: Vec<String>,
    pub(super) set: HashSet<String>,
}

pub(super) static ACTIVE_VIEWPORT_PATHS: LazyLock<Mutex<Option<ActiveViewport>>> = LazyLock::new(|| Mutex::new(None));

pub fn set_active_viewport_paths(paths: Vec<String>) {
    let normalized_paths: Vec<String> = paths
        .into_iter()
        .map(|p| crate::archive_catalog::normalize_canonical_path(&p))
        .collect();
    let set: HashSet<String> = normalized_paths.iter().cloned().collect();
    if let Ok(mut lock) = ACTIVE_VIEWPORT_PATHS.lock() {
        *lock = Some(ActiveViewport {
            paths: normalized_paths,
            set,
        });
    }
}

pub fn get_active_viewport_paths() -> Option<Vec<String>> {
    if let Ok(lock) = ACTIVE_VIEWPORT_PATHS.lock() {
        lock.as_ref().map(|v| v.paths.clone())
    } else {
        None
    }
}

pub fn is_path_in_active_viewport(path: &Path) -> bool {
    let norm = crate::archive_catalog::normalize_canonical_path(&path.to_string_lossy());
    if let Ok(lock) = ACTIVE_VIEWPORT_PATHS.lock() {
        if let Some(ref vp) = *lock {
            return vp.set.contains(&norm);
        }
    }
    false
}

pub fn get_active_viewport_count() -> usize {
    if let Ok(lock) = ACTIVE_VIEWPORT_PATHS.lock() {
        if let Some(ref vp) = *lock {
            return vp.paths.len();
        }
    }
    0
}

// In-memory LRU cache holding up to 10,000 thumbnail/preview JPEGs (~200MB RAM)
// Provides instantaneous ~0.01ms responses on repeat requests or grid scrolls
pub(super) static THUMBNAIL_CACHE: LazyLock<Mutex<LruCache<String, Vec<u8>>>> = LazyLock::new(|| {
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

#[inline]
pub(super) fn is_legacy_black_raw_chunk(path: &Path, bytes: &[u8]) -> bool {
    // 1. Any chunk that is not a valid JPEG stream must be invalidated immediately
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 || bytes[2] != 0xFF {
        return true;
    }
    let m3 = bytes[3];
    if !matches!(m3, 0xE0..=0xEF | 0xDB | 0xC0 | 0xC2 | 0xC4 | 0xFE) {
        return true;
    }

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    // 2. Old broken CR2 fallbacks produced an all-black 544x720 JPEG of ~7,007 bytes.
    if ext.eq_ignore_ascii_case("cr2") && bytes.len() < 8_500 {
        return parse_jpeg_dimensions(bytes) == Some((544, 720))
            || parse_jpeg_dimensions(bytes) == Some((720, 544))
            || bytes.len() <= 7_500;
    }

    // 3. Old broken Olympus ORF fallbacks produced tiny 160x120 or corrupt fragments (< 25 KB).
    // Real Olympus / OM System embedded previews are 3200x2400 (~1 MB) or downscaled to 720px (> 30 KB).
    if ext.eq_ignore_ascii_case("orf") && bytes.len() < 25_000 {
        return true;
    }

    false
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
                if !is_legacy_black_raw_chunk(path, cached) {
                    return Some(cached.clone());
                }
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
                if !is_legacy_black_raw_chunk(path, &bytes) {
                    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                        cache.put(fast_cache_key, bytes.clone());
                    }
                    return Some(bytes);
                }
            }
            // Fallback for scale 0 or 2: If scale 1 is already cached in chunk cache (720px+), return it!
            if scale == 0 || scale == 2 {
                let key1 = crate::chunk_cache::compute_cache_key(path, fast_sz, fast_mt, 1, fast_orient);
                if let Ok(Some(bytes)) = chunk_cache.read_thumbnail(&key1, 1) {
                    if !is_legacy_black_raw_chunk(path, &bytes) {
                        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                            cache.put(fast_cache_key, bytes.clone());
                        }
                        return Some(bytes);
                    }
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
    let (_file_size, _mtime_sec, _key_orient, blake3_key, cache_key) = if let Some((fast_sz, fast_mt, fast_orient)) = fast_metadata {
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
                if !is_legacy_black_raw_chunk(path, cached) {
                    return Ok(cached.clone());
                }
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
                    if !is_legacy_black_raw_chunk(path, &bytes) {
                        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                            cache.put(c_key.clone(), bytes.clone());
                        }
                        return Ok(bytes);
                    }
                }
                // Fallback for scale 0 or 2: If scale 1 is already cached in chunk cache (720px+), return it!
                if (scale == 0 || scale == 2) && meta_res.is_ok() {
                    let k1 = crate::chunk_cache::compute_cache_key(path, sz, mt, 1, resolved_orient);
                    if let Ok(Some(bytes)) = chunk_cache.read_thumbnail(&k1, 1) {
                        if !is_legacy_black_raw_chunk(path, &bytes) {
                            if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                                cache.put(c_key.clone(), bytes.clone());
                            }
                            return Ok(bytes);
                        }
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
    // Camera RAW files (CR2, CR3, NEF, ARW, DNG, RAF, RW2, ORF, PEF, X3F, etc.) contain an embedded preview.
    // For scale 0 (micro-icons) or RAW files, extract the embedded preview:
    if is_raw || (is_jpeg && scale == 0) {
        let raw_preview_bytes = extract_embedded_thumbnail(path, target_orient).or_else(|| {
            // Universal safety net for RAW files:
            // If the fast 256/768 KB header extraction did not find the preview
            // (e.g. Sigma X3F FOVb container, deep Olympus ORF preview, or rare exotic RAWs),
            // fall back to scanning for the embedded JPEG rather than failing and showing an empty black tile!
            if is_raw {
                extract_largest_embedded_jpeg(path, target_orient)
            } else {
                None
            }
        });

        if let Some(fast_bytes) = raw_preview_bytes {
            // Direct-store medium camera previews <= 1.5 MB directly without CPU re-encoding:
            // Camera hardware already produced an optimal preview (720px..1620px, e.g. Sony ARW 504KB, CR3 400KB, DNG 54KB).
            // For full-sensor camera previews > 1.5 MB (e.g. Canon CR2 5472x3648, 2.5-5.5 MB):
            // Downscale to target_px (720px) to keep chunk cache compact (~80-120 KB vs 3.5 MB per image).
            // Loupe View and 100% Zoom (scale >= 100) bypass downscaling and preserve full sensor resolution.
            #[cfg(target_os = "macos")]
            let final_bytes = if scale < 100 && fast_bytes.len() > 1_500_000 {
                let orient = parse_header_orientation(&fast_bytes)
                    .or(target_orient)
                    .or_else(|| get_effective_orientation(path))
                    .unwrap_or(1);
                let downscaled = imageio::extract_thumbnail_from_data(&fast_bytes, target_px).unwrap_or(fast_bytes);
                if orient != 1 {
                    inject_orientation_into_jpeg(&downscaled, orient as u16)
                } else {
                    downscaled
                }
            } else {
                fast_bytes
            };
            #[cfg(not(target_os = "macos"))]
            let final_bytes = if scale < 100 && fast_bytes.len() > 1_500_000 {
                let orient = parse_header_orientation(&fast_bytes)
                    .or(target_orient)
                    .or_else(|| get_effective_orientation(path))
                    .unwrap_or(1);
                // Windows / Linux fallback downscaling using image crate:
                // (Optimized SIMD decoding via turbojpeg/zune-jpeg tracked in ROADMAP.md backlog)
                if let Ok(dyn_img) = image::load_from_memory(&fast_bytes) {
                    let resized = dyn_img.thumbnail(target_px, target_px);
                    let mut buf = std::io::Cursor::new(Vec::new());
                    if resized.into_rgb8().write_to(&mut buf, image::ImageFormat::Jpeg).is_ok() {
                        let out = buf.into_inner();
                        if orient != 1 {
                            inject_orientation_into_jpeg(&out, orient as u16)
                        } else {
                            out
                        }
                    } else {
                        fast_bytes
                    }
                } else {
                    fast_bytes
                }
            } else {
                fast_bytes
            };

            record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &final_bytes);
            return Ok(final_bytes);
        }
    }

    // Stufe 2: Native in-process decoders (bypasses macOS QuickLook XPC daemon bottleneck)
    #[cfg(target_os = "macos")]
    {
        // For RAW files, NEVER call ImageIO with file URLs (prevents remote network seeks and full sensor demosaic over SMB)
        if !is_raw {
            // Direct-store for compact standard JPEGs (<= 1920 px and <= 1.5 MB):
            // Avoids decoding and re-compressing web/preview JPEGs when already optimal for cache.
            // Full-resolution original camera JPEGs (> 1920 px, e.g. 24 MP) are downscaled to 720px
            // to keep the chunk cache compact (< 2 GB for 10k JPEGs) and avoid allocating 96 MB RGBA textures in WebKit.
            if is_jpeg && _file_size > 0 && _file_size <= 1_500_000 {
                if let Ok(data) = std::fs::read(path) {
                    let is_compact = parse_jpeg_dimensions(&data)
                        .map(|(w, h)| w.max(h) <= 1920)
                        .unwrap_or(false);

                    if is_compact {
                        let explicit_o = target_orient.or_else(|| crate::culling::read_sidecar(path).orientation);
                        let final_bytes = if let Some(o) = explicit_o {
                            inject_orientation_into_jpeg(&data, o as u16)
                        } else {
                            data
                        };
                        record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &final_bytes);
                        return Ok(final_bytes);
                    }
                }
            }

            let read_data_res = std::fs::read(path);
            let imgio_res = if let Ok(ref data) = read_data_res {
                if let Some(mut imgio_bytes) = imageio::extract_thumbnail_from_data(data, target_px) {
                    let eff_orient = target_orient
                        .or_else(|| parse_header_orientation(data))
                        .or_else(|| get_effective_orientation(path))
                        .unwrap_or(1);
                    if eff_orient != 1 {
                        imgio_bytes = inject_orientation_into_jpeg(&imgio_bytes, eff_orient as u16);
                    }
                    Some(imgio_bytes)
                } else {
                    None
                }
            } else if let Some(mut imgio_bytes) = extract_macos_imageio_thumbnail(path, target_px) {
                // Fallback extract_macos_imageio_thumbnail uses WithTransform = True (pixels are already physically rotated).
                // Only apply delta if user explicitly specified or changed orientation in the RapidReady sidecar.
                let explicit_o = target_orient.or_else(|| crate::culling::read_sidecar(path).orientation);
                if let Some(target_o) = explicit_o {
                    let file_orient = read_exif_orientation(path).unwrap_or(1);
                    let file_deg = orientation_to_degrees(file_orient);
                    let target_deg = orientation_to_degrees(target_o);
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
                Some(imgio_bytes)
            } else {
                None
            };

            if let Some(final_imgio_bytes) = imgio_res {
                record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &final_imgio_bytes);
                return Ok(final_imgio_bytes);
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        if is_jpeg && _file_size > 0 && _file_size <= 1_500_000 {
            if let Ok(data) = std::fs::read(path) {
                let is_compact = parse_jpeg_dimensions(&data)
                    .map(|(w, h)| w.max(h) <= 1920)
                    .unwrap_or(false);

                if is_compact {
                    let explicit_o = target_orient.or_else(|| crate::culling::read_sidecar(path).orientation);
                    let final_bytes = if let Some(o) = explicit_o {
                        inject_orientation_into_jpeg(&data, o as u16)
                    } else {
                        data
                    };
                    record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &final_bytes);
                    return Ok(final_bytes);
                }
            }
        }

        if let Some(raster_bytes) = extract_raster_thumbnail(path, scale, target_orient) {
            record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &raster_bytes);
            return Ok(raster_bytes);
        }
    }

    // Stufe 3: Fallback using thumb_rs for video poster frames (.mp4, .mov) or exotic container formats
    let thumb_scale = ThumbnailScale(scale.max(1));
    let thumb_res = get_thumbnail(path, thumb_scale);

    // If thumb_rs returned a generic OS file icon (e.g. <=32px) or failed, or an all-black bitmap:
    let is_invalid_thumb = match &thumb_res {
        Ok(t) => {
            if t.width <= 32 || t.height <= 32 {
                true
            } else if t.rgba.len() >= 4 {
                // Sample 32 evenly distributed pixels across the buffer:
                // If every sampled pixel has R == 0, G == 0, B == 0, treat as black/broken!
                let total_pixels = t.rgba.len() / 4;
                let sample_step = (total_pixels / 32).max(1);
                let mut all_black = true;
                for i in (0..total_pixels).step_by(sample_step) {
                    let offset = i * 4;
                    if offset + 2 < t.rgba.len() {
                        if t.rgba[offset] != 0 || t.rgba[offset + 1] != 0 || t.rgba[offset + 2] != 0 {
                            all_black = false;
                            break;
                        }
                    }
                }
                all_black
            } else {
                true
            }
        }
        Err(_) => true,
    };

    if is_invalid_thumb {
        // Fallback: Pure Rust decoder for standard raster images (PNG, WebP, JPG, JPEG)
        if let Some(raster_bytes) = extract_raster_thumbnail(path, scale, target_orient) {
            record_thumbnail_cache(&cache_key, blake3_key.as_deref(), scale, &raster_bytes);
            return Ok(raster_bytes);
        }
        return Err(anyhow::anyhow!("thumb_rs returned an all-black or invalid thumbnail"));
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
    if ext == "jpg" || ext == "jpeg" {
        let bytes = std::fs::read(path).context("Failed to read JPEG")?;
        let explicit_o = explicit_orient.or_else(|| crate::culling::read_sidecar(path).orientation);
        let out_bytes = if let Some(o) = explicit_o {
            inject_orientation_into_jpeg(&bytes, o as u16)
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
        let is_raw = RAW_EXTENSIONS.contains(&ext.as_str());
        if !is_raw {
            if let Some(mut imgio_bytes) = extract_macos_imageio_thumbnail(path, 2560) {
                let explicit_o = explicit_orient.or_else(|| crate::culling::read_sidecar(path).orientation);
                if let Some(target_o) = explicit_o {
                    let file_orient = read_exif_orientation(path).unwrap_or(1);
                    let file_deg = orientation_to_degrees(file_orient);
                    let target_deg = orientation_to_degrees(target_o);
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
            if thumb.rgba.len() >= 4 {
                if thumb.rgba[3] == 0 {
                    continue;
                }
                let total_pixels = thumb.rgba.len() / 4;
                let sample_step = (total_pixels / 32).max(1);
                let mut all_black = true;
                for i in (0..total_pixels).step_by(sample_step) {
                    let offset = i * 4;
                    if offset + 2 < thumb.rgba.len() {
                        if thumb.rgba[offset] != 0 || thumb.rgba[offset + 1] != 0 || thumb.rgba[offset + 2] != 0 {
                            all_black = false;
                            break;
                        }
                    }
                }
                if all_black {
                    continue;
                }
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
            // Fallback for scale 0 or 2: If scale 1 is cached in chunk cache, consider it cached!
            if eff_scale == 0 || eff_scale == 2 {
                let key1 = crate::chunk_cache::compute_cache_key(
                    path,
                    fast_sz,
                    fast_mt,
                    1,
                    fast_orient,
                );
                if chunk_cache.has_thumbnail(&key1, 1) {
                    return true;
                }
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
            if eff_scale == 0 || eff_scale == 2 {
                let key1 = crate::chunk_cache::compute_cache_key(
                    path,
                    meta.len(),
                    mtime_sec,
                    1,
                    resolved_orient.unwrap_or(1),
                );
                if chunk_cache.has_thumbnail(&key1, 1) {
                    return true;
                }
            }
        }
    }
    false
}

/// Checks strictly whether the thumbnail JPEG is currently resident in L1 RAM (THUMBNAIL_CACHE).
/// Fast in-memory lookup without touching filesystem or SMB network!
pub fn is_thumbnail_ram_cached(
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

    if let Some((_, fast_mt, fast_orient)) = fast_metadata {
        let fast_cache_key = make_l1_cache_key(path, eff_scale, fast_orient, fast_mt);
        if let Ok(cache) = THUMBNAIL_CACHE.lock() {
            return cache.contains(&fast_cache_key);
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
