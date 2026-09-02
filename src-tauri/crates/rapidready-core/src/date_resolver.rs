use anyhow::{Context, Result};
use chrono::NaiveDateTime;
use std::fs::File;
use std::path::Path;
use regex::Regex;

pub fn get_creation_date(path: &Path) -> Result<NaiveDateTime> {
    // 1. & 2. Try EXIF (kamadak-exif) - Primary and Fallbacks
    if let Ok(file) = File::open(path) {
        let mut bufreader = std::io::BufReader::new(&file);
        let exifreader = exif::Reader::new();
        
        if let Ok(exif) = exifreader.read_from_container(&mut bufreader) {
            let tags_to_try = [
                exif::Tag::DateTimeOriginal,
                exif::Tag::DateTimeDigitized, // sometimes CreateDate
                exif::Tag::DateTime,          // sometimes ModifyDate
                exif::Tag::GPSDateStamp,
            ];
            
            for tag in tags_to_try {
                if let Some(field) = exif.get_field(tag, exif::In::PRIMARY) {
                    if let exif::Value::Ascii(ref vec) = field.value {
                        if let Some(val) = vec.first() {
                            if let Ok(dt_str) = std::str::from_utf8(val) {
                                // EXIF standard date format: "YYYY:MM:DD HH:MM:SS"
                                if let Ok(dt) = NaiveDateTime::parse_from_str(dt_str.trim(), "%Y:%m:%d %H:%M:%S") {
                                    return Ok(dt);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // 3. Filename Parsing Fallback
    if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
        // Match formats like IMG_20250718_143022.jpg
        let re_compact = Regex::new(r"(?i)(?:img|vid|dsc)_?(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})").unwrap();
        if let Some(caps) = re_compact.captures(filename) {
            if let Ok(dt) = NaiveDateTime::parse_from_str(
                &format!("{}-{}-{} {}:{}:{}", &caps[1], &caps[2], &caps[3], &caps[4], &caps[5], &caps[6]),
                "%Y-%m-%d %H:%M:%S"
            ) {
                return Ok(dt);
            }
        }
        
        // Match formats like 2025-07-18_14-30-22
        let re_dash = Regex::new(r"(\d{4})-(\d{2})-(\d{2})[_-](\d{2})[-_]?(\d{2})[-_]?(\d{2})").unwrap();
        if let Some(caps) = re_dash.captures(filename) {
            if let Ok(dt) = NaiveDateTime::parse_from_str(
                &format!("{}-{}-{} {}:{}:{}", &caps[1], &caps[2], &caps[3], &caps[4], &caps[5], &caps[6]),
                "%Y-%m-%d %H:%M:%S"
            ) {
                return Ok(dt);
            }
        }
    }
    
    // 4. Fallback to filesystem metadata
    let meta = std::fs::metadata(path).context("Failed to read metadata")?;
    let sys_time = meta.created().or_else(|_| meta.modified()).context("No valid timestamp found")?;
    
    let dt: chrono::DateTime<chrono::Local> = sys_time.into();
    Ok(dt.naive_local())
}
