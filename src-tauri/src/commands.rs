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
    scan_directory(&dir_path, &import_index).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_import(
    app: AppHandle,
    files: Vec<ScannedFile>,
    destination_base: String,
    template: String,
) -> Result<(), String> {
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

#[tauri::command]
pub fn get_removable_drives() -> Vec<rapidready_core::drives::DriveInfo> {
    rapidready_core::drives::get_removable_drives()
}

#[tauri::command]
pub async fn scan_archive_directory(path: String) -> Result<Vec<rapidready_core::archive::ArchiveFile>, String> {
    let dir = PathBuf::from(path);
    rapidready_core::archive::scan_archive_directory(&dir).map_err(|e| e.to_string())
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
