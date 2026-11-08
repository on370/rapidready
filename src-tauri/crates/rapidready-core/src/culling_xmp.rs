use crate::culling::{CullingState, TAG_PICK, TAG_REJECT};
use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::LazyLock;

static XMP_NAMING_MODE: AtomicU8 = AtomicU8::new(0); // 0 = standard (<stem>.xmp), 1 = darktable (<file>.<ext>.xmp)

pub fn set_xmp_naming_mode(mode: &str) {
    let val = if mode.eq_ignore_ascii_case("darktable") { 1 } else { 0 };
    XMP_NAMING_MODE.store(val, Ordering::SeqCst);
}

pub fn get_xmp_naming_mode() -> &'static str {
    if XMP_NAMING_MODE.load(Ordering::SeqCst) == 1 {
        "darktable"
    } else {
        "standard"
    }
}

static RE_RATING_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<xmp:Rating>([^<]*)</xmp:Rating>").unwrap());
static RE_RATING_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\bxmp:Rating="([^"]*)""#).unwrap());

static RE_LABEL_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<xmp:Label>([^<]*)</xmp:Label>").unwrap());
static RE_LABEL_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\bxmp:Label="([^"]*)""#).unwrap());

static RE_ORIENT_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<tiff:Orientation>([^<]*)</tiff:Orientation>").unwrap());
static RE_ORIENT_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\btiff:Orientation="([^"]*)""#).unwrap());

static RE_SUBJECT_BLOCK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<dc:subject\b[^>]*>.*?</dc:subject>").unwrap());
static RE_RDF_LI: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<rdf:li\b[^>]*>(.*?)</rdf:li>").unwrap());

static RE_PICK_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:xmpDM:good="true"|xmpDM:pick="1"|photoshop:Urgency="1")"#).unwrap()
});
static RE_REJECT_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?:xmpDM:good="false"|xmpDM:pick="-1")"#).unwrap());

static RE_DARKTABLE_COLORLABELS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<darktable:colorlabels\b[^>]*>.*?<rdf:li\b[^>]*>\s*([0-4])\s*</rdf:li>.*?</darktable:colorlabels>").unwrap()
});
static RE_DARKTABLE_COLORLABELS_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<darktable:colorlabels\b[^>]*>.*?</darktable:colorlabels>").unwrap()
});
static RE_LR_HIERARCHICAL_SUBJECT_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<lr:hierarchicalSubject\b[^>]*>.*?</lr:hierarchicalSubject>").unwrap()
});

// GPS Regexes
static RE_GPS_LAT_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<exif:GPSLatitude>([^<]*)</exif:GPSLatitude>").unwrap());
static RE_GPS_LAT_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\bexif:GPSLatitude="([^"]*)""#).unwrap());
static RE_GPS_LAT_REF_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<exif:GPSLatitudeRef>([^<]*)</exif:GPSLatitudeRef>").unwrap()
});
static RE_GPS_LAT_REF_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\bexif:GPSLatitudeRef="([^"]*)""#).unwrap());

static RE_GPS_LON_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<exif:GPSLongitude>([^<]*)</exif:GPSLongitude>").unwrap());
static RE_GPS_LON_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\bexif:GPSLongitude="([^"]*)""#).unwrap());
static RE_GPS_LON_REF_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<exif:GPSLongitudeRef>([^<]*)</exif:GPSLongitudeRef>").unwrap()
});
static RE_GPS_LON_REF_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\bexif:GPSLongitudeRef="([^"]*)""#).unwrap());

static RE_GPS_ALT_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<exif:GPSAltitude>([^<]*)</exif:GPSAltitude>").unwrap());
static RE_GPS_ALT_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\bexif:GPSAltitude="([^"]*)""#).unwrap());
static RE_GPS_ALT_REF_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<exif:GPSAltitudeRef>([^<]*)</exif:GPSAltitudeRef>").unwrap()
});
static RE_GPS_ALT_REF_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\bexif:GPSAltitudeRef="([^"]*)""#).unwrap());

// Editorial & Date Regexes
static RE_DC_CREATOR_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<dc:creator\b[^>]*>.*?<rdf:li\b[^>]*>(.*?)</rdf:li>.*?</dc:creator>").unwrap()
});
static RE_DC_CREATOR_FULL_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<dc:creator\b[^>]*>.*?</dc:creator>").unwrap()
});
static RE_TIFF_ARTIST_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<tiff:Artist>([^<]*)</tiff:Artist>").unwrap()
});
static RE_TIFF_ARTIST_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"\btiff:Artist="([^"]*)""#).unwrap()
});

static RE_DC_RIGHTS_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<dc:rights\b[^>]*>.*?<rdf:li\b[^>]*>(.*?)</rdf:li>.*?</dc:rights>").unwrap()
});
static RE_DC_RIGHTS_FULL_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<dc:rights\b[^>]*>.*?</dc:rights>").unwrap()
});
static RE_TIFF_COPYRIGHT_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<tiff:Copyright>([^<]*)</tiff:Copyright>").unwrap()
});
static RE_TIFF_COPYRIGHT_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"\btiff:Copyright="([^"]*)""#).unwrap()
});

static RE_XMP_RIGHTS_USAGE_TERMS_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<xmpRights:UsageTerms\b[^>]*>.*?<rdf:li\b[^>]*>(.*?)</rdf:li>.*?</xmpRights:UsageTerms>").unwrap()
});
static RE_XMP_RIGHTS_USAGE_TERMS_FULL_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<xmpRights:UsageTerms\b[^>]*>.*?</xmpRights:UsageTerms>").unwrap()
});
static RE_XMP_RIGHTS_USAGE_TERMS_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<xmpRights:UsageTerms>([^<]*)</xmpRights:UsageTerms>").unwrap()
});
static RE_XMP_RIGHTS_USAGE_TERMS_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"\bxmpRights:UsageTerms="([^"]*)""#).unwrap()
});

static RE_DC_TITLE_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<dc:title\b[^>]*>.*?<rdf:li\b[^>]*>(.*?)</rdf:li>.*?</dc:title>").unwrap()
});
static RE_DC_TITLE_FULL_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<dc:title\b[^>]*>.*?</dc:title>").unwrap()
});
static RE_DC_TITLE_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<dc:title>([^<]*)</dc:title>").unwrap()
});
static RE_DC_TITLE_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"\bdc:title="([^"]*)""#).unwrap()
});

static RE_DC_DESC_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<dc:description\b[^>]*>.*?<rdf:li\b[^>]*>(.*?)</rdf:li>.*?</dc:description>").unwrap()
});
static RE_DC_DESC_FULL_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<dc:description\b[^>]*>.*?</dc:description>").unwrap()
});
static RE_DC_DESC_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<dc:description>([^<]*)</dc:description>").unwrap()
});
static RE_DC_DESC_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"\bdc:description="([^"]*)""#).unwrap()
});

static RE_PHOTOSHOP_DATE_CREATED_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<photoshop:DateCreated>([^<]*)</photoshop:DateCreated>").unwrap()
});
static RE_PHOTOSHOP_DATE_CREATED_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"\bphotoshop:DateCreated="([^"]*)""#).unwrap()
});

pub fn unescape_xml(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

pub fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn normalize_color_label(label: &str) -> Option<String> {
    let lower = label.trim().to_lowercase();
    match lower.as_str() {
        "red" | "rot" => Some("red".to_string()),
        "yellow" | "gelb" => Some("yellow".to_string()),
        "green" | "grün" | "gruen" => Some("green".to_string()),
        "blue" | "blau" => Some("blue".to_string()),
        "purple" | "violett" | "magenta" => Some("purple".to_string()),
        "none" | "" => None,
        _ => Some(lower),
    }
}

fn format_color_label_xmp(col: &str) -> String {
    match col.to_lowercase().as_str() {
        "red" => "Red".to_string(),
        "yellow" => "Yellow".to_string(),
        "green" => "Green".to_string(),
        "blue" => "Blue".to_string(),
        "purple" => "Purple".to_string(),
        other => {
            let mut c = other.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        }
    }
}

/// Parses an XMP string into a `CullingState`.
pub fn parse_sidecar_xmp(contents: &str) -> CullingState {
    let mut state = CullingState::default();

    // 1. Rating & Reject
    let raw_rating = RE_RATING_ATTR
        .captures(contents)
        .or_else(|| RE_RATING_TAG.captures(contents))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().trim());

    if let Some(r_str) = raw_rating {
        if let Ok(r) = r_str.parse::<i32>() {
            if r == -1 {
                state.flag = Some(-1);
                state.rating = 0;
            } else if (0..=5).contains(&r) {
                state.rating = r as u8;
            }
        }
    }

    // 2. Color Label
    let raw_label = RE_LABEL_ATTR
        .captures(contents)
        .or_else(|| RE_LABEL_TAG.captures(contents))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str());

    if let Some(lbl) = raw_label {
        state.color = normalize_color_label(lbl);
    }

    if state.color.is_none() {
        if let Some(dt_cap) = RE_DARKTABLE_COLORLABELS.captures(contents) {
            if let Some(num_str) = dt_cap.get(1).map(|m| m.as_str().trim()) {
                state.color = match num_str {
                    "0" => Some("red".to_string()),
                    "1" => Some("yellow".to_string()),
                    "2" => Some("green".to_string()),
                    "3" => Some("blue".to_string()),
                    "4" => Some("purple".to_string()),
                    _ => None,
                };
            }
        }
    }

    // 3. Orientation
    let raw_orient = RE_ORIENT_ATTR
        .captures(contents)
        .or_else(|| RE_ORIENT_TAG.captures(contents))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().trim());

    if let Some(o_str) = raw_orient {
        if let Ok(o) = o_str.parse::<u32>() {
            if [1, 3, 6, 8].contains(&o) {
                state.orientation = Some(o);
            }
        }
    }

    // 4. Tags & Flag Adapter from <dc:subject>
    if let Some(subj_cap) = RE_SUBJECT_BLOCK.captures(contents) {
        if let Some(subj_str) = subj_cap.get(0).map(|m| m.as_str()) {
            for li_cap in RE_RDF_LI.captures_iter(subj_str) {
                if let Some(tag_match) = li_cap.get(1) {
                    let tag = unescape_xml(tag_match.as_str().trim());
                    if tag == TAG_PICK {
                        state.flag = Some(1);
                    } else if tag == TAG_REJECT {
                        state.flag = Some(-1);
                    } else if !tag.is_empty() && !state.tags.contains(&tag) {
                        state.tags.push(tag);
                    }
                }
            }
        }
    }

    // 5. Secondary Flag Checks if not yet determined
    if state.flag.is_none() {
        if RE_PICK_ATTR.is_match(contents) {
            state.flag = Some(1);
        } else if RE_REJECT_ATTR.is_match(contents) {
            state.flag = Some(-1);
        }
    }

    // 6. Editorial metadata
    state.artist = RE_DC_CREATOR_BLOCK
        .captures(contents)
        .and_then(|c| c.get(1))
        .or_else(|| RE_TIFF_ARTIST_TAG.captures(contents).and_then(|c| c.get(1)))
        .or_else(|| RE_TIFF_ARTIST_ATTR.captures(contents).and_then(|c| c.get(1)))
        .map(|m| unescape_xml(m.as_str().trim()))
        .filter(|s| !s.is_empty());

    state.copyright = RE_DC_RIGHTS_BLOCK
        .captures(contents)
        .and_then(|c| c.get(1))
        .or_else(|| RE_TIFF_COPYRIGHT_TAG.captures(contents).and_then(|c| c.get(1)))
        .or_else(|| RE_TIFF_COPYRIGHT_ATTR.captures(contents).and_then(|c| c.get(1)))
        .map(|m| unescape_xml(m.as_str().trim()))
        .filter(|s| !s.is_empty());

    state.usage_terms = RE_XMP_RIGHTS_USAGE_TERMS_BLOCK
        .captures(contents)
        .and_then(|c| c.get(1))
        .or_else(|| RE_XMP_RIGHTS_USAGE_TERMS_TAG.captures(contents).and_then(|c| c.get(1)))
        .or_else(|| RE_XMP_RIGHTS_USAGE_TERMS_ATTR.captures(contents).and_then(|c| c.get(1)))
        .map(|m| unescape_xml(m.as_str().trim()))
        .filter(|s| !s.is_empty());

    state.title = RE_DC_TITLE_BLOCK
        .captures(contents)
        .and_then(|c| c.get(1))
        .or_else(|| RE_DC_TITLE_TAG.captures(contents).and_then(|c| c.get(1)))
        .or_else(|| RE_DC_TITLE_ATTR.captures(contents).and_then(|c| c.get(1)))
        .map(|m| unescape_xml(m.as_str().trim()))
        .filter(|s| !s.is_empty());

    state.description = RE_DC_DESC_BLOCK
        .captures(contents)
        .and_then(|c| c.get(1))
        .or_else(|| RE_DC_DESC_TAG.captures(contents).and_then(|c| c.get(1)))
        .or_else(|| RE_DC_DESC_ATTR.captures(contents).and_then(|c| c.get(1)))
        .map(|m| unescape_xml(m.as_str().trim()))
        .filter(|s| !s.is_empty());

    // 7. DateCreated (date_override)
    state.date_override = RE_PHOTOSHOP_DATE_CREATED_TAG
        .captures(contents)
        .and_then(|c| c.get(1))
        .or_else(|| RE_PHOTOSHOP_DATE_CREATED_ATTR.captures(contents).and_then(|c| c.get(1)))
        .map(|m| m.as_str().trim().to_string())
        .filter(|s| !s.is_empty());

    state
}

/// Helper to parse GPS coordinates from XMP string representations.
pub fn parse_xmp_coord(val_str: &str, ref_str: Option<&str>) -> Option<f64> {
    let trimmed = val_str.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut dir_char = None;
    let mut num_part = trimmed;

    // Check trailing direction letter (N, S, E, W)
    if let Some(last_ch) = trimmed.chars().last() {
        if ['N', 'S', 'E', 'W', 'n', 's', 'e', 'w'].contains(&last_ch) {
            dir_char = Some(last_ch.to_ascii_uppercase());
            num_part = &trimmed[..trimmed.len() - last_ch.len_utf8()].trim();
        }
    }

    if dir_char.is_none() {
        if let Some(r) = ref_str {
            if let Some(ch) = r.trim().chars().next() {
                if ['N', 'S', 'E', 'W', 'n', 's', 'e', 'w'].contains(&ch) {
                    dir_char = Some(ch.to_ascii_uppercase());
                }
            }
        }
    }

    // Check for comma or whitespace separated DMS or DM format (e.g. "37,46.500000" or "37 46 29.5")
    let parts: Vec<&str> = num_part
        .split(|c| c == ',' || c == ' ' || c == '\t')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    let mut val = if parts.len() >= 2 {
        let deg = parts[0].parse::<f64>().ok()?;
        let min = parts[1].parse::<f64>().ok()?;
        let sec = if parts.len() >= 3 {
            parts[2].parse::<f64>().unwrap_or(0.0)
        } else {
            0.0
        };
        deg.abs() + (min / 60.0) + (sec / 3600.0)
    } else {
        // Direct decimal or rational float
        if num_part.contains('/') {
            let frac: Vec<&str> = num_part.split('/').collect();
            if frac.len() == 2 {
                let num = frac[0].trim().parse::<f64>().ok()?;
                let den = frac[1].trim().parse::<f64>().ok()?;
                if den != 0.0 {
                    num / den
                } else {
                    return None;
                }
            } else {
                num_part.parse::<f64>().ok()?
            }
        } else {
            num_part.parse::<f64>().ok()?
        }
    };

    if let Some(dir) = dir_char {
        if dir == 'S' || dir == 'W' {
            val = -val.abs();
        } else {
            val = val.abs();
        }
    }

    Some(val)
}

/// Extracts GPS coordinates from an XMP string.
pub fn read_xmp_gps_from_str(contents: &str) -> Option<(Option<f64>, Option<f64>, Option<f64>)> {
    let lat_str = RE_GPS_LAT_ATTR
        .captures(contents)
        .or_else(|| RE_GPS_LAT_TAG.captures(contents))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str());

    let lat_ref = RE_GPS_LAT_REF_ATTR
        .captures(contents)
        .or_else(|| RE_GPS_LAT_REF_TAG.captures(contents))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str());

    let lon_str = RE_GPS_LON_ATTR
        .captures(contents)
        .or_else(|| RE_GPS_LON_TAG.captures(contents))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str());

    let lon_ref = RE_GPS_LON_REF_ATTR
        .captures(contents)
        .or_else(|| RE_GPS_LON_REF_TAG.captures(contents))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str());

    let alt_str = RE_GPS_ALT_ATTR
        .captures(contents)
        .or_else(|| RE_GPS_ALT_TAG.captures(contents))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str());

    let alt_ref = RE_GPS_ALT_REF_ATTR
        .captures(contents)
        .or_else(|| RE_GPS_ALT_REF_TAG.captures(contents))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str());

    let lat = lat_str.and_then(|s| parse_xmp_coord(s, lat_ref));
    let lon = lon_str.and_then(|s| parse_xmp_coord(s, lon_ref));

    if lat.is_none() && lon.is_none() {
        return None;
    }

    let alt = alt_str.and_then(|s| {
        let v = if s.contains('/') {
            let frac: Vec<&str> = s.split('/').collect();
            if frac.len() == 2 {
                let num = frac[0].trim().parse::<f64>().ok()?;
                let den = frac[1].trim().parse::<f64>().ok()?;
                if den != 0.0 {
                    num / den
                } else {
                    return None;
                }
            } else {
                s.parse::<f64>().ok()?
            }
        } else {
            s.parse::<f64>().ok()?
        };
        // 1 = Below sea level
        if alt_ref.map_or(false, |r| r.trim() == "1") {
            Some(-v.abs())
        } else {
            Some(v)
        }
    });

    Some((lat, lon, alt))
}

/// Locates an existing XMP sidecar for an image file.
/// Checks `<file>.xmp`, `<file>.XMP`, `<stem>.xmp`, and `<stem>.XMP`.
/// If multiple exist, returns the one with the newer `mtime`.
pub fn find_existing_xmp_path(original_path: &Path) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. Companion / darktable style: <original_path>.xmp or .XMP
    let p_xmp = PathBuf::from(format!("{}.xmp", original_path.to_string_lossy()));
    if p_xmp.is_file() {
        candidates.push(p_xmp);
    }
    let p_xmp_upper = PathBuf::from(format!("{}.XMP", original_path.to_string_lossy()));
    if p_xmp_upper.is_file() && !candidates.contains(&p_xmp_upper) {
        candidates.push(p_xmp_upper);
    }

    // 2. Lightroom / standard stem style: <stem>.xmp or .XMP
    if original_path.extension().is_some() {
        let stem_xmp = original_path.with_extension("xmp");
        if stem_xmp.is_file() && !candidates.contains(&stem_xmp) {
            candidates.push(stem_xmp);
        }
        let stem_xmp_upper = original_path.with_extension("XMP");
        if stem_xmp_upper.is_file() && !candidates.contains(&stem_xmp_upper) {
            candidates.push(stem_xmp_upper);
        }
    }

    if candidates.is_empty() {
        return None;
    }

    if candidates.len() == 1 {
        return Some(candidates.remove(0));
    }

    // Multiple candidates found: return the one with the newest mtime
    candidates
        .into_iter()
        .max_by_key(|p| {
            fs::metadata(p)
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
        })
}

/// Determines the canonical path to write an XMP sidecar.
pub fn get_xmp_write_path(original_path: &Path) -> PathBuf {
    if let Some(existing) = find_existing_xmp_path(original_path) {
        return existing;
    }

    let is_raw = crate::metadata_resolver::is_raw_path(original_path);
    if get_xmp_naming_mode() == "darktable" || !is_raw {
        // darktable style or non-RAW raster photos (e.g. .jpg, .heic) write to <path>.xmp to avoid stem collision
        return PathBuf::from(format!("{}.xmp", original_path.to_string_lossy()));
    }

    // For RAW files, check if a companion raster file with the same stem exists in the same folder
    if let Some(parent) = original_path.parent() {
        let stem = original_path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if !stem.is_empty() {
            for raster_ext in &["jpg", "jpeg", "heic", "hif", "png"] {
                let companion = parent.join(format!("{}.{}", stem, raster_ext));
                if companion.is_file() {
                    return PathBuf::from(format!("{}.xmp", original_path.to_string_lossy()));
                }
            }
        }
    }

    // Standard Lightroom style: <stem>.xmp
    original_path.with_extension("xmp")
}

/// Reads GPS coordinates from the XMP sidecar if present.
pub fn read_xmp_gps(original_path: &Path) -> Option<(Option<f64>, Option<f64>, Option<f64>)> {
    let xmp_path = find_existing_xmp_path(original_path)?;
    let contents = fs::read_to_string(&xmp_path).ok()?;
    read_xmp_gps_from_str(&contents)
}

/// Non-destructively patches or creates an XMP sidecar for `original_path`.
pub fn write_sidecar_xmp(original_path: &Path, state: &CullingState) -> anyhow::Result<()> {
    let target_path = get_xmp_write_path(original_path);
    write_sidecar_xmp_to_path(&target_path, state)
}

/// Non-destructively patches or creates an XMP sidecar at `xmp_path`.
pub fn write_sidecar_xmp_to_path(xmp_path: &Path, state: &CullingState) -> anyhow::Result<()> {
    let rating_val = if state.flag == Some(-1) && state.rating == 0 {
        "-1".to_string()
    } else {
        state.rating.to_string()
    };

    let xml = if xmp_path.is_file() {
        let existing = fs::read_to_string(xmp_path)?;
        patch_xmp_xml(&existing, state, &rating_val)?
    } else {
        generate_fresh_xmp(state, &rating_val)
    };

    atomic_write_file(xmp_path, &xml)
}

/// Atomically updates or clears GPS coordinates in the XMP sidecar.
pub fn write_xmp_gps(
    original_path: &Path,
    latitude: Option<f64>,
    longitude: Option<f64>,
    altitude: Option<f64>,
) -> anyhow::Result<()> {
    let target_path = get_xmp_write_path(original_path);
    let xml = if target_path.is_file() {
        let existing = fs::read_to_string(&target_path)?;
        patch_xmp_gps(&existing, latitude, longitude, altitude)?
    } else {
        let state = CullingState::default();
        let base_xml = generate_fresh_xmp(&state, "0");
        patch_xmp_gps(&base_xml, latitude, longitude, altitude)?
    };

    atomic_write_file(&target_path, &xml)
}

fn atomic_write_file(target_path: &Path, content: &str) -> anyhow::Result<()> {
    let parent = target_path.parent().unwrap_or_else(|| Path::new("."));
    let pid = std::process::id();
    let thread_id = std::thread::current().id();
    let file_stem = target_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("sidecar");
    let tmp_path = parent.join(format!(".{}.tmp.{:?}.{}", file_stem, thread_id, pid));

    if let Err(e) = fs::write(&tmp_path, content) {
        let _ = fs::remove_file(&tmp_path);
        return Err(e.into());
    }

    if let Err(e) = fs::rename(&tmp_path, target_path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(e.into());
    }

    Ok(())
}

fn patch_xmp_xml(existing: &str, state: &CullingState, rating_val: &str) -> anyhow::Result<String> {
    let mut xml = existing.to_string();

    // 1. Ensure required namespaces are declared if <rdf:Description is present
    if xml.contains("<rdf:Description") {
        if !xml.contains("xmlns:xmp=") && !xml.contains("xmlns:xmp\t") {
            xml = xml.replacen("<rdf:Description", "<rdf:Description\n   xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\"", 1);
        }
        if !xml.contains("xmlns:dc=") && !xml.contains("xmlns:dc\t") {
            xml = xml.replacen("<rdf:Description", "<rdf:Description\n   xmlns:dc=\"http://purl.org/dc/elements/1.1/\"", 1);
        }
        if !xml.contains("xmlns:tiff=") && !xml.contains("xmlns:tiff\t") {
            xml = xml.replacen("<rdf:Description", "<rdf:Description\n   xmlns:tiff=\"http://ns.adobe.com/tiff/1.0/\"", 1);
        }
        if !xml.contains("xmlns:lr=") && !xml.contains("xmlns:lr\t") {
            xml = xml.replacen("<rdf:Description", "<rdf:Description\n   xmlns:lr=\"http://ns.adobe.com/lightroom/1.0/\"", 1);
        }
        if !xml.contains("xmlns:darktable=") && !xml.contains("xmlns:darktable\t") {
            xml = xml.replacen("<rdf:Description", "<rdf:Description\n   xmlns:darktable=\"http://darktable.sf.net/\"", 1);
        }
        if !xml.contains("xmlns:photoshop=") && !xml.contains("xmlns:photoshop\t") {
            xml = xml.replacen("<rdf:Description", "<rdf:Description\n   xmlns:photoshop=\"http://ns.adobe.com/photoshop/1.0/\"", 1);
        }
        if !xml.contains("xmlns:xmpRights=") && !xml.contains("xmlns:xmpRights\t") {
            xml = xml.replacen("<rdf:Description", "<rdf:Description\n   xmlns:xmpRights=\"http://ns.adobe.com/xap/1.0/rights/\"", 1);
        }
    }

    // Expand self-closing <rdf:Description ... /> early so insertions before </rdf:Description> succeed
    if let Some(cap) = Regex::new(r"(?s)<rdf:Description\b([^>]*?)/>").unwrap().captures(&xml) {
        let full = cap.get(0).unwrap().as_str();
        let attrs = cap.get(1).unwrap().as_str();
        let expanded = format!("<rdf:Description{}>\n </rdf:Description>", attrs);
        xml = xml.replace(full, &expanded);
    }

    // 2. Patch xmp:Rating
    if RE_RATING_TAG.is_match(&xml) {
        xml = RE_RATING_TAG
            .replace(&xml, format!("<xmp:Rating>{}</xmp:Rating>", rating_val))
            .to_string();
    } else if RE_RATING_ATTR.is_match(&xml) {
        xml = RE_RATING_ATTR
            .replace(&xml, format!("xmp:Rating=\"{}\"", rating_val))
            .to_string();
    } else if xml.contains("<rdf:Description") {
        xml = xml.replacen(
            "<rdf:Description",
            &format!("<rdf:Description\n   xmp:Rating=\"{}\"", rating_val),
            1,
        );
    }

    // 3. Patch xmp:Label & darktable:colorlabels
    if let Some(ref col) = state.color {
        let label_str = format_color_label_xmp(col);
        if RE_LABEL_TAG.is_match(&xml) {
            xml = RE_LABEL_TAG
                .replace(&xml, format!("<xmp:Label>{}</xmp:Label>", label_str))
                .to_string();
        } else if RE_LABEL_ATTR.is_match(&xml) {
            xml = RE_LABEL_ATTR
                .replace(&xml, format!("xmp:Label=\"{}\"", label_str))
                .to_string();
        } else if xml.contains("<rdf:Description") {
            xml = xml.replacen(
                "<rdf:Description",
                &format!("<rdf:Description\n   xmp:Label=\"{}\"", label_str),
                1,
            );
        }

        if let Some(dt_idx) = color_to_darktable_index(col) {
            let dt_block = build_darktable_colorlabels_block(dt_idx);
            if RE_DARKTABLE_COLORLABELS_BLOCK.is_match(&xml) {
                xml = RE_DARKTABLE_COLORLABELS_BLOCK.replace(&xml, &dt_block).to_string();
            } else if xml.contains("</rdf:Description>") {
                xml = xml.replacen("</rdf:Description>", &format!("{}\n </rdf:Description>", dt_block), 1);
            }
        } else {
            xml = RE_DARKTABLE_COLORLABELS_BLOCK.replace_all(&xml, "").to_string();
        }
    } else {
        // Clear label if None
        xml = RE_LABEL_TAG.replace_all(&xml, "").to_string();
        xml = RE_LABEL_ATTR.replace_all(&xml, "").to_string();
        xml = RE_DARKTABLE_COLORLABELS_BLOCK.replace_all(&xml, "").to_string();
    }

    // 4. Patch tiff:Orientation
    if let Some(o) = state.orientation {
        if RE_ORIENT_TAG.is_match(&xml) {
            xml = RE_ORIENT_TAG
                .replace(&xml, format!("<tiff:Orientation>{}</tiff:Orientation>", o))
                .to_string();
        } else if RE_ORIENT_ATTR.is_match(&xml) {
            xml = RE_ORIENT_ATTR
                .replace(&xml, format!("tiff:Orientation=\"{}\"", o))
                .to_string();
        } else if xml.contains("<rdf:Description") {
            xml = xml.replacen(
                "<rdf:Description",
                &format!("<rdf:Description\n   tiff:Orientation=\"{}\"", o),
                1,
            );
        }
    } else {
        xml = RE_ORIENT_TAG.replace_all(&xml, "").to_string();
        xml = RE_ORIENT_ATTR.replace_all(&xml, "").to_string();
    }

    // 5. Patch <dc:subject> and <lr:hierarchicalSubject> with tags and Pick/Reject flag adapter
    let mut clean_tags: Vec<String> = state
        .tags
        .iter()
        .filter(|t| *t != TAG_PICK && *t != TAG_REJECT)
        .cloned()
        .collect();

    match state.flag {
        Some(1) => clean_tags.push(TAG_PICK.to_string()),
        Some(-1) => clean_tags.push(TAG_REJECT.to_string()),
        _ => {}
    }

    let subject_block = build_subject_block(&clean_tags);
    let hierarchical_block = build_hierarchical_subject_block(&clean_tags);

    if RE_SUBJECT_BLOCK.is_match(&xml) {
        xml = RE_SUBJECT_BLOCK.replace(&xml, &subject_block).to_string();
    } else if xml.contains("</rdf:Description>") {
        xml = xml.replacen("</rdf:Description>", &format!("{}\n </rdf:Description>", subject_block), 1);
    } else if let Some(cap) = Regex::new(r"(?s)<rdf:Description\b([^>]*?)/>").unwrap().captures(&xml) {
        let full = cap.get(0).unwrap().as_str();
        let attrs = cap.get(1).unwrap().as_str();
        let expanded = format!("<rdf:Description{}>\n{}\n </rdf:Description>", attrs, subject_block);
        xml = xml.replace(full, &expanded);
    }

    if RE_LR_HIERARCHICAL_SUBJECT_BLOCK.is_match(&xml) {
        xml = RE_LR_HIERARCHICAL_SUBJECT_BLOCK.replace(&xml, &hierarchical_block).to_string();
    } else if xml.contains("</rdf:Description>") {
        xml = xml.replacen("</rdf:Description>", &format!("{}\n </rdf:Description>", hierarchical_block), 1);
    }

    // 6. Patch dc:creator (artist)
    if let Some(ref a) = state.artist {
        let block = format!(
            "  <dc:creator>\n   <rdf:Seq>\n    <rdf:li>{}</rdf:li>\n   </rdf:Seq>\n  </dc:creator>",
            escape_xml(a)
        );
        if RE_DC_CREATOR_FULL_BLOCK.is_match(&xml) {
            xml = RE_DC_CREATOR_FULL_BLOCK.replace(&xml, &block).to_string();
        } else if xml.contains("</rdf:Description>") {
            xml = xml.replacen("</rdf:Description>", &format!("{}\n </rdf:Description>", block), 1);
        }
        xml = RE_TIFF_ARTIST_TAG.replace_all(&xml, "").to_string();
        xml = RE_TIFF_ARTIST_ATTR.replace_all(&xml, "").to_string();
    } else {
        xml = RE_DC_CREATOR_FULL_BLOCK.replace_all(&xml, "").to_string();
        xml = RE_TIFF_ARTIST_TAG.replace_all(&xml, "").to_string();
        xml = RE_TIFF_ARTIST_ATTR.replace_all(&xml, "").to_string();
    }

    // 7. Patch dc:rights (copyright)
    if let Some(ref c) = state.copyright {
        let block = format!(
            "  <dc:rights>\n   <rdf:Alt>\n    <rdf:li xml:lang=\"x-default\">{}</rdf:li>\n   </rdf:Alt>\n  </dc:rights>",
            escape_xml(c)
        );
        if RE_DC_RIGHTS_FULL_BLOCK.is_match(&xml) {
            xml = RE_DC_RIGHTS_FULL_BLOCK.replace(&xml, &block).to_string();
        } else if xml.contains("</rdf:Description>") {
            xml = xml.replacen("</rdf:Description>", &format!("{}\n </rdf:Description>", block), 1);
        }
        xml = RE_TIFF_COPYRIGHT_TAG.replace_all(&xml, "").to_string();
        xml = RE_TIFF_COPYRIGHT_ATTR.replace_all(&xml, "").to_string();
    } else {
        xml = RE_DC_RIGHTS_FULL_BLOCK.replace_all(&xml, "").to_string();
        xml = RE_TIFF_COPYRIGHT_TAG.replace_all(&xml, "").to_string();
        xml = RE_TIFF_COPYRIGHT_ATTR.replace_all(&xml, "").to_string();
    }

    // 8. Patch xmpRights:UsageTerms (usage_terms)
    if let Some(ref u) = state.usage_terms {
        let block = format!(
            "  <xmpRights:UsageTerms>\n   <rdf:Alt>\n    <rdf:li xml:lang=\"x-default\">{}</rdf:li>\n   </rdf:Alt>\n  </xmpRights:UsageTerms>",
            escape_xml(u)
        );
        if RE_XMP_RIGHTS_USAGE_TERMS_FULL_BLOCK.is_match(&xml) {
            xml = RE_XMP_RIGHTS_USAGE_TERMS_FULL_BLOCK.replace(&xml, &block).to_string();
        } else if xml.contains("</rdf:Description>") {
            xml = xml.replacen("</rdf:Description>", &format!("{}\n </rdf:Description>", block), 1);
        }
        xml = RE_XMP_RIGHTS_USAGE_TERMS_TAG.replace_all(&xml, "").to_string();
        xml = RE_XMP_RIGHTS_USAGE_TERMS_ATTR.replace_all(&xml, "").to_string();
    } else {
        xml = RE_XMP_RIGHTS_USAGE_TERMS_FULL_BLOCK.replace_all(&xml, "").to_string();
        xml = RE_XMP_RIGHTS_USAGE_TERMS_TAG.replace_all(&xml, "").to_string();
        xml = RE_XMP_RIGHTS_USAGE_TERMS_ATTR.replace_all(&xml, "").to_string();
    }

    // 9. Patch dc:title (title)
    if let Some(ref t) = state.title {
        let block = format!(
            "  <dc:title>\n   <rdf:Alt>\n    <rdf:li xml:lang=\"x-default\">{}</rdf:li>\n   </rdf:Alt>\n  </dc:title>",
            escape_xml(t)
        );
        if RE_DC_TITLE_FULL_BLOCK.is_match(&xml) {
            xml = RE_DC_TITLE_FULL_BLOCK.replace(&xml, &block).to_string();
        } else if xml.contains("</rdf:Description>") {
            xml = xml.replacen("</rdf:Description>", &format!("{}\n </rdf:Description>", block), 1);
        }
        xml = RE_DC_TITLE_TAG.replace_all(&xml, "").to_string();
        xml = RE_DC_TITLE_ATTR.replace_all(&xml, "").to_string();
    } else {
        xml = RE_DC_TITLE_FULL_BLOCK.replace_all(&xml, "").to_string();
        xml = RE_DC_TITLE_TAG.replace_all(&xml, "").to_string();
        xml = RE_DC_TITLE_ATTR.replace_all(&xml, "").to_string();
    }

    // 10. Patch dc:description (description)
    if let Some(ref d) = state.description {
        let block = format!(
            "  <dc:description>\n   <rdf:Alt>\n    <rdf:li xml:lang=\"x-default\">{}</rdf:li>\n   </rdf:Alt>\n  </dc:description>",
            escape_xml(d)
        );
        if RE_DC_DESC_FULL_BLOCK.is_match(&xml) {
            xml = RE_DC_DESC_FULL_BLOCK.replace(&xml, &block).to_string();
        } else if xml.contains("</rdf:Description>") {
            xml = xml.replacen("</rdf:Description>", &format!("{}\n </rdf:Description>", block), 1);
        }
        xml = RE_DC_DESC_TAG.replace_all(&xml, "").to_string();
        xml = RE_DC_DESC_ATTR.replace_all(&xml, "").to_string();
    } else {
        xml = RE_DC_DESC_FULL_BLOCK.replace_all(&xml, "").to_string();
        xml = RE_DC_DESC_TAG.replace_all(&xml, "").to_string();
        xml = RE_DC_DESC_ATTR.replace_all(&xml, "").to_string();
    }

    // 11. Patch photoshop:DateCreated (date_override)
    if let Some(ref d) = state.date_override {
        let tag = format!("  <photoshop:DateCreated>{}</photoshop:DateCreated>", escape_xml(d));
        if RE_PHOTOSHOP_DATE_CREATED_TAG.is_match(&xml) {
            xml = RE_PHOTOSHOP_DATE_CREATED_TAG.replace(&xml, &tag).to_string();
        } else if RE_PHOTOSHOP_DATE_CREATED_ATTR.is_match(&xml) {
            xml = RE_PHOTOSHOP_DATE_CREATED_ATTR.replace(&xml, format!("photoshop:DateCreated=\"{}\"", escape_xml(d))).to_string();
        } else if xml.contains("</rdf:Description>") {
            xml = xml.replacen("</rdf:Description>", &format!("{}\n </rdf:Description>", tag), 1);
        }
    } else {
        xml = RE_PHOTOSHOP_DATE_CREATED_TAG.replace_all(&xml, "").to_string();
        xml = RE_PHOTOSHOP_DATE_CREATED_ATTR.replace_all(&xml, "").to_string();
    }

    Ok(xml)
}

fn patch_xmp_gps(
    existing: &str,
    latitude: Option<f64>,
    longitude: Option<f64>,
    altitude: Option<f64>,
) -> anyhow::Result<String> {
    let mut xml = existing.to_string();

    // Remove existing GPS tags & attributes
    xml = RE_GPS_LAT_TAG.replace_all(&xml, "").to_string();
    xml = RE_GPS_LAT_ATTR.replace_all(&xml, "").to_string();
    xml = RE_GPS_LAT_REF_TAG.replace_all(&xml, "").to_string();
    xml = RE_GPS_LAT_REF_ATTR.replace_all(&xml, "").to_string();

    xml = RE_GPS_LON_TAG.replace_all(&xml, "").to_string();
    xml = RE_GPS_LON_ATTR.replace_all(&xml, "").to_string();
    xml = RE_GPS_LON_REF_TAG.replace_all(&xml, "").to_string();
    xml = RE_GPS_LON_REF_ATTR.replace_all(&xml, "").to_string();

    xml = RE_GPS_ALT_TAG.replace_all(&xml, "").to_string();
    xml = RE_GPS_ALT_ATTR.replace_all(&xml, "").to_string();
    xml = RE_GPS_ALT_REF_TAG.replace_all(&xml, "").to_string();
    xml = RE_GPS_ALT_REF_ATTR.replace_all(&xml, "").to_string();

    if let (Some(lat), Some(lon)) = (latitude, longitude) {
        if xml.contains("<rdf:Description") {
            if !xml.contains("xmlns:exif=") && !xml.contains("xmlns:exif\t") {
                xml = xml.replacen(
                    "<rdf:Description",
                    "<rdf:Description\n   xmlns:exif=\"http://ns.adobe.com/exif/1.0/\"",
                    1,
                );
            }

            let lat_ref = if lat >= 0.0 { "N" } else { "S" };
            let lon_ref = if lon >= 0.0 { "E" } else { "W" };
            let lat_str = format!("{:.6}{}", lat.abs(), lat_ref);
            let lon_str = format!("{:.6}{}", lon.abs(), lon_ref);

            let alt_attr = if let Some(alt) = altitude {
                let alt_ref = if alt >= 0.0 { "0" } else { "1" };
                format!(
                    "\n   exif:GPSAltitude=\"{:.2}\"\n   exif:GPSAltitudeRef=\"{}\"",
                    alt.abs(),
                    alt_ref
                )
            } else {
                String::new()
            };

            let gps_attrs = format!(
                "\n   exif:GPSLatitude=\"{}\"\n   exif:GPSLatitudeRef=\"{}\"\n   exif:GPSLongitude=\"{}\"\n   exif:GPSLongitudeRef=\"{}\"{}",
                lat_str, lat_ref, lon_str, lon_ref, alt_attr
            );

            xml = xml.replacen("<rdf:Description", &format!("<rdf:Description{}", gps_attrs), 1);
        }
    }

    Ok(xml)
}

fn color_to_darktable_index(col: &str) -> Option<u8> {
    match col.to_lowercase().as_str() {
        "red" => Some(0),
        "yellow" => Some(1),
        "green" => Some(2),
        "blue" => Some(3),
        "purple" => Some(4),
        _ => None,
    }
}

fn build_darktable_colorlabels_block(idx: u8) -> String {
    format!(
        "  <darktable:colorlabels>\n   <rdf:Seq>\n    <rdf:li>{}</rdf:li>\n   </rdf:Seq>\n  </darktable:colorlabels>",
        idx
    )
}

fn build_hierarchical_subject_block(tags: &[String]) -> String {
    if tags.is_empty() {
        return "  <lr:hierarchicalSubject>\n    <rdf:Bag/>\n   </lr:hierarchicalSubject>".to_string();
    }
    let mut s = String::from("  <lr:hierarchicalSubject>\n    <rdf:Bag>\n");
    for t in tags {
        s.push_str(&format!("     <rdf:li>{}</rdf:li>\n", escape_xml(t)));
    }
    s.push_str("    </rdf:Bag>\n   </lr:hierarchicalSubject>");
    s
}

fn build_subject_block(tags: &[String]) -> String {
    if tags.is_empty() {
        return "  <dc:subject>\n    <rdf:Bag/>\n   </dc:subject>".to_string();
    }
    let mut s = String::from("  <dc:subject>\n    <rdf:Bag>\n");
    for t in tags {
        s.push_str(&format!("     <rdf:li>{}</rdf:li>\n", escape_xml(t)));
    }
    s.push_str("    </rdf:Bag>\n   </dc:subject>");
    s
}

fn generate_fresh_xmp(state: &CullingState, rating_val: &str) -> String {
    let label_attr = state
        .color
        .as_ref()
        .map(|c| format!("\n   xmp:Label=\"{}\"", format_color_label_xmp(c)))
        .unwrap_or_default();

    let dt_block = state
        .color
        .as_ref()
        .and_then(|c| color_to_darktable_index(c))
        .map(|idx| format!("\n{}", build_darktable_colorlabels_block(idx)))
        .unwrap_or_default();

    let orient_attr = state
        .orientation
        .map(|o| format!("\n   tiff:Orientation=\"{}\"", o))
        .unwrap_or_default();

    let mut clean_tags: Vec<String> = state
        .tags
        .iter()
        .filter(|t| *t != TAG_PICK && *t != TAG_REJECT)
        .cloned()
        .collect();

    match state.flag {
        Some(1) => clean_tags.push(TAG_PICK.to_string()),
        Some(-1) => clean_tags.push(TAG_REJECT.to_string()),
        _ => {}
    }

    let subject_block = build_subject_block(&clean_tags);
    let hierarchical_block = build_hierarchical_subject_block(&clean_tags);

    let mut extra_blocks = Vec::new();
    if let Some(ref a) = state.artist {
        extra_blocks.push(format!(
            "  <dc:creator>\n   <rdf:Seq>\n    <rdf:li>{}</rdf:li>\n   </rdf:Seq>\n  </dc:creator>",
            escape_xml(a)
        ));
    }
    if let Some(ref c) = state.copyright {
        extra_blocks.push(format!(
            "  <dc:rights>\n   <rdf:Alt>\n    <rdf:li xml:lang=\"x-default\">{}</rdf:li>\n   </rdf:Alt>\n  </dc:rights>",
            escape_xml(c)
        ));
    }
    if let Some(ref u) = state.usage_terms {
        extra_blocks.push(format!(
            "  <xmpRights:UsageTerms>\n   <rdf:Alt>\n    <rdf:li xml:lang=\"x-default\">{}</rdf:li>\n   </rdf:Alt>\n  </xmpRights:UsageTerms>",
            escape_xml(u)
        ));
    }
    if let Some(ref t) = state.title {
        extra_blocks.push(format!(
            "  <dc:title>\n   <rdf:Alt>\n    <rdf:li xml:lang=\"x-default\">{}</rdf:li>\n   </rdf:Alt>\n  </dc:title>",
            escape_xml(t)
        ));
    }
    if let Some(ref d) = state.description {
        extra_blocks.push(format!(
            "  <dc:description>\n   <rdf:Alt>\n    <rdf:li xml:lang=\"x-default\">{}</rdf:li>\n   </rdf:Alt>\n  </dc:description>",
            escape_xml(d)
        ));
    }
    if let Some(ref d) = state.date_override {
        extra_blocks.push(format!(
            "  <photoshop:DateCreated>{}</photoshop:DateCreated>",
            escape_xml(d)
        ));
    }

    let extra_blocks_str = if extra_blocks.is_empty() {
        String::new()
    } else {
        format!("\n{}", extra_blocks.join("\n"))
    };

    format!(
        r#"<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="RapidReady">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:xmp="http://ns.adobe.com/xap/1.0/"
   xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmlns:tiff="http://ns.adobe.com/tiff/1.0/"
   xmlns:exif="http://ns.adobe.com/exif/1.0/"
   xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
   xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
   xmlns:lr="http://ns.adobe.com/lightroom/1.0/"
   xmlns:darktable="http://darktable.sf.net/"
   xmp:Rating="{}"{}{}>
 {}
 {}{}{}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
"#,
        rating_val, label_attr, orient_attr, subject_block, hierarchical_block, dt_block, extra_blocks_str
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_darktable_colorlabels_parsing() {
        let xmp_data = r#"<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:xmp="http://ns.adobe.com/xap/1.0/"
   xmlns:darktable="http://darktable.sf.net/">
   <xmp:Rating>3</xmp:Rating>
   <darktable:colorlabels>
    <rdf:Seq>
     <rdf:li>2</rdf:li>
    </rdf:Seq>
   </darktable:colorlabels>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>"#;

        let state = parse_sidecar_xmp(xmp_data);
        assert_eq!(state.rating, 3);
        assert_eq!(state.color, Some("green".to_string()));
    }

    #[test]
    fn test_patch_darktable_and_lr_subject() {
        let base_xmp = r#"<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:Rating>0</xmp:Rating>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>"#;

        let mut state = CullingState::default();
        state.rating = 4;
        state.color = Some("red".to_string());
        state.flag = Some(1);
        state.tags = vec!["landscape".to_string()];

        let patched = patch_xmp_xml(base_xmp, &state, "4").unwrap();
        assert!(patched.contains("xmlns:darktable=\"http://darktable.sf.net/\""));
        assert!(patched.contains("xmlns:lr=\"http://ns.adobe.com/lightroom/1.0/\""));
        assert!(patched.contains("<xmp:Label>Red</xmp:Label>") || patched.contains("xmp:Label=\"Red\""));
        assert!(patched.contains("<darktable:colorlabels>"));
        assert!(patched.contains("<rdf:li>0</rdf:li>"));
        assert!(patched.contains("<dc:subject>"));
        assert!(patched.contains("<lr:hierarchicalSubject>"));
        assert!(patched.contains(TAG_PICK));
        assert!(patched.contains("landscape"));

        // Now parse it back
        let reloaded = parse_sidecar_xmp(&patched);
        assert_eq!(reloaded.rating, 4);
        assert_eq!(reloaded.color, Some("red".to_string()));
        assert_eq!(reloaded.flag, Some(1));
        assert!(reloaded.tags.contains(&"landscape".to_string()));
    }

    #[test]
    fn test_xmp_naming_mode() {
        set_xmp_naming_mode("standard");
        assert_eq!(get_xmp_naming_mode(), "standard");
        set_xmp_naming_mode("darktable");
        assert_eq!(get_xmp_naming_mode(), "darktable");
        set_xmp_naming_mode("standard");
    }
}
