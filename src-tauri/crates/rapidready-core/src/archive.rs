use serde::{Deserialize, Serialize};
use std::path::Path;
use anyhow::Result;
use walkdir::WalkDir;
use chrono::NaiveDateTime;
use crate::culling::{read_sidecar, CullingState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub date: Option<NaiveDateTime>,
    pub camera: Option<String>,
    pub lens: Option<String>,
    pub iso: Option<String>,
    pub aperture: Option<String>,
    pub shutter: Option<String>,
    pub culling: CullingState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirNode {
    pub name: String,
    pub path: String,
    pub children: Vec<DirNode>,
}

pub fn get_directory_tree(dir: &Path) -> Result<DirNode> {
    let root = DirNode {
        name: dir.file_name().unwrap_or_default().to_string_lossy().into_owned(),
        path: dir.to_string_lossy().into_owned(),
        children: Vec::new(),
    };
    
    // Only go 2-3 levels deep to avoid massive latency
    for entry in WalkDir::new(dir).min_depth(1).max_depth(3).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_dir() {
            // Very simplistic flat return for now, frontend can group it or we can just return flat list of dirs
        }
    }
    
    // Actually, let's just return a flat list of subdirectories to the frontend, and let the frontend render them.
    Ok(root)
}

use rayon::prelude::*;
use crate::date_resolver::get_fast_creation_date;

pub fn scan_archive_directory(dir: &Path) -> Result<Vec<ArchiveFile>> {
    let mut files = Vec::new();
    let supported_exts = [
        "jpg", "jpeg", "png", "tif", "tiff", // Raster
        "cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2", // RAW
    ];

    // Fast filesystem traversal: Collect file info without opening full image/EXIF bodies
    for entry in WalkDir::new(dir).max_depth(4).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if supported_exts.contains(&ext.to_lowercase().as_str()) {
                    let metadata = entry.metadata().ok();
                    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let date = get_fast_creation_date(path, metadata.as_ref());
                    
                    files.push(ArchiveFile {
                        path: path.to_string_lossy().into_owned(),
                        name,
                        size,
                        date,
                        camera: None,
                        lens: None,
                        iso: None,
                        aperture: None,
                        shutter: None,
                        culling: CullingState::default(),
                    });
                }
            }
        }
    }
    
    // Read sidecars in parallel across all CPU cores using Rayon
    files.par_iter_mut().for_each(|f| {
        f.culling = read_sidecar(Path::new(&f.path));
    });
    
    // Sort by name / path
    files.par_sort_unstable_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}
