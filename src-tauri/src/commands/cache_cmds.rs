//! Settings → Disk cache: where the thumbnail/preview cache lives and how big it may get.

use crate::cache_settings::{self, CacheSettings, PendingMove, MIN_SIZE_LIMIT};
use rapidready_core::chunk_cache::{get_global_chunk_cache, spawn_size_limit_pass, CacheStats};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheSettingsInfo {
    /// The cache folder in use now; `None` when the configured folder was not available at launch.
    pub active_dir: Option<String>,
    /// The app's default cache folder.
    pub default_dir: String,
    /// The folder the user chose (the cache is in its "RapidReady Cache" subfolder), `None` = default.
    pub location: Option<String>,
    /// The cache folder after the next launch (differs from `active_dir` while a change is pending).
    pub configured_dir: String,
    pub restart_required: bool,
    /// Whether a pending change moves the existing cache (true) or starts empty (false).
    pub pending_move_existing: Option<bool>,
    pub max_bytes: Option<u64>,
    /// Free space on the drive of the configured folder.
    pub free_bytes: Option<u64>,
    pub stats: CacheStats,
    pub last_move_error: Option<String>,
}

fn dirs(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let default_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join(cache_settings::DEFAULT_CACHE_SUBDIR);
    Ok((app_dir, default_dir))
}

fn info(settings: &CacheSettings, default_dir: &std::path::Path) -> CacheSettingsInfo {
    let cache = get_global_chunk_cache();
    let active_dir = cache.as_ref().map(|c| c.cache_dir().to_path_buf());
    let configured_dir = settings.cache_dir(default_dir);
    // Free space where the cache will be: the chosen folder (the cache subfolder may not exist yet).
    let space_probe = settings.location.as_ref().map(PathBuf::from).unwrap_or_else(|| configured_dir.clone());
    CacheSettingsInfo {
        active_dir: active_dir.as_ref().map(|d| d.to_string_lossy().into_owned()),
        default_dir: default_dir.to_string_lossy().into_owned(),
        location: settings.location.clone(),
        configured_dir: configured_dir.to_string_lossy().into_owned(),
        restart_required: settings.pending.is_some(),
        pending_move_existing: settings.pending.as_ref().map(|p| p.move_existing),
        max_bytes: settings.max_bytes,
        free_bytes: rapidready_core::drives::available_space_for(&space_probe),
        stats: cache.and_then(|c| c.get_stats().ok()).unwrap_or_default(),
        last_move_error: settings.last_move_error.clone(),
    }
}

#[tauri::command]
pub async fn get_cache_settings(app: AppHandle) -> Result<CacheSettingsInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (app_dir, default_dir) = dirs(&app)?;
        Ok(info(&CacheSettings::load(&app_dir), &default_dir))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Chooses where the cache lives (`None` = the default folder). Takes effect on the next launch,
/// which moves the existing cache there (`move_existing`) or deletes it and starts empty.
#[tauri::command]
pub async fn set_cache_location(
    app: AppHandle,
    location: Option<String>,
    move_existing: bool,
) -> Result<CacheSettingsInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (app_dir, default_dir) = dirs(&app)?;
        let mut settings = CacheSettings::load(&app_dir);
        let active = get_global_chunk_cache().map(|c| c.cache_dir().to_path_buf());
        if let Some(loc) = &location {
            cache_settings::validate_location(loc, active.as_deref())?;
        }
        let target = cache_settings::cache_dir_for(location.as_deref(), &default_dir);

        // A second change before restarting keeps the original source and fallback.
        let (from_dir, previous_location) = match settings.pending.take() {
            Some(p) => (PathBuf::from(p.from_dir), p.previous_location),
            None => (active.unwrap_or_else(|| settings.cache_dir(&default_dir)), settings.location.clone()),
        };
        settings.location = location;
        settings.last_move_error = None;
        settings.pending = if cache_settings::same_dir(&from_dir, &target) {
            None // Back to the folder in use: nothing to do on restart.
        } else {
            Some(PendingMove {
                from_dir: from_dir.to_string_lossy().into_owned(),
                previous_location,
                move_existing,
            })
        };
        settings.save(&app_dir)?;
        Ok(info(&settings, &default_dir))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Sets the maximum cache size in bytes (`None` = unlimited). Applies immediately: when the cache
/// is over the new limit, the oldest previews (then the oldest thumbnails) are removed in the
/// background.
#[tauri::command]
pub async fn set_cache_size_limit(app: AppHandle, max_bytes: Option<u64>) -> Result<CacheSettingsInfo, String> {
    if max_bytes.is_some_and(|b| b < MIN_SIZE_LIMIT) {
        return Err("The cache limit must be at least 1 GB.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let (app_dir, default_dir) = dirs(&app)?;
        let mut settings = CacheSettings::load(&app_dir);
        settings.max_bytes = max_bytes;
        settings.save(&app_dir)?;
        if let Some(cache) = get_global_chunk_cache() {
            cache.set_size_limit(max_bytes);
            spawn_size_limit_pass();
        }
        Ok(info(&settings, &default_dir))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Restarts the app (to apply a new cache location).
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}
