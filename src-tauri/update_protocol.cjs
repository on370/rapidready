const fs = require('fs');

let libPath = 'src/lib.rs';
let libContent = fs.readFileSync(libPath, 'utf8');

const oldHandler = `.register_uri_scheme_protocol("rr-image", |_app, request| {
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
                }
                Err(_) => {
                    Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap()
                }
            }
        })`;

const newHandler = `.register_uri_scheme_protocol("rr-image", |_app, request| {
            let uri = request.uri().to_string();
            
            // Extract query string
            let (path_part, query_part) = match uri.find('?') {
                Some(idx) => (&uri[..idx], Some(&uri[idx+1..])),
                None => (uri.as_str(), None),
            };
            
            let is_fullres = query_part.unwrap_or("").contains("fullres=true");
            
            let path_str = if path_part.starts_with("rr-image://localhost") {
                path_part.strip_prefix("rr-image://localhost").unwrap_or(path_part)
            } else if path_part.starts_with("rr-image://") {
                path_part.strip_prefix("rr-image://").unwrap_or(path_part)
            } else {
                path_part
            };
            
            let decoded_path = match urlencoding::decode(path_str) {
                Ok(p) => p.into_owned(),
                Err(_) => path_str.to_string(),
            };

            let path = Path::new(&decoded_path);
            
            if is_fullres {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                
                // For RAW files, extract the embedded JPEG. For standard files, just return them.
                if ["cr2", "cr3", "arw", "nef", "dng", "orf", "raf"].contains(&ext.as_str()) {
                    match rapidready_core::raw_extractor::extract_full_res_preview(path) {
                        Ok(bytes) => {
                            return Response::builder()
                                .header("Content-Type", "image/jpeg")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(bytes)
                                .unwrap();
                        }
                        Err(_) => {
                            // Fallback to normal thumbnail logic
                        }
                    }
                } else {
                    // It's a JPG/PNG/TIF, return file directly for maximum quality
                    if let Ok(bytes) = std::fs::read(path) {
                        let content_type = if ext == "png" { "image/png" } else { "image/jpeg" };
                        return Response::builder()
                            .header("Content-Type", content_type)
                            .header("Access-Control-Allow-Origin", "*")
                            .body(bytes)
                            .unwrap();
                    }
                }
            }
            
            // Generate standard JPEG preview (Scale 2 for thumbnails)
            match rapidready_core::thumbnail::get_preview_jpeg(path, 2) {
                Ok(bytes) => {
                    Response::builder()
                        .header("Content-Type", "image/jpeg")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(bytes)
                        .unwrap()
                }
                Err(_) => {
                    Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap()
                }
            }
        })`;

libContent = libContent.replace(oldHandler, newHandler);
fs.writeFileSync(libPath, libContent);
console.log('Updated protocol handler in lib.rs');
