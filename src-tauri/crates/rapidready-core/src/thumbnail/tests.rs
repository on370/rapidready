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
fn test_warmup_ram_cache_preloading() {
    let temp_dir = std::env::temp_dir().join(format!("rapidready_warmup_test_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp_dir);
    let _ = std::fs::create_dir_all(&temp_dir);

    let db_path = temp_dir.join("catalog.db");
    let cache_dir = temp_dir.join("disk_cache");
    let catalog = std::sync::Arc::new(crate::archive_catalog::ArchiveCatalog::new_with_db_path(&db_path).unwrap());
    crate::archive_catalog::init_global_catalog(catalog.clone());
    let _chunk_cache = crate::chunk_cache::init_global_chunk_cache(&cache_dir, &db_path).unwrap();

    // Create a test image
    let img_path = temp_dir.join("test_warmup.jpg");
    let img = image::RgbImage::from_fn(120, 120, |x, y| {
        image::Rgb([(x % 255) as u8, (y % 255) as u8, 200])
    });
    img.save(&img_path).unwrap();

    // Ensure catalog has metadata hint
    let sz = std::fs::metadata(&img_path).unwrap().len();
    let mt = std::fs::metadata(&img_path).unwrap().modified().unwrap()
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
    catalog.upsert_archive_files(
        &temp_dir.to_string_lossy(),
        &[crate::archive::ArchiveFile {
            path: img_path.to_string_lossy().to_string(),
            name: "test_warmup.jpg".to_string(),
            size: sz,
            date: None,
            camera: None,
            lens: None,
            iso: None,
            aperture: None,
            shutter: None,
            culling: crate::culling::CullingState::default(),
            is_raw: false,
            is_video: false,
            mtime: mt,
        }],
        &[],
    ).unwrap();

    // Generate thumbnail once so it resides in chunk cache (L2 SSD)
    let _ = get_preview_jpeg(&img_path, 1).unwrap();

    // Clear L1 RAM cache
    if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
        cache.clear();
    }

    // Before warmup: L2 has it, but L1 RAM does NOT have it
    assert!(is_thumbnail_cached(&img_path, 1, None), "L2 chunk cache must have thumbnail");
    assert!(!is_thumbnail_ram_cached(&img_path, 1, None, None, None), "L1 RAM cache must be empty");

    // Run warmup
    let token_atomic = AtomicU64::new(777);
    let paths = vec![img_path.to_string_lossy().to_string()];
    let mut reported_current = 0;
    let mut reported_total = 0;

    let processed = warm_thumbnail_cache_with_progress(&paths, 1, 777, &token_atomic, |cur, tot| {
        reported_current = cur;
        reported_total = tot;
    });

    assert_eq!(processed, 1);
    assert_eq!(reported_current, 1);
    assert_eq!(reported_total, 1);

    // After warmup: image must now be warm in L1 RAM cache!
    assert!(is_thumbnail_ram_cached(&img_path, 1, None, None, None), "Warmup must load thumbnail into L1 RAM cache");

    let _ = std::fs::remove_dir_all(&temp_dir);
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
        |done, total, _, _| {
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
        |_, _, _, _| {},
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
        assert!(thumb.len() > 1_000_000, "CR2 extracted preview must be the high-res IFD0 JPEG (>1MB), not the 160x120 micro-thumb");
        assert_eq!(thumb[0], 0xFF);
        assert_eq!(thumb[1], 0xD8);

        // Verify scale 1 thumbnail generation (downscaled to compact ~50-200 KB)
        let scale1_thumb = get_preview_jpeg(&cr2_path, 1).expect("Must generate scale 1 thumbnail");
        assert!(scale1_thumb.len() > 10_000, "Scale 1 thumbnail must be valid");
        assert!(scale1_thumb.len() < 500_000, "Scale 1 thumbnail must be downscaled to compact size (<500 KB)");
        assert_eq!(scale1_thumb[0], 0xFF);
        assert_eq!(scale1_thumb[1], 0xD8);
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

    // 6. Fujifilm RAF RAW
    let raf_path = workspace_root.join("testdata/dest/Fuji-RAW/DSCF8792.RAF");
    if raf_path.exists() {
        let thumb = extract_embedded_thumbnail(&raf_path, None).expect("Must extract RAF thumb");
        assert!(thumb.len() > 1_000_000, "RAF extracted preview must be high-res JPEG (>1MB)");
        assert_eq!(thumb[0], 0xFF);
        assert_eq!(thumb[1], 0xD8);

        // Verify scale 1 thumbnail generation (downscaled to compact ~50-200 KB)
        let scale1_thumb = get_preview_jpeg(&raf_path, 1).expect("Must generate scale 1 thumbnail");
        assert!(scale1_thumb.len() > 10_000, "Scale 1 thumbnail must be valid");
        assert!(scale1_thumb.len() < 500_000, "Scale 1 thumbnail must be downscaled to compact size (<500 KB)");
        assert_eq!(scale1_thumb[0], 0xFF);
        assert_eq!(scale1_thumb[1], 0xD8);
    }
}

#[test]
fn test_issue_2_thumb_and_inspector_orientation_consistency() {
    let temp_dir = std::env::temp_dir().join(format!("rr_orient_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    std::fs::create_dir_all(&temp_dir).unwrap();

    let img_path = temp_dir.join("portrait_test.jpg");

    // 1. Create a synthetic test JPEG with EXIF orientation 6 (90° CW Portrait)
    let img = image::DynamicImage::new_rgb8(2400, 1600); // 2400x1600 (>1920px to force downscaling)
    let mut raw_jpeg = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut raw_jpeg), image::ImageFormat::Jpeg).unwrap();
    let portrait_jpeg = inject_orientation_into_jpeg(&raw_jpeg, 6);
    std::fs::write(&img_path, &portrait_jpeg).unwrap();

    let meta = std::fs::metadata(&img_path).unwrap();
    let size = meta.len();
    let mtime = meta.modified().unwrap().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;

    // Ensure file has EXIF orientation 6 and no .rrdata sidecar exists
    assert_eq!(read_exif_orientation(&img_path), Some(6));
    assert!(!crate::culling::get_sidecar_path(&img_path).exists());

    // Call get_preview_jpeg_with_orient_and_hints with target_orient = None
    let thumb_bytes = get_preview_jpeg_with_orient_and_hints(&img_path, 1, None, Some(size), Some(mtime))
        .expect("Must generate scale 1 thumbnail");

    // Call get_max_preview_jpeg_with_orient_and_hints with explicit_orient = None
    let inspector_bytes = get_max_preview_jpeg_with_orient_and_hints(&img_path, None, Some(size), Some(mtime))
        .expect("Must generate inspector preview");

    let thumb_orient = parse_header_orientation(&thumb_bytes);
    let inspector_orient = parse_header_orientation(&inspector_bytes);

    assert_eq!(thumb_orient, Some(6), "Thumbnail must preserve EXIF orientation 6");
    assert_eq!(inspector_orient, Some(6), "Inspector preview must preserve EXIF orientation 6");
    assert_eq!(thumb_orient, inspector_orient, "Thumbnail and inspector must have identical orientation");

    // Also test real RAW file if present in testdata
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();
    let dng_path = workspace_root.join("testdata/dest/2024/2024-01-13/R0002005.DNG");
    if dng_path.exists() {
        let dng_meta = std::fs::metadata(&dng_path).unwrap();
        let dng_sz = dng_meta.len();
        let dng_mt = dng_meta.modified().unwrap().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;

        let dng_thumb = get_preview_jpeg_with_orient_and_hints(&dng_path, 1, None, Some(dng_sz), Some(dng_mt))
            .expect("Must generate DNG thumbnail");
        let dng_insp = get_max_preview_jpeg_with_orient_and_hints(&dng_path, None, Some(dng_sz), Some(dng_mt))
            .expect("Must generate DNG inspector preview");

        let dng_thumb_orient = parse_header_orientation(&dng_thumb);
        let dng_insp_orient = parse_header_orientation(&dng_insp);

        assert_eq!(dng_thumb_orient, Some(6), "DNG thumb must have EXIF orientation 6");
        assert_eq!(dng_insp_orient, Some(6), "DNG inspector preview must have EXIF orientation 6");
        assert_eq!(dng_thumb_orient, dng_insp_orient, "DNG thumbnail and inspector must have identical orientation");
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_cr2_olympus_short_compression_parsing() {
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();
    let cr2_path = workspace_root.join("testdata/dest/Olympus-RAW/img_2888.cr2");
    if cr2_path.exists() {
        // 1. extract_embedded_thumbnail directly
        let thumb = extract_embedded_thumbnail(&cr2_path, None);
        assert!(thumb.is_some(), "Must extract embedded thumbnail from Canon/Olympus CR2");
        let bytes = thumb.unwrap();
        assert_eq!(bytes[0], 0xFF);
        assert_eq!(bytes[1], 0xD8);
        let img = image::load_from_memory(&bytes).expect("Extracted JPEG must decode cleanly");
        assert_eq!(img.width(), 1536);
        assert_eq!(img.height(), 1024);

        // 2. get_preview_jpeg at scale 1 (Grid view)
        let preview = get_preview_jpeg(&cr2_path, 1).expect("Must generate scale 1 grid preview");
        let img_preview = image::load_from_memory(&preview).expect("Grid preview JPEG must decode cleanly");
        assert!(img_preview.width() >= 720 || img_preview.height() >= 720);
    }

    // 3. Synthetic TIFF header slice with dirty upper 16 bits for Tag 0x0103 (e.g. 0xffdf0006)
    let mut synth = vec![0u8; 1024];
    // Header: "II", magic 42, offset 8
    synth[0..8].copy_from_slice(&[0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]);
    // IFD0: 3 entries
    synth[8..10].copy_from_slice(&3u16.to_le_bytes());
    // Entry 0: Tag 0x0103, type 3 (SHORT), count 1, value with dirty upper bytes: 0x06, 0x00, 0xDF, 0xFF
    synth[10..22].copy_from_slice(&[0x03, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0xDF, 0xFF]);
    // Entry 1: Tag 0x0111 (StripOffsets), type 4 (LONG), count 1, value 500
    synth[22..34].copy_from_slice(&[0x11, 0x01, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0xF4, 0x01, 0x00, 0x00]);
    // Entry 2: Tag 0x0117 (StripByteCounts), type 4 (LONG), count 1, value 50000
    synth[34..46].copy_from_slice(&[0x17, 0x01, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x50, 0xC3, 0x00, 0x00]);
    // Put JPEG SOI marker at offset 500
    synth[500] = 0xFF;
    synth[501] = 0xD8;

    let info = parse_tiff_header_slice(&synth, 0);
    assert_eq!(info.thumb_offset, Some(500), "Must parse StripOffsets even with dirty upper 16 bits in Compression tag");
    assert_eq!(info.thumb_length, Some(50000));

    // 4. Test is_legacy_black_raw_chunk detection
    let fake_broken_chunk = vec![0u8; 7007];
    let fake_valid_preview = vec![0u8; 50_000];
    assert!(is_legacy_black_raw_chunk(Path::new("img_2888.cr2"), &fake_broken_chunk), "7007-byte CR2 chunk must be recognized as legacy black chunk");
    assert!(!is_legacy_black_raw_chunk(Path::new("img_2888.cr2"), &fake_valid_preview), "Valid embedded preview must not be flagged");
    assert!(!is_legacy_black_raw_chunk(Path::new("photo.jpg"), &fake_broken_chunk), "Non-CR2 files must not be affected");
}
