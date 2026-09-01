use std::fs::File;
use std::io::Read;
use std::path::Path;
use anyhow::Result;

const CHUNK_SIZE: usize = 64 * 1024; // 64 KB

pub fn hash_file_head(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut buffer = [0u8; CHUNK_SIZE];
    
    // Read up to 64KB
    let bytes_read = file.read(&mut buffer)?;
    
    // Hash the read bytes
    let hash = blake3::hash(&buffer[..bytes_read]);
    Ok(hash.to_hex().to_string())
}
