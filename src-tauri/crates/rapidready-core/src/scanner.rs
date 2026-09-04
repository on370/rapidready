use anyhow::Result;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

use crate::date_resolver::get_fast_creation_date;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub current: usize,
    pub total: usize,
    pub percent: f32,
    pub current_file: String,
}

pub fn scan_directory<F>(
    dir: &Path,
    import_index: &ImportIndex,
    progress_callback: F,
) -> Result<Vec<ScannedFile>>
where
    F: Fn(ScanProgress) + Send + Sync,
{
    let supported_exts = [
        "jpg", "jpeg", "png", "tif", "tiff", // Raster
        "cr2", "cr3", "arw", "nef", "dng", "orf", "raf", // RAW
        "mp4", "mov", "m4v", "avi" // Video
    ];

    // Pre-fetch distinct imported file sizes from SQLite to avoid 99.9% of random disk reads
    let imported_sizes = import_index.get_imported_sizes().unwrap_or_default();

    // Phase 1: Fast directory walk (reads directory entries from filesystem cache)
    let mut candidate_entries = Vec::new();
    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if supported_exts.contains(&ext.to_lowercase().as_str()) {
                    candidate_entries.push(entry);
                }
            }
        }
    }

    let total = candidate_entries.len();
    if total == 0 {
        progress_callback(ScanProgress {
            current: 0,
            total: 0,
            percent: 100.0,
            current_file: String::new(),
        });
        return Ok(Vec::new());
    }

    // Initial heartbeat
    progress_callback(ScanProgress {
        current: 0,
        total,
        percent: 0.0,
        current_file: String::new(),
    });

    // Phase 2: In-memory metadata & smart pre-filtered hash verification
    let mut files = Vec::with_capacity(total);
    for (idx, entry) in candidate_entries.into_iter().enumerate() {
        let path = entry.path();
        let meta = entry.metadata().ok();
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let name = entry.file_name().to_string_lossy().to_string();

        let date = get_fast_creation_date(path, meta.as_ref());
        let formatted_date = date.map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string());

        // Zero-I/O check: If file size is not in imported_files, it's 100% not imported.
        // Only read 64KB head hash if size matches an already imported file.
        let (hash, already_imported) = if size > 0 && imported_sizes.contains(&size) {
            let h = hash_file_head(path).unwrap_or_default();
            let imported = import_index.is_imported(&h, size).unwrap_or(false);
            (h, imported)
        } else {
            (String::new(), false)
        };

        files.push(ScannedFile {
            path: path.to_string_lossy().to_string(),
            name: name.clone(),
            size,
            date,
            formatted_date,
            hash,
            already_imported,
        });

        let current = idx + 1;
        // Emit progress periodically or at milestones
        if current % 25 == 0 || current == total || current <= 5 {
            let percent = (current as f32 / total as f32) * 100.0;
            progress_callback(ScanProgress {
                current,
                total,
                percent,
                current_file: name,
            });
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
