use anyhow::Result;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

use crate::date_resolver::get_creation_date;
use crate::hasher::hash_file_head;
use crate::import_index::ImportIndex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub date: Option<NaiveDateTime>,
    pub formatted_date: Option<String>,
    pub hash: String,
    pub already_imported: bool,
}

pub fn scan_directory(dir: &Path, import_index: &ImportIndex) -> Result<Vec<ScannedFile>> {
    let mut files = Vec::new();
    let supported_exts = [
        "jpg", "jpeg", "png", "tif", "tiff", // Raster
        "cr2", "cr3", "arw", "nef", "dng", "orf", "raf", // RAW
        "mp4", "mov", "m4v", "avi" // Video
    ];

    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if supported_exts.contains(&ext.to_lowercase().as_str()) {
                    let meta = entry.metadata().ok();
                    let size = meta.map(|m| m.len()).unwrap_or(0);
                    let name = entry.file_name().to_string_lossy().to_string();
                    
                    let date = get_creation_date(path).ok();
                    let formatted_date = date.map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string());
                    
                    let hash = hash_file_head(path).unwrap_or_else(|_| "".to_string());
                    let already_imported = import_index.is_imported(&hash, size).unwrap_or(false);
                    
                    files.push(ScannedFile {
                        path: path.to_string_lossy().to_string(),
                        name,
                        size,
                        date,
                        formatted_date,
                        hash,
                        already_imported,
                    });
                }
            }
        }
    }
    
    // Sort by date (oldest first)
    files.sort_by(|a, b| {
        let date_a = a.date.unwrap_or(chrono::DateTime::UNIX_EPOCH.naive_utc());
        let date_b = b.date.unwrap_or(chrono::DateTime::UNIX_EPOCH.naive_utc());
        date_a.cmp(&date_b)
    });
    
    Ok(files)
}
