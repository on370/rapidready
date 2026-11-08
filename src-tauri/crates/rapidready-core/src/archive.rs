use serde::{Deserialize, Serialize};
use std::path::Path;
use anyhow::Result;
use walkdir::WalkDir;
use chrono::{Datelike, NaiveDateTime};
use crate::culling::{get_sidecar_path, read_sidecar, CullingState};
use crate::culling_xmp::find_existing_xmp_path;
use regex::Regex;
use std::sync::LazyLock;

static RE_FOLDER_YMD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:^|[^\d])(19\d\d|20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:$|[^\d])").unwrap()
});

static RE_FOLDER_YM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:^|[^\d])(19\d\d|20\d\d)-(0[1-9]|1[0-2])(?:$|[^\d])").unwrap()
});

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
    #[serde(default)]
    pub mtime: i64,
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
    #[serde(default)]
    pub phase: Option<String>,
    #[serde(default)]
    pub total_files: Option<usize>,
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

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveScanResult {
    pub files: Vec<ArchiveFile>,
    pub directories: Vec<String>,
    #[serde(default = "default_true")]
    pub is_fully_indexed: bool,
}

pub(crate) fn extract_folder_date_from_path(path: &Path) -> Option<NaiveDateTime> {
    for ancestor in path.ancestors().skip(1) {
        if let Some(folder_name) = ancestor.file_name().and_then(|s| s.to_str()) {
            if let Some(caps) = RE_FOLDER_YMD.captures(folder_name) {
                if let (Ok(y), Ok(m), Ok(d)) = (
                    caps[1].parse::<i32>(),
                    caps[2].parse::<u32>(),
                    caps[3].parse::<u32>(),
                ) {
                    if let Some(nd) = chrono::NaiveDate::from_ymd_opt(y, m, d) {
                        if let Some(ndt) = nd.and_hms_opt(0, 0, 0) {
                            return Some(ndt);
                        }
                    }
                }
            } else if let Some(caps) = RE_FOLDER_YM.captures(folder_name) {
                if let (Ok(y), Ok(m)) = (
                    caps[1].parse::<i32>(),
                    caps[2].parse::<u32>(),
                ) {
                    if let Some(nd) = chrono::NaiveDate::from_ymd_opt(y, m, 1) {
                        if let Some(ndt) = nd.and_hms_opt(0, 0, 0) {
                            return Some(ndt);
                        }
                    }
                }
            }
        }
    }
    None
}

fn get_streaming_discovery_date(
    path: &Path,
    name: &str,
    meta: Option<&std::fs::Metadata>,
) -> Option<NaiveDateTime> {
    // 0. Priority: Sidecar Date Override (Highest priority if sidecar exists on disk)
    let has_sidecar = get_sidecar_path(path).is_file() || find_existing_xmp_path(path).is_some();
    if has_sidecar {
        let sidecar = read_sidecar(path);
        if let Some(ref override_str) = sidecar.date_override {
            if let Some(mut dt) = crate::date_resolver::parse_flexible_datetime(override_str) {
                if let Some(shift) = sidecar.time_shift_seconds {
                    dt += chrono::Duration::seconds(shift);
                }
                return Some(dt);
            }
        }
    }

    // 1. Priority: Parse date from filename
    if let Some(dt) = crate::date_resolver::parse_date_from_filename(name) {
        return Some(dt);
    }

    // Prepare mtime datetime if available
    let mtime_dt = meta.and_then(|m| {
        m.modified().or_else(|_| m.created()).ok().map(|sys_time| {
            let dt: chrono::DateTime<chrono::Local> = sys_time.into();
            dt.naive_local()
        })
    });

    // 2. Priority: Folder path date inspection backwards along parent folder names
    if let Some(folder_dt) = extract_folder_date_from_path(path) {
        if let Some(dt) = mtime_dt {
            if dt.year() == folder_dt.year() && dt.month() == folder_dt.month() {
                return Some(dt);
            }
        }
        return Some(folder_dt);
    }

    // 3. Priority: Filesystem timestamp
    if let Some(dt) = mtime_dt {
        return Some(dt);
    }

    None
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
    let mut known_rrdata: std::collections::HashMap<String, (i64, CullingState)> = std::collections::HashMap::new();
    let mut known_exact_xmp: std::collections::HashMap<String, (i64, CullingState)> = std::collections::HashMap::new();
    let mut known_stem_xmp: std::collections::HashMap<String, (i64, CullingState)> = std::collections::HashMap::new();
    let supported_exts = SUPPORTED_EXTENSIONS;

    let resolve_culling_in_memory = |path_norm: &str,
                                     known_rr: &std::collections::HashMap<String, (i64, CullingState)>,
                                     known_xmp_exact: &std::collections::HashMap<String, (i64, CullingState)>,
                                     known_xmp_stem: &std::collections::HashMap<String, (i64, CullingState)>|
     -> CullingState {
        let rr_entry = known_rr.get(path_norm);
        let xmp_entry = known_xmp_exact.get(path_norm).or_else(|| {
            let p = std::path::Path::new(path_norm);
            let parent = p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_default();
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let norm_stem = if parent.is_empty() {
                stem.to_string()
            } else {
                format!("{}/{}", parent, stem)
            };
            known_xmp_stem.get(&norm_stem)
        });

        match (rr_entry, xmp_entry) {
            (Some(&(rr_mtime, ref rr_st)), Some(&(xmp_mtime, ref xmp_st))) => {
                if xmp_mtime > rr_mtime {
                    let mut st = xmp_st.clone();
                    st.sidecar_source = Some("both_xmp".to_string());
                    st
                } else {
                    let mut st = rr_st.clone();
                    st.sidecar_source = Some("both_rrdata".to_string());
                    st
                }
            }
            (Some(&(_rr_mtime, ref rr_st)), None) => {
                let mut st = rr_st.clone();
                st.sidecar_source = Some("rrdata".to_string());
                st
            }
            (None, Some(&(_xmp_mtime, ref xmp_st))) => {
                let mut st = xmp_st.clone();
                st.sidecar_source = Some("xmp".to_string());
                st
            }
            (None, None) => CullingState::default(),
        }
    };

    let mut current_chunk = Vec::with_capacity(100);
    let mut current_dir_chunk = Vec::new();
    let mut total_bytes = initial_bytes;
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
        phase: Some("discovering".to_string()),
        total_files: None,
    });

    let walker = WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.file_type().is_dir() {
                if let Some(name) = e.file_name().to_str() {
                    if (name.starts_with('.') && name != ".")
                        || name.starts_with("@eaDir")
                        || name.starts_with(".@__thumb")
                        || name.eq_ignore_ascii_case("$RECYCLE.BIN")
                        || name.eq_ignore_ascii_case("System Volume Information")
                    {
                        return false;
                    }
                }
            }
            true
        });

    for res in walker {
        if controller.check_pause_or_cancel() {
            break;
        }

        let entry = match res {
            Ok(e) => e,
            Err(err) => {
                eprintln!("[RapidReady WalkDir Warning] {}", err);
                continue;
            }
        };

        let path = entry.path();
        if entry.file_type().is_dir() {
            if path != dir {
                let norm_dir = path.to_string_lossy().replace('\\', "/");
                all_directories.push(norm_dir.clone());
                current_dir_chunk.push(norm_dir);
            }
            current_dir_str = path.to_string_lossy().into_owned();
            let chunk_elapsed = last_chunk_time.elapsed().as_millis();
            let should_emit_dir = (!current_chunk.is_empty() && (current_chunk.len() >= 250 || (files.is_empty() && current_chunk.len() >= 30) || chunk_elapsed >= 400))
                || (current_dir_chunk.len() >= 100 || chunk_elapsed >= 500);
            if (!current_chunk.is_empty() || !current_dir_chunk.is_empty()) && should_emit_dir {
                if !current_chunk.is_empty() {
                    files.extend(current_chunk.iter().cloned());
                }
                on_chunk(std::mem::take(&mut current_chunk), std::mem::take(&mut current_dir_chunk));
                current_chunk = Vec::with_capacity(300);
                last_chunk_time = Instant::now();
                on_progress(ArchiveScanProgress {
                    scan_id,
                    files_found: initial_count + files.len(),
                    total_bytes,
                    current_dir: current_dir_str.clone(),
                    is_paused: controller.is_paused(),
                    is_cancelled: controller.is_cancelled(),
                    is_complete: false,
                    phase: Some("discovering".to_string()),
                    total_files: None,
                });
            }
            continue;
        }

        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if ext.eq_ignore_ascii_case("rrdata") {
                    let sc_mtime = entry
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);
                    if let Ok(contents) = std::fs::read_to_string(path) {
                        let mut state = crate::culling::parse_sidecar_json(&contents);
                        state.sidecar_source = Some("rrdata".to_string());
                        let mut orig_str = path.to_string_lossy().into_owned();
                        if orig_str.ends_with(".rrdata") {
                            orig_str.truncate(orig_str.len() - 7);
                        }
                        let norm_orig = orig_str.replace('\\', "/");
                        known_rrdata.insert(norm_orig.clone(), (sc_mtime, state));
                        if let Some(f) = current_chunk.iter_mut().find(|f| f.path.replace('\\', "/") == norm_orig) {
                            f.culling = resolve_culling_in_memory(&norm_orig, &known_rrdata, &known_exact_xmp, &known_stem_xmp);
                        }
                    }
                    continue;
                }

                if ext.eq_ignore_ascii_case("xmp") {
                    let sc_mtime = entry
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);
                    if let Ok(contents) = std::fs::read_to_string(path) {
                        let mut state = crate::culling::parse_sidecar_xmp(&contents);
                        state.sidecar_source = Some("xmp".to_string());
                        let p_str = path.to_string_lossy();
                        let without_xmp = &p_str[..p_str.len() - 4];
                        let candidate = Path::new(without_xmp);
                        if candidate.extension().is_some() {
                            // Exact companion style: DSC001.ARW.xmp -> DSC001.ARW
                            let norm_exact = without_xmp.replace('\\', "/");
                            known_exact_xmp.insert(norm_exact.clone(), (sc_mtime, state));
                            if let Some(f) = current_chunk.iter_mut().find(|f| f.path.replace('\\', "/") == norm_exact) {
                                f.culling = resolve_culling_in_memory(&norm_exact, &known_rrdata, &known_exact_xmp, &known_stem_xmp);
                            }
                        } else {
                            // Stem style: DSC001.xmp -> parent/DSC001
                            let parent = path.parent().map(|d| d.to_string_lossy().replace('\\', "/")).unwrap_or_default();
                            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                            let norm_stem = if parent.is_empty() {
                                stem.to_string()
                            } else {
                                format!("{}/{}", parent, stem)
                            };
                            known_stem_xmp.insert(norm_stem.clone(), (sc_mtime, state));
                            for f in current_chunk.iter_mut() {
                                let fp = Path::new(&f.path);
                                let fp_parent = fp.parent().map(|d| d.to_string_lossy().replace('\\', "/")).unwrap_or_default();
                                let fp_stem = fp.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                                let fp_norm_stem = if fp_parent.is_empty() {
                                    fp_stem.to_string()
                                } else {
                                    format!("{}/{}", fp_parent, fp_stem)
                                };
                                if fp_norm_stem == norm_stem {
                                    f.culling = resolve_culling_in_memory(&f.path.replace('\\', "/"), &known_rrdata, &known_exact_xmp, &known_stem_xmp);
                                }
                            }
                        }
                    }
                    continue;
                }

                if supported_exts.contains(&ext.to_lowercase().as_str()) {
                    let path_norm = path.to_string_lossy().replace('\\', "/");
                    if let Some(set) = existing_paths {
                        if set.contains(&path_norm) {
                            continue;
                        }
                    }

                    let metadata = entry.metadata().ok();
                    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                    let mtime = metadata.as_ref()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);
                    total_bytes += size;
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let date = get_streaming_discovery_date(path, &name, metadata.as_ref());
                    let is_raw = crate::metadata_resolver::is_raw_path(path);
                    let is_video = crate::metadata_resolver::is_video_path(path);
                    let culling = resolve_culling_in_memory(&path_norm, &known_rrdata, &known_exact_xmp, &known_stem_xmp);

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
                        mtime,
                    };

                    current_chunk.push(item);

                    let chunk_elapsed = last_chunk_time.elapsed().as_millis();
                    let should_emit_chunk = current_chunk.len() >= 250
                        || (files.is_empty() && (current_chunk.len() >= 30 || chunk_elapsed >= 200))
                        || ((!current_chunk.is_empty() || !current_dir_chunk.is_empty()) && chunk_elapsed >= 400);

                    if should_emit_chunk {
                        if !current_chunk.is_empty() {
                            files.extend(current_chunk.iter().cloned());
                        }
                        on_chunk(std::mem::take(&mut current_chunk), std::mem::take(&mut current_dir_chunk));
                        current_chunk = Vec::with_capacity(300);
                        last_chunk_time = Instant::now();
                        on_progress(ArchiveScanProgress {
                            scan_id,
                            files_found: initial_count + files.len(),
                            total_bytes,
                            current_dir: current_dir_str.clone(),
                            is_paused: controller.is_paused(),
                            is_cancelled: controller.is_cancelled(),
                            is_complete: false,
                            phase: Some("discovering".to_string()),
                            total_files: None,
                        });
                    }
                }
            }
        }
        if controller.check_pause_or_cancel() {
            break;
        }
    }

    if !current_chunk.is_empty() || !current_dir_chunk.is_empty() {
        if !current_chunk.is_empty() {
            files.extend(current_chunk.iter().cloned());
        }
        on_chunk(current_chunk, current_dir_chunk);
    }

    let is_cancelled = controller.is_cancelled();

    // Final complete event for discovery phase
    on_progress(ArchiveScanProgress {
        scan_id,
        files_found: initial_count + files.len(),
        total_bytes,
        current_dir: String::new(),
        is_paused: false,
        is_cancelled,
        is_complete: false, // Discovery phase complete; thumbnailing follows in Phase 2
        phase: Some("discovering".to_string()),
        total_files: Some(initial_count + files.len()),
    });

    if !is_cancelled {
        // Resolve culling for any files that were discovered before their sidecar files were encountered
        for f in files.iter_mut() {
            if f.culling.sidecar_source.is_none() {
                let resolved = resolve_culling_in_memory(&f.path.replace('\\', "/"), &known_rrdata, &known_exact_xmp, &known_stem_xmp);
                if resolved.sidecar_source.is_some() {
                    f.culling = resolved;
                }
            }
        }
        files.par_sort_unstable_by(|a, b| a.path.cmp(&b.path));
        all_directories.sort_unstable();
        all_directories.dedup();
    }
    Ok(ArchiveScanResult {
        files,
        directories: all_directories,
        is_fully_indexed: false, // Initial discovery complete; thumbnails must be built in Phase 2
    })
}

pub fn scan_archive_directory(dir: &Path) -> Result<ArchiveScanResult> {
    let controller = ScanController::new();
    scan_archive_directory_streaming(dir, None, 0, 0, controller, |_| {}, |_, _| {})
}

pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    // Raster Images
    "jpg", "jpeg", "png", "tif", "tiff", "heic", "heif", "hif", "webp", "avif", "bmp", "gif",
    // RAW Camera Formats
    "cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", "pef", "3fr", "x3f",
    "nrw", "rwl", "fff", "iiq", "crw", "erf", "sr2", "srf", "mrw", "dcr", "kdc",
    "mef", "mos", "srw", "gpr", "raw", "bay", "cap", "eip", "dcs", "drf", "k25",
    // Video Containers
    "mp4", "mov", "m4v", "avi", "mkv", "mts", "m2ts", "wmv", "webm", "flv",
    "3gp", "3g2", "mpg", "mpeg", "m2v", "mod", "tod", "vob",
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
    let mtime = metadata.as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

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
        mtime,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconcileDiff {
    pub folder_path: String,
    pub added: Vec<ArchiveFile>,
    pub removed: Vec<String>,
    pub new_dirs: Vec<String>,
    #[serde(default)]
    pub removed_dirs: Vec<String>,
}

pub fn normalize_path_for_comparison(p: &str) -> String {
    let s = p.replace('\\', "/");
    let trimmed = s.trim_end_matches('/');
    #[cfg(target_os = "linux")]
    {
        trimmed.to_string()
    }
    #[cfg(not(target_os = "linux"))]
    {
        trimmed.to_lowercase()
    }
}

/// Reconciles the files and immediate subdirectories in `folder` against the frontend's `known_paths`.
///
/// # Architecture & Performance Rationale
/// This function performs a **single-level** directory read (`std::fs::read_dir`) rather than
/// an arbitrary recursive walk (`WalkDir`).
///
/// 1. **Ultra-Low Latency (< 0.2 ms):**
///    When invoked during `handleWindowFocus` (e.g. user switches back from RapidRAW to RapidReady),
///    the check completes almost instantaneously without blocking the UI thread, even across slow
///    network storage (NAS/SMB).
/// 2. **Complements the Recursive Watcher:**
///    The real-time background file watcher (`notify` in `commands.rs`) handles recursive events at
///    any folder depth asynchronously. This function serves as a zero-cost safety net focused on the
///    currently active folder viewport.
pub fn reconcile_directory_files(
    folder: &Path,
    known_paths: &[String],
    known_dirs: &[String],
) -> Result<ReconcileDiff> {
    let folder_norm = folder.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_string();
    if !folder.exists() || !folder.is_dir() {
        return Ok(ReconcileDiff {
            folder_path: folder_norm.clone(),
            added: Vec::new(),
            removed: known_paths.to_vec(),
            new_dirs: Vec::new(),
            removed_dirs: vec![folder_norm],
        });
    }

    let folder_comp = normalize_path_for_comparison(&folder_norm);
    let folder_prefix = format!("{}/", folder_comp);

    let known_set: std::collections::HashSet<String> = known_paths
        .iter()
        .map(|p| normalize_path_for_comparison(p))
        .collect();

    let mut added = Vec::new();
    let mut new_dirs = Vec::new();
    let mut current_on_disk = std::collections::HashSet::new();
    let mut current_dirs_on_disk = std::collections::HashSet::new();

    if let Ok(entries) = std::fs::read_dir(folder) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let dir_norm = p.to_string_lossy().replace('\\', "/");
                current_dirs_on_disk.insert(normalize_path_for_comparison(&dir_norm));
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

    let mut removed_dirs = Vec::new();
    for d in known_dirs {
        let d_norm = d.replace('\\', "/");
        let d_comp = normalize_path_for_comparison(&d_norm);
        if d_comp.starts_with(&folder_prefix) {
            if !current_dirs_on_disk.contains(&d_comp) && !Path::new(d).exists() {
                removed_dirs.push(d.clone());
            }
        }
    }

    let mut removed = Vec::new();
    for p in known_paths {
        let p_norm = p.replace('\\', "/");
        let p_comp = normalize_path_for_comparison(&p_norm);

        let is_in_folder = if let Some(parent) = p_norm.rfind('/') {
            let parent_dir = &p_norm[..parent];
            normalize_path_for_comparison(parent_dir) == folder_comp
        } else {
            false
        };

        let is_under_removed_dir = removed_dirs.iter().any(|rd| {
            let rd_prefix = format!("{}/", normalize_path_for_comparison(rd));
            p_comp.starts_with(&rd_prefix)
        });

        if is_in_folder {
            let comp_key = &p_comp;
            if !current_on_disk.contains(comp_key) && !Path::new(p).exists() {
                removed.push(p.clone());
            }
        } else if is_under_removed_dir || (p_comp.starts_with(&folder_prefix) && !Path::new(p).exists()) {
            removed.push(p.clone());
        }
    }

    added.sort_unstable_by(|a, b| a.path.cmp(&b.path));
    removed.sort_unstable();
    new_dirs.sort_unstable();
    removed_dirs.sort_unstable();

    Ok(ReconcileDiff {
        folder_path: folder_norm,
        added,
        removed,
        new_dirs,
        removed_dirs,
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
        let diff1 = reconcile_directory_files(&temp_dir, &[], &[]).expect("reconcile should succeed");
        assert_eq!(diff1.added.len(), 1);
        assert_eq!(diff1.added[0].name, "photo1.jpg");
        assert!(diff1.removed.is_empty());

        // Reconcile with photo1 known: nothing added, nothing removed
        let known = vec![file1.to_string_lossy().replace('\\', "/")];
        let diff2 = reconcile_directory_files(&temp_dir, &known, &[]).expect("reconcile should succeed");
        assert!(diff2.added.is_empty());
        assert!(diff2.removed.is_empty());

        // Add photo2: should be detected as added
        let file2 = temp_dir.join("photo2.jpg");
        std::fs::write(&file2, b"jpg2_new").unwrap();

        let diff3 = reconcile_directory_files(&temp_dir, &known, &[]).expect("reconcile should succeed");
        assert_eq!(diff3.added.len(), 1);
        assert_eq!(diff3.added[0].name, "photo2.jpg");
        assert!(diff3.removed.is_empty());

        // Delete photo1: should be detected as removed when known
        let _ = std::fs::remove_file(&file1);
        let known2 = vec![
            file1.to_string_lossy().replace('\\', "/"),
            file2.to_string_lossy().replace('\\', "/"),
        ];
        let diff4 = reconcile_directory_files(&temp_dir, &known2, &[]).expect("reconcile should succeed");
        assert!(diff4.added.is_empty());
        assert_eq!(diff4.removed.len(), 1);
        assert_eq!(diff4.removed[0].replace('\\', "/"), file1.to_string_lossy().replace('\\', "/"));

        // Subdirectory and directory removal test
        let sub_dir = temp_dir.join("subfolder");
        std::fs::create_dir_all(&sub_dir).unwrap();
        let sub_file = sub_dir.join("subphoto.jpg");
        std::fs::write(&sub_file, b"subphoto").unwrap();
        let sub_dir_str = sub_dir.to_string_lossy().replace('\\', "/");
        let sub_file_str = sub_file.to_string_lossy().replace('\\', "/");

        let known_dirs = vec![sub_dir_str.clone()];
        let known_files = vec![
            file2.to_string_lossy().replace('\\', "/"),
            sub_file_str.clone(),
        ];

        // Delete subfolder with its file
        let _ = std::fs::remove_dir_all(&sub_dir);
        let diff5 = reconcile_directory_files(&temp_dir, &known_files, &known_dirs).expect("reconcile should succeed");
        assert_eq!(diff5.removed_dirs.len(), 1);
        assert_eq!(diff5.removed_dirs[0], sub_dir_str);
        assert!(diff5.removed.contains(&sub_file_str));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
