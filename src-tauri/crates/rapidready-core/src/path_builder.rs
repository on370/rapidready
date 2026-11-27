use std::path::Path;
use chrono::{Datelike, NaiveDateTime};

pub fn build_target_path(template: &str, dt: &NaiveDateTime) -> String {
    build_target_path_for_file(template, dt, None, None)
}

fn sanitize_path_token(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut prev_underscore = false;

    for ch in raw.trim().chars() {
        let mapped = if ch.is_whitespace()
            || ch.is_control()
            || matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        {
            '_'
        } else {
            ch
        };

        if mapped == '_' {
            if !prev_underscore {
                out.push('_');
                prev_underscore = true;
            }
        } else {
            out.push(mapped);
            prev_underscore = false;
        }
    }

    let trimmed = out.trim_matches(|c| c == '_' || c == '.');
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        String::new()
    } else {
        trimmed.to_string()
    }
}

fn resolve_ext_token(file_path: Option<&Path>) -> String {
    file_path
        .and_then(|p| p.extension())
        .and_then(|s| s.to_str())
        .map(|s| sanitize_path_token(&s.to_uppercase()))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "OTHER".to_string())
}

fn resolve_type_token(file_path: Option<&Path>) -> String {
    let Some(p) = file_path else {
        return "OTHER".to_string();
    };

    if crate::metadata_resolver::is_raw_path(p) {
        return "RAW".to_string();
    }

    let ext_upper = p
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| sanitize_path_token(&s.to_uppercase()))
        .unwrap_or_default();

    if ext_upper == "JPG" || ext_upper == "JPEG" {
        return "JPG".to_string();
    }

    if crate::metadata_resolver::is_video_path(p) {
        return "VID".to_string();
    }

    if !ext_upper.is_empty() {
        ext_upper
    } else {
        "OTHER".to_string()
    }
}

pub fn build_target_path_for_file(
    template: &str,
    dt: &NaiveDateTime,
    file_path: Option<&Path>,
    camera: Option<&str>,
) -> String {
    let trimmed = template.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let mut result = trimmed.to_string();

    let year = format!("{:04}", dt.year());
    let month = format!("{:02}", dt.month());
    let day = format!("{:02}", dt.day());

    result = result.replace("{year}", &year);
    result = result.replace("{month}", &month);
    result = result.replace("{day}", &day);

    if result.contains("{ext}") {
        let ext = resolve_ext_token(file_path);
        result = result.replace("{ext}", &ext);
    }

    if result.contains("{type}") {
        let media_type = resolve_type_token(file_path);
        result = result.replace("{type}", &media_type);
    }

    if result.contains("{camera}") {
        let cam = camera
            .map(sanitize_path_token)
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Unknown_Camera".to_string());
        result = result.replace("{camera}", &cam);
    }

    // Normalize slashes on Windows
    #[cfg(target_os = "windows")]
    {
        result = result.replace('\\', "/");
    }
    if !result.ends_with('/') {
        result.push('/');
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn sample_dt() -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 7, 14)
            .unwrap()
            .and_hms_opt(12, 30, 0)
            .unwrap()
    }

    #[test]
    fn test_build_target_path_backwards_compat() {
        let dt = sample_dt();
        assert_eq!(
            build_target_path("{year}/{year}-{month}-{day}", &dt),
            "2026/2026-07-14/"
        );
        assert_eq!(build_target_path("", &dt), "");
    }

    #[test]
    fn test_ext_token() {
        let dt = sample_dt();
        let tmpl = "{year}/{year}-{month}-{day}/{ext}";
        assert_eq!(
            build_target_path_for_file(tmpl, &dt, Some(Path::new("IMG_0001.cr3")), None),
            "2026/2026-07-14/CR3/"
        );
        assert_eq!(
            build_target_path_for_file(tmpl, &dt, Some(Path::new("IMG_0001.jpg")), None),
            "2026/2026-07-14/JPG/"
        );
        assert_eq!(
            build_target_path_for_file(tmpl, &dt, Some(Path::new("no_extension")), None),
            "2026/2026-07-14/OTHER/"
        );
    }

    #[test]
    fn test_type_token() {
        let dt = sample_dt();
        let tmpl = "{year}/{year}-{month}-{day}/{type}";
        assert_eq!(
            build_target_path_for_file(tmpl, &dt, Some(Path::new("IMG_0001.cr3")), None),
            "2026/2026-07-14/RAW/"
        );
        assert_eq!(
            build_target_path_for_file(tmpl, &dt, Some(Path::new("DSC0001.ARW")), None),
            "2026/2026-07-14/RAW/"
        );
        assert_eq!(
            build_target_path_for_file(tmpl, &dt, Some(Path::new("IMG_0001.jpeg")), None),
            "2026/2026-07-14/JPG/"
        );
        assert_eq!(
            build_target_path_for_file(tmpl, &dt, Some(Path::new("CLIP0001.mp4")), None),
            "2026/2026-07-14/VID/"
        );
        assert_eq!(
            build_target_path_for_file(tmpl, &dt, Some(Path::new("IMG_0001.heic")), None),
            "2026/2026-07-14/HEIC/"
        );
    }

    #[test]
    fn test_camera_token_and_sanitization() {
        let dt = sample_dt();
        let tmpl = "{camera}/{type}";
        assert_eq!(
            build_target_path_for_file(
                tmpl,
                &dt,
                Some(Path::new("IMG_0001.cr3")),
                Some("Canon EOS R8")
            ),
            "Canon_EOS_R8/RAW/"
        );
        assert_eq!(
            build_target_path_for_file(
                tmpl,
                &dt,
                Some(Path::new("IMG_0001.arw")),
                Some("Sony/A7: IV?")
            ),
            "Sony_A7_IV/RAW/"
        );
        assert_eq!(
            build_target_path_for_file(tmpl, &dt, Some(Path::new("IMG_0001.cr3")), Some("..")),
            "Unknown_Camera/RAW/"
        );
        assert_eq!(
            build_target_path_for_file(tmpl, &dt, Some(Path::new("IMG_0001.cr3")), None),
            "Unknown_Camera/RAW/"
        );
    }
}
