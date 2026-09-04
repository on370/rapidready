use std::fs::File;
use std::io::Read;
use std::path::Path;
use anyhow::Result;

const CHUNK_SIZE: usize = 64 * 1024; // 64 KB

pub fn hash_file_head(path: &Path) -> Result<String> {
    let file = File::open(path)?;
    let mut buffer = Vec::with_capacity(CHUNK_SIZE);
    
    // Read up to 64KB using take to guarantee reading the full chunk or until EOF
    // Eliminates any short-read discrepancies between slow USB controllers and fast SSDs
    file.take(CHUNK_SIZE as u64).read_to_end(&mut buffer)?;
    
    if buffer.is_empty() {
        return Ok(String::new());
    }
    
    let hash = blake3::hash(&buffer);
    Ok(hash.to_hex().to_string())
}
