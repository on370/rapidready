use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use chrono::NaiveDateTime;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ImageMetadata {
    pub date: Option<NaiveDateTime>,
    pub date_modified: Option<NaiveDateTime>,
    pub camera: Option<String>,
    pub lens: Option<String>,
    pub iso: Option<String>,
    pub aperture: Option<String>,
    pub shutter: Option<String>,
    pub focal_length: Option<String>,
    pub exposure_bias: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub is_raw: bool,
    #[serde(default)]
    pub is_video: bool,
    pub is_monochrome_sensor: bool,
    pub is_monochrome_preview: bool,
    #[serde(default)]
    pub latitude: Option<f64>,
    #[serde(default)]
    pub longitude: Option<f64>,
    #[serde(default)]
    pub altitude: Option<f64>,
}

pub fn is_video_path(path: &Path) -> bool {
    let video_exts = [
        "mp4", "mov", "m4v", "avi", "mkv", "mts", "m2ts", "wmv", "webm", "flv",
        "3gp", "3g2", "mpg", "mpeg", "m2v", "mod", "tod", "vob",
    ];
    path.extension()
        .and_then(|s| s.to_str())
        .map(|ext| video_exts.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn is_raw_path(path: &Path) -> bool {
    let raw_exts = [
        "cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", "pef", "3fr", "x3f", "nrw",
        "rwl", "fff", "iiq", "crw", "erf", "sr2", "srf", "mrw", "dcr", "kdc", "mef", "mos",
        "srw", "gpr", "raw", "bay", "cap", "eip", "dcs", "drf", "k25",
    ];
    path.extension()
        .and_then(|s| s.to_str())
        .map(|ext| raw_exts.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn is_network_or_remote_path(path: &Path) -> bool {
    #[cfg(target_os = "windows")]
    {
        let path_str = path.to_string_lossy();
        // 1. UNC network path: starts with \\ or // or \??\UNC
        if path_str.starts_with(r"\\") || path_str.starts_with("//") || path_str.starts_with(r"\??\UNC") {
            return true;
        }

        // 2. Mapped drive: check drive root e.g. "Z:\" with GetDriveTypeW (DRIVE_REMOTE = 4)
        use std::os::windows::ffi::OsStrExt;
        if let Some(component) = path.components().next() {
            let mut drive: Vec<u16> = component.as_os_str().encode_wide().collect();
            if !drive.ends_with(&[b'\\' as u16]) {
                drive.push(b'\\' as u16);
            }
            drive.push(0);

            unsafe extern "system" {
                fn GetDriveTypeW(lpRootPathName: *const u16) -> u32;
            }
            unsafe {
                if GetDriveTypeW(drive.as_ptr()) == 4 {
                    return true;
                }
            }
        }
        false
    }

    #[cfg(target_os = "macos")]
    {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;

        let existing_path = path.ancestors().find(|a| a.exists()).unwrap_or(path);

        if let Ok(c_path) = CString::new(existing_path.as_os_str().as_bytes()) {
            let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
            if unsafe { libc::statfs(c_path.as_ptr(), &mut stat) } == 0 {
                // MNT_LOCAL = 0x00001000 in macOS sys/mount.h
                const MNT_LOCAL: u32 = 0x00001000;
                if (stat.f_flags & MNT_LOCAL) == 0 {
                    return true;
                }
                let fstype = unsafe {
                    std::ffi::CStr::from_ptr(stat.f_fstypename.as_ptr()).to_string_lossy()
                };
                if fstype == "smbfs" || fstype == "nfs" || fstype == "afpfs" || fstype == "cifs" || fstype == "webdav" {
                    return true;
                }
            }
        }
        false
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;

        let existing_path = path.ancestors().find(|a| a.exists()).unwrap_or(path);

        if let Ok(c_path) = CString::new(existing_path.as_os_str().as_bytes()) {
            let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
            if unsafe { libc::statfs(c_path.as_ptr(), &mut stat) } == 0 {
                let f_type = stat.f_type as i64;
                if f_type == 0x6969 || f_type == 0x517B || f_type == 0xFF534D42 {
                    return true;
                }
            }
        }
        false
    }
}

pub fn get_image_metadata(path: &Path) -> ImageMetadata {
    let mut meta = ImageMetadata::default();

    // Single-pass: Open file ONCE and extract date + EXIF tags simultaneously
    let mut exif_capture_date = None;
    let mut exif_modify_date = None;
    if let Ok(mut file) = File::open(path) {
        let mut magic16 = [0u8; 16];
        let mut target_offset = 0u64;
        if file.read_exact(&mut magic16).is_ok() && &magic16 == b"FUJIFILMCCD-RAW " {
            let mut dir = [0u8; 92];
            if file.seek(SeekFrom::Start(0)).is_ok() && file.read_exact(&mut dir).is_ok() {
                let jpeg_offset = u32::from_be_bytes([dir[84], dir[85], dir[86], dir[87]]) as u64;
                if jpeg_offset > 0 {
                    target_offset = jpeg_offset;
                }
            }
        }
        let _ = file.seek(SeekFrom::Start(target_offset));
        let mut bufreader = std::io::BufReader::new(file);
        let exifreader = exif::Reader::new();
        
        if let Ok(exif) = exifreader.read_from_container(&mut bufreader) {
            let parse_date_str = |dt_str: &str| -> Option<NaiveDateTime> {
                let trimmed = dt_str.trim();
                NaiveDateTime::parse_from_str(trimmed, "%Y:%m:%d %H:%M:%S")
                    .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S"))
                    .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%Y:%m:%d %H:%M"))
                    .ok()
            };
            let parse_field_date = |f: &exif::Field| -> Option<NaiveDateTime> {
                if let exif::Value::Ascii(ref vec) = f.value {
                    if let Some(val) = vec.first() {
                        if let Ok(s) = std::str::from_utf8(val) {
                            return parse_date_str(s);
                        }
                    }
                }
                None
            };

            // 1. Capture Date (DateTimeOriginal / DateTimeDigitized)
            for tag in [exif::Tag::DateTimeOriginal, exif::Tag::DateTimeDigitized] {
                if let Some(f) = exif.fields().find(|f| f.tag == tag) {
                    if let Some(dt) = parse_field_date(f) {
                        exif_capture_date = Some(dt);
                        break;
                    }
                }
            }

            // 2. Modify Date (DateTime tag 0x0132)
            if let Some(f) = exif.fields().find(|f| f.tag == exif::Tag::DateTime) {
                exif_modify_date = parse_field_date(f);
            }

            let extract_ascii_field = |f: &exif::Field| -> String {
                match &f.value {
                    exif::Value::Ascii(vec) => {
                        vec.iter()
                            .find_map(|bytes| {
                                std::str::from_utf8(bytes).ok()
                                    .map(|s| s.trim().trim_matches('"').trim())
                                    .filter(|s| !s.is_empty())
                            })
                            .unwrap_or("")
                            .to_string()
                    }
                    _ => f.display_value().to_string(),
                }
            };

            // 3. Camera Model
            if let Some(field) = exif.fields().find(|f| f.tag == exif::Tag::Model) {
                let raw = extract_ascii_field(field);
                meta.camera = clean_camera_model(&raw);
            }

            // 4. Lens Model
            if let Some(field) = exif.fields().find(|f| f.tag == exif::Tag::LensModel) {
                let raw = extract_ascii_field(field);
                meta.lens = clean_lens_model(&raw);
            }

            // 5. ISO
            let iso_tag = exif.fields().find(|f| f.tag == exif::Tag::PhotographicSensitivity)
                .or_else(|| exif.fields().find(|f| f.tag == exif::Tag::ISOSpeed));
            if let Some(field) = iso_tag {
                let iso = field.display_value().to_string().trim().to_string();
                if !iso.is_empty() {
                    meta.iso = Some(clean_iso(&iso));
                }
            }

            // 6. Aperture (FNumber)
            if let Some(field) = exif.fields().find(|f| f.tag == exif::Tag::FNumber) {
                let f_str = field.display_value().to_string().trim().to_string();
                if !f_str.is_empty() {
                    meta.aperture = Some(clean_aperture(&f_str));
                }
            }

            // 7. Shutter Speed (ExposureTime)
            if let Some(field) = exif.fields().find(|f| f.tag == exif::Tag::ExposureTime) {
                let exp_str = field.display_value().to_string().trim().to_string();
                if !exp_str.is_empty() {
                    meta.shutter = Some(clean_shutter_speed(&exp_str));
                }
            }

            // 8. Exposure Bias Value (Exposure compensation in EV)
            if let Some(field) = exif.fields().find(|f| f.tag == exif::Tag::ExposureBiasValue) {
                let ev_num = match field.value {
                    exif::Value::SRational(ref vec) => {
                        vec.first().and_then(|r| if r.denom != 0 { Some(r.num as f64 / r.denom as f64) } else { None })
                    }
                    exif::Value::Rational(ref vec) => {
                        vec.first().and_then(|r| if r.denom != 0 { Some(r.num as f64 / r.denom as f64) } else { None })
                    }
                    _ => None,
                };
                if let Some(ev) = ev_num {
                    meta.exposure_bias = Some(clean_exposure_bias(&format!("{:.4}", ev)));
                } else {
                    let disp = field.display_value().to_string();
                    if !disp.is_empty() {
                        meta.exposure_bias = Some(clean_exposure_bias(&disp));
                    }
                }
            }

            // 9. Focal Length
            if let Some(field) = exif.fields().find(|f| f.tag == exif::Tag::FocalLength) {
                let fl = field.display_value().with_unit(&exif).to_string();
                if !fl.is_empty() {
                    meta.focal_length = Some(clean_focal_length(&fl));
                }
            }

            // 10. Dimensions (PixelXDimension / PixelYDimension or ImageWidth / ImageLength)
            let max_w = exif
                .fields()
                .filter(|f| f.tag == exif::Tag::PixelXDimension || f.tag == exif::Tag::ImageWidth)
                .filter_map(|f| f.value.get_uint(0))
                .max();
            let max_h = exif
                .fields()
                .filter(|f| f.tag == exif::Tag::PixelYDimension || f.tag == exif::Tag::ImageLength)
                .filter_map(|f| f.value.get_uint(0))
                .max();

            let mut width = max_w;
            let mut height = max_h;

            if width.is_none() || height.is_none() || width.unwrap_or(0) < 300 {
                if let Ok((img_w, img_h)) = image::image_dimensions(path) {
                    width = Some(img_w);
                    height = Some(img_h);
                }
            }

            meta.width = width;
            meta.height = height;

            // 11. Monochrome Sensor Check via EXIF PhotometricInterpretation & CFAPattern
            if let Some(field) = exif.fields().find(|f| f.tag == exif::Tag::PhotometricInterpretation) {
                if let Some(val) = field.value.get_uint(0) {
                    // 0 = WhiteIsZero, 1 = BlackIsZero (Standard Grayscale/Monochrome sensor)
                    // 32803 = CFA (Color Filter Array)
                    let has_cfa = exif.fields().any(|f| f.tag == exif::Tag::CFAPattern);
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
            if let Some(gps_val) = val.get("gps") {
                if gps_val.is_null() {
                    // Explicit removal/clearing of GPS overrides camera EXIF
                    meta.latitude = None;
                    meta.longitude = None;
                    meta.altitude = None;
                } else if let Some(gps_obj) = gps_val.as_object() {
                    if let (Some(lat), Some(lon)) = (
                        gps_obj.get("latitude").and_then(|v| v.as_f64()),
                        gps_obj.get("longitude").and_then(|v| v.as_f64()),
                    ) {
                        meta.latitude = Some(lat);
                        meta.longitude = Some(lon);
                        meta.altitude = gps_obj.get("altitude").and_then(|v| v.as_f64());
                    } else if gps_obj.get("latitude").map_or(false, |v| v.is_null()) {
                        meta.latitude = None;
                        meta.longitude = None;
                        meta.altitude = None;
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
    meta.is_video = is_video_path(path);

    // If it's a RAW file and not already a physical monochrome sensor, check if the in-camera preview is monochrome
    if meta.is_raw && !meta.is_monochrome_sensor {
        meta.is_monochrome_preview = is_embedded_preview_monochrome(path);
    } else if meta.is_monochrome_sensor {
        meta.is_monochrome_preview = true;
    }

    let fs_modified = std::fs::metadata(path).ok().and_then(|m| m.modified().ok()).map(|sys_time| {
        let dt: chrono::DateTime<chrono::Utc> = sys_time.into();
        dt.naive_local()
    });

    if let Some(d) = exif_capture_date {
        meta.date = Some(d);
        meta.date_modified = exif_modify_date.or(fs_modified);
    } else if let Some(m_date) = exif_modify_date {
        meta.date = Some(m_date);
        meta.date_modified = fs_modified;
    } else {
        meta.date = crate::date_resolver::get_creation_date(path).ok();
        meta.date_modified = fs_modified;
    }

    meta
}

/// Formats a raw shutter speed/exposure time string into a clean photography representation (e.g. "1/500s", "1/2.5s", "2s", "30s").
/// Prevents ridiculous floating point decimals like "1/513.765947654489709870987".
pub fn clean_shutter_speed(exp_str: &str) -> String {
    let trimmed = exp_str.trim().trim_end_matches('s').trim_end_matches('"').trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Some(rest) = trimmed.strip_prefix("1/") {
        if let Ok(denom) = rest.parse::<f64>() {
            if denom <= 0.0 {
                return format!("{}s", trimmed);
            }
            if denom >= 10.0 {
                return format!("1/{}s", denom.round() as i64);
            } else if (denom - denom.round()).abs() < 0.05 {
                return format!("1/{}s", denom.round() as i64);
            } else if denom >= 1.0 {
                let formatted = format!("{:.1}", denom);
                let clean = formatted.trim_end_matches(".0");
                return format!("1/{}s", clean);
            } else {
                let secs = 1.0 / denom;
                if (secs - secs.round()).abs() < 0.05 {
                    return format!("{}s", secs.round() as i64);
                } else {
                    return format!("{:.1}s", secs);
                }
            }
        }
    } else if let Ok(val) = trimmed.parse::<f64>() {
        if val <= 0.0 {
            return format!("{}s", trimmed);
        }
        if val < 1.0 {
            let denom = 1.0 / val;
            if denom >= 10.0 {
                return format!("1/{}s", denom.round() as i64);
            } else if (denom - denom.round()).abs() < 0.05 {
                return format!("1/{}s", denom.round() as i64);
            } else {
                let formatted = format!("{:.1}", denom);
                let clean = formatted.trim_end_matches(".0");
                return format!("1/{}s", clean);
            }
        } else {
            if (val - val.round()).abs() < 0.05 {
                return format!("{}s", val.round() as i64);
            } else {
                return format!("{:.1}s", val);
            }
        }
    }

    if trimmed.ends_with('s') {
        trimmed.to_string()
    } else {
        format!("{}s", trimmed)
    }
}

/// Formats an aperture value cleanly (e.g. "f/2.8", "f/1.4", "f/4", "f/11").
pub fn clean_aperture(f_str: &str) -> String {
    let trimmed = f_str.trim().trim_start_matches("f/").trim_start_matches("F/").trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Ok(val) = trimmed.parse::<f64>() {
        if val <= 0.0 {
            return format!("f/{}", trimmed);
        }
        if val >= 10.0 && (val - val.round()).abs() < 0.1 {
            return format!("f/{}", val.round() as i64);
        } else if (val * 10.0).round() % 10.0 == 0.0 {
            return format!("f/{}", val.round() as i64);
        } else {
            return format!("f/{:.1}", val);
        }
    }

    if f_str.starts_with("f/") || f_str.starts_with("F/") {
        f_str.to_string()
    } else {
        format!("f/{}", f_str)
    }
}

/// Formats a focal length cleanly (e.g. "24 mm", "50 mm", "70.5 mm").
pub fn clean_focal_length(fl_str: &str) -> String {
    let trimmed = fl_str.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let num_part = trimmed.trim_end_matches("mm").trim_end_matches("MM").trim();
    if let Ok(val) = num_part.parse::<f64>() {
        if (val - val.round()).abs() < 0.05 {
            return format!("{} mm", val.round() as i64);
        } else {
            return format!("{:.1} mm", val);
        }
    }
    trimmed.to_string()
}

/// Formats an ISO value cleanly (e.g. "100", "3200").
pub fn clean_iso(iso_str: &str) -> String {
    let trimmed = iso_str.trim().trim_start_matches("ISO").trim_start_matches("iso").trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if let Ok(val) = trimmed.parse::<f64>() {
        return format!("{}", val.round() as i64);
    }
    trimmed.to_string()
}

/// Formats an exposure bias / compensation value cleanly (e.g. "±0.0 EV", "+0.7 EV", "-1.3 EV", "+1.0 EV").
pub fn clean_exposure_bias(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches("EV").trim_end_matches("ev").trim();
    if trimmed.is_empty() {
        return String::new();
    }

    // Direct match for already formatted zero indicators
    if trimmed == "±0.0" || trimmed == "±0" || trimmed == "+/-0.0" || trimmed == "+/- 0.0" || trimmed == "+-0.0" {
        return "±0.0 EV".to_string();
    }

    let val: Option<f64> = if let Some((num_str, denom_str)) = trimmed.split_once('/') {
        let num_clean = num_str.trim().trim_start_matches('+');
        let denom_clean = denom_str.trim().trim_start_matches('+');
        if let (Ok(num), Ok(denom)) = (num_clean.parse::<f64>(), denom_clean.parse::<f64>()) {
            if denom != 0.0 {
                Some(num / denom)
            } else {
                None
            }
        } else {
            None
        }
    } else {
        let num_clean = trimmed
            .trim_start_matches('±')
            .trim_start_matches("+/-")
            .trim_start_matches("+ / -")
            .trim_start_matches('+')
            .trim();
        num_clean.parse::<f64>().ok()
    };

    if let Some(ev) = val {
        if ev.abs() < 0.05 {
            "±0.0 EV".to_string()
        } else if ev > 0.0 {
            format!("+{:.1} EV", ev)
        } else {
            format!("{:.1} EV", ev)
        }
    } else {
        if trimmed.starts_with('±') {
            format!("{} EV", trimmed)
        } else if trimmed.starts_with('+') || trimmed.starts_with('-') {
            format!("{} EV", trimmed)
        } else if trimmed == "0" {
            "±0.0 EV".to_string()
        } else {
            format!("+{} EV", trimmed)
        }
    }
}

fn clean_exif_name(raw: &str, is_lens: bool) -> Option<String> {
    // 1. Take first non-empty segment before NUL bytes
    let mut seg = raw.split('\0').next().unwrap_or("");

    // 2. Handle kamadak-exif multi-part ASCII fragments like `", "", ""` or `", ""`
    if let Some((first, _)) = seg.split_once("\", \"") {
        seg = first;
    } else if let Some((first, _)) = seg.split_once("\",\"") {
        seg = first;
    } else if let Some((first, _)) = seg.split_once(", \"\"") {
        seg = first;
    } else if let Some((first, _)) = seg.split_once(",\"\"") {
        seg = first;
    } else if let Some((first, _)) = seg.split_once("\",") {
        seg = first;
    }

    // 3. Filter control characters and unprintable characters (c < 32 or 127)
    let mut s = String::with_capacity(seg.len());
    for ch in seg.chars() {
        if ch == '\t' || ch == '\r' || ch == '\n' {
            s.push(' ');
        } else if !ch.is_control() && (ch as u32) >= 32 && (ch as u32) != 127 {
            s.push(ch);
        }
    }

    // 4. Trim whitespace, quotes (regular, single, backtick, smart quotes)
    let trimmed = s.trim().trim_matches(|c| c == '"' || c == '\'' || c == '`' || c == '“' || c == '”').trim();
    if trimmed.is_empty() {
        return None;
    }

    // 5. Split words, collapse whitespace
    let words: Vec<&str> = trimmed.split_whitespace().collect();
    if words.is_empty() {
        return None;
    }

    let mut words: Vec<String> = words.into_iter().map(|w| w.to_string()).collect();

    // Deduplicate NIKON CORPORATION NIKON -> NIKON
    if words.len() >= 3 
        && words[1].eq_ignore_ascii_case("CORPORATION") 
        && words[0].eq_ignore_ascii_case(&words[2]) 
    {
        words.remove(2);
        words.remove(1);
    }

    // Deduplicate consecutive identical words (case-insensitive)
    let mut deduped: Vec<String> = Vec::with_capacity(words.len());
    for w in words {
        if deduped.last().map(|prev| prev.eq_ignore_ascii_case(&w)).unwrap_or(false) {
            continue;
        }
        deduped.push(w);
    }

    let cleaned = deduped.join(" ");

    // Must contain at least one alphanumeric character
    if !cleaned.chars().any(|c| c.is_alphanumeric()) {
        return None;
    }

    let lower = cleaned.to_lowercase();

    const DUMMY_CAMERAS: &[&str] = &[
        "unknown",
        "unknown camera",
        "default",
        "default string",
        "none",
        "no camera",
        "n/a",
        "na",
        "null",
        "nil",
        "(null)",
        "<unknown>",
        "[unknown]",
        "camera",
        "digital camera",
        "standard",
        "undefined",
        "not specified",
        "unspecified",
    ];

    if DUMMY_CAMERAS.contains(&lower.as_str()) {
        return None;
    }

    if is_lens {
        const DUMMY_LENSES: &[&str] = &[
            "0.0 mm f/0.0",
            "0.0mm f/0.0",
            "0.0 mm f/0",
            "0mm f/0",
            "0.0 mm",
            "0.0mm",
            "0 mm",
            "0mm",
            "f/0.0",
            "f/0",
            "no lens",
            "unknown lens",
            "not defined",
            "lens",
        ];

        if DUMMY_LENSES.contains(&lower.as_str()) {
            return None;
        }

        if lower.starts_with("0.0 mm f/0") 
            || lower.starts_with("0 mm f/0") 
            || lower.starts_with("0.0mm f/0")
            || lower == "0.0 mm f/0.0"
        {
            return None;
        }
    }

    Some(cleaned)
}

/// Formats and sanitizes a camera model string cleanly.
/// Strips NUL-padding fragments (e.g. `", "", ""` from kamadak-exif),
/// redundant quotes, unprintable control characters, duplicate manufacturer prefixes (e.g. "Canon Canon EOS"),
/// and filters out generic placeholders (e.g. "Unknown", "Default", "--") returning `None`.
pub fn clean_camera_model(raw: &str) -> Option<String> {
    clean_exif_name(raw, false)
}

/// Formats and sanitizes a lens model string cleanly.
/// Filters out placeholder lenses like "0.0 mm f/0.0", "No Lens", "Unknown Lens", etc.
pub fn clean_lens_model(raw: &str) -> Option<String> {
    clean_exif_name(raw, true)
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
        assert!(is_raw_path(Path::new("photo.rwl")));
        assert!(is_raw_path(Path::new("photo.fff")));
        assert!(is_raw_path(Path::new("photo.iiq")));
        assert!(is_raw_path(Path::new("photo.crw")));
        assert!(is_raw_path(Path::new("photo.erf")));
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

        let raf_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../testdata/dest/Fuji-RAW/DSCF8792.RAF");
        if raf_path.exists() {
            let meta = get_image_metadata(&raf_path);
            assert!(meta.is_raw, "DSCF8792.RAF must be detected as RAW");
            assert!(!meta.is_monochrome_sensor, "Fujifilm X-E4 is not a monochrome sensor");
            assert_eq!(meta.camera.as_deref(), Some("X-E4"));
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

    #[test]
    fn test_clean_shutter_speed() {
        assert_eq!(clean_shutter_speed("1/513.765947654489709870987"), "1/514s");
        assert_eq!(clean_shutter_speed("1/513.765947654489709870987s"), "1/514s");
        assert_eq!(clean_shutter_speed("1/500"), "1/500s");
        assert_eq!(clean_shutter_speed("1/500s"), "1/500s");
        assert_eq!(clean_shutter_speed("1/2.5"), "1/2.5s");
        assert_eq!(clean_shutter_speed("1/4"), "1/4s");
        assert_eq!(clean_shutter_speed("0.002"), "1/500s");
        assert_eq!(clean_shutter_speed("0.5"), "1/2s");
        assert_eq!(clean_shutter_speed("1"), "1s");
        assert_eq!(clean_shutter_speed("2.5"), "2.5s");
        assert_eq!(clean_shutter_speed("30"), "30s");
    }

    #[test]
    fn test_clean_aperture() {
        assert_eq!(clean_aperture("2.80000001"), "f/2.8");
        assert_eq!(clean_aperture("f/2.80000001"), "f/2.8");
        assert_eq!(clean_aperture("f/1.4"), "f/1.4");
        assert_eq!(clean_aperture("4.0"), "f/4");
        assert_eq!(clean_aperture("f/11.0"), "f/11");
        assert_eq!(clean_aperture("22"), "f/22");
    }

    #[test]
    fn test_clean_focal_length() {
        assert_eq!(clean_focal_length("24.0 mm"), "24 mm");
        assert_eq!(clean_focal_length("24.12345 mm"), "24.1 mm");
        assert_eq!(clean_focal_length("50mm"), "50 mm");
    }

    #[test]
    fn test_clean_iso() {
        assert_eq!(clean_iso("100"), "100");
        assert_eq!(clean_iso("100.0"), "100");
        assert_eq!(clean_iso("ISO 400"), "400");
    }

    #[test]
    fn test_clean_exposure_bias() {
        assert_eq!(clean_exposure_bias("0"), "±0.0 EV");
        assert_eq!(clean_exposure_bias("0.0"), "±0.0 EV");
        assert_eq!(clean_exposure_bias("-0.0"), "±0.0 EV");
        assert_eq!(clean_exposure_bias("0/1"), "±0.0 EV");
        assert_eq!(clean_exposure_bias("0/6"), "±0.0 EV");
        assert_eq!(clean_exposure_bias("±0.0 EV"), "±0.0 EV");
        assert_eq!(clean_exposure_bias("+/- 0.0 EV"), "±0.0 EV");
        assert_eq!(clean_exposure_bias("2/3"), "+0.7 EV");
        assert_eq!(clean_exposure_bias("+1.7 EV"), "+1.7 EV");
        assert_eq!(clean_exposure_bias("5/3"), "+1.7 EV");
        assert_eq!(clean_exposure_bias("-1/3"), "-0.3 EV");
        assert_eq!(clean_exposure_bias("1/2"), "+0.5 EV");
        assert_eq!(clean_exposure_bias("-4/3"), "-1.3 EV");
        assert_eq!(clean_exposure_bias("-5/3"), "-1.7 EV");
        assert_eq!(clean_exposure_bias("-1.7 EV"), "-1.7 EV");
        assert_eq!(clean_exposure_bias("1"), "+1.0 EV");
        assert_eq!(clean_exposure_bias("-1"), "-1.0 EV");
        assert_eq!(clean_exposure_bias("-2"), "-2.0 EV");
        assert_eq!(clean_exposure_bias("+0.67 EV"), "+0.7 EV");
    }

    #[test]
    fn test_clean_camera_model() {
        // NUL-padding fragments from kamadak-exif display_value
        assert_eq!(
            clean_camera_model(r#""Canon DIGITAL IXUS", "", "", "", "", "", "", "", """#),
            Some("Canon DIGITAL IXUS".to_string())
        );
        assert_eq!(
            clean_camera_model(r#"Canon DIGITAL IXUS", "", "", "", "", "", "", "", """#),
            Some("Canon DIGITAL IXUS".to_string())
        );
        assert_eq!(
            clean_camera_model("Canon DIGITAL IXUS\0\0\0\0"),
            Some("Canon DIGITAL IXUS".to_string())
        );

        // Duplicate manufacturer prefix
        assert_eq!(
            clean_camera_model("Canon Canon EOS R5"),
            Some("Canon EOS R5".to_string())
        );
        assert_eq!(
            clean_camera_model("NIKON NIKON D850"),
            Some("NIKON D850".to_string())
        );
        assert_eq!(
            clean_camera_model("NIKON CORPORATION NIKON D850"),
            Some("NIKON D850".to_string())
        );
        assert_eq!(
            clean_camera_model("SONY SONY ILCE-7M3"),
            Some("SONY ILCE-7M3".to_string())
        );

        // Normal cameras
        assert_eq!(
            clean_camera_model("Canon EOS 5D Mark IV"),
            Some("Canon EOS 5D Mark IV".to_string())
        );
        assert_eq!(
            clean_camera_model("ILCE-7RM4"),
            Some("ILCE-7RM4".to_string())
        );
        assert_eq!(
            clean_camera_model("iPhone 13 Pro"),
            Some("iPhone 13 Pro".to_string())
        );

        // Placeholders & junk
        assert_eq!(clean_camera_model("Unknown"), None);
        assert_eq!(clean_camera_model("unknown"), None);
        assert_eq!(clean_camera_model("Default"), None);
        assert_eq!(clean_camera_model("None"), None);
        assert_eq!(clean_camera_model("N/A"), None);
        assert_eq!(clean_camera_model("--"), None);
        assert_eq!(clean_camera_model("---"), None);
        assert_eq!(clean_camera_model("?"), None);
        assert_eq!(clean_camera_model("\"\""), None);
        assert_eq!(clean_camera_model("   "), None);
        assert_eq!(clean_camera_model("Camera"), None);
        assert_eq!(clean_camera_model("Digital Camera"), None);
        assert_eq!(clean_camera_model("(null)"), None);
    }

    #[test]
    fn test_clean_lens_model() {
        assert_eq!(
            clean_lens_model(r#""EF24-105mm f/4L IS USM", "", """#),
            Some("EF24-105mm f/4L IS USM".to_string())
        );
        assert_eq!(
            clean_lens_model("Canon Canon EF 50mm f/1.8 STM"),
            Some("Canon EF 50mm f/1.8 STM".to_string())
        );
        assert_eq!(
            clean_lens_model("FE 24-70mm F2.8 GM II"),
            Some("FE 24-70mm F2.8 GM II".to_string())
        );

        // Dummy / placeholder lenses
        assert_eq!(clean_lens_model("0.0 mm f/0.0"), None);
        assert_eq!(clean_lens_model("0.0 mm"), None);
        assert_eq!(clean_lens_model("0 mm"), None);
        assert_eq!(clean_lens_model("0mm"), None);
        assert_eq!(clean_lens_model("0.0mm f/0.0"), None);
        assert_eq!(clean_lens_model("0.0 mm f/0"), None);
        assert_eq!(clean_lens_model("No Lens"), None);
        assert_eq!(clean_lens_model("Unknown Lens"), None);
        assert_eq!(clean_lens_model("Unknown"), None);
        assert_eq!(clean_lens_model("None"), None);
        assert_eq!(clean_lens_model("--"), None);
    }

    #[test]
    fn test_ixus_metadata_extraction() {
        let p = std::path::Path::new("/Volumes/Media/Bilder/flow/2001/2001-03-04/100-0073_AUT.JPG");
        if p.exists() {
            let meta = get_image_metadata(p);
            assert_eq!(meta.camera.as_deref(), Some("Canon DIGITAL IXUS"));
        }
    }
}
