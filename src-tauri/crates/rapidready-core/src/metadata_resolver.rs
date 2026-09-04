use std::fs::File;
use std::path::Path;
use chrono::NaiveDateTime;

#[derive(Debug, Clone, Default)]
pub struct ImageMetadata {
    pub date: Option<NaiveDateTime>,
    pub camera: Option<String>,
    pub lens: Option<String>,
    pub iso: Option<String>,
    pub aperture: Option<String>,
    pub shutter: Option<String>,
    pub focal_length: Option<String>,
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
        }
    }

    if let Some(d) = exif_date {
        meta.date = Some(d);
    } else {
        // Fallback to filename/fs timestamp only if EXIF didn't have a date
        meta.date = crate::date_resolver::get_creation_date(path).ok();
    }

    meta
}
