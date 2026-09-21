use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use anyhow::{Context, Result};
use chrono::{Duration, NaiveDateTime};
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView};
use regex::bytes::Regex;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "mode", content = "value", rename_all = "camelCase")]
pub enum ExportResizeMode {
    Original,
    LongEdge(u32),
    Custom { width: u32, height: u32 },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CollectionExportOptions {
    pub album_id: String,
    pub destination_dir: String,
    pub filename_prefix: String,
    pub digits: usize,
    pub preserve_original_name: bool,
    pub resize_mode: ExportResizeMode,
    pub jpeg_quality: u8,
    pub synthesize_exif_dates: bool,
    #[serde(default)]
    pub is_sequential: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub current: usize,
    pub total: usize,
    pub filename: String,
}

/// Injects or updates the EXIF DateTime and DateTimeOriginal tags in JPEG bytes.
/// If an existing EXIF timestamp pattern is found in the header, updates in-place.
/// Otherwise, prepends a clean, standard APP1 Exif segment.
pub fn inject_or_update_exif_date(jpeg_bytes: &[u8], date: NaiveDateTime) -> Vec<u8> {
    if jpeg_bytes.len() < 4 || jpeg_bytes[0] != 0xFF || jpeg_bytes[1] != 0xD8 {
        return jpeg_bytes.to_vec();
    }

    let date_str = date.format("%Y:%m:%d %H:%M:%S").to_string();
    let date_bytes = date_str.as_bytes();

    // 1. Check if there are already ASCII date patterns in the first 64KB
    let search_len = jpeg_bytes.len().min(65536);
    let re = Regex::new(r"\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}").unwrap();
    let mut updated = jpeg_bytes.to_vec();
    let mut found = false;

    for mat in re.find_iter(&jpeg_bytes[..search_len]) {
        let start = mat.start();
        let end = mat.end();
        if end - start == 19 {
            updated[start..end].copy_from_slice(date_bytes);
            found = true;
        }
    }

    if found {
        return updated;
    }

    // 2. No existing date found: Build a minimal valid APP1 EXIF segment
    let app1_segment = build_minimal_app1_exif(&date_str);

    // Insert APP1 segment right after JPEG SOI marker (0xFF, 0xD8)
    let mut result = Vec::with_capacity(jpeg_bytes.len() + app1_segment.len());
    result.extend_from_slice(&jpeg_bytes[..2]); // 0xFF, 0xD8
    result.extend_from_slice(&app1_segment);
    result.extend_from_slice(&jpeg_bytes[2..]);
    result
}

/// Builds a minimal, 100% compliant APP1 EXIF segment containing DateTime and DateTimeOriginal tags.
fn build_minimal_app1_exif(date_str: &str) -> Vec<u8> {
    let mut tiff = Vec::with_capacity(76);
    // TIFF Header (Little Endian "II")
    tiff.extend_from_slice(b"II\x2A\x00\x08\x00\x00\x00"); // 8 bytes, offset to IFD0 = 8

    // IFD0: 2 entries (DateTime + ExifIFDPointer)
    tiff.extend_from_slice(&2u16.to_le_bytes()); // Count: 2

    // Entry 0: DateTime (0x0132), ASCII (2), Count 20, Offset 56
    tiff.extend_from_slice(&0x0132u16.to_le_bytes());
    tiff.extend_from_slice(&2u16.to_le_bytes());
    tiff.extend_from_slice(&20u32.to_le_bytes());
    tiff.extend_from_slice(&56u32.to_le_bytes());

    // Entry 1: ExifIFDPointer (0x8769), LONG (4), Count 1, Offset 38
    tiff.extend_from_slice(&0x8769u16.to_le_bytes());
    tiff.extend_from_slice(&4u16.to_le_bytes());
    tiff.extend_from_slice(&1u32.to_le_bytes());
    tiff.extend_from_slice(&38u32.to_le_bytes());

    // Next IFD offset: 0
    tiff.extend_from_slice(&0u32.to_le_bytes());

    // ExifIFD (Offset 38): 1 entry (DateTimeOriginal)
    tiff.extend_from_slice(&1u16.to_le_bytes()); // Count: 1
    // Entry 0: DateTimeOriginal (0x9003), ASCII (2), Count 20, Offset 56
    tiff.extend_from_slice(&0x9003u16.to_le_bytes());
    tiff.extend_from_slice(&2u16.to_le_bytes());
    tiff.extend_from_slice(&20u32.to_le_bytes());
    tiff.extend_from_slice(&56u32.to_le_bytes());
    // Next IFD offset: 0
    tiff.extend_from_slice(&0u32.to_le_bytes());

    // Date string at Offset 56 (20 bytes: 19 chars + null byte)
    tiff.extend_from_slice(date_str.as_bytes());
    tiff.push(0x00);

    // APP1 Header: 0xFF, 0xE1, length (big endian: 2 + 6 + tiff.len()), b"Exif\0\0"
    let app1_len = (2 + 6 + tiff.len()) as u16;
    let mut segment = Vec::with_capacity(4 + 6 + tiff.len());
    segment.push(0xFF);
    segment.push(0xE1);
    segment.extend_from_slice(&app1_len.to_be_bytes());
    segment.extend_from_slice(b"Exif\0\0");
    segment.extend_from_slice(&tiff);

    segment
}

/// Downscales an image preserving aspect ratio according to ExportResizeMode
fn resize_image(img: DynamicImage, mode: &ExportResizeMode) -> DynamicImage {
    match mode {
        ExportResizeMode::Original => img,
        ExportResizeMode::LongEdge(max_edge) => {
            let (w, h) = img.dimensions();
            if w <= *max_edge && h <= *max_edge {
                img
            } else if w >= h {
                img.resize(*max_edge, u32::MAX, FilterType::Lanczos3)
            } else {
                img.resize(u32::MAX, *max_edge, FilterType::Lanczos3)
            }
        }
        ExportResizeMode::Custom { width, height } => {
            img.resize(*width, *height, FilterType::Lanczos3)
        }
    }
}

/// Runs the sequential export for a collection of image paths.
/// Produces genuine file copies only with sequential naming, optional resizing, and optional synthetic linear EXIF timestamps.
pub fn run_collection_export<F>(
    image_paths: &[String],
    options: &CollectionExportOptions,
    is_cancelled: Arc<AtomicBool>,
    mut on_progress: F,
) -> Result<usize>
where
    F: FnMut(ExportProgress),
{
    let dest_dir = Path::new(&options.destination_dir);
    if !dest_dir.exists() {
        fs::create_dir_all(dest_dir).context("Failed to create export destination directory")?;
    }

    let total = image_paths.len();
    let should_synthesize = options.is_sequential && options.synthesize_exif_dates;

    let base_date = if should_synthesize && !image_paths.is_empty() {
        // Resolve base date from first valid image or use current time
        let first_path = Path::new(&image_paths[0]);
        crate::date_resolver::get_fast_creation_date(first_path, None)
            .unwrap_or_else(|| chrono::Local::now().naive_local())
    } else {
        chrono::Local::now().naive_local()
    };

    let mut exported_count = 0;

    for (index, path_str) in image_paths.iter().enumerate() {
        if is_cancelled.load(Ordering::Relaxed) {
            break;
        }

        let src_path = Path::new(path_str);
        if !src_path.exists() {
            continue;
        }

        let stem = src_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image");

        let target_filename = if options.is_sequential {
            let num = index + 1;
            let formatted_num = format!("{:0width$}", num, width = options.digits);
            if options.preserve_original_name {
                format!("{}{}_{}.jpg", options.filename_prefix, formatted_num, stem)
            } else {
                format!("{}{}.jpg", options.filename_prefix, formatted_num)
            }
        } else {
            format!("{}{}.jpg", options.filename_prefix, stem)
        };

        // Collision protection: ensure unique target filename if file already exists
        let mut target_path = dest_dir.join(&target_filename);
        let mut collision_seq = 1;
        while target_path.exists() {
            let coll_filename = if options.is_sequential {
                let num = index + 1;
                let formatted_num = format!("{:0width$}", num, width = options.digits);
                if options.preserve_original_name {
                    format!("{}{}_{}_{}.jpg", options.filename_prefix, formatted_num, stem, collision_seq)
                } else {
                    format!("{}{}_{}.jpg", options.filename_prefix, formatted_num, collision_seq)
                }
            } else {
                format!("{}{}_{}.jpg", options.filename_prefix, stem, collision_seq)
            };
            target_path = dest_dir.join(&coll_filename);
            collision_seq += 1;
        }

        let ext = src_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let is_jpeg = ext == "jpg" || ext == "jpeg";

        // Synthetic timestamp for this index: base + index * 10 seconds
        let current_date = base_date + Duration::seconds((index as i64) * 10);

        // Fast path: direct copy if original JPEG, no resizing, and no EXIF synthesis
        if is_jpeg
            && options.resize_mode == ExportResizeMode::Original
            && !should_synthesize
        {
            fs::copy(src_path, &target_path).context("Failed to copy image file")?;
        } else {
            // Need processing (RAW conversion, resizing, or EXIF injection)
            let mut jpeg_bytes = if is_jpeg && options.resize_mode == ExportResizeMode::Original {
                fs::read(src_path).context("Failed to read JPEG")?
            } else {
                // Decode preview or image
                let raw_or_img_bytes = crate::thumbnail::get_max_preview_jpeg(src_path)
                    .or_else(|_| fs::read(src_path))
                    .context("Failed to obtain image data for export")?;

                let dynamic_img = image::load_from_memory(&raw_or_img_bytes)
                    .context("Failed to decode image")?;

                let processed_img = resize_image(dynamic_img, &options.resize_mode);

                let mut encoded_buf = Vec::new();
                let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                    &mut encoded_buf,
                    options.jpeg_quality.clamp(1, 100),
                );
                encoder
                    .encode_image(&processed_img)
                    .context("Failed to encode JPEG")?;
                encoded_buf
            };

            if should_synthesize {
                jpeg_bytes = inject_or_update_exif_date(&jpeg_bytes, current_date);
            }

            fs::write(&target_path, jpeg_bytes).context("Failed to write exported JPEG")?;
        }

        exported_count += 1;
        let actual_filename = target_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&target_filename)
            .to_string();

        on_progress(ExportProgress {
            current: exported_count,
            total,
            filename: actual_filename,
        });
    }

    Ok(exported_count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufReader, Cursor};
    use image::ImageFormat;

    #[test]
    fn test_exif_injection_and_parsing() {
        // Create minimal 1x1 black JPEG
        let img = DynamicImage::new_rgb8(1, 1);
        let mut jpeg_bytes = Vec::new();
        img.write_to(&mut Cursor::new(&mut jpeg_bytes), ImageFormat::Jpeg).unwrap();

        let date = NaiveDateTime::parse_from_str("2026-09-20 16:45:30", "%Y-%m-%d %H:%M:%S").unwrap();
        let updated = inject_or_update_exif_date(&jpeg_bytes, date);

        // Verify with kamadak-exif
        let mut reader = BufReader::new(Cursor::new(&updated));
        let exifreader = exif::Reader::new();
        let exif = exifreader.read_from_container(&mut reader).expect("Must read EXIF container");

        let original = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY)
            .expect("Must have DateTimeOriginal");
        assert_eq!(original.display_value().to_string(), "2026-09-20 16:45:30");
    }

    #[test]
    fn test_sequential_and_standard_export() {
        let temp_dir = std::env::temp_dir().join(format!("rr_export_test_{}", std::process::id()));
        let src_dir = temp_dir.join("src");
        let dest_dir = temp_dir.join("dest");
        let _ = fs::create_dir_all(&src_dir);
        let _ = fs::create_dir_all(&dest_dir);

        // Create 2 test jpeg files
        let img = DynamicImage::new_rgb8(10, 10);
        let img1_path = src_dir.join("photo_a.jpg");
        let img2_path = src_dir.join("photo_b.jpg");
        img.save_with_format(&img1_path, ImageFormat::Jpeg).unwrap();
        img.save_with_format(&img2_path, ImageFormat::Jpeg).unwrap();

        let image_paths = vec![
            img1_path.to_str().unwrap().to_string(),
            img2_path.to_str().unwrap().to_string(),
        ];

        // 1. Sequential export
        let seq_opts = CollectionExportOptions {
            album_id: "test".into(),
            destination_dir: dest_dir.to_str().unwrap().into(),
            filename_prefix: "Book_".into(),
            digits: 3,
            preserve_original_name: true,
            resize_mode: ExportResizeMode::Original,
            jpeg_quality: 90,
            synthesize_exif_dates: true,
            is_sequential: true,
        };

        let count = run_collection_export(
            &image_paths,
            &seq_opts,
            Arc::new(AtomicBool::new(false)),
            |_| {},
        ).unwrap();

        assert_eq!(count, 2);
        assert!(dest_dir.join("Book_001_photo_a.jpg").exists());
        assert!(dest_dir.join("Book_002_photo_b.jpg").exists());

        // 2. Standard export (non-sequential, no prefix) into a new subfolder
        let dest_std = temp_dir.join("dest_std");
        let std_opts = CollectionExportOptions {
            album_id: "test".into(),
            destination_dir: dest_std.to_str().unwrap().into(),
            filename_prefix: "".into(),
            digits: 3,
            preserve_original_name: false,
            resize_mode: ExportResizeMode::Original,
            jpeg_quality: 90,
            synthesize_exif_dates: false,
            is_sequential: false,
        };

        let count_std = run_collection_export(
            &image_paths,
            &std_opts,
            Arc::new(AtomicBool::new(false)),
            |_| {},
        ).unwrap();

        assert_eq!(count_std, 2);
        assert!(dest_std.join("photo_a.jpg").exists());
        assert!(dest_std.join("photo_b.jpg").exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
