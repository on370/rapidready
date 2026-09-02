

pub mod commands;

use std::path::Path;
use tauri::http::Response;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("rr-image", |_app, request| {
            // e.g. rr-image://localhost/Volumes/eMion2T/path/to/img.CR3
            let uri = request.uri().to_string();
            
            
            // Extract the actual path from the URI
            let path_str = if uri.starts_with("rr-image://localhost") {
                uri.strip_prefix("rr-image://localhost").unwrap_or(&uri)
            } else if uri.starts_with("rr-image://") {
                uri.strip_prefix("rr-image://").unwrap_or(&uri)
            } else {
                &uri
            };
            
            // URL decode the path
            let decoded_path = match urlencoding::decode(path_str) {
                Ok(p) => p.into_owned(),
                Err(_) => path_str.to_string(),
            };

            let path = Path::new(&decoded_path);
            
            // Generate JPEG preview
            match rapidready_core::thumbnail::get_preview_jpeg(path, 2) {
                Ok(bytes) => {
                    Response::builder()
                        .header("Content-Type", "image/jpeg")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(bytes)
                        .unwrap()
                },
                Err(e) => {
                    eprintln!("Preview error for {}: {}", decoded_path, e);
                    Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap()
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_source_directory,
            commands::execute_import,
            commands::get_removable_drives,
            commands::scan_archive_directory,
            commands::set_culling_state,
            commands::delete_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
