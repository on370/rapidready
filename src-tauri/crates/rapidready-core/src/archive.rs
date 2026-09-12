use serde::{Deserialize, Serialize};
use std::path::Path;
use anyhow::Result;
use walkdir::WalkDir;
use chrono::NaiveDateTime;
use crate::culling::{read_sidecar, CullingState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub date: Option<NaiveDateTime>,
    pub camera: Option<String>,
    pub lens: Option<String>,
    pub iso: Option<String>,
    pub aperture: Option<String>,
    pub shutter: Option<String>,
    pub culling: CullingState,
    pub is_raw: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirNode {
    pub name: String,
    pub path: String,
    pub children: Vec<DirNode>,
}

pub fn get_directory_tree(dir: &Path) -> Result<DirNode> {
    let root = DirNode {
        name: dir.file_name().unwrap_or_default().to_string_lossy().into_owned(),
        path: dir.to_string_lossy().into_owned(),
        children: Vec::new(),
    };
    
    // Only go 2-3 levels deep to avoid massive latency
    for entry in WalkDir::new(dir).min_depth(1).max_depth(3).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_dir() {
            // Very simplistic flat return for now, frontend can group it or we can just return flat list of dirs
        }
    }
    
    // Actually, let's just return a flat list of subdirectories to the frontend, and let the frontend render them.
    Ok(root)
}

use rayon::prelude::*;
use crate::date_resolver::get_fast_creation_date;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, Condvar};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveScanProgress {
    pub scan_id: u64,
    pub files_found: usize,
    pub total_bytes: u64,
    pub current_dir: String,
    pub is_paused: bool,
    pub is_cancelled: bool,
    pub is_complete: bool,
}

#[derive(Clone)]
pub struct ScanController {
    cancelled: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    pause_cond: Arc<(Mutex<bool>, Condvar)>,
}

impl Default for ScanController {
    fn default() -> Self {
        Self::new()
    }
}

impl ScanController {
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
            paused: Arc::new(AtomicBool::new(false)),
            pause_cond: Arc::new((Mutex::new(false), Condvar::new())),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.resume();
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
        let (lock, _cvar) = &*self.pause_cond;
        let mut p = lock.lock().unwrap();
        *p = true;
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
        let (lock, cvar) = &*self.pause_cond;
        let mut p = lock.lock().unwrap();
        *p = false;
        cvar.notify_all();
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    /// Checks if paused or cancelled. If paused, blocks thread on Condvar until resumed or cancelled.
    /// Returns true if cancelled.
    pub fn check_pause_or_cancel(&self) -> bool {
        if self.is_cancelled() {
            return true;
        }
        if self.is_paused() {
            let (lock, cvar) = &*self.pause_cond;
            let mut p = lock.lock().unwrap();
            while *p && !self.is_cancelled() {
                p = cvar.wait(p).unwrap();
            }
        }
        self.is_cancelled()
    }
}

pub fn scan_archive_directory_streaming<P, C>(
    dir: &Path,
    existing_paths: Option<&std::collections::HashSet<String>>,
    initial_bytes: u64,
    scan_id: u64,
    controller: ScanController,
    mut on_progress: P,
    mut on_chunk: C,
) -> Result<Vec<ArchiveFile>>
where
    P: FnMut(ArchiveScanProgress),
    C: FnMut(Vec<ArchiveFile>),
{
    let initial_count = existing_paths.map(|s| s.len()).unwrap_or(0);
    let mut files = Vec::new();
    let supported_exts = [
        "jpg", "jpeg", "png", "tif", "tiff", // Raster
        "cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", "pef", "3fr", "x3f", "nrw", // RAW
    ];

    let mut current_chunk = Vec::with_capacity(100);
    let mut total_bytes = initial_bytes;
    let mut last_progress_time = Instant::now();
    let mut last_chunk_time = Instant::now();
    let mut current_dir_str = dir.to_string_lossy().into_owned();

    // Initial progress event: Connecting / Starting
    on_progress(ArchiveScanProgress {
        scan_id,
        files_found: initial_count,
        total_bytes,
        current_dir: current_dir_str.clone(),
        is_paused: false,
        is_cancelled: false,
        is_complete: false,
    });

    for entry in WalkDir::new(dir).follow_links(false).into_iter().filter_map(|e| e.ok()) {
        if controller.check_pause_or_cancel() {
            break;
        }

        let path = entry.path();
        if entry.file_type().is_dir() {
            current_dir_str = path.to_string_lossy().into_owned();
            let chunk_elapsed = last_chunk_time.elapsed().as_millis();
            if !current_chunk.is_empty() && (current_chunk.len() >= 20 || chunk_elapsed >= 500) {
                on_chunk(std::mem::take(&mut current_chunk));
                current_chunk = Vec::with_capacity(100);
                last_chunk_time = Instant::now();
            }
            if last_progress_time.elapsed().as_millis() >= 150 {
                last_progress_time = Instant::now();
                on_progress(ArchiveScanProgress {
                    scan_id,
                    files_found: initial_count + files.len(),
                    total_bytes,
                    current_dir: current_dir_str.clone(),
                    is_paused: controller.is_paused(),
                    is_cancelled: controller.is_cancelled(),
                    is_complete: false,
                });
            }
            continue;
        }

        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if supported_exts.contains(&ext.to_lowercase().as_str()) {
                    let path_norm = path.to_string_lossy().replace('\\', "/");
                    if let Some(set) = existing_paths {
                        if set.contains(&path_norm) {
                            continue;
                        }
                    }

                    let metadata = entry.metadata().ok();
                    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                    total_bytes += size;
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let date = get_fast_creation_date(path, metadata.as_ref());
                    let is_raw = crate::metadata_resolver::is_raw_path(path);
                    let culling = read_sidecar(path);

                    let item = ArchiveFile {
                        path: path.to_string_lossy().into_owned(),
                        name,
                        size,
                        date,
                        camera: None,
                        lens: None,
                        iso: None,
                        aperture: None,
                        shutter: None,
                        culling,
                        is_raw,
                    };

                    current_chunk.push(item.clone());
                    files.push(item);

                    let chunk_elapsed = last_chunk_time.elapsed().as_millis();
                    let should_emit_chunk = current_chunk.len() >= 100
                        || (current_chunk.len() >= 20 && chunk_elapsed >= 400)
                        || (!current_chunk.is_empty() && chunk_elapsed >= 800);

                    if should_emit_chunk {
                        on_chunk(std::mem::take(&mut current_chunk));
                        current_chunk = Vec::with_capacity(100);
                        last_chunk_time = Instant::now();
                        last_progress_time = Instant::now();
                        on_progress(ArchiveScanProgress {
                            scan_id,
                            files_found: initial_count + files.len(),
                            total_bytes,
                            current_dir: current_dir_str.clone(),
                            is_paused: controller.is_paused(),
                            is_cancelled: controller.is_cancelled(),
                            is_complete: false,
                        });
                    } else if last_progress_time.elapsed().as_millis() >= 150 {
                        last_progress_time = Instant::now();
                        on_progress(ArchiveScanProgress {
                            scan_id,
                            files_found: initial_count + files.len(),
                            total_bytes,
                            current_dir: current_dir_str.clone(),
                            is_paused: controller.is_paused(),
                            is_cancelled: controller.is_cancelled(),
                            is_complete: false,
                        });
                    }
                }
            }
        }
        if controller.is_cancelled() {
            break;
        }
    }

    if !current_chunk.is_empty() {
        on_chunk(current_chunk);
    }

    let is_cancelled = controller.is_cancelled();

    // Final complete event
    on_progress(ArchiveScanProgress {
        scan_id,
        files_found: initial_count + files.len(),
        total_bytes,
        current_dir: String::new(),
        is_paused: false,
        is_cancelled,
        is_complete: !is_cancelled,
    });

    files.par_sort_unstable_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

pub fn scan_archive_directory(dir: &Path) -> Result<Vec<ArchiveFile>> {
    let controller = ScanController::new();
    scan_archive_directory_streaming(dir, None, 0, 0, controller, |_| {}, |_| {})
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_scan_archive_directory_basic() {
        let test_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../testdata/dest");
        if test_dir.exists() {
            let files = scan_archive_directory(&test_dir).expect("Scan must succeed");
            assert!(!files.is_empty(), "Must find test files in testdata/dest");
            assert!(files.iter().any(|f| f.is_raw), "Must contain RAW files");
        }
    }

    #[test]
    fn test_scan_archive_directory_with_existing_paths() {
        let test_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../testdata/dest");
        if test_dir.exists() {
            let all_files = scan_archive_directory(&test_dir).expect("Scan must succeed");
            if all_files.len() > 1 {
                let first_path = all_files[0].path.replace('\\', "/");
                let mut existing = std::collections::HashSet::new();
                existing.insert(first_path.clone());

                let controller = ScanController::new();
                let mut progress_counts = Vec::new();
                let remaining_files = scan_archive_directory_streaming(
                    &test_dir,
                    Some(&existing),
                    all_files[0].size,
                    0,
                    controller,
                    |p| progress_counts.push(p.files_found),
                    |_| {},
                ).expect("Scan with existing paths must succeed");

                // Skipped the first file
                assert_eq!(remaining_files.len(), all_files.len() - 1);
                assert!(!remaining_files.iter().any(|f| f.path.replace('\\', "/") == first_path));
                // Total files reported should start with existing count and end at total
                assert_eq!(progress_counts[0], 1);
                assert_eq!(*progress_counts.last().unwrap(), all_files.len());
            }
        }
    }

    #[test]
    fn test_scan_controller_cancellation() {
        let test_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../testdata/dest");
        if test_dir.exists() {
            let controller = ScanController::new();
            controller.cancel();
            assert!(controller.is_cancelled());

            let mut chunks = Vec::new();
            let files = scan_archive_directory_streaming(
                &test_dir,
                None,
                0,
                0,
                controller,
                |_| {},
                |c| chunks.push(c),
            ).expect("Scan with pre-cancelled controller should exit cleanly");
            assert!(files.is_empty(), "Pre-cancelled scan should find 0 files");
            assert!(chunks.is_empty());
        }
    }
}
