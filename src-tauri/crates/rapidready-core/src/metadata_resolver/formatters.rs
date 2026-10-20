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
