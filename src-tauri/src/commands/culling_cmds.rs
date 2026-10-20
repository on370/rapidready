use super::archive_cmds::ArchiveCatalogState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

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
pub fn get_culling_state(path: String) -> rapidready_core::culling::CullingState {
    let p = PathBuf::from(path);
    rapidready_core::culling::read_sidecar(&p)
}

#[tauri::command]
pub async fn set_culling_state(
    path: String,
    flag: Option<i8>,
    rating: u8,
    color: Option<String>,
    tags: Option<Vec<String>>,
    catalog_state: tauri::State<'_, ArchiveCatalogState>,
) -> Result<(), String> {
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
    let _ = catalog_state.catalog.update_culling(&path, &state, None);
    Ok(())
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
