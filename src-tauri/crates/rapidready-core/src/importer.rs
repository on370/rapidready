use anyhow::Result;
use std::path::Path;
use tokio::fs;
use serde::{Serialize, Deserialize};

use crate::scanner::ScannedFile;
use crate::path_builder::build_target_path;
use crate::import_index::ImportIndex;
use chrono::DateTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProgress {
    pub files_processed: u32,
    pub total_files: u32,
    pub bytes_processed: u64,
    pub total_bytes: u64,
    pub current_file: String,
    pub current_file_path: String,
}

pub async fn execute_import<F>(
    files: Vec<ScannedFile>,
    destination_base: &str,
    template: &str,
    import_index: &ImportIndex,
    mut on_progress: F,
) -> Result<()>
where
    F: FnMut(ImportProgress) + Send + 'static,
{
    let total_files = files.len() as u32;
    let total_bytes: u64 = files.iter().map(|f| f.size).sum();
    let mut files_processed = 0;
    let mut bytes_processed = 0;

    println!("Executing import with {} files to {}", total_files, destination_base);
    let dest_base = Path::new(destination_base);

    for file in files {
        let date = file.date.unwrap_or(DateTime::UNIX_EPOCH.naive_utc());
        
        let relative_dir = build_target_path(template, &date);
        // Strip leading slashes to prevent join from replacing the base path
        let relative_dir_clean = relative_dir.trim_start_matches('/');
        let target_dir = dest_base.join(relative_dir_clean);
        
        // Create directory if it doesn't exist
        if !target_dir.exists() {
            fs::create_dir_all(&target_dir).await?;
        }
        
        let target_path = target_dir.join(&file.name);
        
        // Notify progress before copy
        on_progress(ImportProgress {
            files_processed,
            total_files,
            bytes_processed,
            total_bytes,
            current_file: file.name.clone(),
            current_file_path: target_path.to_string_lossy().into_owned(),
        });
        
        // Copy file
        fs::copy(&file.path, &target_path).await?;
        
        // VERIFY: Hash the copied file and compare with original hash
        let target_hash = crate::hasher::hash_file_head(&target_path)?;
        if target_hash != file.hash {
            fs::remove_file(&target_path).await?;
            return Err(anyhow::anyhow!("Hash mismatch after copy: {}", file.name));
        }
        
        // Mark as imported
        let _ = import_index.mark_imported(
            &file.hash,
            file.size,
            &file.name,
            &target_path.to_string_lossy()
        );
        
        // Update progress
        files_processed += 1;
        bytes_processed += file.size;
        
        // Notify progress after copy
        on_progress(ImportProgress {
            files_processed,
            total_files,
            bytes_processed,
            total_bytes,
            current_file: file.name.clone(),
            current_file_path: target_path.to_string_lossy().into_owned(),
        });
    }

    Ok(())
}
