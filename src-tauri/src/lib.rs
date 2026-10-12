

pub mod commands;
pub mod menu;

use tauri::http::Response;
use tauri::Emitter;

#[cfg(target_os = "macos")]
extern "C" {
    fn set_macos_dock_icon(bytes: *const u8, length: usize);
}

fn extract_query_param<T: std::str::FromStr>(query: &str, full_str: &str, key: &str) -> Option<T> {
    if !query.is_empty() {
        for part in query.split('&') {
            if let Some(val) = part.strip_prefix(key).and_then(|p| p.strip_prefix('=')) {
                if let Ok(v) = val.parse::<T>() {
                    return Some(v);
                }
            }
        }
    }
    let needle = format!("{}=", key);
    if let Some(idx) = full_str.find(&needle) {
        let sub = &full_str[idx + needle.len()..];
        let val_str: String = sub
            .chars()
            .take_while(|c| *c != '&' && *c != '%' && *c != '?' && *c != '#' && !c.is_whitespace())
            .collect();
        if let Ok(v) = val_str.parse::<T>() {
            return Some(v);
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(commands::SidecarWatcherState::default())
        .manage(commands::ArchiveScanState::default())
        .manage(commands::CollectionExportState::default())
        .manage(commands::SourceScanState::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                const ICON_BYTES: &[u8] = include_bytes!("../icons/icon.png");
                unsafe {
                    set_macos_dock_icon(ICON_BYTES.as_ptr(), ICON_BYTES.len());
                }
            }

            use tauri::Manager;
            let app_dir = app.path().app_data_dir()?;
            let cache_dir = app.path().app_cache_dir()?.join("disk_cache_v1");
            let catalog = std::sync::Arc::new(rapidready_core::archive_catalog::ArchiveCatalog::new(&app_dir)?);
            rapidready_core::archive_catalog::init_global_catalog(catalog.clone());
            let _ = rapidready_core::chunk_cache::init_global_chunk_cache(&cache_dir, &app_dir.join("archive_catalog.db"));
            app.manage(commands::ArchiveCatalogState {
                catalog,
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_theme(Some(tauri::Theme::Dark));
            }
            let handle = app.handle();
            if let Ok(menu) = menu::build_menu(handle) {
                app.set_menu(menu)?;
            }
            app.on_menu_event(move |app, event| {
                if event.id() == "open_help" {
                    let _ = app.emit("toggle-help-modal", ());
                } else if event.id() == "start_guided_tour" {
                    let _ = app.emit("start-guided-tour", ());
                } else if event.id() == "open_about" || event.id() == "open_about_help" {
                    let _ = app.emit("toggle-about-modal", ());
                } else if event.id() == "check_updates" || event.id() == "check_updates_help" {
                    let _ = app.emit("trigger-check-updates", ());
                } else if event.id() == "view_import" {
                    let _ = app.emit("navigate-view", "import");
                } else if event.id() == "view_library" {
                    let _ = app.emit("navigate-view", "library");
                } else if event.id() == "view_settings" {
                    let _ = app.emit("navigate-view", "settings");
                }
            });
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("rr-image", |_app, request, responder| {
            tauri::async_runtime::spawn(async move {
                let uri_obj = request.uri();
                let uri_path = uri_obj.path();
                let query = uri_obj.query().unwrap_or("");
                let full_uri_str = uri_obj.to_string();
                
                let is_fullres = query.contains("fullres=true")
                    || uri_path.ends_with("%3Ffullres=true")
                    || uri_path.ends_with("?fullres=true")
                    || full_uri_str.contains("fullres=true");
                
                let orient_param: Option<u32> = extract_query_param(query, &full_uri_str, "orient");
                let size_param: Option<u64> = extract_query_param(query, &full_uri_str, "size");
                let mtime_param: Option<i64> = extract_query_param(query, &full_uri_str, "mtime");
                let scale: u32 = extract_query_param(query, &full_uri_str, "scale").unwrap_or(1);

                let path_str = uri_path;
                let path_str = if path_str.starts_with("rr-image://localhost") {
                    path_str.strip_prefix("rr-image://localhost").unwrap_or(path_str)
                } else if path_str.starts_with("rr-image://") {
                    path_str.strip_prefix("rr-image://").unwrap_or(path_str)
                } else {
                    path_str
                };
                
                let path_str = if let Some(idx) = path_str.find("%3F") {
                    &path_str[..idx]
                } else if let Some(idx) = path_str.find('?') {
                    &path_str[..idx]
                } else {
                    path_str
                };
                
                #[allow(unused_mut)]
                let mut decoded_path = match urlencoding::decode(path_str) {
                    Ok(p) => p.into_owned(),
                    Err(_) => path_str.to_string(),
                };

                #[cfg(target_os = "windows")]
                {
                    decoded_path = decoded_path.replace('/', "\\");
                    if decoded_path.starts_with('\\') && decoded_path.chars().nth(2) == Some(':') {
                        decoded_path.remove(0);
                    } else if decoded_path.starts_with(r"\\\") {
                        while decoded_path.starts_with(r"\\\") {
                            decoded_path.remove(0);
                        }
                    }
                }

                let path = std::path::PathBuf::from(decoded_path);

                // FAST PATH: If not fullres, check L1 RAM cache and L2 local NVMe chunk cache.
                // Resolves in < 0.05 ms without spawning blocking threads or touching SMB/NAS!
                if !is_fullres {
                    if let Some(bytes) = rapidready_core::thumbnail::get_cached_preview_jpeg_fast(
                        &path,
                        scale,
                        orient_param,
                        size_param,
                        mtime_param,
                    ) {
                        let res = Response::builder()
                            .header("Content-Type", "image/jpeg")
                            .header("Access-Control-Allow-Origin", "*")
                            .header("Cache-Control", "public, max-age=86400, immutable")
                            .body(bytes)
                            .unwrap();
                        responder.respond(res);
                        return;
                    }
                }

                // SLOW PATH: Cache miss on NAS or fullres decode.
                // Limit concurrent active SMB decodes to max 8 to prevent thread-pool exhaustion
                // and WebKit IPC stall.
                static SLOW_DECODE_SEMAPHORE: std::sync::OnceLock<tokio::sync::Semaphore> = std::sync::OnceLock::new();
                let sem = SLOW_DECODE_SEMAPHORE.get_or_init(|| tokio::sync::Semaphore::new(8));

                let permit = match sem.acquire().await {
                    Ok(p) => p,
                    Err(_) => {
                        responder.respond(Response::builder().status(500).body(Vec::new()).unwrap());
                        return;
                    }
                };

                let res = tauri::async_runtime::spawn_blocking(move || {
                    let _permit = permit;
                    let path = &path;
                    if is_fullres {
                        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                        
                        if ["cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", "pef", "3fr", "x3f", "nrw", "heic", "heif", "hif", "mp4", "mov", "m4v", "avi"].contains(&ext.as_str()) {
                            match rapidready_core::thumbnail::get_max_preview_jpeg_with_orient_and_hints(path, orient_param, size_param, mtime_param) {
                                Ok(bytes) => {
                                    return Response::builder()
                                        .header("Content-Type", "image/jpeg")
                                        .header("Access-Control-Allow-Origin", "*")
                                        .header("Cache-Control", "public, max-age=86400, immutable")
                                        .body(bytes)
                                        .unwrap();
                                }
                                Err(_) => {}
                            }
                        } else {
                            let sidecar_state = rapidready_core::culling::read_sidecar(path);
                            let eff_orient = orient_param.or(sidecar_state.orientation);
                            if let Ok(bytes) = std::fs::read(path) {
                                let content_type = if ext == "png" { "image/png" } else { "image/jpeg" };
                                let final_bytes = if (ext == "jpg" || ext == "jpeg") && eff_orient.is_some() && eff_orient != Some(1) {
                                    rapidready_core::thumbnail::inject_orientation_into_jpeg(&bytes, eff_orient.unwrap() as u16)
                                } else {
                                    bytes
                                };
                                return Response::builder()
                                    .header("Content-Type", content_type)
                                    .header("Access-Control-Allow-Origin", "*")
                                    .header("Cache-Control", "public, max-age=86400, immutable")
                                    .body(final_bytes)
                                    .unwrap();
                            }
                        }
                    }
                    
                    match rapidready_core::thumbnail::get_preview_jpeg_with_orient_and_hints(path, scale, orient_param, size_param, mtime_param) {
                        Ok(bytes) => {
                            Response::builder()
                                .header("Content-Type", "image/jpeg")
                                .header("Access-Control-Allow-Origin", "*")
                                .header("Cache-Control", "public, max-age=86400, immutable")
                                .body(bytes)
                                .unwrap()
                        }
                        Err(_) => {
                            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                            if ["jpg", "jpeg", "png", "heic", "heif", "hif", "webp", "avif"].contains(&ext.as_str()) {
                                if let Ok(bytes) = std::fs::read(path) {
                                    let content_type = if ext == "png" {
                                        "image/png"
                                    } else if ext == "webp" {
                                        "image/webp"
                                    } else if ext == "avif" {
                                        "image/avif"
                                    } else if ext == "heic" || ext == "heif" || ext == "hif" {
                                        "image/heic"
                                    } else {
                                        "image/jpeg"
                                    };
                                    Response::builder()
                                        .header("Content-Type", content_type)
                                        .header("Access-Control-Allow-Origin", "*")
                                        .header("Cache-Control", "public, max-age=86400, immutable")
                                        .body(bytes)
                                        .unwrap()
                                } else {
                                    Response::builder().status(404).body(Vec::new()).unwrap()
                                }
                            } else {
                                Response::builder().status(404).body(Vec::new()).unwrap()
                            }
                        }
                    }
                }).await.unwrap_or_else(|_| Response::builder().status(500).body(Vec::new()).unwrap());

                responder.respond(res);
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_source_directory,
            commands::cancel_source_scan,
            commands::execute_import,
            commands::get_removable_drives,
            commands::scan_archive_directory,
            commands::pause_archive_scan,
            commands::resume_archive_scan,
            commands::cancel_archive_scan,
            commands::set_culling_state,
            commands::set_culling_state_batch,
            commands::set_gps_batch,
            commands::rotate_images,
            commands::get_culling_state,
            commands::start_watching_directory,
            commands::stop_watching_directory,
            commands::reconcile_folder,
            commands::delete_files,
            commands::delete_folder,
            commands::delete_folders,
            commands::create_folder,
            commands::rename_folder,
            commands::is_network_path,
            commands::are_any_network_paths,
            commands::open_in_rapidraw,
            commands::show_in_finder,
            commands::show_in_finder_batch,
            commands::check_path_exists,
            commands::quit_app,
            commands::close_window,
            commands::minimize_window,
            commands::toggle_maximize_window,
            commands::get_image_metadata,
            commands::get_default_pictures_dir,
            commands::show_main_window,
            commands::get_collections,
            commands::save_collections,
            commands::add_to_collection,
            commands::remove_from_collection,
            commands::reorder_collection_images,
            commands::create_collection_item,
            commands::rename_collection_item,
            commands::delete_collection_item,
            commands::sort_collection_by_exif,
            commands::prune_from_all_collections,
            commands::prune_collections_by_library,
            commands::export_collection,
            commands::cancel_collection_export,
            commands::warm_thumbnail_cache,
            commands::cancel_warmup_cache,
            commands::get_cached_archive_files,
            commands::get_cached_archive_count,
            commands::reconcile_archive_delta,
            commands::rebuild_archive_catalog,
            commands::get_disk_cache_stats,
            commands::clear_disk_cache,
            commands::set_active_viewport_folder,
            commands::set_active_viewport_paths,
            commands::start_archive_thumbnailing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
