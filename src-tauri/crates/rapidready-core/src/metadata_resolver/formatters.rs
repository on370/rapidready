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

const KNOWN_BRANDS: &[(&str, &str)] = &[
    ("SONY", "Sony"),
    ("FUJIFILM", "Fujifilm"),
    ("NIKON", "Nikon"),
    ("CANON", "Canon"),
    ("PANASONIC", "Panasonic"),
    ("OLYMPUS", "Olympus"),
    ("PENTAX", "Pentax"),
    ("RICOH", "Ricoh"),
    ("LEICA", "Leica"),
    ("HASSELBLAD", "Hasselblad"),
    ("SIGMA", "Sigma"),
    ("APPLE", "Apple"),
];

const CORP_SUFFIXES: &[&str] = &[
    "corporation",
    "corp.",
    "corp",
    "inc.",
    "inc",
    "co.,ltd.",
    "co.,ltd",
    "co.,",
    "co.",
    "co",
    "ltd.",
    "ltd",
    "imaging",
    "optical",
    "camera",
    "digital",
    "company",
];

/// Normalizes brand casing to photographic standard (e.g. "SONY" -> "Sony").
pub fn normalize_brand_name(brand: &str) -> String {
    for (upper, proper) in KNOWN_BRANDS {
        if brand.eq_ignore_ascii_case(upper) {
            return proper.to_string();
        }
    }
    brand.to_string()
}

fn normalize_make(make: &str) -> String {
    let words: Vec<&str> = make.split_whitespace().collect();
    let mut filtered_words = Vec::new();
    for w in words {
        let clean_w = w.trim_matches(|c| c == ',' || c == '.' || c == '"' || c == '\'').to_lowercase();
        let is_suffix = CORP_SUFFIXES.iter().any(|s| {
            s.eq_ignore_ascii_case(w) || s.eq_ignore_ascii_case(&clean_w)
        });
        if !is_suffix && !clean_w.is_empty() {
            filtered_words.push(w.trim_matches(','));
        }
    }
    let candidate = if filtered_words.is_empty() {
        make.to_string()
    } else {
        filtered_words.join(" ")
    };
    normalize_brand_name(&candidate)
}

fn normalize_model_first_word(model: &str) -> String {
    let words: Vec<&str> = model.split_whitespace().collect();
    if words.is_empty() {
        return model.to_string();
    }
    let first = words[0];
    let norm_first = normalize_brand_name(first);
    if norm_first != first {
        let mut res = norm_first;
        for w in &words[1..] {
            res.push(' ');
            res.push_str(w);
        }
        res
    } else {
        model.to_string()
    }
}

/// Combines camera make and model intelligently with deduplication and brand harmonization.
///
/// 1. Sanitizes both inputs using `clean_camera_model`.
/// 2. Strips corporate suffixes (e.g. "CORPORATION", "INC.", "IMAGING", "LTD.") from make.
/// 3. Normalizes known brand names (e.g. "SONY" -> "Sony", "FUJIFILM" -> "Fujifilm").
/// 4. Handles case where model already starts with or contains make (e.g. "Canon" + "Canon EOS 6D" -> "Canon EOS 6D").
/// 5. Handles Apple devices ("Apple" + "iPhone 13 Pro" -> "iPhone 13 Pro").
/// 6. Combines make and model seamlessly (e.g. "SONY" + "ILCE-7RM4" -> "Sony ILCE-7RM4").
pub fn combine_camera_make_and_model(raw_make: Option<&str>, raw_model: Option<&str>) -> Option<String> {
    let clean_make = raw_make.and_then(clean_camera_model);
    let clean_model = raw_model.and_then(clean_camera_model);

    match (clean_make, clean_model) {
        (None, None) => None,
        (Some(make), None) => {
            let norm_make = normalize_make(&make);
            clean_camera_model(&norm_make)
        }
        (None, Some(model)) => {
            let norm_model = normalize_model_first_word(&model);
            clean_camera_model(&norm_model)
        }
        (Some(make), Some(model)) => {
            let norm_make = normalize_make(&make);
            let norm_model = normalize_model_first_word(&model);

            // Special case Apple: iPhone / iPad
            if norm_make.eq_ignore_ascii_case("Apple") 
                && (norm_model.to_lowercase().starts_with("iphone") || norm_model.to_lowercase().starts_with("ipad")) 
            {
                return clean_camera_model(&norm_model);
            }

            let model_lower = norm_model.to_lowercase();
            let make_lower = norm_make.to_lowercase();

            let starts_with_make = model_lower.starts_with(&make_lower);
            let contains_make_word = norm_model.split_whitespace().any(|w| {
                w.trim_matches(|c: char| !c.is_alphanumeric()).eq_ignore_ascii_case(&norm_make)
            });

            if starts_with_make || contains_make_word {
                clean_camera_model(&norm_model)
            } else {
                let combined = format!("{} {}", norm_make, norm_model);
                clean_camera_model(&combined)
            }
        }
    }
}
