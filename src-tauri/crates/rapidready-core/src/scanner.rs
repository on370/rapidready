use anyhow::Result;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use walkdir::WalkDir;

use crate::archive_catalog::ArchiveCatalog;
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
    cancel_flag: Option<&AtomicBool>,
    progress_callback: F,
) -> Result<Vec<ScannedFile>>
where
    F: Fn(ScanProgress) + Send + Sync,
{
    scan_directory_with_catalog(
        dir,
        import_index,
        crate::archive_catalog::get_global_catalog().as_deref(),
        cancel_flag,
        progress_callback,
    )
}

pub fn scan_directory_with_catalog<F>(
    dir: &Path,
    import_index: &ImportIndex,
    archive_catalog: Option<&ArchiveCatalog>,
    cancel_flag: Option<&AtomicBool>,
    progress_callback: F,
) -> Result<Vec<ScannedFile>>
where
    F: Fn(ScanProgress) + Send + Sync,
{
    let supported_exts = [
        "jpg", "jpeg", "png", "tif", "tiff", "heic", "heif", "hif", "webp", "avif", // Raster
        "cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", "pef", "3fr", "x3f", "nrw", "rwl", "fff", "iiq", "crw", "erf", // RAW
        "mp4", "mov", "m4v", "avi" // Video
    ];

    // Pre-fetch distinct imported file sizes from SQLite to avoid 99.9% of random disk reads
    let mut imported_sizes = import_index.get_imported_sizes().unwrap_or_default();
    let imported_target_paths = import_index.get_imported_target_paths().unwrap_or_default();

    // Lazy Backfill pre-filtering: load archive files grouped by size, excluding paths already in import_index
    let mut unindexed_archive_by_size: HashMap<u64, Vec<(String, String)>> = HashMap::new();
    if let Some(catalog) = archive_catalog {
        if let Ok(size_map) = catalog.get_files_by_size_map() {
            for (size, files) in size_map {
                let filtered: Vec<(String, String)> = files
                    .into_iter()
                    .filter(|(path, _name)| {
                        let norm = path.replace('\\', "/");
                        !imported_target_paths.contains(&norm)
                    })
                    .collect();
                if !filtered.is_empty() {
                    unindexed_archive_by_size.insert(size, filtered);
                }
            }
        }
    }

    // Phase 1: Fast directory walk (reads directory entries from filesystem cache)
    let mut candidate_entries = Vec::new();
    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if let Some(cancel) = cancel_flag {
            if cancel.load(Ordering::Relaxed) {
                return Err(anyhow::anyhow!("Scan cancelled"));
            }
        }
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
        if let Some(cancel) = cancel_flag {
            if cancel.load(Ordering::Relaxed) {
                return Err(anyhow::anyhow!("Scan cancelled"));
            }
        }
        let path = entry.path();
        let meta = entry.metadata().ok();
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let name = entry.file_name().to_string_lossy().to_string();

        let date = get_fast_creation_date(path, meta.as_ref());
        let formatted_date = date.map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string());

        // Zero-I/O check: If file size is not in imported_files and not in unindexed_archive_by_size, it's 100% not imported.
        // Only read 64KB head hash if size matches an already imported file or an unindexed archive candidate.
        let (hash, already_imported) = if size > 0 && (imported_sizes.contains(&size) || unindexed_archive_by_size.contains_key(&size)) {
            let h = hash_file_head(path).unwrap_or_default();
            let mut imported = import_index.is_imported(&h, size).unwrap_or(false);

            // Lazy Backfill: If not imported or if unindexed candidates exist for this size,
            // hash archive candidates of this exact size, backfill into import_index, and check for match.
            if (!imported || unindexed_archive_by_size.contains_key(&size)) && unindexed_archive_by_size.contains_key(&size) {
                if let Some(candidates) = unindexed_archive_by_size.remove(&size) {
                    for (arch_path, arch_name) in candidates {
                        if let Ok(arch_hash) = hash_file_head(Path::new(&arch_path)) {
                            if !arch_hash.is_empty() {
                                let _ = import_index.mark_imported(&arch_hash, size, &arch_name, &arch_path);
                                imported_sizes.insert(size);
                                if !h.is_empty() && arch_hash == h {
                                    imported = true;
                                }
                            }
                        }
                    }
                }
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scanner_supports_heic_and_heif() {
        let temp_dir = std::env::temp_dir().join(format!("rr_scanner_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let jpg = temp_dir.join("photo1.jpg");
        let heic = temp_dir.join("photo2.heic");
        let heif = temp_dir.join("photo3.HEIF");
        let hif = temp_dir.join("photo4.hif");
        let txt = temp_dir.join("notes.txt");

        let _ = std::fs::write(&jpg, b"dummy jpg");
        let _ = std::fs::write(&heic, b"dummy heic");
        let _ = std::fs::write(&heif, b"dummy heif");
        let _ = std::fs::write(&hif, b"dummy hif");
        let _ = std::fs::write(&txt, b"dummy text");

        let import_index = ImportIndex::new(&temp_dir).expect("Create dummy import index");
        let scanned = scan_directory(&temp_dir, &import_index, None, |_| {}).expect("scan directory");

        let names: Vec<_> = scanned.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"photo1.jpg"));
        assert!(names.contains(&"photo2.heic"));
        assert!(names.contains(&"photo3.HEIF"));
        assert!(names.contains(&"photo4.hif"));
        assert!(!names.contains(&"notes.txt"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_scanner_cancellation() {
        let temp_dir = std::env::temp_dir().join(format!("rr_scanner_cancel_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);

        for i in 0..10 {
            let _ = std::fs::write(temp_dir.join(format!("photo{}.jpg", i)), b"dummy");
        }

        let import_index = ImportIndex::new(&temp_dir).expect("Create dummy import index");
        let cancel_flag = AtomicBool::new(true); // Pre-cancelled
        let res = scan_directory(&temp_dir, &import_index, Some(&cancel_flag), |_| {});
        assert!(res.is_err(), "Scan should return Err when cancelled");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_scanner_lazy_backfill_from_archive_catalog() {
        let temp_dir = std::env::temp_dir().join(format!("rr_backfill_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_dir);
        let _ = std::fs::create_dir_all(&temp_dir);

        let archive_dir = temp_dir.join("archive");
        let sd_card_dir = temp_dir.join("sd_card");
        let app_data_dir = temp_dir.join("app_data");
        std::fs::create_dir_all(&archive_dir).unwrap();
        std::fs::create_dir_all(&sd_card_dir).unwrap();
        std::fs::create_dir_all(&app_data_dir).unwrap();

        // 1. Files in archive
        let arch_match_path = archive_dir.join("existing_photo.jpg");
        let arch_diff_path = archive_dir.join("different_photo.jpg");

        let content_match = vec![b'A'; 1000];
        let content_diff_b = vec![b'B'; 2000];

        std::fs::write(&arch_match_path, &content_match).unwrap();
        std::fs::write(&arch_diff_path, &content_diff_b).unwrap();

        // 2. Set up ArchiveCatalog with these 2 files
        let catalog = ArchiveCatalog::new(&app_data_dir).unwrap();
        let files = vec![
            crate::archive::ArchiveFile {
                path: arch_match_path.to_string_lossy().to_string(),
                name: "existing_photo.jpg".into(),
                size: 1000,
                date: None,
                camera: None,
                lens: None,
                iso: None,
                aperture: None,
                shutter: None,
                culling: crate::culling::CullingState::default(),
                is_raw: false,
                is_video: false,
                mtime: 1700000000,
            },
            crate::archive::ArchiveFile {
                path: arch_diff_path.to_string_lossy().to_string(),
                name: "different_photo.jpg".into(),
                size: 2000,
                date: None,
                camera: None,
                lens: None,
                iso: None,
                aperture: None,
                shutter: None,
                culling: crate::culling::CullingState::default(),
                is_raw: false,
                is_video: false,
                mtime: 1700000000,
            },
        ];
        catalog.upsert_archive_files(&archive_dir.to_string_lossy(), &files, &[]).unwrap();

        // 3. Set up ImportIndex (empty)
        let import_index = ImportIndex::new(&app_data_dir).unwrap();
        assert!(import_index.get_imported_sizes().unwrap().is_empty());
        assert!(import_index.get_imported_target_paths().unwrap().is_empty());

        // 4. Files on SD card to scan
        let sd_match_path = sd_card_dir.join("sd_match.jpg");
        let sd_diff_path = sd_card_dir.join("sd_diff.jpg");
        let sd_new_path = sd_card_dir.join("sd_new.jpg");

        std::fs::write(&sd_match_path, &content_match).unwrap();
        let content_diff_c = vec![b'C'; 2000];
        std::fs::write(&sd_diff_path, &content_diff_c).unwrap();
        std::fs::write(&sd_new_path, vec![b'D'; 3000]).unwrap();

        // 5. Run scan_directory_with_catalog
        let scanned = scan_directory_with_catalog(
            &sd_card_dir,
            &import_index,
            Some(&catalog),
            None,
            |_| {},
        ).expect("scan directory with catalog");

        // 6. Verify results
        let match_file = scanned.iter().find(|f| f.name == "sd_match.jpg").unwrap();
        assert!(match_file.already_imported, "Matching content & size must be marked already_imported = true");

        let diff_file = scanned.iter().find(|f| f.name == "sd_diff.jpg").unwrap();
        assert!(!diff_file.already_imported, "Same size but different content must remain already_imported = false");

        let new_file = scanned.iter().find(|f| f.name == "sd_new.jpg").unwrap();
        assert!(!new_file.already_imported, "New file must remain already_imported = false");

        // 7. Verify backfill
        let arch_match_hash = hash_file_head(&arch_match_path).unwrap();
        assert!(import_index.is_imported(&arch_match_hash, 1000).unwrap(), "Archive file must now be backfilled in import_index.db");

        let target_paths = import_index.get_imported_target_paths().unwrap();
        let norm_match = arch_match_path.to_string_lossy().replace('\\', "/");
        assert!(target_paths.contains(&norm_match), "Target paths must contain backfilled archive file");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
