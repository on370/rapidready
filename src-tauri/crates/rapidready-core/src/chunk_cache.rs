use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use anyhow::{Context, Result};
use rusqlite::Connection;

pub const DEFAULT_MAX_CHUNK_SIZE: u64 = 128 * 1024 * 1024; // 128 MB

/// Canonical BLAKE3 Cache-Key for Thumbnails & Screen Previews.
/// Key = BLAKE3(normalize_path(path) + "_" + file_size + "_" + mtime + "_scale" + scale + "_rot" + orientation)
pub fn compute_cache_key(
    path: &Path,
    file_size: u64,
    mtime: i64,
    scale: u32,
    orientation: u32,
) -> String {
    let norm_path = crate::archive_catalog::normalize_canonical_path(&path.to_string_lossy());
    let raw = format!("{}_{}_{}_scale{}_rot{}", norm_path, file_size, mtime, scale, orientation);
    blake3::hash(raw.as_bytes()).to_hex().to_string()
}

pub struct ChunkWriter {
    pub current_chunk_id: u32,
    pub current_file: File,
    pub current_offset: u64,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CacheStats {
    pub chunk_bytes: u64,
    pub preview_bytes: u64,
    pub chunk_count: usize,
    pub preview_count: usize,
    pub total_cached_items: usize,
}

pub struct ChunkCache {
    cache_dir: PathBuf,
    chunks_dir: PathBuf,
    previews_dir: PathBuf,
    conn: Arc<Mutex<Connection>>,
    writer: Mutex<Option<ChunkWriter>>,
    max_chunk_size: u64,
}

static GLOBAL_CHUNK_CACHE: OnceLock<Arc<ChunkCache>> = OnceLock::new();

pub fn init_global_chunk_cache(cache_dir: &Path, db_path: &Path) -> Result<Arc<ChunkCache>> {
    let cache = Arc::new(ChunkCache::new(cache_dir, db_path)?);
    let _ = GLOBAL_CHUNK_CACHE.set(cache.clone());
    Ok(cache)
}

pub fn get_global_chunk_cache() -> Option<Arc<ChunkCache>> {
    GLOBAL_CHUNK_CACHE.get().cloned()
}

impl ChunkCache {
    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }
    pub fn new(cache_dir: &Path, db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)
            .with_context(|| format!("Failed to open database for chunk cache at {:?}", db_path))?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;",
        )?;
        Self::new_with_conn(cache_dir, Arc::new(Mutex::new(conn)))
    }

    pub fn new_with_conn(cache_dir: &Path, conn: Arc<Mutex<Connection>>) -> Result<Self> {
        let chunks_dir = cache_dir.join("chunks");
        let previews_dir = cache_dir.join("previews");

        if !chunks_dir.exists() {
            fs::create_dir_all(&chunks_dir)?;
        }
        if !previews_dir.exists() {
            fs::create_dir_all(&previews_dir)?;
        }

        {
            let db = conn.lock().unwrap();
            db.execute_batch(
                "CREATE TABLE IF NOT EXISTS thumbnail_chunks (
                    cache_key TEXT PRIMARY KEY,
                    chunk_file_id INTEGER NOT NULL,
                    byte_offset INTEGER NOT NULL,
                    byte_length INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_thumbnail_chunk_file_id ON thumbnail_chunks(chunk_file_id);",
            )?;
        }

        Ok(Self {
            cache_dir: cache_dir.to_path_buf(),
            chunks_dir,
            previews_dir,
            conn,
            writer: Mutex::new(None),
            max_chunk_size: DEFAULT_MAX_CHUNK_SIZE,
        })
    }

    #[cfg(test)]
    pub fn set_max_chunk_size(&mut self, size: u64) {
        self.max_chunk_size = size;
    }

    fn init_writer_locked(&self, guard: &mut Option<ChunkWriter>) -> Result<()> {
        if guard.is_some() {
            return Ok(());
        }
        let mut highest_id = 1u32;
        if let Ok(entries) = fs::read_dir(&self.chunks_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.starts_with("chunk_") && name.ends_with(".bin") {
                    let id_str = &name[6..name.len() - 4];
                    if let Ok(id) = id_str.parse::<u32>() {
                        if id > highest_id {
                            highest_id = id;
                        }
                    }
                }
            }
        }

        let mut chunk_path = self.chunks_dir.join(format!("chunk_{:04}.bin", highest_id));
        let current_len = fs::metadata(&chunk_path).map(|m| m.len()).unwrap_or(0);

        let (target_id, file, offset) = if current_len >= self.max_chunk_size {
            let next_id = highest_id + 1;
            chunk_path = self.chunks_dir.join(format!("chunk_{:04}.bin", next_id));
            let f = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&chunk_path)
                .with_context(|| format!("Failed to create chunk file {:?}", chunk_path))?;
            (next_id, f, 0)
        } else {
            let f = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&chunk_path)
                .with_context(|| format!("Failed to open chunk file {:?}", chunk_path))?;
            (highest_id, f, current_len)
        };

        *guard = Some(ChunkWriter {
            current_chunk_id: target_id,
            current_file: file,
            current_offset: offset,
        });
        Ok(())
    }

    /// Reads Tier 1 thumbnail from packed binary chunks.
    pub fn read_chunk_thumbnail(&self, cache_key: &str) -> Result<Option<Vec<u8>>> {
        let loc = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare(
                "SELECT chunk_file_id, byte_offset, byte_length FROM thumbnail_chunks WHERE cache_key = ?1",
            )?;
            let mut rows = stmt.query([cache_key])?;
            if let Some(row) = rows.next()? {
                let chunk_file_id: u32 = row.get(0)?;
                let byte_offset: i64 = row.get(1)?;
                let byte_length: i64 = row.get(2)?;
                Some((chunk_file_id, byte_offset as u64, byte_length as usize))
            } else {
                None
            }
        };

        if let Some((chunk_id, offset, length)) = loc {
            let chunk_path = self.chunks_dir.join(format!("chunk_{:04}.bin", chunk_id));
            if !chunk_path.exists() {
                return Ok(None);
            }
            let mut file = File::open(&chunk_path)
                .with_context(|| format!("Failed to open chunk file {:?}", chunk_path))?;
            file.seek(SeekFrom::Start(offset))?;
            let mut buf = vec![0u8; length];
            file.read_exact(&mut buf)?;
            return Ok(Some(buf));
        }
        Ok(None)
    }

    /// Appends Tier 1 thumbnail into packed binary chunks and records offset in SQLite.
    pub fn write_chunk_thumbnail(&self, cache_key: &str, data: &[u8]) -> Result<()> {
        if data.is_empty() {
            return Ok(());
        }

        let data_len = data.len() as u64;

        let (chunk_id, offset) = {
            let mut guard = self.writer.lock().unwrap();
            if guard.is_none() {
                self.init_writer_locked(&mut guard)?;
            }
            let writer = guard.as_mut().expect("Writer must be initialized");

            if writer.current_offset + data_len > self.max_chunk_size {
                let next_id = writer.current_chunk_id + 1;
                let chunk_path = self.chunks_dir.join(format!("chunk_{:04}.bin", next_id));
                let next_file = OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&chunk_path)
                    .with_context(|| format!("Failed to create chunk file {:?}", chunk_path))?;
                *writer = ChunkWriter {
                    current_chunk_id: next_id,
                    current_file: next_file,
                    current_offset: 0,
                };
            }

            let start_offset = writer.current_offset;
            writer.current_file.write_all(data)?;
            writer.current_file.flush()?;
            writer.current_offset += data_len;
            (writer.current_chunk_id, start_offset)
        };

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO thumbnail_chunks (cache_key, chunk_file_id, byte_offset, byte_length, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(cache_key) DO UPDATE SET
                 chunk_file_id = excluded.chunk_file_id,
                 byte_offset = excluded.byte_offset,
                 byte_length = excluded.byte_length,
                 created_at = excluded.created_at",
            (cache_key, chunk_id, offset as i64, data.len() as i64, now),
        )?;

        Ok(())
    }

    /// Computes file path for Tier 2 sharded preview:
    /// previews/{hash[0..2]}/{hash[2..4]}/{hash}.jpg
    pub fn preview_path(&self, cache_key: &str) -> PathBuf {
        let prefix1 = if cache_key.len() >= 2 { &cache_key[0..2] } else { "00" };
        let prefix2 = if cache_key.len() >= 4 { &cache_key[2..4] } else { "00" };
        self.previews_dir.join(prefix1).join(prefix2).join(format!("{}.jpg", cache_key))
    }

    /// Reads Tier 2 Screen Preview from sharded filesystem tree.
    pub fn read_preview(&self, cache_key: &str) -> Result<Option<Vec<u8>>> {
        let p = self.preview_path(cache_key);
        if p.is_file() {
            Ok(Some(fs::read(p)?))
        } else {
            Ok(None)
        }
    }

    /// Writes Tier 2 Screen Preview into sharded filesystem tree atomically.
    pub fn write_preview(&self, cache_key: &str, data: &[u8]) -> Result<()> {
        if data.is_empty() {
            return Ok(());
        }

        let p = self.preview_path(cache_key);
        if let Some(parent) = p.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }

        let tmp = p.with_extension(format!("tmp_{}", std::process::id()));
        fs::write(&tmp, data)?;
        fs::rename(tmp, p)?;
        Ok(())
    }

    /// Unified Reader: Tier 1 (scale < 2) reads from packed chunks; Tier 2 (scale >= 2) reads from sharded previews.
    pub fn read_thumbnail(&self, cache_key: &str, scale: u32) -> Result<Option<Vec<u8>>> {
        if scale < 2 {
            self.read_chunk_thumbnail(cache_key)
        } else {
            self.read_preview(cache_key)
        }
    }

    /// Unified Writer: Tier 1 (scale < 2) writes to packed chunks; Tier 2 (scale >= 2) writes to sharded previews.
    pub fn write_thumbnail(&self, cache_key: &str, scale: u32, data: &[u8]) -> Result<()> {
        if scale < 2 {
            self.write_chunk_thumbnail(cache_key, data)
        } else {
            self.write_preview(cache_key, data)
        }
    }

    /// Checks whether thumbnail or preview is present in cache without reading its full payload.
    pub fn has_thumbnail(&self, cache_key: &str, scale: u32) -> bool {
        if scale < 2 {
            let loc = {
                let conn = self.conn.lock().unwrap();
                let mut stmt = match conn.prepare(
                    "SELECT chunk_file_id FROM thumbnail_chunks WHERE cache_key = ?1",
                ) {
                    Ok(s) => s,
                    Err(_) => return false,
                };
                let mut rows = match stmt.query([cache_key]) {
                    Ok(r) => r,
                    Err(_) => return false,
                };
                if let Ok(Some(row)) = rows.next() {
                    let id: u32 = row.get(0).unwrap_or(0);
                    Some(id)
                } else {
                    None
                }
            };
            if let Some(chunk_id) = loc {
                self.chunks_dir.join(format!("chunk_{:04}.bin", chunk_id)).is_file()
            } else {
                false
            }
        } else {
            self.preview_path(cache_key).is_file()
        }
    }

    /// Computes total size and item counts for cache statistics.
    pub fn get_stats(&self) -> Result<CacheStats> {
        let mut stats = CacheStats::default();

        if let Ok(entries) = fs::read_dir(&self.chunks_dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        stats.chunk_bytes += meta.len();
                        stats.chunk_count += 1;
                    }
                }
            }
        }

        if self.previews_dir.exists() {
            for entry in walkdir::WalkDir::new(&self.previews_dir).into_iter().flatten() {
                if entry.file_type().is_file() {
                    if let Ok(meta) = entry.metadata() {
                        stats.preview_bytes += meta.len();
                        stats.preview_count += 1;
                    }
                }
            }
        }

        let conn = self.conn.lock().unwrap();
        let total: Result<i64, _> = conn.query_row(
            "SELECT COUNT(*) FROM thumbnail_chunks",
            [],
            |r| r.get(0),
        );
        stats.total_cached_items = total.unwrap_or(0) as usize + stats.preview_count;

        Ok(stats)
    }

    /// Wipes all chunk binary segments, preview files, and thumbnail index rows.
    pub fn clear_cache(&self) -> Result<()> {
        {
            let mut writer = self.writer.lock().unwrap();
            *writer = None;
        }

        let _ = fs::remove_dir_all(&self.chunks_dir);
        let _ = fs::remove_dir_all(&self.previews_dir);
        let _ = fs::create_dir_all(&self.chunks_dir);
        let _ = fs::create_dir_all(&self.previews_dir);

        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM thumbnail_chunks", [])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_cache_key() {
        let p = Path::new("/photos/2026/sample.arw");
        let k1 = compute_cache_key(p, 25000000, 1720000000, 1, 1);
        let k2 = compute_cache_key(p, 25000000, 1720000000, 1, 1);
        assert_eq!(k1, k2, "Identical file attributes must produce identical BLAKE3 keys");

        // Scale changed
        let k_scale = compute_cache_key(p, 25000000, 1720000000, 2, 1);
        assert_ne!(k1, k_scale);

        // Rotation changed
        let k_rot = compute_cache_key(p, 25000000, 1720000000, 1, 6);
        assert_ne!(k1, k_rot);

        // Mtime changed
        let k_mtime = compute_cache_key(p, 25000000, 1720000001, 1, 1);
        assert_ne!(k1, k_mtime);
    }

    #[test]
    fn test_chunk_cache_tier1_roundtrip_and_segmentation() {
        let temp_dir = std::env::temp_dir().join(format!("rr_chunk_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let db_path = temp_dir.join("catalog.db");
        let cache_dir = temp_dir.join("cache");
        let mut cache = ChunkCache::new(&cache_dir, &db_path).unwrap();

        // Set small chunk threshold to trigger segmentation across multiple chunk files
        cache.set_max_chunk_size(1024); // 1 KB max chunk

        let thumb1 = vec![0xAA; 600];
        let thumb2 = vec![0xBB; 600]; // Exceeds 1024 bytes -> triggers chunk_0002.bin!
        let thumb3 = vec![0xCC; 300];

        cache.write_thumbnail("key1", 0, &thumb1).unwrap();
        cache.write_thumbnail("key2", 1, &thumb2).unwrap();
        cache.write_thumbnail("key3", 1, &thumb3).unwrap();

        // Verify retrieval
        let r1 = cache.read_thumbnail("key1", 0).unwrap().expect("Must read thumb1");
        assert_eq!(r1, thumb1);

        let r2 = cache.read_thumbnail("key2", 1).unwrap().expect("Must read thumb2");
        assert_eq!(r2, thumb2);

        let r3 = cache.read_thumbnail("key3", 1).unwrap().expect("Must read thumb3");
        assert_eq!(r3, thumb3);

        assert!(cache.has_thumbnail("key1", 0));
        assert!(cache.has_thumbnail("key2", 1));
        assert!(!cache.has_thumbnail("nonexistent", 0));
        assert_eq!(cache.cache_dir(), cache_dir.as_path());

        // Non-existent key
        assert!(cache.read_thumbnail("nonexistent", 0).unwrap().is_none());

        // Verify segmentation created multiple chunk files
        let chunk1_path = cache_dir.join("chunks/chunk_0001.bin");
        let chunk2_path = cache_dir.join("chunks/chunk_0002.bin");
        assert!(chunk1_path.exists());
        assert!(chunk2_path.exists());

        // Verify re-opening existing cache continues correctly
        drop(cache);
        let cache_reopened = ChunkCache::new(&cache_dir, &db_path).unwrap();
        let r1_again = cache_reopened.read_thumbnail("key1", 0).unwrap().unwrap();
        assert_eq!(r1_again, thumb1);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_chunk_cache_tier2_preview_roundtrip() {
        let temp_dir = std::env::temp_dir().join(format!("rr_preview_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let db_path = temp_dir.join("catalog.db");
        let cache_dir = temp_dir.join("cache");
        let cache = ChunkCache::new(&cache_dir, &db_path).unwrap();

        let preview_data = b"SIMULATED_2048PX_PREVIEW_JPEG_BYTES";
        let key = "abcdef1234567890";

        cache.write_thumbnail(key, 2, preview_data).unwrap();

        let read_back = cache.read_thumbnail(key, 2).unwrap().expect("Must read preview");
        assert_eq!(read_back, preview_data);
        assert!(cache.has_thumbnail(key, 2));
        assert!(!cache.has_thumbnail("nonexistent", 2));

        // Verify sharded path structure
        let expected_path = cache_dir.join("previews/ab/cd/abcdef1234567890.jpg");
        assert!(expected_path.exists());

        let stats = cache.get_stats().unwrap();
        assert_eq!(stats.preview_count, 1);
        assert_eq!(stats.preview_bytes, preview_data.len() as u64);

        // Clear cache
        cache.clear_cache().unwrap();
        assert!(!expected_path.exists());
        assert!(cache.read_thumbnail(key, 2).unwrap().is_none());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
