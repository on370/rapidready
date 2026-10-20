use notify::{RecommendedWatcher, Watcher};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

pub struct SidecarWatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub watched_dir: Mutex<Option<PathBuf>>,
    pub tx: Mutex<Option<std::sync::mpsc::Sender<PathBuf>>>,
}

impl Default for SidecarWatcherState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched_dir: Mutex::new(None),
            tx: Mutex::new(None),
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

#[derive(Clone)]
pub struct ArchiveCatalogState {
    pub catalog: Arc<rapidready_core::archive_catalog::ArchiveCatalog>,
}

pub fn get_archive_catalog(app: &AppHandle) -> Result<Arc<rapidready_core::archive_catalog::ArchiveCatalog>, String> {
    if let Some(state) = app.try_state::<ArchiveCatalogState>() {
        return Ok(state.catalog.clone());
    }
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let catalog = rapidready_core::archive_catalog::ArchiveCatalog::new(&app_dir)
        .map_err(|e| e.to_string())?;
    Ok(Arc::new(catalog))
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
        // Clean up previous sender
        *state.tx.lock().unwrap() = None;
        *state.watcher.lock().unwrap() = None;

        let (tx, rx) = std::sync::mpsc::channel::<PathBuf>();
        let app_handle = app.clone();

        std::thread::spawn(move || {
            while let Ok(first_path) = rx.recv() {
                let mut paths = std::collections::HashSet::new();
                paths.insert(first_path);
                let start = std::time::Instant::now();
                loop {
                    match rx.recv_timeout(std::time::Duration::from_millis(300)) {
                        Ok(next_path) => {
                            paths.insert(next_path);
                            if start.elapsed() >= std::time::Duration::from_millis(1500) {
                                break;
                            }
                        }
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                            break;
                        }
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                            break;
                        }
                    }
                }

                let mut added_files = Vec::new();
                let mut removed_files = Vec::new();
                let mut new_dirs = Vec::new();

                for p in paths {
                    let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    // Ignore transient / temporary write files (e.g. atomic sidecar files .*.tmp.* or *.tmp/*.temp)
                    if file_name.starts_with('.') && file_name.contains(".tmp.") {
                        continue;
                    }
                    if file_name.ends_with(".tmp") || file_name.ends_with(".temp") {
                        continue;
                    }

                    let path_str = p.to_string_lossy();
                    if path_str.ends_with(".rrdata") {
                        let img_path_str = path_str.strip_suffix(".rrdata").unwrap_or(&path_str).to_string();
                        let img_path = PathBuf::from(&img_path_str);
                        let culling = rapidready_core::culling::read_sidecar(&img_path);
                        let _ = app_handle.emit("sidecar-updated", serde_json::json!({
                            "path": img_path_str,
                            "culling": culling
                        }));
                    } else if p.is_dir() {
                        let dir_norm = p.to_string_lossy().replace('\\', "/");
                        new_dirs.push(dir_norm);
                    } else if rapidready_core::archive::is_supported_archive_file(&p) {
                        if p.exists() && p.is_file() {
                            if let Some(archive_file) = rapidready_core::archive::create_archive_file(&p) {
                                added_files.push(archive_file);
                            }
                        } else if !p.exists() {
                            let norm = p.to_string_lossy().replace('\\', "/");
                            removed_files.push(norm);
                        }
                    }
                }

                if !added_files.is_empty() || !removed_files.is_empty() || !new_dirs.is_empty() {
                    let _ = app_handle.emit("archive-files-changed", serde_json::json!({
                        "added": added_files,
                        "removed": removed_files,
                        "new_dirs": new_dirs
                    }));
                }
            }
        });

        let tx_clone = tx.clone();
        let app_err = app.clone();
        let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            match res {
                Ok(event) => {
                    for p in event.paths {
                        let _ = tx_clone.send(p);
                    }
                }
                Err(e) => {
                    eprintln!("Directory watcher error: {}", e);
                    let _ = app_err.emit("sidecar-watcher-error", e.to_string());
                }
            }
        }).map_err(|e| e.to_string())?;

        watcher.watch(dir, notify::RecursiveMode::Recursive).map_err(|e| e.to_string())?;
        *state.watcher.lock().unwrap() = Some(watcher);
        *state.watched_dir.lock().unwrap() = Some(dir.to_path_buf());
        *state.tx.lock().unwrap() = Some(tx);
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
    let mut tx = state.tx.lock().unwrap();
    *tx = None;
    Ok(())
}

#[tauri::command]
pub async fn reconcile_folder(
    folder_path: String,
    known_paths: Vec<String>,
    catalog_state: tauri::State<'_, ArchiveCatalogState>,
) -> Result<rapidready_core::archive::ReconcileDiff, String> {
    let catalog = catalog_state.catalog.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let p = std::path::PathBuf::from(&folder_path);
        let diff = rapidready_core::archive::reconcile_directory_files(&p, &known_paths)
            .map_err(|e| e.to_string())?;
        if !diff.added.is_empty() || !diff.new_dirs.is_empty() {
            let _ = catalog.upsert_archive_files(&folder_path, &diff.added, &diff.new_dirs);
        }
        if !diff.removed.is_empty() {
            let _ = catalog.delete_files(&diff.removed);
        }
        Ok(diff)
    })
    .await
    .map_err(|e| e.to_string())?
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
    catalog_state: tauri::State<'_, ArchiveCatalogState>,
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
    let app_for_prog_final = app.clone();
    let app_for_chunk = app.clone();
    let controller_clone = controller.clone();
    let scan_state_clone = scan_state.current_scan.clone();
    let catalog_for_chunk = catalog_state.catalog.clone();
    let catalog_for_cancel = catalog_state.catalog.clone();
    let path_clone = path.clone();
    let path_for_cancel = path.clone();

    if existing_paths.is_none() {
        let _ = catalog_state.catalog.set_archive_indexing_status(&path, false);
    }

    let existing_set: Option<std::collections::HashSet<String>> = existing_paths.map(|paths| {
        paths
            .into_iter()
            .map(|p| p.replace('\\', "/"))
            .collect()
    });
    let init_bytes = initial_bytes.unwrap_or(0);

    let res = tauri::async_runtime::spawn_blocking(move || {
        let walk_res = rapidready_core::archive::scan_archive_directory_streaming(
            &dir,
            existing_set.as_ref(),
            init_bytes,
            scan_id,
            controller_clone.clone(),
            move |mut progress| {
                if progress.is_complete {
                    progress.is_complete = false;
                }
                let _ = app_for_prog.emit("archive_scan_progress", progress);
            },
            move |chunk, dirs| {
                let _ = catalog_for_chunk.upsert_archive_files(&path_clone, &chunk, &dirs);
                let _ = app_for_chunk.emit("archive_scan_chunk", ArchiveChunkPayload {
                    scan_id,
                    files: chunk,
                    directories: dirs,
                });
            },
        )
        .map_err(|e| e.to_string())?;

        if controller_clone.is_cancelled() {
            let actual_count = catalog_for_cancel.get_cached_count(&path_for_cancel).unwrap_or(walk_res.files.len());
            let _ = app_for_prog_final.emit("archive_scan_progress", rapidready_core::archive::ArchiveScanProgress {
                scan_id,
                files_found: actual_count,
                total_bytes: 0,
                current_dir: String::new(),
                is_paused: false,
                is_cancelled: true,
                is_complete: false,
                phase: Some("discovering".to_string()),
                total_files: None,
            });
            return Ok(walk_res);
        }

        let is_cancelled = controller_clone.is_cancelled();
        let _ = app_for_prog_final.emit("archive_scan_progress", rapidready_core::archive::ArchiveScanProgress {
            scan_id,
            files_found: walk_res.files.len(),
            total_bytes: 0,
            current_dir: String::new(),
            is_paused: false,
            is_cancelled,
            is_complete: false, // Discovery phase complete; thumbnailing follows in Phase 2
            phase: Some("discovering".to_string()),
            total_files: Some(walk_res.files.len()),
        });

        let mut final_res = walk_res;
        final_res.is_fully_indexed = false;

        Ok(final_res)
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
pub async fn get_cached_archive_files(
    path: String,
    catalog_state: tauri::State<'_, ArchiveCatalogState>,
) -> Result<rapidready_core::archive::ArchiveScanResult, String> {
    let catalog = catalog_state.catalog.clone();
    tauri::async_runtime::spawn_blocking(move || {
        catalog.get_cached_archive_files(&path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_cached_archive_count(
    path: String,
    catalog_state: tauri::State<'_, ArchiveCatalogState>,
) -> Result<usize, String> {
    let catalog = catalog_state.catalog.clone();
    tauri::async_runtime::spawn_blocking(move || {
        catalog.get_cached_count(&path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_disk_cache_stats() -> Result<rapidready_core::chunk_cache::CacheStats, String> {
    tauri::async_runtime::spawn_blocking(|| {
        if let Some(cache) = rapidready_core::chunk_cache::get_global_chunk_cache() {
            cache.get_stats().map_err(|e| e.to_string())
        } else {
            Ok(rapidready_core::chunk_cache::CacheStats::default())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clear_disk_cache(
    catalog_state: tauri::State<'_, ArchiveCatalogState>,
) -> Result<(), String> {
    let catalog = catalog_state.catalog.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(cache) = rapidready_core::chunk_cache::get_global_chunk_cache() {
            cache.clear_cache().map_err(|e| e.to_string())?;
        }
        catalog.reset_all_fully_indexed_flags().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn reconcile_archive_delta(
    app: AppHandle,
    path: String,
    scan_id: Option<u64>,
    catalog_state: tauri::State<'_, ArchiveCatalogState>,
    scan_state: tauri::State<'_, ArchiveScanState>,
) -> Result<rapidready_core::archive_catalog::ArchiveDeltaResult, String> {
    let dir = PathBuf::from(&path);
    let scan_id = scan_id.unwrap_or_else(|| scan_state.next_id.fetch_add(1, Ordering::SeqCst) + 1);
    let controller = rapidready_core::archive::ScanController::new();

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

    let app_clone = app.clone();
    let catalog = catalog_state.catalog.clone();
    let scan_state_clone = scan_state.current_scan.clone();
    let path_clone = path.clone();
    let controller_clone = controller.clone();

    let res = tauri::async_runtime::spawn_blocking(move || {
        let delta_res = catalog.sync_archive_delta(
            &dir,
            scan_id,
            &controller,
            move |progress| {
                let _ = app_clone.emit("archive_scan_progress", progress);
            },
        )
        .map_err(|e| e.to_string())?;

        if !controller_clone.is_cancelled() {
            let is_indexed = catalog.is_archive_fully_indexed(&path_clone).unwrap_or(false);
            let needs_thumbs = !delta_res.added.is_empty()
                || !delta_res.updated.is_empty()
                || !is_indexed;

            if needs_thumbs {
                if let Some(chunk_cache) = rapidready_core::chunk_cache::get_global_chunk_cache() {
                    let _ = rapidready_core::thumbnail::generate_missing_thumbnails_for_archive(
                        &catalog,
                        &chunk_cache,
                        &path_clone,
                        1,
                        &controller_clone,
                        |_, _, _, _| {},
                    );
                }
            }
        }

        Ok(delta_res)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

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
pub fn set_active_viewport_folder(folder_path: Option<String>) {
    rapidready_core::thumbnail::set_active_folder(folder_path);
}

#[tauri::command]
pub fn set_active_viewport_paths(paths: Vec<String>) {
    rapidready_core::thumbnail::set_active_viewport_paths(paths);
}

#[tauri::command]
pub async fn start_archive_thumbnailing(
    app: AppHandle,
    path: String,
    scan_id: Option<u64>,
    catalog_state: tauri::State<'_, ArchiveCatalogState>,
    scan_state: tauri::State<'_, ArchiveScanState>,
) -> Result<usize, String> {
    let scan_id = scan_id.unwrap_or_else(|| scan_state.next_id.fetch_add(1, Ordering::SeqCst) + 1);
    let controller = rapidready_core::archive::ScanController::new();

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

    let app_clone = app.clone();
    let app_final = app.clone();
    let catalog = catalog_state.catalog.clone();
    let scan_state_clone = scan_state.current_scan.clone();
    let path_clone = path.clone();
    let controller_clone = controller.clone();

    let res = tauri::async_runtime::spawn_blocking(move || {
        let chunk_cache = match rapidready_core::chunk_cache::get_global_chunk_cache() {
            Some(c) => c,
            None => return Err("Chunk cache not initialized".to_string()),
        };

        let total_cached = catalog.get_cached_count(&path_clone).unwrap_or(0);
        let ctrl_prog = controller_clone.clone();
        let last_reported_done = Arc::new(AtomicUsize::new(0));
        let last_reported_bytes = Arc::new(AtomicU64::new(0));
        let last_done_clone = last_reported_done.clone();
        let last_bytes_clone = last_reported_bytes.clone();

        let count = rapidready_core::thumbnail::generate_missing_thumbnails_for_archive(
            &catalog,
            &chunk_cache,
            &path_clone,
            1, // scale 1: micro-thumbnail
            &controller_clone,
            move |done, total, current_file, bytes_processed| {
                last_done_clone.store(done, Ordering::SeqCst);
                last_bytes_clone.store(bytes_processed, Ordering::SeqCst);
                let _ = app_clone.emit("archive_scan_progress", rapidready_core::archive::ArchiveScanProgress {
                    scan_id,
                    files_found: done,
                    total_bytes: bytes_processed,
                    current_dir: if !current_file.is_empty() { current_file.to_string() } else { format!("{}/{}", done, total) },
                    is_paused: ctrl_prog.is_paused(),
                    is_cancelled: ctrl_prog.is_cancelled(),
                    is_complete: false,
                    phase: Some("thumbnailing".to_string()),
                    total_files: Some(total),
                });
            },
        ).map_err(|e| e.to_string())?;

        let is_cancelled = controller_clone.is_cancelled();
        let final_count = if is_cancelled {
            last_reported_done.load(Ordering::SeqCst).min(total_cached)
        } else {
            total_cached
        };
        let final_bytes = last_reported_bytes.load(Ordering::SeqCst);

        let _ = app_final.emit("archive_scan_progress", rapidready_core::archive::ArchiveScanProgress {
            scan_id,
            files_found: final_count,
            total_bytes: final_bytes,
            current_dir: String::new(),
            is_paused: false,
            is_cancelled,
            is_complete: !is_cancelled,
            phase: Some("thumbnailing".to_string()),
            total_files: Some(total_cached),
        });

        if !is_cancelled {
            let _ = catalog.set_archive_indexing_status(&path_clone, true);
        }

        Ok(count)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

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
pub async fn rebuild_archive_catalog(
    path: String,
    catalog_state: tauri::State<'_, ArchiveCatalogState>,
) -> Result<(), String> {
    let catalog = catalog_state.catalog.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Targeted invalidation of this archive's chunks only! Never wipe other archives globally.
        if let Some(chunk_cache) = rapidready_core::chunk_cache::get_global_chunk_cache() {
            if let Ok(cands) = catalog.get_thumbnail_candidates_for_root(&path) {
                let mut keys = Vec::with_capacity(cands.len() * 2);
                for c in cands {
                    let p = Path::new(&c.path);
                    let orient = c.orientation.unwrap_or(1);
                    keys.push(rapidready_core::chunk_cache::compute_cache_key(p, c.size, c.mtime, 1, orient));
                    keys.push(rapidready_core::chunk_cache::compute_cache_key(p, c.size, c.mtime, 2, orient));
                }
                let _ = chunk_cache.remove_entries_for_keys(&keys);
            }
        }
        catalog.rebuild_archive_catalog(&path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Clone, Serialize)]
pub struct WarmupProgressPayload {
    pub token: u64,
    pub tag: String,
    pub current: usize,
    pub total: usize,
}

#[tauri::command]
pub async fn warm_thumbnail_cache(
    app: AppHandle,
    paths: Vec<String>,
    scale: u32,
    token: u64,
    tag: Option<String>,
) -> Result<usize, String> {
    rapidready_core::thumbnail::WARMUP_TOKEN.store(token, std::sync::atomic::Ordering::SeqCst);
    let app_clone = app.clone();
    let tag_clone = tag.clone();

    let processed = tauri::async_runtime::spawn_blocking(move || {
        rapidready_core::thumbnail::warm_thumbnail_cache_with_progress(
            &paths,
            scale,
            token,
            &rapidready_core::thumbnail::WARMUP_TOKEN,
            |current, total| {
                if let Some(ref t) = tag_clone {
                    let _ = app_clone.emit("warmup-progress", WarmupProgressPayload {
                        token,
                        tag: t.clone(),
                        current,
                        total,
                    });
                }
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(processed)
}

#[tauri::command]
pub fn cancel_warmup_cache() -> Result<(), String> {
    rapidready_core::thumbnail::cancel_warmup_cache();
    Ok(())
}
