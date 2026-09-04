use rapidready_core::scanner::{scan_directory, ScannedFile};
use rapidready_core::importer::{execute_import as core_execute_import, ImportProgress};
use rapidready_core::import_index::ImportIndex;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

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
    #[cfg(not(target_os = "macos"))]
    {
        open::that(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_removable_drives() -> Vec<rapidready_core::drives::DriveInfo> {
    rapidready_core::drives::get_removable_drives()
}

#[tauri::command]
pub async fn scan_archive_directory(path: String) -> Result<Vec<rapidready_core::archive::ArchiveFile>, String> {
    let dir = PathBuf::from(path);
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
) -> Result<(), String> {
    let p = PathBuf::from(path);
    // Read existing
    let mut state = rapidready_core::culling::read_sidecar(&p);
    state.flag = flag;
    state.rating = rating;
    state.color = color;
    
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
    #[cfg(not(target_os = "macos"))]
    {
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



