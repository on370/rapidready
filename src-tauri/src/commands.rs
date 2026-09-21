use rapidready_core::scanner::{scan_directory, ScannedFile};
use rapidready_core::importer::{execute_import as core_execute_import, ImportProgress};
use rapidready_core::import_index::ImportIndex;
use rapidready_core::collections::{
    AlbumItem, load_collections as core_load_collections,
    save_collections as core_save_collections, add_to_collection as core_add_to_collection,
    remove_from_collection as core_remove_from_collection,
    reorder_collection_images as core_reorder_collection_images,
    create_collection_item as core_create_collection_item,
    rename_collection_item as core_rename_collection_item,
    delete_collection_item as core_delete_collection_item,
    sort_collection_by_exif as core_sort_collection_by_exif,
    prune_paths_from_all_collections as core_prune_paths_from_all_collections,
    prune_folder_from_all_collections as core_prune_folder_from_all_collections,
};
use rapidready_core::collection_export::{
    CollectionExportOptions, run_collection_export,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use notify::{Watcher, RecommendedWatcher};

fn get_import_index(app: &AppHandle) -> Result<ImportIndex, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    ImportIndex::new(&app_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn scan_source_directory(app: AppHandle, path: String) -> Result<Vec<ScannedFile>, String> {
    let dir_path = PathBuf::from(path);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err("Invalid directory path".into());
    }

    let import_index = get_import_index(&app)?;
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        scan_directory(&dir_path, &import_index, move |progress| {
            let _ = app_clone.emit("scan_progress", progress);
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn execute_import(
    app: AppHandle,
    files: Vec<ScannedFile>,
    destination_base: String,
    template: String,
) -> Result<Vec<String>, String> {
    let import_index = get_import_index(&app)?;
    
    core_execute_import(
        files,
        &destination_base,
        &template,
        &import_index,
        move |progress: ImportProgress| {
            let _ = app.emit("import_progress", progress);
        },
    )
    .await
    .map_err(|e| e.to_string())
}

fn find_first_image_in_path(path_str: &str) -> String {
    let p = std::path::Path::new(path_str);
    if p.is_file() {
        return path_str.to_string();
    }
    if p.is_dir() {
        let valid_extensions = [
            "cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", "pef", "3fr", "x3f", "nrw",
            "jpg", "jpeg", "png", "tif", "tiff", "heic", "heif", "hif", "webp", "avif"
        ];
        if let Ok(entries) = std::fs::read_dir(p) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_file() {
                    if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                        if valid_extensions.contains(&ext.to_lowercase().as_str()) {
                            return entry_path.to_string_lossy().into_owned();
                        }
                    }
                } else if entry_path.is_dir() {
                    if let Ok(sub_entries) = std::fs::read_dir(&entry_path) {
                        for sub in sub_entries.flatten() {
                            let sub_path = sub.path();
                            if sub_path.is_file() {
                                if let Some(ext) = sub_path.extension().and_then(|e| e.to_str()) {
                                    if valid_extensions.contains(&ext.to_lowercase().as_str()) {
                                        return sub_path.to_string_lossy().into_owned();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    path_str.to_string()
}

#[cfg(target_os = "macos")]
fn find_rapidraw_binary() -> Option<std::path::PathBuf> {
    let p1 = std::path::PathBuf::from("/Applications/RapidRAW.app/Contents/MacOS/RapidRAW");
    if p1.exists() {
        return Some(p1);
    }
    if let Ok(home) = std::env::var("HOME") {
        let p2 = std::path::PathBuf::from(home).join("Applications/RapidRAW.app/Contents/MacOS/RapidRAW");
        if p2.exists() {
            return Some(p2);
        }
    }
    if let Ok(out) = std::process::Command::new("mdfind")
        .arg("kMDItemCFBundleIdentifier == 'io.github.CyberTimon.RapidRAW'")
        .output()
    {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                let bin = std::path::PathBuf::from(trimmed).join("Contents/MacOS/RapidRAW");
                if bin.exists() {
                    return Some(bin);
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn open_in_rapidraw(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let file_to_open = find_first_image_in_path(&path);

        // If binary is found, launch it directly so tauri-plugin-single-instance in RapidRAW
        // can receive the CLI argument and forward it via IPC socket to the running instance!
        if let Some(bin_path) = find_rapidraw_binary() {
            let _ = std::process::Command::new(&bin_path)
                .arg(&file_to_open)
                .spawn();

            // Bring RapidRAW to the foreground
            let _ = std::process::Command::new("osascript")
                .args(["-e", "tell application id \"io.github.CyberTimon.RapidRAW\" to activate"])
                .spawn();

            return Ok(());
        }

        // Fallback: try bundle id
        let status = std::process::Command::new("open")
            .args(["-b", "io.github.CyberTimon.RapidRAW", &file_to_open])
            .status();

        if let Ok(s) = status {
            if s.success() {
                return Ok(());
            }
        }

        // Fallback: system default open
        std::process::Command::new("open")
            .arg(&file_to_open)
            .spawn()
            .map_err(|e| format!("Failed to open: {}", e))?;

        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        let file_to_open = find_first_image_in_path(&path);
        
        let candidate_paths = [
            // User-Installation (Standard bei Tauri / Squirrel / NSIS)
            std::env::var("LOCALAPPDATA").map(|p| format!("{}\\Programs\\RapidRaw\\RapidRaw.exe", p)).ok(),
            std::env::var("LOCALAPPDATA").map(|p| format!("{}\\RapidRaw\\RapidRaw.exe", p)).ok(),
            // Systemweite Installation
            std::env::var("ProgramFiles").map(|p| format!("{}\\RapidRaw\\RapidRaw.exe", p)).ok(),
            std::env::var("ProgramFiles(x86)").map(|p| format!("{}\\RapidRaw\\RapidRaw.exe", p)).ok(),
        ];

        for candidate in candidate_paths.into_iter().flatten() {
            if std::path::Path::new(&candidate).exists() {
                let _ = std::process::Command::new(&candidate)
                    .arg(&file_to_open)
                    .spawn();
                return Ok(());
            }
        }

        // Fallback: systemweites Öffnen
        open::that(&file_to_open).map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        open::that(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_removable_drives() -> Vec<rapidready_core::drives::DriveInfo> {
    rapidready_core::drives::get_removable_drives()
}

pub struct SidecarWatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub watched_dir: Mutex<Option<PathBuf>>,
}

impl Default for SidecarWatcherState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched_dir: Mutex::new(None),
        }
    }
}

#[derive(Clone)]
pub struct ActiveScan {
    pub id: u64,
    pub controller: rapidready_core::archive::ScanController,
}

#[derive(Default)]
pub struct ArchiveScanState {
    pub current_scan: Arc<Mutex<Option<ActiveScan>>>,
    pub next_id: Arc<AtomicU64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveChunkPayload {
    pub scan_id: u64,
    pub files: Vec<rapidready_core::archive::ArchiveFile>,
    #[serde(default)]
    pub directories: Vec<String>,
}

pub fn start_watching_dir_internal(
    app: &AppHandle,
    dir: &std::path::Path,
    state: &SidecarWatcherState,
) -> Result<(), String> {
    if !dir.exists() || !dir.is_dir() {
        return Ok(());
    }

    let should_watch = {
        let current = state.watched_dir.lock().unwrap();
        match &*current {
            Some(w) => *w != dir && !dir.starts_with(w),
            None => true,
        }
    };

    if should_watch {
        let app_handle = app.clone();
        let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            match res {
                Ok(event) => {
                    for p in event.paths {
                        let path_str = p.to_string_lossy();
                        if path_str.ends_with(".rrdata") {
                            let img_path_str = path_str.strip_suffix(".rrdata").unwrap_or(&path_str).to_string();
                            let img_path = PathBuf::from(&img_path_str);
                            let culling = rapidready_core::culling::read_sidecar(&img_path);
                            let _ = app_handle.emit("sidecar-updated", serde_json::json!({
                                "path": img_path_str,
                                "culling": culling
                            }));
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Sidecar watcher error: {}", e);
                    let _ = app_handle.emit("sidecar-watcher-error", e.to_string());
                }
            }
        }).map_err(|e| e.to_string())?;

        watcher.watch(dir, notify::RecursiveMode::Recursive).map_err(|e| e.to_string())?;
        *state.watcher.lock().unwrap() = Some(watcher);
        *state.watched_dir.lock().unwrap() = Some(dir.to_path_buf());
    }
    Ok(())
}

#[tauri::command]
pub fn start_watching_directory(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, SidecarWatcherState>,
) -> Result<(), String> {
    let dir = PathBuf::from(&path);
    start_watching_dir_internal(&app, &dir, &state)
}

#[tauri::command]
pub fn stop_watching_directory(
    state: tauri::State<'_, SidecarWatcherState>,
) -> Result<(), String> {
    let mut watcher = state.watcher.lock().unwrap();
    *watcher = None;
    let mut watched_dir = state.watched_dir.lock().unwrap();
    *watched_dir = None;
    Ok(())
}

#[tauri::command]
pub fn get_culling_state(path: String) -> rapidready_core::culling::CullingState {
    let p = PathBuf::from(path);
    rapidready_core::culling::read_sidecar(&p)
}

#[tauri::command]
pub async fn scan_archive_directory(
    app: AppHandle,
    path: String,
    scan_id: Option<u64>,
    existing_paths: Option<Vec<String>>,
    initial_bytes: Option<u64>,
    state: tauri::State<'_, SidecarWatcherState>,
    scan_state: tauri::State<'_, ArchiveScanState>,
) -> Result<rapidready_core::archive::ArchiveScanResult, String> {
    let dir = PathBuf::from(&path);
    let _ = start_watching_dir_internal(&app, &dir, &state);

    let scan_id = scan_id.unwrap_or_else(|| scan_state.next_id.fetch_add(1, Ordering::SeqCst) + 1);
    let controller = rapidready_core::archive::ScanController::new();

    // Cancel previous scan if any and register this one
    {
        let mut lock = scan_state.current_scan.lock().unwrap();
        if let Some(ref prev) = *lock {
            prev.controller.cancel();
        }
        *lock = Some(ActiveScan {
            id: scan_id,
            controller: controller.clone(),
        });
    }

    let app_for_prog = app.clone();
    let app_for_chunk = app.clone();
    let controller_clone = controller.clone();
    let scan_state_clone = scan_state.current_scan.clone();

    let existing_set: Option<std::collections::HashSet<String>> = existing_paths.map(|paths| {
        paths
            .into_iter()
            .map(|p| p.replace('\\', "/"))
            .collect()
    });
    let init_bytes = initial_bytes.unwrap_or(0);

    let res = tauri::async_runtime::spawn_blocking(move || {
        rapidready_core::archive::scan_archive_directory_streaming(
            &dir,
            existing_set.as_ref(),
            init_bytes,
            scan_id,
            controller_clone,
            move |progress| {
                let _ = app_for_prog.emit("archive_scan_progress", progress);
            },
            move |chunk, dirs| {
                let _ = app_for_chunk.emit("archive_scan_chunk", ArchiveChunkPayload {
                    scan_id,
                    files: chunk,
                    directories: dirs,
                });
            },
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    // Clear controller on completion ONLY if it is still this exact scan
    {
        let mut lock = scan_state_clone.lock().unwrap();
        if let Some(ref active) = *lock {
            if active.id == scan_id {
                *lock = None;
            }
        }
    }

    res
}

#[tauri::command]
pub fn pause_archive_scan(
    app: AppHandle,
    scan_state: tauri::State<'_, ArchiveScanState>,
) -> Result<(), String> {
    let lock = scan_state.current_scan.lock().unwrap();
    if let Some(ref active) = *lock {
        active.controller.pause();
        let _ = app.emit("archive_scan_paused", ());
    }
    Ok(())
}

#[tauri::command]
pub fn resume_archive_scan(
    app: AppHandle,
    scan_state: tauri::State<'_, ArchiveScanState>,
) -> Result<(), String> {
    let lock = scan_state.current_scan.lock().unwrap();
    if let Some(ref active) = *lock {
        active.controller.resume();
        let _ = app.emit("archive_scan_resumed", ());
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_archive_scan(
    app: AppHandle,
    scan_state: tauri::State<'_, ArchiveScanState>,
) -> Result<(), String> {
    let lock = scan_state.current_scan.lock().unwrap();
    if let Some(ref active) = *lock {
        active.controller.cancel();
        let _ = app.emit("archive_scan_cancelled", ());
    }
    Ok(())
}

#[tauri::command]
pub async fn set_culling_state(
    path: String,
    flag: Option<i8>,
    rating: u8,
    color: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<(), String> {
    let p = PathBuf::from(path);
    // Read existing
    let mut state = rapidready_core::culling::read_sidecar(&p);
    state.flag = flag;
    state.rating = rating;
    state.color = if let Some(ref c) = color {
        if c == "none" || c.is_empty() {
            None
        } else {
            Some(c.clone())
        }
    } else {
        None
    };
    if let Some(t) = tags {
        state.tags = t;
    }
    
    // Write updated
    rapidready_core::culling::write_sidecar(&p, &state).map_err(|e| e.to_string())
}

pub fn normalize_path_str(p: &Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    let trimmed = s.trim_end_matches('/');
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        trimmed.to_lowercase()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        trimmed.to_string()
    }
}

pub fn is_system_critical_path(path: &Path) -> bool {
    let norm = normalize_path_str(path);
    let trimmed = norm.trim_end_matches('/');

    if trimmed.is_empty() {
        return true;
    }

    let forbidden = [
        "",
        "/",
        "/bin",
        "/sbin",
        "/usr",
        "/usr/bin",
        "/usr/sbin",
        "/usr/local",
        "/etc",
        "/var",
        "/var/root",
        "/tmp",
        "/home",
        "/root",
        "/users",
        "/system",
        "/applications",
        "/library",
        "/volumes",
        "/private",
        "/dev",
        "/proc",
        "/sys",
        "c:",
        "c:/windows",
        "c:/windows/system32",
        "c:/users",
        "c:/program files",
        "c:/program files (x86)",
        "c:/programdata",
        "d:",
        "e:",
        "f:",
        "z:",
    ];

    if forbidden.contains(&trimmed) {
        return true;
    }

    // Windows root drive check (e.g. "c:" or "c:/")
    if (trimmed.len() == 2 && trimmed.ends_with(':')) || (trimmed.len() == 3 && trimmed.chars().nth(1) == Some(':') && trimmed.ends_with('/')) {
        return true;
    }

    // Prohibit paths that resolve to the root directory without parent
    if path.parent().map_or(true, |p| p.as_os_str().is_empty()) && !path.is_relative() {
        return true;
    }

    false
}

pub fn is_strictly_inside_root(path: &Path, root: &Path) -> bool {
    // Prohibit relative path traversal tricks
    if path.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return false;
    }

    let norm_path = normalize_path_str(path);
    let norm_root = normalize_path_str(root);

    if norm_root.is_empty() || norm_path.is_empty() {
        return false;
    }

    // 1. Target cannot be the root itself!
    if norm_path == norm_root {
        return false;
    }

    // 2. Lexical prefix check: norm_path must start with norm_root + "/"
    let prefix = format!("{}/", norm_root);
    if !norm_path.starts_with(&prefix) {
        return false;
    }

    // 3. Symlink / canonicalization check if both paths exist
    if let (Ok(c_path), Ok(c_root)) = (std::fs::canonicalize(path), std::fs::canonicalize(root)) {
        let norm_c_path = normalize_path_str(&c_path);
        let norm_c_root = normalize_path_str(&c_root);
        if norm_c_path == norm_c_root {
            return false;
        }
        let c_prefix = format!("{}/", norm_c_root);
        if !norm_c_path.starts_with(&c_prefix) {
            return false;
        }
    }

    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteFilesResult {
    pub deleted: Vec<String>,
    pub failed: Vec<(String, String)>,
}

#[tauri::command]
pub async fn delete_files(
    app: AppHandle,
    paths: Vec<String>,
    to_trash: bool,
    archive_root: Option<String>,
) -> Result<DeleteFilesResult, String> {
    delete_files_impl(Some(&app), paths, to_trash, archive_root).await
}

pub async fn delete_files_impl(
    app: Option<&AppHandle>,
    paths: Vec<String>,
    to_trash: bool,
    archive_root: Option<String>,
) -> Result<DeleteFilesResult, String> {
    let mut deleted = Vec::new();
    let mut failed = Vec::new();
    let root_path_opt = archive_root.as_ref().map(PathBuf::from);

    for p in paths {
        let path = PathBuf::from(&p);
        if !path.exists() {
            continue;
        }

        // 1. delete_files must NEVER delete directories!
        if path.is_dir() {
            failed.push((p.clone(), "Target is a directory, not a file".to_string()));
            continue;
        }

        // 2. Block system-critical paths
        if is_system_critical_path(&path) {
            failed.push((p.clone(), "Refusing to delete: Target is a system-critical path".to_string()));
            continue;
        }

        // 3. If archive_root is provided, target must be strictly inside it
        if let Some(ref root) = root_path_opt {
            if !is_strictly_inside_root(&path, root) {
                failed.push((p.clone(), "Refusing to delete: Target is not inside archive root".to_string()));
                continue;
            }
        }

        // 4. Independent NAS verification & safety override
        let is_nas = is_network_or_remote_path(&path);
        let should_use_trash = to_trash || !is_nas;

        let delete_res = if should_use_trash {
            trash::delete(&path).map_err(|e| format!("Failed to move to trash: {}", e))
        } else {
            std::fs::remove_file(&path).map_err(|e| format!("Failed to permanently delete file: {}", e))
        };

        match delete_res {
            Ok(_) => {
                deleted.push(p.clone());

                // Also delete sidecar file if present
                let sidecar = rapidready_core::culling::get_sidecar_path(&path);
                if sidecar.exists() {
                    if should_use_trash {
                        let _ = trash::delete(&sidecar);
                    } else {
                        let _ = std::fs::remove_file(&sidecar);
                    }
                }
            }
            Err(e) => {
                failed.push((p, e));
            }
        }
    }

    // Automatically prune successfully deleted files from all collections
    if !deleted.is_empty() {
        if let Some(app) = app {
            if let Ok(app_dir) = app.path().app_data_dir() {
                if let Ok(mut tree) = core_load_collections(&app_dir) {
                    if core_prune_paths_from_all_collections(&mut tree, &deleted) {
                        let _ = core_save_collections(tree, &app_dir);
                    }
                }
            }
        }
    }

    Ok(DeleteFilesResult { deleted, failed })
}

#[tauri::command]
pub async fn delete_folder(
    app: AppHandle,
    path: String,
    to_trash: bool,
    archive_root: String,
) -> Result<(), String> {
    delete_folder_impl(Some(&app), path, to_trash, archive_root).await
}

pub async fn delete_folder_impl(
    app: Option<&AppHandle>,
    path: String,
    to_trash: bool,
    archive_root: String,
) -> Result<(), String> {
    let folder_path = PathBuf::from(&path);
    let root_path = PathBuf::from(&archive_root);

    if !folder_path.exists() {
        return Err("Folder does not exist".to_string());
    }
    if !folder_path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    // 1. Must be strictly inside archive root (never archive root itself or outside)
    if !is_strictly_inside_root(&folder_path, &root_path) {
        return Err("Refusing to delete: Path is not inside the active archive root".to_string());
    }

    // 2. Blocklist of system critical paths
    if is_system_critical_path(&folder_path) {
        return Err("Refusing to delete: Target is a system-critical path".to_string());
    }

    // 3. Independent NAS verification & safety override
    let is_nas = is_network_or_remote_path(&folder_path);

    if to_trash {
        trash::delete(&folder_path).map_err(|e| format!("Failed to move folder to trash: {}", e))?;
    } else {
        // SAFETY OVERRIDE: If to_trash is false but path is NOT a network share,
        // force move to trash instead of permanent removal!
        if !is_nas {
            trash::delete(&folder_path).map_err(|e| format!("Safety override: Failed to move local folder to trash: {}", e))?;
        } else {
            std::fs::remove_dir_all(&folder_path).map_err(|e| format!("Failed to permanently delete folder: {}", e))?;
        }
    }

    // Prune deleted folder from all collections
    if let Some(app) = app {
        if let Ok(app_dir) = app.path().app_data_dir() {
            if let Ok(mut tree) = core_load_collections(&app_dir) {
                if core_prune_folder_from_all_collections(&mut tree, &path) {
                    let _ = core_save_collections(tree, &app_dir);
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_folders(
    app: AppHandle,
    paths: Vec<String>,
    to_trash: bool,
    archive_root: String,
) -> Result<Vec<String>, String> {
    let root_path = PathBuf::from(&archive_root);
    let mut deleted = Vec::new();

    for path_str in paths {
        let folder_path = PathBuf::from(&path_str);
        if !folder_path.exists() || !folder_path.is_dir() {
            continue;
        }

        // 1. Must be strictly inside archive root
        if !is_strictly_inside_root(&folder_path, &root_path) {
            return Err(format!("Refusing to delete: '{}' is not inside the active archive root", path_str));
        }

        // 2. Blocklist of system critical paths
        if is_system_critical_path(&folder_path) {
            return Err(format!("Refusing to delete: '{}' is a system-critical path", path_str));
        }

        let is_nas = is_network_or_remote_path(&folder_path);
        if to_trash {
            trash::delete(&folder_path).map_err(|e| format!("Failed to move folder to trash: {}", e))?;
        } else {
            if !is_nas {
                trash::delete(&folder_path).map_err(|e| format!("Safety override: Failed to move local folder to trash: {}", e))?;
            } else {
                std::fs::remove_dir_all(&folder_path).map_err(|e| format!("Failed to permanently delete folder: {}", e))?;
            }
        }
        deleted.push(path_str);
    }

    // Prune deleted folders from all collections
    if !deleted.is_empty() {
        if let Ok(app_dir) = app.path().app_data_dir() {
            if let Ok(mut tree) = core_load_collections(&app_dir) {
                let mut modified = false;
                for p in &deleted {
                    if core_prune_folder_from_all_collections(&mut tree, p) {
                        modified = true;
                    }
                }
                if modified {
                    let _ = core_save_collections(tree, &app_dir);
                }
            }
        }
    }

    Ok(deleted)
}

#[tauri::command]
pub async fn prune_from_all_collections(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_prune_paths_from_all_collections(&mut tree, &paths) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub fn create_folder(parent_path: String, name: String) -> Result<String, String> {
    let parent = PathBuf::from(&parent_path);
    if !parent.exists() || !parent.is_dir() {
        return Err("Parent directory does not exist".to_string());
    }
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err("Folder name contains invalid characters".to_string());
    }
    let new_folder = parent.join(trimmed);
    if new_folder.exists() {
        return Err("A folder with this name already exists".to_string());
    }
    std::fs::create_dir(&new_folder).map_err(|e| format!("Failed to create folder: {}", e))?;
    Ok(new_folder.to_string_lossy().to_string())
}

#[tauri::command]
pub fn rename_folder(old_path: String, new_name: String) -> Result<String, String> {
    let source = PathBuf::from(&old_path);
    if !source.exists() || !source.is_dir() {
        return Err("Source directory does not exist".to_string());
    }
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err("Folder name contains invalid characters".to_string());
    }
    let parent = source.parent().ok_or_else(|| "Cannot rename root directory".to_string())?;
    let target = parent.join(trimmed);
    if target.exists() && target != source {
        return Err("A folder with this name already exists".to_string());
    }
    if target != source {
        std::fs::rename(&source, &target).map_err(|e| format!("Failed to rename folder: {}", e))?;
    }
    Ok(target.to_string_lossy().to_string())
}

pub fn is_network_or_remote_path(path: &Path) -> bool {
    #[cfg(target_os = "windows")]
    {
        let path_str = path.to_string_lossy();
        // 1. UNC network path: starts with \\ or // or \??\UNC
        if path_str.starts_with(r"\\") || path_str.starts_with("//") || path_str.starts_with(r"\??\UNC") {
            return true;
        }

        // 2. Mapped drive: check drive root e.g. "Z:\" with GetDriveTypeW (DRIVE_REMOTE = 4)
        use std::os::windows::ffi::OsStrExt;
        if let Some(component) = path.components().next() {
            let mut drive: Vec<u16> = component.as_os_str().encode_wide().collect();
            if !drive.ends_with(&[b'\\' as u16]) {
                drive.push(b'\\' as u16);
            }
            drive.push(0);

            extern "system" {
                fn GetDriveTypeW(lpRootPathName: *const u16) -> u32;
            }
            unsafe {
                if GetDriveTypeW(drive.as_ptr()) == 4 {
                    return true;
                }
            }
        }
        false
    }

    #[cfg(target_os = "macos")]
    {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;

        let existing_path = path.ancestors().find(|a| a.exists()).unwrap_or(path);

        if let Ok(c_path) = CString::new(existing_path.as_os_str().as_bytes()) {
            let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
            if unsafe { libc::statfs(c_path.as_ptr(), &mut stat) } == 0 {
                // MNT_LOCAL = 0x00001000 in macOS sys/mount.h
                const MNT_LOCAL: u32 = 0x00001000;
                if (stat.f_flags & MNT_LOCAL) == 0 {
                    return true;
                }
                let fstype = unsafe {
                    std::ffi::CStr::from_ptr(stat.f_fstypename.as_ptr()).to_string_lossy()
                };
                if fstype == "smbfs" || fstype == "nfs" || fstype == "afpfs" || fstype == "cifs" || fstype == "webdav" {
                    return true;
                }
            }
        }
        false
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;

        let existing_path = path.ancestors().find(|a| a.exists()).unwrap_or(path);

        if let Ok(c_path) = CString::new(existing_path.as_os_str().as_bytes()) {
            let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
            if unsafe { libc::statfs(c_path.as_ptr(), &mut stat) } == 0 {
                let f_type = stat.f_type as i64;
                if f_type == 0x6969 || f_type == 0x517B || f_type == 0xFF534D42 {
                    return true;
                }
            }
        }
        false
    }
}

#[tauri::command]
pub fn is_network_path(path: String) -> bool {
    is_network_or_remote_path(Path::new(&path))
}

#[tauri::command]
pub fn are_any_network_paths(paths: Vec<String>) -> bool {
    paths.iter().any(|p| is_network_or_remote_path(Path::new(p)))
}

#[tauri::command]
pub fn show_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        let win_path = path.replace('/', "\\");
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", win_path))
            .spawn()
            .map_err(|e| format!("Failed to reveal in Explorer: {}", e))?;
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = path;
        Ok(())
    }
}

#[tauri::command]
pub fn show_in_finder_batch(paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("open");
        cmd.arg("-R");
        for p in &paths {
            cmd.arg(p);
        }
        cmd.spawn()
            .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        for p in &paths {
            let win_path = p.replace('/', "\\");
            let _ = std::process::Command::new("explorer")
                .arg(format!("/select,{}", win_path))
                .spawn();
        }
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = paths;
        Ok(())
    }
}

#[tauri::command]
pub fn check_path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn close_window(window: tauri::Window) {
    let _ = window.close();
}

#[tauri::command]
pub fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn toggle_maximize_window(window: tauri::Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
pub async fn get_image_metadata(path: String) -> Result<rapidready_core::metadata_resolver::ImageMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(rapidready_core::metadata_resolver::get_image_metadata(std::path::Path::new(&path)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_default_pictures_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .picture_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_main_window(window: tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[derive(serde::Serialize)]
pub struct ImageRotationResult {
    pub path: String,
    pub culling: rapidready_core::culling::CullingState,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct BatchCullingResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub first_error: Option<String>,
}

#[tauri::command]
pub async fn rotate_images(paths: Vec<String>, direction: String) -> Result<Vec<ImageRotationResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut results = Vec::new();
        let mut errors = Vec::new();
        for path_str in paths {
            let path = Path::new(&path_str);
            let mut state = rapidready_core::culling::read_sidecar(path);
            let current = state.orientation.unwrap_or_else(|| {
                rapidready_core::thumbnail::get_effective_orientation(path).unwrap_or(1)
            });
            let next = rapidready_core::culling::next_orientation(current, &direction);
            state.orientation = Some(next);
            if let Err(e) = rapidready_core::culling::write_sidecar(path, &state) {
                errors.push(format!("{}: {}", path_str, e));
                continue;
            }
            results.push(ImageRotationResult {
                path: path_str,
                culling: state,
            });
        }
        if !errors.is_empty() && results.is_empty() {
            return Err(errors.join("\n"));
        }
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_culling_state_batch(
    paths: Vec<String>,
    flag: Option<i8>,
    rating: Option<u8>,
    color: Option<String>,
    add_tag: Option<String>,
    remove_tag: Option<String>,
) -> Result<BatchCullingResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let total = paths.len();
        let mut succeeded = 0;
        let mut failed = 0;
        let mut first_error = None;

        for path_str in paths {
            let p = PathBuf::from(&path_str);
            let mut state = rapidready_core::culling::read_sidecar(&p);
            if let Some(f) = flag {
                state.flag = if f == 0 { None } else { Some(f) };
            }
            if let Some(r) = rating {
                state.rating = r;
            }
            if let Some(ref c) = color {
                if c == "none" || c.is_empty() {
                    state.color = None;
                } else {
                    state.color = Some(c.clone());
                }
            }
            if let Some(ref tag_to_add) = add_tag {
                let trimmed = tag_to_add.trim();
                if !trimmed.is_empty() && !state.tags.iter().any(|t| t.eq_ignore_ascii_case(trimmed)) {
                    state.tags.push(trimmed.to_string());
                }
            }
            if let Some(ref tag_to_remove) = remove_tag {
                state.tags.retain(|t| !t.eq_ignore_ascii_case(tag_to_remove));
            }
            match rapidready_core::culling::write_sidecar(&p, &state) {
                Ok(_) => succeeded += 1,
                Err(e) => {
                    failed += 1;
                    if first_error.is_none() {
                        first_error = Some(format!("{}: {}", path_str, e));
                    }
                }
            }
        }

        if failed > 0 && succeeded == 0 {
            return Err(first_error.unwrap_or_else(|| "All file writes failed".into()));
        }

        Ok(BatchCullingResult {
            total,
            succeeded,
            failed,
            first_error,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_gps_batch(
    paths: Vec<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    altitude: Option<f64>,
) -> Result<BatchCullingResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let total = paths.len();
        let mut succeeded = 0;
        let mut failed = 0;
        let mut first_error = None;

        for path_str in paths {
            let p = PathBuf::from(&path_str);
            match rapidready_core::culling::write_gps_sidecar(&p, latitude, longitude, altitude) {
                Ok(_) => succeeded += 1,
                Err(e) => {
                    failed += 1;
                    if first_error.is_none() {
                        first_error = Some(format!("{}: {}", path_str, e));
                    }
                }
            }
        }

        if failed > 0 && succeeded == 0 {
            return Err(first_error.unwrap_or_else(|| "All file writes failed".into()));
        }

        Ok(BatchCullingResult {
            total,
            succeeded,
            failed,
            first_error,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Default)]
pub struct CollectionExportState(pub Arc<AtomicBool>);

#[tauri::command]
pub async fn get_collections(app: AppHandle) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    core_load_collections(&app_dir)
}

#[tauri::command]
pub async fn save_collections(app: AppHandle, tree: Vec<AlbumItem>) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    core_save_collections(tree, &app_dir)
}

#[tauri::command]
pub async fn add_to_collection(app: AppHandle, album_id: String, paths: Vec<String>) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_add_to_collection(&mut tree, &album_id, &paths) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn remove_from_collection(app: AppHandle, album_id: String, paths: Vec<String>) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_remove_from_collection(&mut tree, &album_id, &paths) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn reorder_collection_images(app: AppHandle, album_id: String, new_order: Vec<String>) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_reorder_collection_images(&mut tree, &album_id, &new_order) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn create_collection_item(
    app: AppHandle,
    parent_id: Option<String>,
    name: String,
    is_group: bool,
    icon: Option<String>,
) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let id = format!("album-{}", now);
    let new_item = if is_group {
        AlbumItem::Group { id, name, icon, children: Vec::new() }
    } else {
        AlbumItem::Album { id, name, icon, images: Vec::new() }
    };
    core_create_collection_item(&mut tree, parent_id.as_deref(), new_item);
    core_save_collections(tree.clone(), &app_dir)?;
    Ok(tree)
}

#[tauri::command]
pub async fn rename_collection_item(app: AppHandle, target_id: String, new_name: String) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_rename_collection_item(&mut tree, &target_id, &new_name) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn delete_collection_item(app: AppHandle, target_id: String) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_delete_collection_item(&mut tree, &target_id) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn sort_collection_by_exif(app: AppHandle, target_id: String) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_sort_collection_by_exif(&mut tree, &target_id) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn export_collection(
    app: AppHandle,
    state: tauri::State<'_, CollectionExportState>,
    options: CollectionExportOptions,
) -> Result<usize, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let tree = core_load_collections(&app_dir)?;

    fn find_album_images(items: &[AlbumItem], target_id: &str) -> Option<Vec<String>> {
        for item in items {
            match item {
                AlbumItem::Album { id, images, .. } if id == target_id => return Some(images.clone()),
                AlbumItem::Group { children, .. } => {
                    if let Some(imgs) = find_album_images(children, target_id) {
                        return Some(imgs);
                    }
                }
                _ => {}
            }
        }
        None
    }

    let images = find_album_images(&tree, &options.album_id)
        .ok_or_else(|| format!("Collection with id '{}' not found", options.album_id))?;

    state.0.store(false, Ordering::Relaxed);
    let is_cancelled = Arc::clone(&state.0);
    let app_clone = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        run_collection_export(&images, &options, is_cancelled, move |progress| {
            let _ = app_clone.emit("collection-export-progress", progress);
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Export task join error: {}", e))?
}

#[tauri::command]
pub fn cancel_collection_export(state: tauri::State<'_, CollectionExportState>) -> Result<(), String> {
    state.0.store(true, Ordering::Relaxed);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_network_or_remote_path_local() {
        let current = std::env::current_dir().unwrap();
        assert!(!is_network_or_remote_path(&current));
    }

    #[test]
    fn test_is_network_or_remote_path_real() {
        if Path::new("/Volumes/Media").exists() {
            assert!(is_network_or_remote_path(Path::new("/Volumes/Media")));
            assert!(is_network_path("/Volumes/Media".to_string()));
            assert!(is_network_path("/Volumes/Media/".to_string()));
            assert!(are_any_network_paths(vec!["/Volumes/Media".to_string()]));
            assert!(are_any_network_paths(vec!["/Volumes/Media/".to_string()]));
            assert!(are_any_network_paths(vec!["/some/local/path".to_string(), "/Volumes/Media".to_string()]));
        }
    }

    #[test]
    fn test_is_system_critical_path() {
        assert!(is_system_critical_path(Path::new("/")));
        assert!(is_system_critical_path(Path::new("/Users")));
        assert!(is_system_critical_path(Path::new("/System")));
        assert!(is_system_critical_path(Path::new("/Applications")));
        assert!(is_system_critical_path(Path::new("/bin")));
        assert!(is_system_critical_path(Path::new("/usr/bin")));
        assert!(is_system_critical_path(Path::new("C:\\")));
        assert!(is_system_critical_path(Path::new("C:\\Windows")));
        assert!(is_system_critical_path(Path::new("c:/windows/system32")));
        assert!(is_system_critical_path(Path::new("D:")));
        assert!(is_system_critical_path(Path::new("")));

        // Valid user photo directories should NOT be system critical
        assert!(!is_system_critical_path(Path::new("/Volumes/Storage/Photos/2024/09_Iceland")));
        assert!(!is_system_critical_path(Path::new("/Users/john/Pictures/Archive/2025")));
        assert!(!is_system_critical_path(Path::new("D:\\Photos\\ClientShoots\\2025-01-10")));
    }

    #[test]
    fn test_is_strictly_inside_root() {
        let root = Path::new("/Volumes/Archive/Photos");
        
        // Valid children
        assert!(is_strictly_inside_root(Path::new("/Volumes/Archive/Photos/2024"), root));
        assert!(is_strictly_inside_root(Path::new("/Volumes/Archive/Photos/2024/01_Trip"), root));
        assert!(is_strictly_inside_root(Path::new("/Volumes/Archive/Photos/image.cr3"), root));

        // Root itself must NOT be inside root (cannot delete root!)
        assert!(!is_strictly_inside_root(root, root));

        // Outside paths
        assert!(!is_strictly_inside_root(Path::new("/Volumes/Archive/OtherFolder"), root));
        assert!(!is_strictly_inside_root(Path::new("/Volumes/Archive"), root));
        assert!(!is_strictly_inside_root(Path::new("/Users/john/Pictures"), root));

        // Partial prefix false-positive prevention (Photos_Backup is not Photos!)
        assert!(!is_strictly_inside_root(Path::new("/Volumes/Archive/Photos_Backup/2024"), root));

        // Relative path traversal tricks
        assert!(!is_strictly_inside_root(Path::new("/Volumes/Archive/Photos/../etc/passwd"), root));
    }

    #[test]
    fn test_delete_folder_guardrails() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("rapidready_safety_test_{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&temp_dir);
            std::fs::create_dir_all(temp_dir.join("subfolder")).unwrap();

            let root_str = temp_dir.to_string_lossy().to_string();
            let sub_str = temp_dir.join("subfolder").to_string_lossy().to_string();

            // 1. Refuse deleting root itself
            let err_root = delete_folder_impl(None, root_str.clone(), true, root_str.clone()).await;
            assert!(err_root.is_err());
            assert!(err_root.unwrap_err().contains("not inside the active archive root"));

            // 2. Refuse deleting outside root
            let outside = std::env::temp_dir().to_string_lossy().to_string();
            let err_outside = delete_folder_impl(None, outside, true, root_str.clone()).await;
            assert!(err_outside.is_err());

            // 3. Deleting valid subfolder with to_trash: false on local storage triggers safety override without error
            let ok_sub = delete_folder_impl(None, sub_str.clone(), false, root_str.clone()).await;
            assert!(ok_sub.is_ok());
            assert!(!Path::new(&sub_str).exists());

            let _ = std::fs::remove_dir_all(&temp_dir);
        });
    }

    #[test]
    fn test_delete_files_guardrails() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("rapidready_files_safety_test_{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&temp_dir);
            std::fs::create_dir_all(temp_dir.join("subdir")).unwrap();
            std::fs::write(temp_dir.join("photo1.jpg"), b"test").unwrap();
            std::fs::write(temp_dir.join("photo1.jpg.rrdata"), b"test sidecar").unwrap();

            let root_str = temp_dir.to_string_lossy().to_string();
            let photo_str = temp_dir.join("photo1.jpg").to_string_lossy().to_string();
            let subdir_str = temp_dir.join("subdir").to_string_lossy().to_string();

            // 1. delete_files must reject directories
            let res_dir = delete_files_impl(None, vec![subdir_str], false, Some(root_str.clone())).await.unwrap();
            assert_eq!(res_dir.deleted.len(), 0);
            assert_eq!(res_dir.failed.len(), 1);
            assert!(res_dir.failed[0].1.contains("directory"));

            // 2. delete_files on local path with to_trash: false safely deletes file and sidecar via safety override
            let res_photo = delete_files_impl(None, vec![photo_str.clone()], false, Some(root_str.clone())).await.unwrap();
            assert_eq!(res_photo.deleted.len(), 1);
            assert_eq!(res_photo.failed.len(), 0);
            assert!(!Path::new(&photo_str).exists());
            assert!(!temp_dir.join("photo1.jpg.rrdata").exists());

            let _ = std::fs::remove_dir_all(&temp_dir);
        });
    }
}




