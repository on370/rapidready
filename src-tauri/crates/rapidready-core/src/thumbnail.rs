use std::path::Path;
use std::io::Cursor;
use std::sync::Mutex;
use std::num::NonZeroUsize;
use std::sync::LazyLock;
use image::{ImageFormat, RgbaImage};
use thumb_rs::{get_thumbnail, ThumbnailScale};
use anyhow::{Context, Result};
use lru::LruCache;

// In-memory LRU cache holding up to 600 thumbnail/preview JPEGs (~20-30MB RAM)
// Provides instantaneous ~0.01ms responses on repeat requests or grid scrolls
static THUMBNAIL_CACHE: LazyLock<Mutex<LruCache<String, Vec<u8>>>> = LazyLock::new(|| {
    Mutex::new(LruCache::new(NonZeroUsize::new(600).unwrap()))
});

pub fn find_companion_jpeg(raw_path: &Path) -> Option<std::path::PathBuf> {
    let ext = raw_path.extension().and_then(|e| e.to_str())?.to_lowercase();
    let raw_exts = ["cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2"];
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

pub fn get_preview_jpeg(path: &Path, scale: u32) -> Result<Vec<u8>> {
    let cache_key = format!("{}:{}", path.to_string_lossy(), scale);
    
    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }
    
    // Performance boost: If RAW has a companion JPEG, use the JPEG for thumbnails (10x faster)
    let target_path = find_companion_jpeg(path).unwrap_or_else(|| path.to_path_buf());
    let thumb = get_thumbnail(&target_path, ThumbnailScale(scale))
        .map_err(|e| anyhow::anyhow!("thumb_rs error: {:?}", e))?;
        
    let img = RgbaImage::from_raw(thumb.width, thumb.height, thumb.rgba)
        .context("Failed to construct RgbaImage from raw bytes")?;
        
    let mut buffer = Cursor::new(Vec::new());
    let rgb_img = image::DynamicImage::ImageRgba8(img).into_rgb8();
    
    rgb_img.write_to(&mut buffer, ImageFormat::Jpeg)
        .context("Failed to encode JPEG")?;
        
    let bytes = buffer.into_inner();
    
    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
        cache.put(cache_key, bytes.clone());
    }
        
    Ok(bytes)
}

pub fn get_max_preview_jpeg(path: &Path) -> Result<Vec<u8>> {
    let cache_key = format!("{}:fullres", path.to_string_lossy());
    
    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }

    // Performance boost: If RAW has a companion JPEG, directly return the JPEG bytes
    if let Some(companion) = find_companion_jpeg(path) {
        if let Ok(bytes) = std::fs::read(&companion) {
            if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                cache.put(cache_key, bytes.clone());
            }
            return Ok(bytes);
        }
    }

    // macOS QLThumbnailGenerator returns a generic 1024x1024 or 512x512 file icon
    // if the requested scale is larger than the embedded preview.
    // We try descending scales to find the largest actual preview (scale 10 is ~2560px, ideal for fast 2K/4K display)
    let mut best_thumb = None;
    for scale in [10, 8, 4, 2] {
        if let Ok(thumb) = get_thumbnail(path, ThumbnailScale(scale)) {
            if thumb.rgba.len() >= 4 && thumb.rgba[3] == 0 {
                continue;
            }
            best_thumb = Some(thumb);
            break;
        }
    }
    
    let thumb = best_thumb.ok_or_else(|| anyhow::anyhow!("Failed to extract a valid preview"))?;
    
    let img = RgbaImage::from_raw(thumb.width, thumb.height, thumb.rgba)
        .context("Failed to construct RgbaImage from raw bytes")?;
        
    let mut buffer = Cursor::new(Vec::new());
    let rgb_img = image::DynamicImage::ImageRgba8(img).into_rgb8();
    
    rgb_img.write_to(&mut buffer, ImageFormat::Jpeg)
        .context("Failed to encode JPEG")?;
        
    let bytes = buffer.into_inner();
    
    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
        cache.put(cache_key, bytes.clone());
    }
        
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    #[test]
    fn test_find_companion_jpeg() {
        let temp_dir = std::env::temp_dir().join(format!("rr_test_{}", std::process::id()));
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
}
