const fs = require('fs');

let path = 'src-tauri/src/lib.rs';
let content = fs.readFileSync(path, 'utf8');

const newProtocol = `.register_uri_scheme_protocol("rr-image", |_app, request| {
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
                            println!("Preview error for {}: {:?}", uri, e);
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
                    println!("Preview error for {}: {:?}", uri, e);
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
            // Find the closing parenthesis after the brace
            const closeParen = content.indexOf(')', i);
            endIndex = closeParen + 1;
            break;
        }
    }
    
    if (endIndex !== -1) {
        content = content.substring(0, startIndex) + newProtocol + content.substring(endIndex);
        fs.writeFileSync(path, content);
        console.log('Successfully updated lib.rs');
    } else {
        console.log('Failed to find end index');
    }
} else {
    console.log('Failed to find start index');
}
