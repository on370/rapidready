

pub mod commands;
pub mod menu;

use std::path::Path;
use tauri::http::Response;
use tauri::Emitter;

#[cfg(target_os = "macos")]
extern "C" {
    fn set_macos_dock_icon(bytes: *const u8, length: usize);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(commands::SidecarWatcherState::default())
        .manage(commands::ArchiveScanState::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                const ICON_BYTES: &[u8] = include_bytes!("../icons/icon.png");
                unsafe {
                    set_macos_dock_icon(ICON_BYTES.as_ptr(), ICON_BYTES.len());
                }
            }

            use tauri::Manager;
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
                } else if event.id() == "open_about" {
                    let _ = app.emit("toggle-about-modal", ());
                }
            });
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("rr-image", |_app, request, responder| {
            tauri::async_runtime::spawn_blocking(move || {
                let uri_obj = request.uri();
            let uri_path = uri_obj.path();
            let query = uri_obj.query().unwrap_or("");
            
            let is_fullres = query.contains("fullres=true") || uri_path.ends_with("%3Ffullres=true") || uri_path.ends_with("?fullres=true");
            
            let orient_param = query
                .split('&')
                .find(|p| p.starts_with("orient="))
                .and_then(|p| p.strip_prefix("orient="))
                .and_then(|v| v.parse::<u32>().ok())
                .or_else(|| {
                    if let Some(idx) = uri_path.find("orient=") {
                        let sub = &uri_path[idx + 7..];
                        let digits: String = sub.chars().take_while(|c| c.is_ascii_digit()).collect();
                        digits.parse::<u32>().ok()
                    } else {
                        None
                    }
                });
            
            let path_str = uri_path;
            
            // Clean up path
            let path_str = if path_str.starts_with("rr-image://localhost") {
                path_str.strip_prefix("rr-image://localhost").unwrap_or(path_str)
            } else if path_str.starts_with("rr-image://") {
                path_str.strip_prefix("rr-image://").unwrap_or(path_str)
            } else {
                path_str
            };
            
            // Strip any remaining query string if it was URL encoded in the path
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
                // Konvertiert "/C:/Photos/..." oder "\C:\Photos\..." in "C:\Photos\..."
                if (decoded_path.starts_with('/') || decoded_path.starts_with('\\'))
                    && decoded_path.chars().nth(2) == Some(':')
                {
                    decoded_path.remove(0);
                }
                // Backslashes normalisieren
                decoded_path = decoded_path.replace('/', "\\");
            }

            let path = Path::new(&decoded_path);
            
            if is_fullres {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                
                if ["cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2"].contains(&ext.as_str()) {
                    match rapidready_core::thumbnail::get_max_preview_jpeg(path) {
                        Ok(bytes) => {
                            let res = Response::builder()
                                .header("Content-Type", "image/jpeg")
                                .header("Access-Control-Allow-Origin", "*")
                                .header("Cache-Control", "public, max-age=86400, immutable")
                                .body(bytes)
                                .unwrap();
                            responder.respond(res);
                            return;
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
                        let res = Response::builder()
                            .header("Content-Type", content_type)
                            .header("Access-Control-Allow-Origin", "*")
                            .header("Cache-Control", "public, max-age=86400, immutable")
                            .body(final_bytes)
                            .unwrap();
                        responder.respond(res);
                        return;
                    }
                }
            }
            
            let scale = if query.contains("scale=0") {
                0
            } else if query.contains("scale=2") {
                2
            } else {
                1
            };
            let res = match rapidready_core::thumbnail::get_preview_jpeg_with_orient(path, scale, orient_param) {
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
                    if ["jpg", "jpeg", "png"].contains(&ext.as_str()) {
                        if let Ok(bytes) = std::fs::read(path) {
                            let content_type = if ext == "png" { "image/png" } else { "image/jpeg" };
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
            };
            responder.respond(res);
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_source_directory,
            commands::execute_import,
            commands::get_removable_drives,
            commands::scan_archive_directory,
            commands::pause_archive_scan,
            commands::resume_archive_scan,
            commands::cancel_archive_scan,
            commands::set_culling_state,
            commands::set_culling_state_batch,
            commands::rotate_images,
            commands::get_culling_state,
            commands::start_watching_directory,
            commands::delete_files,
            commands::open_in_rapidraw,
            commands::show_in_finder,
            commands::check_path_exists,
            commands::quit_app,
            commands::close_window,
            commands::minimize_window,
            commands::toggle_maximize_window,
            commands::get_image_metadata,
            commands::get_default_pictures_dir,
            commands::show_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
