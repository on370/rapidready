use std::fs::File;
use std::path::Path;
use chrono::NaiveDateTime;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ImageMetadata {
    pub date: Option<NaiveDateTime>,
    pub camera: Option<String>,
    pub lens: Option<String>,
    pub iso: Option<String>,
    pub aperture: Option<String>,
    pub shutter: Option<String>,
    pub focal_length: Option<String>,
    pub is_raw: bool,
    pub is_monochrome_sensor: bool,
    pub is_monochrome_preview: bool,
}

pub fn is_raw_path(path: &Path) -> bool {
    let raw_exts = [
        "cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", "pef", "3fr", "x3f", "nrw",
    ];
    path.extension()
        .and_then(|s| s.to_str())
        .map(|ext| raw_exts.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn get_image_metadata(path: &Path) -> ImageMetadata {
    let mut meta = ImageMetadata::default();

    // Single-pass: Open file ONCE and extract date + EXIF tags simultaneously
    let mut exif_date = None;
    if let Ok(file) = File::open(path) {
        let mut bufreader = std::io::BufReader::new(&file);
        let exifreader = exif::Reader::new();
        
        if let Ok(exif) = exifreader.read_from_container(&mut bufreader) {
            // 1. Date extraction from EXIF
            let tags_to_try = [
                exif::Tag::DateTimeOriginal,
                exif::Tag::DateTimeDigitized,
                exif::Tag::DateTime,
                exif::Tag::GPSDateStamp,
            ];
            for tag in tags_to_try {
                if let Some(field) = exif.get_field(tag, exif::In::PRIMARY) {
                    if let exif::Value::Ascii(ref vec) = field.value {
                        if let Some(val) = vec.first() {
                            if let Ok(dt_str) = std::str::from_utf8(val) {
                                if let Ok(dt) = NaiveDateTime::parse_from_str(dt_str.trim(), "%Y:%m:%d %H:%M:%S") {
                                    exif_date = Some(dt);
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // 2. Camera Model
            if let Some(field) = exif.get_field(exif::Tag::Model, exif::In::PRIMARY) {
                let model = field.display_value().to_string().trim().trim_matches('"').to_string();
                if !model.is_empty() {
                    meta.camera = Some(model);
                }
            }

            // 3. Lens Model
            if let Some(field) = exif.get_field(exif::Tag::LensModel, exif::In::PRIMARY) {
                let lens = field.display_value().to_string().trim().trim_matches('"').to_string();
                if !lens.is_empty() {
                    meta.lens = Some(lens);
                }
            }

            // 4. ISO
            let iso_tag = exif.get_field(exif::Tag::PhotographicSensitivity, exif::In::PRIMARY)
                .or_else(|| exif.get_field(exif::Tag::ISOSpeed, exif::In::PRIMARY));
            if let Some(field) = iso_tag {
                let iso = field.display_value().to_string().trim().to_string();
                if !iso.is_empty() {
                    meta.iso = Some(iso);
                }
            }

            // 5. Aperture (FNumber)
            if let Some(field) = exif.get_field(exif::Tag::FNumber, exif::In::PRIMARY) {
                let f_str = field.display_value().to_string().trim().to_string();
                if !f_str.is_empty() {
                    let formatted = if f_str.starts_with("f/") {
                        f_str
                    } else {
                        format!("f/{}", f_str)
                    };
                    meta.aperture = Some(formatted);
                }
            }

            // 6. Shutter Speed (ExposureTime)
            if let Some(field) = exif.get_field(exif::Tag::ExposureTime, exif::In::PRIMARY) {
                let exp_str = field.display_value().to_string().trim().to_string();
                if !exp_str.is_empty() {
                    let formatted = if exp_str.ends_with('s') {
                        exp_str
                    } else {
                        format!("{}s", exp_str)
                    };
                    meta.shutter = Some(formatted);
                }
            }

            // 7. Focal Length
            if let Some(field) = exif.get_field(exif::Tag::FocalLength, exif::In::PRIMARY) {
                let fl = field.display_value().with_unit(&exif).to_string();
                if !fl.is_empty() {
                    meta.focal_length = Some(fl);
                }
            }

            // 8. Monochrome Sensor Check via EXIF PhotometricInterpretation & CFAPattern
            if let Some(field) = exif.get_field(exif::Tag::PhotometricInterpretation, exif::In::PRIMARY) {
                if let Some(val) = field.value.get_uint(0) {
                    // 0 = WhiteIsZero, 1 = BlackIsZero (Standard Grayscale/Monochrome sensor)
                    // 32803 = CFA (Color Filter Array)
                    let has_cfa = exif.get_field(exif::Tag::CFAPattern, exif::In::PRIMARY).is_some();
                    if (val == 0 || val == 1) && !has_cfa {
                        meta.is_monochrome_sensor = true;
                    }
                }
            }
        }
    }

    // Camera model-based monochrome sensor detection (Leica Monochrom, Pentax K-3 Monochrome, Phase One Achromatic)
    if !meta.is_monochrome_sensor {
        if let Some(ref model) = meta.camera {
            let lower = model.to_lowercase();
            if lower.contains("monochrom") || lower.contains("achromatic") {
                meta.is_monochrome_sensor = true;
            }
        }
    }

    meta.is_raw = is_raw_path(path);

    // If it's a RAW file and not already a physical monochrome sensor, check if the in-camera preview is monochrome
    if meta.is_raw && !meta.is_monochrome_sensor {
        meta.is_monochrome_preview = is_embedded_preview_monochrome(path);
    } else if meta.is_monochrome_sensor {
        meta.is_monochrome_preview = true;
    }

    if let Some(d) = exif_date {
        meta.date = Some(d);
    } else {
        // Fallback to filename/fs timestamp only if EXIF didn't have a date
        meta.date = crate::date_resolver::get_creation_date(path).ok();
    }

    meta
}

/// Checks whether an embedded JPEG preview is monochrome (grayscale or B/W camera picture profile).
pub fn is_embedded_preview_monochrome(path: &Path) -> bool {
    let thumb_bytes = match crate::thumbnail::extract_embedded_thumbnail(path, None) {
        Some(b) => b,
        None => return false,
    };

    // 1. Fast SOF marker check: If JPEG has only 1 component, it's definitively grayscale.
    if let Some(is_grayscale) = check_jpeg_grayscale_header(&thumb_bytes) {
        if is_grayscale {
            return true;
        }
    }

    // 2. Chroma analysis on decoded thumbnail for 3-component YCbCr/RGB B/W profiles.
    if let Ok(dyn_img) = image::load_from_memory(&thumb_bytes) {
        let rgb = dyn_img.to_rgb8();
        let raw = rgb.as_raw();
        if raw.is_empty() {
            return false;
        }

        let mut colored_samples = 0;
        let mut total_samples = 0;

        // Sample every 4th pixel (fast stride)
        for chunk in raw.chunks_exact(3).step_by(4) {
            total_samples += 1;
            let r = chunk[0] as i32;
            let g = chunk[1] as i32;
            let b = chunk[2] as i32;

            let diff = (r - g).abs().max((g - b).abs()).max((r - b).abs());
            // Chroma difference > 8 allows for 4:2:0 subsampling and compression artifacts in B/W photos
            if diff > 8 {
                colored_samples += 1;
                // Early exit: if more than 25 sampled pixels have significant color, it's definitely a color preview
                if colored_samples > 25 {
                    return false;
                }
            }
        }

        if total_samples > 0 && colored_samples <= 25 {
            return true;
        }
    }

    false
}

/// Inspects the JPEG header for SOF markers to check if the image has only 1 component (grayscale).
fn check_jpeg_grayscale_header(bytes: &[u8]) -> Option<bool> {
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return None;
    }
    let mut pos = 2;
    while pos + 4 < bytes.len() {
        if bytes[pos] != 0xFF {
            pos += 1;
            continue;
        }
        let marker = bytes[pos + 1];
        if marker == 0xD8 || marker == 0xD9 || marker == 0x00 || (marker >= 0xD0 && marker <= 0xD7) {
            pos += 2;
            continue;
        }
        if pos + 4 > bytes.len() {
            break;
        }
        let length = ((bytes[pos + 2] as usize) << 8) | (bytes[pos + 3] as usize);
        if length < 2 || pos + 2 + length > bytes.len() {
            break;
        }
        // SOF markers: SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2), SOF3 (0xC3),
        // SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 (excluding DHT 0xC4, JPG 0xC8, DAC 0xCC)
        if (0xC0..=0xCF).contains(&marker) && marker != 0xC4 && marker != 0xC8 && marker != 0xCC {
            // Byte 9 of marker payload is number of components
            if pos + 9 < bytes.len() {
                let num_components = bytes[pos + 9];
                return Some(num_components == 1);
            }
        }
        pos += 2 + length;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_is_raw_path() {
        assert!(is_raw_path(Path::new("photo.CR2")));
        assert!(is_raw_path(Path::new("photo.cr3")));
        assert!(is_raw_path(Path::new("photo.ARW")));
        assert!(is_raw_path(Path::new("photo.nef")));
        assert!(is_raw_path(Path::new("photo.DNG")));
        assert!(is_raw_path(Path::new("photo.raf")));
        assert!(is_raw_path(Path::new("photo.rw2")));
        assert!(!is_raw_path(Path::new("photo.jpg")));
        assert!(!is_raw_path(Path::new("photo.jpeg")));
        assert!(!is_raw_path(Path::new("photo.png")));
    }

    #[test]
    fn test_real_raw_metadata_and_monochrome_detection() {
        let arw_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../testdata/dest/2023/2023-09-24/DSC02268.ARW");
        if arw_path.exists() {
            let meta = get_image_metadata(&arw_path);
            assert!(meta.is_raw, "DSC02268.ARW must be detected as RAW");
            assert!(!meta.is_monochrome_sensor, "Sony ILCE-7RM4 is not a monochrome sensor");
            assert!(!meta.is_monochrome_preview, "DSC02268 preview is a color photo");
            assert_eq!(meta.camera.as_deref(), Some("ILCE-7RM4"));
        }

        let cr2_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../testdata/dest/2014/2014-05-01/IMG_2978.CR2");
        if cr2_path.exists() {
            let meta = get_image_metadata(&cr2_path);
            assert!(meta.is_raw, "IMG_2978.CR2 must be detected as RAW");
            assert!(!meta.is_monochrome_sensor, "Canon 6D is not a monochrome sensor");
            assert!(!meta.is_monochrome_preview, "IMG_2978 preview is a color photo");
        }

        let dng_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../testdata/dest/2024/2024-01-13/R0002005.DNG");
        if dng_path.exists() {
            let meta = get_image_metadata(&dng_path);
            assert!(meta.is_raw, "R0002005.DNG must be detected as RAW");
            assert!(!meta.is_monochrome_sensor, "RICOH GR III is not a monochrome sensor");
            assert!(!meta.is_monochrome_preview, "R0002005 preview is a color photo");
        }
    }

    #[test]
    fn test_monochrome_camera_model_detection() {
        let models = [
            ("Leica M Monochrom", true),
            ("LEICA M10 MONOCHROM", true),
            ("Leica Q2 Monochrom", true),
            ("PENTAX K-3 Mark III Monochrome", true),
            ("Phase One IQ4 150MP Achromatic", true),
            ("Sony ILCE-7M4", false),
            ("Canon EOS R5", false),
            ("FUJIFILM X-T5", false),
        ];

        for (model, expected) in models {
            let lower = model.to_lowercase();
            let is_mono = lower.contains("monochrom") || lower.contains("achromatic");
            assert_eq!(is_mono, expected, "Model: {}", model);
        }
    }
}
