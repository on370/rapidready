use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CullingState {
    pub flag: Option<i8>, // 1 = Pick, -1 = Reject, None/0 = Unrated
    pub rating: u8,       // 0 to 5
    pub color: Option<String>,
    pub tags: Vec<String>,
}

pub fn get_sidecar_path(original_path: &Path) -> PathBuf {
    let mut sidecar = original_path.to_path_buf();
    let ext = sidecar.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
    sidecar.set_extension(format!("{}.rrdata", ext));
    sidecar
}

pub fn read_sidecar(original_path: &Path) -> CullingState {
    let sidecar_path = get_sidecar_path(original_path);
    if let Ok(contents) = fs::read_to_string(&sidecar_path) {
        if let Ok(state) = serde_json::from_str::<CullingState>(&contents) {
            return state;
        }
    }
    CullingState::default()
}

pub fn write_sidecar(original_path: &Path, state: &CullingState) -> anyhow::Result<()> {
    let sidecar_path = get_sidecar_path(original_path);
    let json = serde_json::to_string_pretty(state)?;
    fs::write(&sidecar_path, json)?;
    Ok(())
}
