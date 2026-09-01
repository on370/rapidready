use anyhow::{Context, Result};
use chrono::NaiveDateTime;
use std::fs::File;
use std::path::Path;

pub fn get_creation_date(path: &Path) -> Result<NaiveDateTime> {
    // 1. Try EXIF (kamadak-exif)
    if let Ok(file) = File::open(path) {
        let mut bufreader = std::io::BufReader::new(&file);
        let exifreader = exif::Reader::new();
        
        if let Ok(exif) = exifreader.read_from_container(&mut bufreader) {
            if let Some(field) = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
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
    
    // 2. Fallback to filesystem metadata
    let meta = std::fs::metadata(path).context("Failed to read metadata")?;
    let sys_time = meta.created().or_else(|_| meta.modified()).context("No valid timestamp found")?;
    
    let dt: chrono::DateTime<chrono::Local> = sys_time.into();
    Ok(dt.naive_local())
}
