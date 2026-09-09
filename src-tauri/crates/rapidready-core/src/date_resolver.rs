use anyhow::{Context, Result};
use chrono::NaiveDateTime;
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
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

fn extract_date_from_exif(exif: &exif::Exif) -> Option<NaiveDateTime> {
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
                            return Some(dt);
                        }
                    }
                }
            }
        }
    }
    None
}

fn try_read_tiff_slice(file: &mut File, size: usize) -> Option<NaiveDateTime> {
    file.seek(SeekFrom::Start(0)).ok()?;
    let mut buf = vec![0u8; size];
    let n = file.read(&mut buf).ok()?;
    buf.truncate(n);
    if buf.len() < 8 {
        return None;
    }

    let mut reader = exif::Reader::new();
    reader.continue_on_error(true);
    let exif = match reader.read_raw(buf) {
        Ok(exif) => exif,
        Err(exif::Error::PartialResult(pr)) => pr.into_inner().0,
        Err(_) => return None,
    };
    extract_date_from_exif(&exif)
}

pub fn get_creation_date(path: &Path) -> Result<NaiveDateTime> {
    // 1. Try EXIF (kamadak-exif) with tiered header reading
    if let Ok(mut file) = File::open(path) {
        // Optimization for TIFF/RAW files (Sony ARW, Canon CR2, Nikon NEF, DNG, etc.):
        // Instead of reading the entire multi-megabyte file from slow SD cards,
        // read only the header chunk containing IFD0 and Exif Sub-IFD.
        let mut magic = [0u8; 4];
        if file.read_exact(&mut magic).is_ok() {
            let is_tiff = magic == [0x49, 0x49, 0x2a, 0x00] // II*
                       || magic == [0x4d, 0x4d, 0x00, 0x2a] // MM*
                       || (magic[0] == 0x49 && magic[1] == 0x49 && magic[2] == 0x55 && magic[3] == 0x00); // CR2: IIU

            if is_tiff {
                // Tier 1: 256 KB header slice (covers 99.9% of RAW files in < 1ms)
                if let Some(dt) = try_read_tiff_slice(&mut file, 256 * 1024) {
                    return Ok(dt);
                }
                // Tier 2: 2 MB header slice fallback (for rare RAWs with large IFD/embedded previews)
                if let Some(dt) = try_read_tiff_slice(&mut file, 2 * 1024 * 1024) {
                    return Ok(dt);
                }
            }
        }

        // Tier 3: Full container fallback (JPEG, HEIF, PNG, WebP, or rare TIFFs requiring full scan)
        // kamadak-exif handles JPEG/HEIC/PNG/WebP efficiently by reading only the APP1 / Exif box.
        if file.seek(SeekFrom::Start(0)).is_ok() {
            let mut bufreader = BufReader::new(file);
            let exifreader = exif::Reader::new();
            
            if let Ok(exif) = exifreader.read_from_container(&mut bufreader) {
                if let Some(dt) = extract_date_from_exif(&exif) {
                    return Ok(dt);
                }
            }
        }
    }
    
    // 2. Filename Parsing Fallback (for WhatsApp, scans, drone videos without EXIF)
    if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
        if let Some(dt) = parse_date_from_filename(filename) {
            return Ok(dt);
        }
    }
    
    // 3. Fallback to filesystem metadata (prefer modified over created)
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

    #[test]
    fn test_get_creation_date_cr2() {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();
        let path = workspace_root.join("testdata/dest/2014/2014-05-01/IMG_3126.CR2");
        if path.exists() {
            let date = get_creation_date(&path).unwrap();
            assert_eq!(date.format("%Y-%m-%d %H:%M:%S").to_string(), "2014-05-01 13:08:53");
        }
    }

    #[test]
    fn test_get_creation_date_jpg() {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap().parent().unwrap().parent().unwrap().parent().unwrap();
        let path = workspace_root.join("testdata/dest/2014/2014-08-25/DSC03058.JPG");
        if path.exists() {
            let date = get_creation_date(&path).unwrap();
            assert_eq!(date.format("%Y-%m-%d %H:%M:%S").to_string(), "2014-08-25 16:29:39");
        }
    }
}
