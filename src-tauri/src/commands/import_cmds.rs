use rapidready_core::scanner::{scan_directory, ScannedFile};
use rapidready_core::importer::{execute_import as core_execute_import, ImportProgress};
use rapidready_core::import_index::ImportIndex;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

fn get_import_index(app: &AppHandle) -> Result<ImportIndex, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    ImportIndex::new(&app_dir).map_err(|e| e.to_string())
}

#[derive(Default)]
pub struct SourceScanState {
    pub cancel_token: Arc<Mutex<Option<Arc<AtomicBool>>>>,
}

#[tauri::command]
pub async fn scan_source_directory(
    app: AppHandle, 
    path: String,
    scan_state: tauri::State<'_, SourceScanState>,
) -> Result<Vec<ScannedFile>, String> {
    let dir_path = PathBuf::from(path);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err("Invalid directory path".into());
    }

    // Cancel any previous running scan
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut lock = scan_state.cancel_token.lock().unwrap();
        if let Some(old_cancel) = lock.take() {
            old_cancel.store(true, Ordering::SeqCst);
        }
        *lock = Some(cancel_flag.clone());
    }

    let import_index = get_import_index(&app)?;
    let app_clone = app.clone();
    let cancel_clone = cancel_flag.clone();

    let scan_res = tauri::async_runtime::spawn_blocking(move || {
        scan_directory(
            &dir_path,
            &import_index,
            Some(&cancel_clone),
            move |progress| {
                let _ = app_clone.emit("scan_progress", progress);
            },
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    // Clear active token if it's still ours
    {
        let mut lock = scan_state.cancel_token.lock().unwrap();
        if let Some(ref current) = *lock {
            if Arc::ptr_eq(current, &cancel_flag) {
                *lock = None;
            }
        }
    }

    scan_res
}

#[tauri::command]
pub fn cancel_source_scan(
    scan_state: tauri::State<'_, SourceScanState>,
) -> Result<(), String> {
    let mut lock = scan_state.cancel_token.lock().unwrap();
    if let Some(cancel) = lock.take() {
        cancel.store(true, Ordering::SeqCst);
    }
    Ok(())
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

#[tauri::command]
pub fn get_removable_drives() -> Vec<rapidready_core::drives::DriveInfo> {
    rapidready_core::drives::get_removable_drives()
}
