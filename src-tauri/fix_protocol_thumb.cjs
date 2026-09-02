const fs = require('fs');

let libPath = 'src/lib.rs';
let libContent = fs.readFileSync(libPath, 'utf8');

const oldStr = `match rapidready_core::raw_extractor::extract_full_res_preview(path) {
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
                    }`;
const newStr = `match rapidready_core::thumbnail::get_preview_jpeg(path, 16) {
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
                    }`;

libContent = libContent.replace(oldStr, newStr);
fs.writeFileSync(libPath, libContent);
console.log('Fixed lib.rs');
