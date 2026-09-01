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
    let _ = std::fs::write("/tmp/rr_execute.log", "execute_import called"); println!(">>> execute_import called with {} files, dest={}, template={}", files.len(), destination_base, template);
    let import_index = get_import_index(&app).map_err(|e| {
        println!(">>> get_import_index failed: {}", e);
        e
    })?;
    
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
    .map_err(|e| {
        println!(">>> core_execute_import failed: {:?}", e);
        e.to_string()
    })
}
