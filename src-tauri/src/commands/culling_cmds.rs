use super::archive_cmds::ArchiveCatalogState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct SidecarSyncState {
    pub current_sync: Arc<Mutex<Option<rapidready_core::archive::ScanController>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarSyncProgress {
    pub processed: usize,
    pub total: usize,
    pub synced_count: usize,
    pub current_file: String,
    pub is_paused: bool,
    pub is_cancelled: bool,
    pub is_complete: bool,
}

#[derive(Serialize)]
pub struct ImageRotationResult {
    pub path: String,
    pub culling: rapidready_core::culling::CullingState,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BatchCullingResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub first_error: Option<String>,
}

#[tauri::command]
pub fn set_sidecar_mode_cmd(mode: String) -> Result<(), String> {
    let m = match mode.to_lowercase().as_str() {
        "dual" => rapidready_core::culling::SidecarMode::Dual,
        "xmp" => rapidready_core::culling::SidecarMode::Xmp,
        _ => rapidready_core::culling::SidecarMode::Rrdata,
    };
    rapidready_core::culling::set_sidecar_mode(m);
    Ok(())
}

#[tauri::command]
pub fn get_culling_state(path: String) -> rapidready_core::culling::CullingState {
    let p = PathBuf::from(path);
    rapidready_core::culling::read_sidecar(&p)
}

#[tauri::command]
pub async fn set_culling_state(
    app: AppHandle,
    path: String,
    flag: Option<i8>,
    rating: u8,
    color: Option<String>,
    tags: Option<Vec<String>>,
    catalog_state: tauri::State<'_, ArchiveCatalogState>,
) -> Result<rapidready_core::culling::CullingState, String> {
    let p = PathBuf::from(&path);
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
    rapidready_core::culling::write_sidecar(&p, &state).map_err(|e| e.to_string())?;
    let updated_state = rapidready_core::culling::read_sidecar(&p);
    let _ = catalog_state.catalog.update_culling(&path, &updated_state, None);
    let _ = app.emit("sidecar-updated", serde_json::json!({
        "path": path,
        "culling": updated_state
    }));
    Ok(updated_state)
}

#[tauri::command]
pub async fn set_culling_state_batch(
    app: AppHandle,
    paths: Vec<String>,
    flag: Option<i8>,
    rating: Option<u8>,
    color: Option<String>,
    add_tag: Option<String>,
    remove_tag: Option<String>,
    catalog_state: tauri::State<'_, ArchiveCatalogState>,
) -> Result<BatchCullingResult, String> {
    let catalog = catalog_state.catalog.clone();
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
                Ok(_) => {
                    succeeded += 1;
                    let updated = rapidready_core::culling::read_sidecar(&p);
                    let _ = catalog.update_culling(&path_str, &updated, None);
                    let _ = app.emit("sidecar-updated", serde_json::json!({
                        "path": path_str,
                        "culling": updated
                    }));
                }
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
pub async fn sync_archive_sidecars(
    app: AppHandle,
    paths: Vec<String>,
    mode: String,
    sync_state: State<'_, SidecarSyncState>,
    catalog_state: State<'_, ArchiveCatalogState>,
) -> Result<SidecarSyncProgress, String> {
    let controller = rapidready_core::archive::ScanController::new();
    {
        let mut guard = sync_state.current_sync.lock().map_err(|e| e.to_string())?;
        *guard = Some(controller.clone());
    }

    let sync_state_clone = sync_state.current_sync.clone();
    let catalog = catalog_state.catalog.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let target_mode = match mode.to_lowercase().as_str() {
            "dual" => rapidready_core::culling::SidecarMode::Dual,
            "xmp" => rapidready_core::culling::SidecarMode::Xmp,
            _ => rapidready_core::culling::SidecarMode::Rrdata,
        };
        rapidready_core::culling::set_sidecar_mode(target_mode);

        let total = paths.len();
        let mut processed = 0;
        let mut synced_count = 0;
        let mut last_progress_time = std::time::Instant::now();
        let mut current_file = String::new();

        for path_str in paths {
            if controller.check_pause_or_cancel() {
                break;
            }

            processed += 1;
            let p = Path::new(&path_str);
            current_file = p.file_name().and_then(|n| n.to_str()).unwrap_or(&path_str).to_string();

            let rr_path = rapidready_core::culling::get_sidecar_path(p);
            let rr_exists = rr_path.is_file();
            let xmp_path = rapidready_core::culling::find_existing_xmp_path(p);
            let xmp_exists = xmp_path.is_some();

            // Smart Delta Rule (Critical for NAS speed!):
            // Skip immediately if NEITHER .rrdata nor .xmp exists on disk
            if !rr_exists && !xmp_exists {
                if processed % 50 == 0 || last_progress_time.elapsed().as_millis() >= 150 {
                    last_progress_time = std::time::Instant::now();
                    let _ = app.emit("sidecar_sync_progress", SidecarSyncProgress {
                        processed,
                        total,
                        synced_count,
                        current_file: current_file.clone(),
                        is_paused: controller.is_paused(),
                        is_cancelled: controller.is_cancelled(),
                        is_complete: false,
                    });
                }
                continue;
            }

            // At least one exists: read authoritative SSoT
            let auth_state = rapidready_core::culling::read_sidecar(p);
            let mut file_synced = false;

            let rr_mtime = if rr_exists {
                std::fs::metadata(&rr_path).and_then(|m| m.modified()).ok()
            } else {
                None
            };
            let xmp_mtime = if let Some(ref xp) = xmp_path {
                std::fs::metadata(xp).and_then(|m| m.modified()).ok()
            } else {
                None
            };

            match target_mode {
                rapidready_core::culling::SidecarMode::Dual => {
                    // Under Dual, ensure both exist and hold authoritative state
                    if !rr_exists {
                        if rapidready_core::culling::write_sidecar_rrdata(p, &auth_state).is_ok() {
                            file_synced = true;
                        }
                    }
                    if !xmp_exists {
                        if rapidready_core::culling::write_sidecar_xmp(p, &auth_state).is_ok() {
                            file_synced = true;
                        }
                    }
                    if rr_exists && xmp_exists {
                        if let (Some(rt), Some(xt)) = (rr_mtime, xmp_mtime) {
                            if let Ok(duration) = xt.duration_since(rt) {
                                if duration.as_secs() >= 1 {
                                    // XMP is newer, update rrdata
                                    if rapidready_core::culling::write_sidecar_rrdata(p, &auth_state).is_ok() {
                                        file_synced = true;
                                    }
                                }
                            } else if let Ok(duration) = rt.duration_since(xt) {
                                if duration.as_secs() >= 1 {
                                    // rrdata is newer, update xmp
                                    if rapidready_core::culling::write_sidecar_xmp(p, &auth_state).is_ok() {
                                        file_synced = true;
                                    }
                                }
                            }
                        }
                    }
                }
                rapidready_core::culling::SidecarMode::Xmp => {
                    // Target is XMP: if .rrdata exists and .xmp is missing or older, write/update .xmp
                    if !xmp_exists {
                        if rapidready_core::culling::write_sidecar_xmp(p, &auth_state).is_ok() {
                            file_synced = true;
                        }
                    } else if let (Some(rt), Some(xt)) = (rr_mtime, xmp_mtime) {
                        if let Ok(duration) = rt.duration_since(xt) {
                            if duration.as_secs() >= 1 {
                                if rapidready_core::culling::write_sidecar_xmp(p, &auth_state).is_ok() {
                                    file_synced = true;
                                }
                            }
                        }
                    }
                }
                rapidready_core::culling::SidecarMode::Rrdata => {
                    // Target is Rrdata: if .xmp exists and .rrdata is missing or older, write/update .rrdata
                    if !rr_exists {
                        if rapidready_core::culling::write_sidecar_rrdata(p, &auth_state).is_ok() {
                            file_synced = true;
                        }
                    } else if let (Some(rt), Some(xt)) = (rr_mtime, xmp_mtime) {
                        if let Ok(duration) = xt.duration_since(rt) {
                            if duration.as_secs() >= 1 {
                                if rapidready_core::culling::write_sidecar_rrdata(p, &auth_state).is_ok() {
                                    file_synced = true;
                                }
                            }
                        }
                    }
                }
            }

            if file_synced {
                synced_count += 1;
                let updated_culling = rapidready_core::culling::read_sidecar(p);
                let _ = catalog.update_culling(&path_str, &updated_culling, None);
                let _ = app.emit("sidecar-updated", serde_json::json!({
                    "path": path_str,
                    "culling": updated_culling
                }));
            }

            if processed % 25 == 0 || last_progress_time.elapsed().as_millis() >= 150 {
                last_progress_time = std::time::Instant::now();
                let _ = app.emit("sidecar_sync_progress", SidecarSyncProgress {
                    processed,
                    total,
                    synced_count,
                    current_file: current_file.clone(),
                    is_paused: controller.is_paused(),
                    is_cancelled: controller.is_cancelled(),
                    is_complete: false,
                });
            }
        }

        let is_cancelled = controller.is_cancelled();
        {
            if let Ok(mut guard) = sync_state_clone.lock() {
                *guard = None;
            }
        }

        let final_progress = SidecarSyncProgress {
            processed,
            total,
            synced_count,
            current_file,
            is_paused: false,
            is_cancelled,
            is_complete: !is_cancelled,
        };

        let _ = app.emit("sidecar_sync_progress", final_progress.clone());
        Ok(final_progress)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn pause_sidecar_sync(sync_state: State<'_, SidecarSyncState>) {
    if let Ok(guard) = sync_state.current_sync.lock() {
        if let Some(ctrl) = guard.as_ref() {
            ctrl.pause();
        }
    }
}

#[tauri::command]
pub fn resume_sidecar_sync(sync_state: State<'_, SidecarSyncState>) {
    if let Ok(guard) = sync_state.current_sync.lock() {
        if let Some(ctrl) = guard.as_ref() {
            ctrl.resume();
        }
    }
}

#[tauri::command]
pub fn cancel_sidecar_sync(sync_state: State<'_, SidecarSyncState>) {
    if let Ok(guard) = sync_state.current_sync.lock() {
        if let Some(ctrl) = guard.as_ref() {
            ctrl.cancel();
        }
    }
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
pub async fn get_image_metadata(path: String) -> Result<rapidready_core::metadata_resolver::ImageMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(rapidready_core::metadata_resolver::get_image_metadata(std::path::Path::new(&path)))
    })
    .await
    .map_err(|e| e.to_string())?
}
