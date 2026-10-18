use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
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
    let raw = format!("{}_{}_{}_scale{}_rot{}_v2", norm_path, file_size, mtime, scale, orientation);
    blake3::hash(raw.as_bytes()).to_hex().to_string()
}

pub struct ChunkWriter {
    pub current_chunk_id: u32,
    pub current_file: File,
    pub current_offset: u64,
}

#[derive(Clone, Copy, Debug)]
pub struct ChunkLocation {
    pub chunk_file_id: u32,
    pub byte_offset: u64,
    pub byte_length: u32,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CacheStats {
    pub chunk_bytes: u64,
    pub preview_bytes: u64,
    pub chunk_count: usize,
    pub preview_count: usize,
    pub total_cached_items: usize,
}

pub struct PooledReadConn<'a> {
    conn: Option<Connection>,
    pool: &'a Mutex<Vec<Connection>>,
}

impl<'a> std::ops::Deref for PooledReadConn<'a> {
    type Target = Connection;
    fn deref(&self) -> &Self::Target {
        self.conn.as_ref().unwrap()
    }
}

impl<'a> std::ops::DerefMut for PooledReadConn<'a> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.conn.as_mut().unwrap()
    }
}

impl<'a> Drop for PooledReadConn<'a> {
    fn drop(&mut self) {
        if let Some(conn) = self.conn.take() {
            if let Ok(mut pool) = self.pool.lock() {
                if pool.len() < 16 {
                    pool.push(conn);
                }
            }
        }
    }
}

pub struct ChunkCache {
    cache_dir: PathBuf,
    chunks_dir: PathBuf,
    previews_dir: PathBuf,
    db_path: Option<PathBuf>,
    read_pool: Mutex<Vec<Connection>>,
    conn: Arc<Mutex<Connection>>,
    writer: Mutex<Option<ChunkWriter>>,
    max_chunk_size: u64,
    index: RwLock<HashMap<String, ChunkLocation>>,
    open_chunk_files: Mutex<HashMap<u32, Arc<File>>>,
}

static GLOBAL_CHUNK_CACHE: std::sync::RwLock<Option<Arc<ChunkCache>>> = std::sync::RwLock::new(None);

pub fn init_global_chunk_cache(cache_dir: &Path, db_path: &Path) -> Result<Arc<ChunkCache>> {
    let cache = Arc::new(ChunkCache::new(cache_dir, db_path)?);
    let mut guard = GLOBAL_CHUNK_CACHE.write().unwrap();
    *guard = Some(cache.clone());
    Ok(cache)
}

pub fn get_global_chunk_cache() -> Option<Arc<ChunkCache>> {
    GLOBAL_CHUNK_CACHE.read().unwrap().clone()
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
        let mut cache = Self::new_with_conn(cache_dir, Arc::new(Mutex::new(conn)))?;
        cache.db_path = Some(db_path.to_path_buf());
        Ok(cache)
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

        let mut index_map = HashMap::new();
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

            // Load existing chunk index into RAM for zero-SQLite lookups
            if let Ok(mut stmt) = db.prepare("SELECT cache_key, chunk_file_id, byte_offset, byte_length FROM thumbnail_chunks") {
                if let Ok(rows) = stmt.query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        ChunkLocation {
                            chunk_file_id: row.get(1)?,
                            byte_offset: row.get::<_, i64>(2)? as u64,
                            byte_length: row.get::<_, i64>(3)? as u32,
                        },
                    ))
                }) {
                    for r in rows.flatten() {
                        index_map.insert(r.0, r.1);
                    }
                }
            }
        }

        Ok(Self {
            cache_dir: cache_dir.to_path_buf(),
            chunks_dir,
            previews_dir,
            db_path: None,
            read_pool: Mutex::new(Vec::new()),
            conn,
            writer: Mutex::new(None),
            max_chunk_size: DEFAULT_MAX_CHUNK_SIZE,
            index: RwLock::new(index_map),
            open_chunk_files: Mutex::new(HashMap::new()),
        })
    }

    fn get_chunk_file(&self, chunk_id: u32) -> Result<Arc<File>> {
        let mut map = self.open_chunk_files.lock().unwrap();
        if let Some(f) = map.get(&chunk_id) {
            return Ok(f.clone());
        }
        let chunk_path = self.chunks_dir.join(format!("chunk_{:04}.bin", chunk_id));
        let f = Arc::new(
            File::open(&chunk_path)
                .with_context(|| format!("Failed to open chunk file {:?}", chunk_path))?,
        );
        map.insert(chunk_id, f.clone());
        Ok(f)
    }

    fn get_read_conn(&self) -> Result<PooledReadConn<'_>> {
        let db_path = match self.db_path {
            Some(ref p) => p,
            None => anyhow::bail!("No db_path configured for read pool"),
        };

        if let Ok(mut pool) = self.read_pool.lock() {
            if let Some(conn) = pool.pop() {
                return Ok(PooledReadConn {
                    conn: Some(conn),
                    pool: &self.read_pool,
                });
            }
        }

        let conn = Connection::open_with_flags(
            db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
        )
        .or_else(|_| Connection::open(db_path))
        .with_context(|| format!("Failed to open read connection for chunk cache at {:?}", db_path))?;

        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;",
        )?;

        Ok(PooledReadConn {
            conn: Some(conn),
            pool: &self.read_pool,
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

    /// Reads Tier 1 thumbnail from packed binary chunks using zero-SQLite RAM index and pread/seek_read.
    pub fn read_chunk_thumbnail(&self, cache_key: &str) -> Result<Option<Vec<u8>>> {
        let loc = self.index.read().unwrap().get(cache_key).copied();
        if let Some(loc) = loc {
            let file = match self.get_chunk_file(loc.chunk_file_id) {
                Ok(f) => f,
                Err(_) => return Ok(None),
            };
            let mut buf = vec![0u8; loc.byte_length as usize];
            #[cfg(unix)]
            {
                use std::os::unix::fs::FileExt;
                file.read_exact_at(&mut buf, loc.byte_offset)?;
            }
            #[cfg(windows)]
            {
                use std::os::windows::fs::FileExt;
                file.seek_read(&mut buf, loc.byte_offset)?;
            }
            #[cfg(not(any(unix, windows)))]
            {
                let mut f = &*file;
                f.seek(SeekFrom::Start(loc.byte_offset))?;
                f.read_exact(&mut buf)?;
            }
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
                let _ = writer.current_file.flush();
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

        self.index.write().unwrap().insert(
            cache_key.to_string(),
            ChunkLocation {
                chunk_file_id: chunk_id,
                byte_offset: offset,
                byte_length: data.len() as u32,
            },
        );

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
            self.index.read().unwrap().contains_key(cache_key)
        } else {
            self.preview_path(cache_key).is_file()
        }
    }

    /// Targeted invalidation: removes cache entries for given keys from in-memory index,
    /// disk preview files, and thumbnail_chunks table, without wiping other archives.
    pub fn remove_entries_for_keys(&self, keys: &[String]) -> Result<()> {
        if keys.is_empty() {
            return Ok(());
        }
        {
            let mut idx = self.index.write().unwrap();
            for k in keys {
                idx.remove(k);
            }
        }
        for k in keys {
            let p = self.preview_path(k);
            if p.is_file() {
                let _ = fs::remove_file(p);
            }
        }
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("DELETE FROM thumbnail_chunks WHERE cache_key = ?1")?;
        for k in keys {
            let _ = stmt.execute([k]);
        }
        Ok(())
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

        let total: Result<i64, _> = if self.db_path.is_some() {
            if let Ok(conn) = self.get_read_conn() {
                conn.query_row("SELECT COUNT(*) FROM thumbnail_chunks", [], |r| r.get(0))
            } else {
                let conn = self.conn.lock().unwrap();
                conn.query_row("SELECT COUNT(*) FROM thumbnail_chunks", [], |r| r.get(0))
            }
        } else {
            let conn = self.conn.lock().unwrap();
            conn.query_row("SELECT COUNT(*) FROM thumbnail_chunks", [], |r| r.get(0))
        };
        stats.total_cached_items = total.unwrap_or(0) as usize + stats.preview_count;

        Ok(stats)
    }

    /// Wipes all chunk binary segments, preview files, and thumbnail index rows.
    pub fn clear_cache(&self) -> Result<()> {
        {
            let mut writer = self.writer.lock().unwrap();
            *writer = None;
        }

        if let Ok(mut pool) = self.read_pool.lock() {
            pool.clear();
        }

        let _ = fs::remove_dir_all(&self.chunks_dir);
        let _ = fs::remove_dir_all(&self.previews_dir);
        let _ = fs::create_dir_all(&self.chunks_dir);
        let _ = fs::create_dir_all(&self.previews_dir);

        self.index.write().unwrap().clear();
        if let Ok(mut files) = self.open_chunk_files.lock() {
            files.clear();
        }

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
