use super::archive_cmds::get_archive_catalog;
pub use rapidready_core::metadata_resolver::is_network_or_remote_path;
use rapidready_core::collections::{
    load_collections as core_load_collections,
    prune_folder_from_all_collections as core_prune_folder_from_all_collections,
    prune_paths_from_all_collections as core_prune_paths_from_all_collections,
    save_collections as core_save_collections,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

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

    // Automatically prune successfully deleted files from all collections and archive catalog
    if !deleted.is_empty() {
        if let Some(app) = app {
            if let Ok(catalog) = get_archive_catalog(app) {
                let _ = catalog.delete_files(&deleted);
            }
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
            if let Ok(catalog) = get_archive_catalog(app) {
                let _ = catalog.delete_folders(&[path.clone()]);
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

#[tauri::command]
pub fn is_network_path(path: String) -> bool {
    is_network_or_remote_path(Path::new(&path))
}

#[tauri::command]
pub fn are_any_network_paths(paths: Vec<String>) -> bool {
    paths.iter().any(|p| is_network_or_remote_path(Path::new(p)))
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
