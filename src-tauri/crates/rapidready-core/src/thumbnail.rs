use std::path::Path;
use std::io::Cursor;
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
    // 2. Fall back to companion JPEG EXIF
    if let Some(companion) = find_companion_jpeg(path) {
        if let Some(o) = read_exif_orientation(&companion) {
            return Some(o);
        }
    }
    // 3. Fall back to image file EXIF
    read_exif_orientation(path)
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

pub fn get_preview_jpeg(path: &Path, scale: u32) -> Result<Vec<u8>> {
    let target_orient = get_effective_orientation(path);
    let cache_key = format!("{}:{}:{}", path.to_string_lossy(), scale, target_orient.unwrap_or(1));
    
    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }
    
    // Performance boost: If RAW has a companion JPEG, use the JPEG for thumbnail extraction
    let target_path = find_companion_jpeg(path).unwrap_or_else(|| path.to_path_buf());

    let thumb = get_thumbnail(&target_path, ThumbnailScale(scale))
        .map_err(|e| anyhow::anyhow!("thumb_rs error: {:?}", e))?;
        
    let img = RgbaImage::from_raw(thumb.width, thumb.height, thumb.rgba)
        .context("Failed to construct RgbaImage from raw bytes")?;
    let dyn_img = image::DynamicImage::ImageRgba8(img);
    
    let file_orient = read_exif_orientation(&target_path).or_else(|| read_exif_orientation(path));
    let rotated_img = apply_effective_orientation(dyn_img, target_orient, file_orient);
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

pub fn get_max_preview_jpeg(path: &Path) -> Result<Vec<u8>> {
    let target_orient = get_effective_orientation(path);
    let cache_key = format!("{}:fullres:{}", path.to_string_lossy(), target_orient.unwrap_or(1));
    
    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }

    // Performance boost: If RAW has a companion JPEG and NO sidecar orientation override, directly return the JPEG bytes
    if crate::culling::read_sidecar(path).orientation.is_none() {
        if let Some(companion) = find_companion_jpeg(path) {
            if let Ok(bytes) = std::fs::read(&companion) {
                if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
                    cache.put(cache_key, bytes.clone());
                }
                return Ok(bytes);
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
    
    let thumb = best_thumb.ok_or_else(|| anyhow::anyhow!("Failed to extract a valid preview"))?;
    
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
        
    Ok(bytes)
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
                let thumb2 = get_thumbnail(&dng_portrait, ThumbnailScale(1)).unwrap();
                println!("ARW portrait thumb: width={}, height={}", thumb2.width, thumb2.height);
                let res2 = get_max_preview_jpeg(&dng_portrait).unwrap();
                let img2 = image::load_from_memory(&res2).unwrap();
                println!("ARW max preview: width={}, height={}", img2.width(), img2.height());
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
            workspace_root.join("testdata/src/Bilder/R0002008.DNG"),
            workspace_root.join("testdata/dest/2014/2014-08-25/DSC03058.JPG"),
        ];

        for p in &test_files {
            if !p.exists() { continue; }
            let mut file = std::fs::File::open(p).unwrap();
            let mut bufreader = std::io::BufReader::new(&mut file);
            let exifreader = exif::Reader::new();
            let orient = if let Ok(exif) = exifreader.read_from_container(&mut bufreader) {
                if let Some(f) = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY) {
                    f.value.get_uint(0)
                } else {
                    None
                }
            } else {
                None
            };
            println!("FILE {:?}: EXIF orientation = {:?}", p.file_name().unwrap(), orient);
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
}
