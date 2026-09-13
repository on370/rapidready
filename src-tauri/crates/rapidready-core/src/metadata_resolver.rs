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
    #[serde(default)]
    pub latitude: Option<f64>,
    #[serde(default)]
    pub longitude: Option<f64>,
    #[serde(default)]
    pub altitude: Option<f64>,
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

            // 9. GPS Coordinates (Latitude, Longitude, Altitude) from EXIF
            let lat_field = exif.fields().find(|f| f.tag == exif::Tag::GPSLatitude);
            let lat_ref = exif.fields().find(|f| f.tag == exif::Tag::GPSLatitudeRef);
            if let Some(f) = lat_field {
                meta.latitude = parse_gps_coord(f, lat_ref);
            }

            let lon_field = exif.fields().find(|f| f.tag == exif::Tag::GPSLongitude);
            let lon_ref = exif.fields().find(|f| f.tag == exif::Tag::GPSLongitudeRef);
            if let Some(f) = lon_field {
                meta.longitude = parse_gps_coord(f, lon_ref);
            }

            let alt_field = exif.fields().find(|f| f.tag == exif::Tag::GPSAltitude);
            let alt_ref = exif.fields().find(|f| f.tag == exif::Tag::GPSAltitudeRef);
            if let Some(f) = alt_field {
                if let exif::Value::Rational(ref vec) = f.value {
                    if let Some(first) = vec.first() {
                        if let Some(mut alt) = rational_to_f64(first) {
                            if let Some(r) = alt_ref {
                                if let Some(ref_byte) = r.value.get_uint(0) {
                                    if ref_byte == 1 {
                                        alt = -alt;
                                    }
                                }
                            }
                            meta.altitude = Some(alt);
                        }
                    }
                }
            }
        }
    }

    // Precedence: Check if .rrdata sidecar has manual GPS overrides
    let sidecar_path = crate::culling::get_sidecar_path(path);
    if let Ok(contents) = std::fs::read_to_string(&sidecar_path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&contents) {
            if let Some(gps_obj) = val.get("gps").and_then(|v| v.as_object()) {
                if let (Some(lat), Some(lon)) = (
                    gps_obj.get("latitude").and_then(|v| v.as_f64()),
                    gps_obj.get("longitude").and_then(|v| v.as_f64()),
                ) {
                    meta.latitude = Some(lat);
                    meta.longitude = Some(lon);
                    meta.altitude = gps_obj.get("altitude").and_then(|v| v.as_f64());
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

fn rational_to_f64(r: &exif::Rational) -> Option<f64> {
    if r.denom == 0 {
        None
    } else {
        Some(r.num as f64 / r.denom as f64)
    }
}

fn parse_gps_coord(coord_field: &exif::Field, ref_field: Option<&exif::Field>) -> Option<f64> {
    if let exif::Value::Rational(ref vec) = coord_field.value {
        if vec.len() >= 3 {
            let deg = rational_to_f64(&vec[0])?;
            let min = rational_to_f64(&vec[1])?;
            let sec = rational_to_f64(&vec[2])?;
            let mut val = deg + (min / 60.0) + (sec / 3600.0);
            if let Some(r) = ref_field {
                let ref_str = r.display_value().to_string();
                if ref_str.contains('S') || ref_str.contains('s') || ref_str.contains('W') || ref_str.contains('w') {
                    val = -val;
                }
            }
            return Some(val);
        }
    }
    None
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

    #[test]
    fn test_gps_metadata_extraction() {
        let ios_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../testdata/dest/2022/2022-01-22-gaga/20220122_122303000_iOS.jpg");
        if ios_path.exists() {
            let meta = get_image_metadata(&ios_path);
            assert!(meta.latitude.is_some(), "iOS photo should have latitude: {:?}", meta.latitude);
            assert!(meta.longitude.is_some(), "iOS photo should have longitude: {:?}", meta.longitude);
            let lat = meta.latitude.unwrap();
            let lon = meta.longitude.unwrap();
            assert!(lat > -90.0 && lat < 90.0, "Latitude out of range: {}", lat);
            assert!(lon > -180.0 && lon < 180.0, "Longitude out of range: {}", lon);
        }
    }

    #[test]
    fn test_gps_sidecar_override() {
        let temp_dir = std::env::temp_dir().join(format!("rr_gps_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let dummy_img = temp_dir.join("test_img.jpg");
        let _ = std::fs::write(&dummy_img, b"fake jpeg data");
        let sidecar = temp_dir.join("test_img.jpg.rrdata");
        let sidecar_json = r#"{
            "version": 1,
            "rating": 5,
            "gps": {
                "latitude": 48.13715,
                "longitude": 11.57542,
                "altitude": 520.0
            }
        }"#;
        let _ = std::fs::write(&sidecar, sidecar_json);

        let meta = get_image_metadata(&dummy_img);
        assert_eq!(meta.latitude, Some(48.13715));
        assert_eq!(meta.longitude, Some(11.57542));
        assert_eq!(meta.altitude, Some(520.0));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
