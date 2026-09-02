const fs = require('fs');

let path = 'src-tauri/src/lib.rs';
let content = fs.readFileSync(path, 'utf8');

const newProtocol = `.register_uri_scheme_protocol("rr-image", |_app, request| {
            let uri_obj = request.uri();
            let uri_path = uri_obj.path();
            let query = uri_obj.query().unwrap_or("");
            
            let is_fullres = query.contains("fullres=true") || uri_path.ends_with("%3Ffullres=true") || uri_path.ends_with("?fullres=true");
            
            let path_str = uri_path;
            
            // Clean up path
            let path_str = if path_str.starts_with("rr-image://localhost") {
                path_str.strip_prefix("rr-image://localhost").unwrap_or(path_str)
            } else if path_str.starts_with("rr-image://") {
                path_str.strip_prefix("rr-image://").unwrap_or(path_str)
            } else {
                path_str
            };
            
            // Strip any remaining ?fullres=true if it was URL encoded in the path
            let path_str = if path_str.ends_with("%3Ffullres=true") {
                &path_str[..path_str.len() - 15]
            } else if path_str.ends_with("?fullres=true") {
                &path_str[..path_str.len() - 13]
            } else {
                path_str
            };
            
            let decoded_path = match urlencoding::decode(path_str) {
                Ok(p) => p.into_owned(),
                Err(_) => path_str.to_string(),
            };

            let path = Path::new(&decoded_path);
            
            if is_fullres {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                
                if ["cr2", "cr3", "arw", "nef", "dng", "orf", "raf"].contains(&ext.as_str()) {
                    match rapidready_core::thumbnail::get_preview_jpeg(path, 16) {
                        Ok(bytes) => {
                            return Response::builder()
                                .header("Content-Type", "image/jpeg")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(bytes)
                                .unwrap();
                        }
                        Err(e) => {
                            println!("Preview error for {:?}: {:?}", path, e);
                        }
                    }
                } else {
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
            
            match rapidready_core::thumbnail::get_preview_jpeg(path, 2) {
                Ok(bytes) => {
                    Response::builder()
                        .header("Content-Type", "image/jpeg")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(bytes)
                        .unwrap()
                }
                Err(e) => {
                    println!("Preview error for {:?}: {:?}", path, e);
                    Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap()
                }
            }
        })`;

const startIndex = content.indexOf('.register_uri_scheme_protocol("rr-image"');
if (startIndex !== -1) {
    let brackets = 0;
    let endIndex = -1;
    let foundOpen = false;
    for (let i = startIndex; i < content.length; i++) {
        if (content[i] === '{') {
            brackets++;
            foundOpen = true;
        } else if (content[i] === '}') {
            brackets--;
        }
        
        if (foundOpen && brackets === 0) {
            const closeParen = content.indexOf(')', i);
            endIndex = closeParen + 1;
            break;
        }
    }
    
    if (endIndex !== -1) {
        content = content.substring(0, startIndex) + newProtocol + content.substring(endIndex);
        fs.writeFileSync(path, content);
        console.log('Successfully updated lib.rs');
    }
}
