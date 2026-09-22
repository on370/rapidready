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
    #[serde(default)]
    pub is_video: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveScanResult {
    pub files: Vec<ArchiveFile>,
    pub directories: Vec<String>,
}

pub fn scan_archive_directory_streaming<P, C>(
    dir: &Path,
    existing_paths: Option<&std::collections::HashSet<String>>,
    initial_bytes: u64,
    scan_id: u64,
    controller: ScanController,
    mut on_progress: P,
    mut on_chunk: C,
) -> Result<ArchiveScanResult>
where
    P: FnMut(ArchiveScanProgress),
    C: FnMut(Vec<ArchiveFile>, Vec<String>),
{
    let initial_count = existing_paths.map(|s| s.len()).unwrap_or(0);
    let mut files = Vec::new();
    let mut all_directories = Vec::new();
    let supported_exts = SUPPORTED_EXTENSIONS;

    let mut current_chunk = Vec::with_capacity(100);
    let mut current_dir_chunk = Vec::new();
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

    let walker = WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.file_type().is_dir() {
                if let Some(name) = e.file_name().to_str() {
                    if name.starts_with('.') && name != "." {
                        return false;
                    }
                    if name.eq_ignore_ascii_case("$RECYCLE.BIN") || name.eq_ignore_ascii_case("System Volume Information") {
                        return false;
                    }
                }
            }
            true
        });

    for entry in walker.filter_map(|e| e.ok()) {
        if controller.check_pause_or_cancel() {
            break;
        }

        let path = entry.path();
        if entry.file_type().is_dir() {
            if path != dir {
                let norm_dir = path.to_string_lossy().replace('\\', "/");
                all_directories.push(norm_dir.clone());
                current_dir_chunk.push(norm_dir);
            }
            current_dir_str = path.to_string_lossy().into_owned();
            let chunk_elapsed = last_chunk_time.elapsed().as_millis();
            if (!current_chunk.is_empty() || !current_dir_chunk.is_empty()) && (current_chunk.len() >= 20 || current_dir_chunk.len() >= 20 || chunk_elapsed >= 500) {
                on_chunk(std::mem::take(&mut current_chunk), std::mem::take(&mut current_dir_chunk));
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
                    let is_video = crate::metadata_resolver::is_video_path(path);
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
                        is_video,
                    };

                    current_chunk.push(item.clone());
                    files.push(item);

                    let chunk_elapsed = last_chunk_time.elapsed().as_millis();
                    let should_emit_chunk = current_chunk.len() >= 100
                        || (current_chunk.len() >= 20 && chunk_elapsed >= 400)
                        || ((!current_chunk.is_empty() || !current_dir_chunk.is_empty()) && chunk_elapsed >= 800);

                    if should_emit_chunk {
                        on_chunk(std::mem::take(&mut current_chunk), std::mem::take(&mut current_dir_chunk));
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

    if !current_chunk.is_empty() || !current_dir_chunk.is_empty() {
        on_chunk(current_chunk, current_dir_chunk);
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
    all_directories.sort_unstable();
    all_directories.dedup();
    Ok(ArchiveScanResult {
        files,
        directories: all_directories,
    })
}

pub fn scan_archive_directory(dir: &Path) -> Result<ArchiveScanResult> {
    let controller = ScanController::new();
    scan_archive_directory_streaming(dir, None, 0, 0, controller, |_| {}, |_, _| {})
}

pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "tif", "tiff", "heic", "heif", "hif", "webp", "avif", // Raster
    "cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", "pef", "3fr", "x3f", "nrw", "rwl", "fff", "iiq", "crw", "erf", // RAW
    "mp4", "mov", "m4v", "avi", // Video
];

pub fn is_supported_archive_file(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|ext| SUPPORTED_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn create_archive_file(path: &Path) -> Option<ArchiveFile> {
    if !path.is_file() || !is_supported_archive_file(path) {
        return None;
    }

    let metadata = std::fs::metadata(path).ok();
    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
    let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let date = get_fast_creation_date(path, metadata.as_ref());
    let is_raw = crate::metadata_resolver::is_raw_path(path);
    let is_video = crate::metadata_resolver::is_video_path(path);
    let culling = read_sidecar(path);

    Some(ArchiveFile {
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
        is_video,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconcileDiff {
    pub folder_path: String,
    pub added: Vec<ArchiveFile>,
    pub removed: Vec<String>,
    pub new_dirs: Vec<String>,
}

pub fn normalize_path_for_comparison(p: &str) -> String {
    let s = p.replace('\\', "/");
    let trimmed = s.trim_end_matches('/');
    if cfg!(target_os = "linux") {
        trimmed.to_string()
    } else {
        trimmed.to_lowercase()
    }
}

pub fn reconcile_directory_files(folder: &Path, known_paths: &[String]) -> Result<ReconcileDiff> {
    let folder_norm = folder.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_string();
    if !folder.exists() || !folder.is_dir() {
        return Ok(ReconcileDiff {
            folder_path: folder_norm,
            added: Vec::new(),
            removed: Vec::new(),
            new_dirs: Vec::new(),
        });
    }

    let folder_comp = normalize_path_for_comparison(&folder_norm);

    let known_set: std::collections::HashSet<String> = known_paths
        .iter()
        .map(|p| normalize_path_for_comparison(p))
        .collect();

    let mut added = Vec::new();
    let mut new_dirs = Vec::new();
    let mut current_on_disk = std::collections::HashSet::new();

    if let Ok(entries) = std::fs::read_dir(folder) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let dir_norm = p.to_string_lossy().replace('\\', "/");
                new_dirs.push(dir_norm);
            } else if p.is_file() && is_supported_archive_file(&p) {
                let norm = p.to_string_lossy().replace('\\', "/");
                let comp_key = normalize_path_for_comparison(&norm);
                current_on_disk.insert(comp_key.clone());
                if !known_set.contains(&comp_key) {
                    if let Some(archive_file) = create_archive_file(&p) {
                        added.push(archive_file);
                    }
                }
            }
        }
    }

    let mut removed = Vec::new();
    for p in known_paths {
        let p_norm = p.replace('\\', "/");
        let is_in_folder = if let Some(parent) = p_norm.rfind('/') {
            let parent_dir = &p_norm[..parent];
            normalize_path_for_comparison(parent_dir) == folder_comp
        } else {
            false
        };

        if is_in_folder {
            let comp_key = normalize_path_for_comparison(&p_norm);
            if !current_on_disk.contains(&comp_key) && !Path::new(p).exists() {
                removed.push(p.clone());
            }
        }
    }

    added.sort_unstable_by(|a, b| a.path.cmp(&b.path));
    removed.sort_unstable();
    new_dirs.sort_unstable();

    Ok(ReconcileDiff {
        folder_path: folder_norm,
        added,
        removed,
        new_dirs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_scan_archive_directory_basic() {
        let test_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../testdata/dest");
        if test_dir.exists() {
            let res = scan_archive_directory(&test_dir).expect("Scan must succeed");
            let files = res.files;
            assert!(!files.is_empty(), "Must find test files in testdata/dest");
            assert!(files.iter().any(|f| f.is_raw), "Must contain RAW files");
            assert!(!res.directories.is_empty(), "Must find directories in testdata/dest");
        }
    }

    #[test]
    fn test_scan_archive_directory_with_existing_paths() {
        let test_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../testdata/dest");
        if test_dir.exists() {
            let res = scan_archive_directory(&test_dir).expect("Scan must succeed");
            let all_files = res.files;
            if all_files.len() > 1 {
                let first_path = all_files[0].path.replace('\\', "/");
                let mut existing = std::collections::HashSet::new();
                existing.insert(first_path.clone());

                let controller = ScanController::new();
                let mut progress_counts = Vec::new();
                let res2 = scan_archive_directory_streaming(
                    &test_dir,
                    Some(&existing),
                    all_files[0].size,
                    0,
                    controller,
                    |p| progress_counts.push(p.files_found),
                    |_, _| {},
                ).expect("Scan with existing paths must succeed");

                let remaining_files = res2.files;
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
            let res = scan_archive_directory_streaming(
                &test_dir,
                None,
                0,
                0,
                controller,
                |_| {},
                |c, _| chunks.push(c),
            ).expect("Scan with pre-cancelled controller should exit cleanly");
            assert!(res.files.is_empty(), "Pre-cancelled scan should find 0 files");
            assert!(chunks.is_empty());
        }
    }

    #[test]
    fn test_scan_archive_discovers_empty_directories() {
        let temp_dir = std::env::temp_dir().join(format!("rapidready_test_empty_dirs_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(temp_dir.join("sub1/empty_child")).unwrap();
        std::fs::create_dir_all(temp_dir.join("sub2")).unwrap();
        std::fs::write(temp_dir.join("sub2/test.jpg"), b"fake jpg").unwrap();

        let res = scan_archive_directory(&temp_dir).expect("Scan must succeed");
        assert_eq!(res.files.len(), 1);
        let dirs = res.directories;
        assert!(dirs.iter().any(|d| d.ends_with("sub1")), "Must find sub1");
        assert!(dirs.iter().any(|d| d.ends_with("sub1/empty_child")), "Must find empty_child");
        assert!(dirs.iter().any(|d| d.ends_with("sub2")), "Must find sub2");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_scan_archive_discovers_video_files() {
        let temp_dir = std::env::temp_dir().join(format!("rapidready_test_videos_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();
        std::fs::write(temp_dir.join("clip1.mp4"), b"fake mp4").unwrap();
        std::fs::write(temp_dir.join("clip2.mov"), b"fake mov").unwrap();
        std::fs::write(temp_dir.join("photo.jpg"), b"fake jpg").unwrap();

        let res = scan_archive_directory(&temp_dir).expect("Scan must succeed");
        assert_eq!(res.files.len(), 3);
        
        let mp4 = res.files.iter().find(|f| f.name == "clip1.mp4").expect("Must find clip1.mp4");
        assert!(mp4.is_video);
        assert!(!mp4.is_raw);

        let mov = res.files.iter().find(|f| f.name == "clip2.mov").expect("Must find clip2.mov");
        assert!(mov.is_video);
        assert!(!mov.is_raw);

        let jpg = res.files.iter().find(|f| f.name == "photo.jpg").expect("Must find photo.jpg");
        assert!(!jpg.is_video);
        assert!(!jpg.is_raw);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_create_archive_file_and_reconcile() {
        let temp_dir = std::env::temp_dir().join(format!("rapidready_test_reconcile_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let file1 = temp_dir.join("photo1.jpg");
        std::fs::write(&file1, b"jpg1").unwrap();

        let af1 = create_archive_file(&file1).expect("create_archive_file should succeed on valid jpg");
        assert_eq!(af1.name, "photo1.jpg");
        assert_eq!(af1.size, 4);

        // Initial reconcile with no known paths: photo1 should be added
        let diff1 = reconcile_directory_files(&temp_dir, &[]).expect("reconcile should succeed");
        assert_eq!(diff1.added.len(), 1);
        assert_eq!(diff1.added[0].name, "photo1.jpg");
        assert!(diff1.removed.is_empty());

        // Reconcile with photo1 known: nothing added, nothing removed
        let known = vec![file1.to_string_lossy().replace('\\', "/")];
        let diff2 = reconcile_directory_files(&temp_dir, &known).expect("reconcile should succeed");
        assert!(diff2.added.is_empty());
        assert!(diff2.removed.is_empty());

        // Add photo2: should be detected as added
        let file2 = temp_dir.join("photo2.jpg");
        std::fs::write(&file2, b"jpg2_new").unwrap();

        let diff3 = reconcile_directory_files(&temp_dir, &known).expect("reconcile should succeed");
        assert_eq!(diff3.added.len(), 1);
        assert_eq!(diff3.added[0].name, "photo2.jpg");
        assert!(diff3.removed.is_empty());

        // Delete photo1: should be detected as removed when known
        let _ = std::fs::remove_file(&file1);
        let known2 = vec![
            file1.to_string_lossy().replace('\\', "/"),
            file2.to_string_lossy().replace('\\', "/"),
        ];
        let diff4 = reconcile_directory_files(&temp_dir, &known2).expect("reconcile should succeed");
        assert!(diff4.added.is_empty());
        assert_eq!(diff4.removed.len(), 1);
        assert_eq!(diff4.removed[0].replace('\\', "/"), file1.to_string_lossy().replace('\\', "/"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
