use anyhow::{Context, Result};
use chrono::NaiveDateTime;
use std::fs::File;
use std::path::Path;
use regex::Regex;
use std::sync::LazyLock;

static RE_COMPACT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:img|vid|dsc)_?(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})").unwrap()
});

static RE_DASH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(\d{4})-(\d{2})-(\d{2})[_-](\d{2})[-_]?(\d{2})[-_]?(\d{2})").unwrap()
});

pub fn parse_date_from_filename(filename: &str) -> Option<NaiveDateTime> {
    if let Some(caps) = RE_COMPACT.captures(filename) {
        if let Ok(dt) = NaiveDateTime::parse_from_str(
            &format!("{}-{}-{} {}:{}:{}", &caps[1], &caps[2], &caps[3], &caps[4], &caps[5], &caps[6]),
            "%Y-%m-%d %H:%M:%S",
        ) {
            return Some(dt);
        }
    }
    if let Some(caps) = RE_DASH.captures(filename) {
        if let Ok(dt) = NaiveDateTime::parse_from_str(
            &format!("{}-{}-{} {}:{}:{}", &caps[1], &caps[2], &caps[3], &caps[4], &caps[5], &caps[6]),
            "%Y-%m-%d %H:%M:%S",
        ) {
            return Some(dt);
        }
    }
    None
}

pub fn get_fast_creation_date(path: &Path, meta: Option<&std::fs::Metadata>) -> Option<NaiveDateTime> {
    // 1. EXIF / Metadata is the absolute authority!
    if let Ok(dt) = get_creation_date(path) {
        return Some(dt);
    }

    // 2. Fallback: Try parsing date from filename (e.g. Scans, Screenshots, WhatsApp files without EXIF)
    if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
        if let Some(dt) = parse_date_from_filename(filename) {
            return Some(dt);
        }
    }

    // 3. Last resort fallback: Filesystem timestamp (prefer modified over created)
    if let Some(m) = meta {
        if let Ok(sys_time) = m.modified().or_else(|_| m.created()) {
            let dt: chrono::DateTime<chrono::Local> = sys_time.into();
            return Some(dt.naive_local());
        }
    }

    None
}

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
                // Check PRIMARY first, or search across all IFDs (e.g. Sony ARW Exif IFD)
                let field = exif.get_field(tag, exif::In::PRIMARY)
                    .or_else(|| exif.fields().find(|f| f.tag == tag));
                if let Some(field) = field {
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
        if let Some(dt) = parse_date_from_filename(filename) {
            return Ok(dt);
        }
    }
    
    // 4. Fallback to filesystem metadata
    let meta = std::fs::metadata(path).context("Failed to read metadata")?;
    let sys_time = meta.modified().or_else(|_| meta.created()).context("No valid timestamp found")?;
    
    let dt: chrono::DateTime<chrono::Local> = sys_time.into();
    Ok(dt.naive_local())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_date_from_filename() {
        let dt1 = parse_date_from_filename("IMG_20260815_143022.JPG");
        assert!(dt1.is_some());
        let dt1 = dt1.unwrap();
        assert_eq!(dt1.format("%Y-%m-%d %H:%M:%S").to_string(), "2026-08-15 14:30:22");

        let dt2 = parse_date_from_filename("2026-08-15_14-30-22.dng");
        assert!(dt2.is_some());
        let dt2 = dt2.unwrap();
        assert_eq!(dt2.format("%Y-%m-%d %H:%M:%S").to_string(), "2026-08-15 14:30:22");

        let dt3 = parse_date_from_filename("_DSC1234.ARW");
        assert!(dt3.is_none());
    }

    #[test]
    fn test_get_fast_creation_date_prefers_exif() {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();
        let path = workspace_root.join("testdata/dest/2023/2023-10-03/DSC02298.ARW");
        if path.exists() {
            let meta = std::fs::metadata(&path).ok();
            let date = get_fast_creation_date(&path, meta.as_ref()).unwrap();
            assert_eq!(date.format("%Y-%m-%d").to_string(), "2023-10-03");
        }
    }
}
