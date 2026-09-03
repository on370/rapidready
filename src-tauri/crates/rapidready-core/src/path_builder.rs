use chrono::{Datelike, NaiveDateTime};

pub fn build_target_path(template: &str, dt: &NaiveDateTime) -> String {
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
    
    // Normalize slashes
    result = result.replace("\\", "/");
    if !result.ends_with('/') {
        result.push('/');
    }
    
    result
}
