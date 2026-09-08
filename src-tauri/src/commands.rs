use rapidready_core::scanner::{scan_directory, ScannedFile};
use rapidready_core::importer::{execute_import as core_execute_import, ImportProgress};
use rapidready_core::import_index::ImportIndex;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
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
        let valid_extensions = ["cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", "jpg", "jpeg", "png", "tif", "tiff"];
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
            if let Ok(event) = res {
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
    let dir = PathBuf::from(path);
    start_watching_dir_internal(&app, &dir, &state)
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
    state: tauri::State<'_, SidecarWatcherState>,
) -> Result<Vec<rapidready_core::archive::ArchiveFile>, String> {
    let dir = PathBuf::from(&path);
    let _ = start_watching_dir_internal(&app, &dir, &state);

    tauri::async_runtime::spawn_blocking(move || {
        rapidready_core::archive::scan_archive_directory(&dir).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
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

#[tauri::command]
pub async fn delete_files(paths: Vec<String>, to_trash: bool) -> Result<(), String> {
    for p in paths {
        let path = PathBuf::from(&p);
        if path.exists() {
            if to_trash {
                // MOVE TO OS TRASH!
                trash::delete(&path).map_err(|e| format!("Failed to move to trash: {}", e))?;
            } else {
                std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
            
            // Also delete sidecar (move to trash as well to be safe)
            let sidecar = rapidready_core::culling::get_sidecar_path(&path);
            if sidecar.exists() {
                if to_trash {
                    let _ = trash::delete(&sidecar);
                } else {
                    let _ = std::fs::remove_file(&sidecar);
                }
            }
        }
    }
    Ok(())
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

#[tauri::command]
pub async fn rotate_images(paths: Vec<String>, direction: String) -> Result<Vec<ImageRotationResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut results = Vec::new();
        for path_str in paths {
            let path = Path::new(&path_str);
            let mut state = rapidready_core::culling::read_sidecar(path);
            let current = state.orientation.unwrap_or_else(|| {
                rapidready_core::thumbnail::get_effective_orientation(path).unwrap_or(1)
            });
            let next = rapidready_core::culling::next_orientation(current, &direction);
            state.orientation = Some(next);
            if let Err(e) = rapidready_core::culling::write_sidecar(path, &state) {
                return Err(format!("Failed to write sidecar for {}: {}", path_str, e));
            }
            results.push(ImageRotationResult {
                path: path_str,
                culling: state,
            });
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
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        for path_str in paths {
            let p = PathBuf::from(path_str);
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
            rapidready_core::culling::write_sidecar(&p, &state).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}




