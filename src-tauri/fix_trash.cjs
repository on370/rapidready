const fs = require('fs');

let cmdsPath = 'src/commands.rs';
let cmdsContent = fs.readFileSync(cmdsPath, 'utf8');

const oldDelete = `#[tauri::command]
pub async fn delete_files(paths: Vec<String>, to_trash: bool) -> Result<(), String> {
    for p in paths {
        let path = PathBuf::from(&p);
        if path.exists() {
            if to_trash {
                // Using standard remove for now until we add a trash crate
                std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
            
            // Also delete sidecar
            let sidecar = rapidready_core::culling::get_sidecar_path(&path);
            if sidecar.exists() {
                let _ = std::fs::remove_file(&sidecar);
            }
        }
    }
    Ok(())
}`;

const newDelete = `#[tauri::command]
pub async fn delete_files(paths: Vec<String>, to_trash: bool) -> Result<(), String> {
    for p in paths {
        let path = PathBuf::from(&p);
        if path.exists() {
            if to_trash {
                // MOVE TO OS TRASH!
                trash::delete(&path).map_err(|e| format!("Failed to move to trash: {}", e))?;
            } else {
                std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
            
            // Also delete sidecar (move to trash as well to be safe)
            let sidecar = rapidready_core::culling::get_sidecar_path(&path);
            if sidecar.exists() {
                if to_trash {
                    let _ = trash::delete(&sidecar);
                } else {
                    let _ = std::fs::remove_file(&sidecar);
                }
            }
        }
    }
    Ok(())
}`;

cmdsContent = cmdsContent.replace(oldDelete, newDelete);
fs.writeFileSync(cmdsPath, cmdsContent);
console.log('Fixed Rust Trash');
