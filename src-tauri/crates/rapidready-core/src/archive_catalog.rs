use anyhow::{Context, Result};
use chrono::NaiveDateTime;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use walkdir::WalkDir;

use crate::archive::{
    create_archive_file, is_supported_archive_file, ArchiveFile, ArchiveScanProgress,
    ArchiveScanResult, ScanController,
};
use crate::culling::{get_sidecar_path, read_sidecar, CullingState};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ArchiveDeltaResult {
    pub root_path: String,
    pub added: Vec<ArchiveFile>,
    pub updated: Vec<ArchiveFile>,
    pub removed: Vec<String>,
    pub new_dirs: Vec<String>,
}

static GLOBAL_ARCHIVE_CATALOG: OnceLock<Arc<ArchiveCatalog>> = OnceLock::new();

pub fn init_global_catalog(catalog: Arc<ArchiveCatalog>) {
    let _ = GLOBAL_ARCHIVE_CATALOG.set(catalog);
}

pub fn get_global_catalog() -> Option<Arc<ArchiveCatalog>> {
    GLOBAL_ARCHIVE_CATALOG.get().cloned()
}

pub fn get_catalog_metadata_hint(path: &Path) -> Option<(u64, i64, Option<u32>)> {
    let catalog = get_global_catalog()?;
    catalog.get_file_metadata_hint(path)
}

pub struct PooledCatalogReadConn<'a> {
    conn: Option<Connection>,
    pool: &'a Mutex<Vec<Connection>>,
}

impl<'a> std::ops::Deref for PooledCatalogReadConn<'a> {
    type Target = Connection;
    fn deref(&self) -> &Self::Target {
        self.conn.as_ref().unwrap()
    }
}

impl<'a> std::ops::DerefMut for PooledCatalogReadConn<'a> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.conn.as_mut().unwrap()
    }
}

impl<'a> Drop for PooledCatalogReadConn<'a> {
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

#[derive(Debug, Clone)]
pub struct ThumbnailCandidate {
    pub path: String,
    pub size: u64,
    pub mtime: i64,
    pub orientation: Option<u32>,
    pub is_video: bool,
}

pub struct ArchiveCatalog {
    conn: Arc<Mutex<Connection>>,
    db_path: Option<std::path::PathBuf>,
    read_pool: Mutex<Vec<Connection>>,
}

pub fn normalize_canonical_path(path_str: &str) -> String {
    let s = path_str.replace('\\', "/");
    let trimmed = s.trim_end_matches('/');
    #[cfg(not(target_os = "windows"))]
    {
        if trimmed.starts_with("//") {
            let stripped = trimmed.trim_start_matches('/');
            return format!("/{}", stripped);
        }
        trimmed.to_string()
    }
    #[cfg(target_os = "windows")]
    {
        trimmed.to_string()
    }
}



impl ArchiveCatalog {
    pub fn get_read_conn(&self) -> Result<PooledCatalogReadConn<'_>> {
        let db_path = self.db_path.as_ref().context("No db_path configured")?;
        let mut pool = self.read_pool.lock().unwrap();
        let conn = if let Some(c) = pool.pop() {
            c
        } else {
            let c = Connection::open(db_path)?;
            c.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA busy_timeout = 5000;",
            )?;
            c
        };
        Ok(PooledCatalogReadConn {
            conn: Some(conn),
            pool: &self.read_pool,
        })
    }

    pub fn new(app_data_dir: &Path) -> Result<Self> {
        if !app_data_dir.exists() {
            fs::create_dir_all(app_data_dir)?;
        }
        let db_path = app_data_dir.join("archive_catalog.db");
        Self::new_with_db_path(&db_path)
    }

    pub fn new_with_db_path(db_path: &Path) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }

        let conn = Connection::open(db_path)
            .with_context(|| format!("Failed to open archive_catalog database at {:?}", db_path))?;

        // Enable WAL mode, NORMAL synchronous, and busy timeout for high concurrency and no locks
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;",
        )?;

        let catalog = Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: Some(db_path.to_path_buf()),
            read_pool: Mutex::new(Vec::new()),
        };

        catalog.migrate()?;
        Ok(catalog)
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let user_version: u32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

        if user_version == 0 {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS archive_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    canonical_path TEXT NOT NULL UNIQUE,
                    archive_root TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    mtime INTEGER NOT NULL,
                    exif_date TEXT,
                    camera TEXT,
                    lens TEXT,
                    iso TEXT,
                    aperture TEXT,
                    shutter TEXT,
                    is_raw BOOLEAN NOT NULL,
                    is_video BOOLEAN NOT NULL,
                    sidecar_mtime INTEGER,
                    sidecar_culling_json TEXT,
                    indexed_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_archive_root ON archive_files(archive_root);
                CREATE INDEX IF NOT EXISTS idx_canonical_path ON archive_files(canonical_path);

                CREATE TABLE IF NOT EXISTS archive_directories (
                    path TEXT PRIMARY KEY,
                    archive_root TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_dir_root ON archive_directories(archive_root);

                PRAGMA user_version = 1;",
            )?;
        }

        if user_version < 2 {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS archive_meta (
                    root_path TEXT PRIMARY KEY,
                    is_fully_indexed INTEGER NOT NULL DEFAULT 0,
                    last_scan_completed_at INTEGER
                );
                PRAGMA user_version = 2;",
            )?;
        }

        Ok(())
    }

    /// Returns the number of cached files for `root` (or any parent containing `root`).
    pub fn get_cached_count(&self, root: &str) -> Result<usize> {
        let norm_root = normalize_canonical_path(root);
        let pattern = format!("{}/%", norm_root);
        if self.db_path.is_some() {
            if let Ok(conn) = self.get_read_conn() {
                let count: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM archive_files
                     WHERE archive_root = ?1 OR canonical_path = ?1 OR canonical_path LIKE ?2",
                    (&norm_root, &pattern),
                    |row| row.get(0),
                )?;
                return Ok(count as usize);
            }
        }
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM archive_files
             WHERE archive_root = ?1 OR canonical_path = ?1 OR canonical_path LIKE ?2",
            (&norm_root, &pattern),
            |row| row.get(0),
        )?;
        Ok(count as usize)
    }

    /// Phase 1 Instant Grid Boot: Loads cached files and directories in < 30 ms.
    pub fn get_cached_archive_files(&self, root: &str) -> Result<ArchiveScanResult> {
        let norm_root = normalize_canonical_path(root);
        let pattern = format!("{}/%", norm_root);

        let query_fn = |conn: &Connection| -> Result<ArchiveScanResult> {
            let mut stmt = conn.prepare(
                "SELECT canonical_path, filename, file_size, exif_date, camera, lens, iso, aperture, shutter, is_raw, is_video, sidecar_culling_json, mtime
                 FROM archive_files
                 WHERE archive_root = ?1 OR canonical_path = ?1 OR canonical_path LIKE ?2
                 ORDER BY canonical_path ASC"
            )?;

            let file_rows = stmt.query_map((&norm_root, &pattern), |row| {
                let canonical_path: String = row.get(0)?;
                let filename: String = row.get(1)?;
                let file_size: i64 = row.get(2)?;
                let exif_date: Option<String> = row.get(3)?;
                let camera: Option<String> = row.get(4)?;
                let lens: Option<String> = row.get(5)?;
                let iso: Option<String> = row.get(6)?;
                let aperture: Option<String> = row.get(7)?;
                let shutter: Option<String> = row.get(8)?;
                let is_raw: bool = row.get(9)?;
                let is_video: bool = row.get(10)?;
                let sidecar_json: Option<String> = row.get(11)?;
                let mtime: i64 = row.get(12)?;

                let date = exif_date.and_then(|s| {
                    NaiveDateTime::parse_from_str(&s, "%Y-%m-%dT%H:%M:%S")
                        .or_else(|_| NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S"))
                        .or_else(|_| chrono::DateTime::parse_from_rfc3339(&s).map(|dt| dt.naive_utc()))
                        .ok()
                });

                let culling: CullingState = sidecar_json
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default();

                Ok(ArchiveFile {
                    path: canonical_path,
                    name: filename,
                    size: file_size as u64,
                    date,
                    camera,
                    lens,
                    iso,
                    aperture,
                    shutter,
                    culling,
                    is_raw,
                    is_video,
                    mtime,
                })
            })?;

            let mut files = Vec::new();
            for f in file_rows {
                files.push(f?);
            }

            let mut dir_stmt = conn.prepare(
                "SELECT path FROM archive_directories
                 WHERE archive_root = ?1 OR path = ?1 OR path LIKE ?2
                 ORDER BY path ASC"
            )?;

            let dir_rows = dir_stmt.query_map((&norm_root, &pattern), |row| row.get::<_, String>(0))?;
            let mut directories = Vec::new();
            for d in dir_rows {
                directories.push(d?);
            }

            let is_fully_indexed: bool = {
                let status: rusqlite::Result<i64> = conn.query_row(
                    "SELECT is_fully_indexed FROM archive_meta WHERE root_path = ?1",
                    [&norm_root],
                    |row| row.get(0),
                );
                match status {
                    Ok(val) => val != 0,
                    Err(_) => false,
                }
            };

            Ok(ArchiveScanResult {
                files,
                directories,
                is_fully_indexed,
            })
        };

        let result = if self.db_path.is_some() {
            if let Ok(conn) = self.get_read_conn() {
                query_fn(&conn)?
            } else {
                let conn = self.conn.lock().unwrap();
                query_fn(&conn)?
            }
        } else {
            let conn = self.conn.lock().unwrap();
            query_fn(&conn)?
        };


        Ok(result)
    }

    /// Fast indexed lookup of size, mtime, and orientation from local SQLite catalog in < 0.02 ms.
    pub fn get_file_metadata_hint(&self, path: &Path) -> Option<(u64, i64, Option<u32>)> {
        let norm = normalize_canonical_path(&path.to_string_lossy());
        if self.db_path.is_some() {
            if let Ok(conn) = self.get_read_conn() {
                let mut stmt = conn.prepare_cached(
                    "SELECT file_size, mtime, sidecar_culling_json FROM archive_files WHERE canonical_path = ?1"
                ).ok()?;
                let mut rows = stmt.query([&norm]).ok()?;
                if let Ok(Some(row)) = rows.next() {
                    let size: i64 = row.get(0).unwrap_or(0);
                    let mtime: i64 = row.get(1).unwrap_or(0);
                    let sidecar_json: Option<String> = row.get(2).unwrap_or(None);
                    let orient = sidecar_json
                        .and_then(|s| serde_json::from_str::<CullingState>(&s).ok())
                        .and_then(|c| c.orientation);
                    return Some((size as u64, mtime, orient));
                } else {
                    return None;
                }
            }
        }
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare_cached(
            "SELECT file_size, mtime, sidecar_culling_json FROM archive_files WHERE canonical_path = ?1"
        ).ok()?;
        let mut rows = stmt.query([&norm]).ok()?;
        if let Ok(Some(row)) = rows.next() {
            let size: i64 = row.get(0).unwrap_or(0);
            let mtime: i64 = row.get(1).unwrap_or(0);
            let sidecar_json: Option<String> = row.get(2).unwrap_or(None);
            let orient = sidecar_json
                .and_then(|s| serde_json::from_str::<CullingState>(&s).ok())
                .and_then(|c| c.orientation);
            Some((size as u64, mtime, orient))
        } else {
            None
        }
    }

    /// Retrieves lightweight candidate descriptors for all files in an archive root to verify or build chunk thumbnails.
    pub fn get_thumbnail_candidates_for_root(&self, root: &str) -> Result<Vec<ThumbnailCandidate>> {
        let norm_root = normalize_canonical_path(root);
        let pattern = format!("{}/%", norm_root);

        let query_fn = |conn: &Connection| -> Result<Vec<ThumbnailCandidate>> {
            let mut stmt = conn.prepare(
                "SELECT canonical_path, file_size, mtime, sidecar_culling_json, is_video
                 FROM archive_files
                 WHERE archive_root = ?1 OR canonical_path = ?1 OR canonical_path LIKE ?2
                 ORDER BY canonical_path ASC"
            )?;
            let rows = stmt.query_map((&norm_root, &pattern), |row| {
                let canonical_path: String = row.get(0)?;
                let file_size: i64 = row.get(1)?;
                let mtime: i64 = row.get(2)?;
                let sidecar_json: Option<String> = row.get(3)?;
                let is_video: bool = row.get(4)?;
                let orient = sidecar_json
                    .and_then(|s| serde_json::from_str::<CullingState>(&s).ok())
                    .and_then(|c| c.orientation);
                Ok(ThumbnailCandidate {
                    path: canonical_path,
                    size: file_size as u64,
                    mtime,
                    orientation: orient,
                    is_video,
                })
            })?;
            let mut candidates = Vec::new();
            for r in rows {
                candidates.push(r?);
            }
            Ok(candidates)
        };

        if self.db_path.is_some() {
            if let Ok(conn) = self.get_read_conn() {
                return query_fn(&conn);
            }
        }
        let conn = self.conn.lock().unwrap();
        query_fn(&conn)
    }

    /// Upserts files and directories into `archive_catalog.db`.
    pub fn upsert_archive_files(&self, root: &str, files: &[ArchiveFile], directories: &[String]) -> Result<()> {
        if files.is_empty() && directories.is_empty() {
            return Ok(());
        }

        let norm_root = normalize_canonical_path(root);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        {
            let mut file_stmt = tx.prepare(
                "INSERT INTO archive_files (
                    canonical_path, archive_root, filename, file_size, mtime,
                    exif_date, camera, lens, iso, aperture, shutter,
                    is_raw, is_video, sidecar_mtime, sidecar_culling_json, indexed_at
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16
                )
                ON CONFLICT(canonical_path) DO UPDATE SET
                    archive_root = excluded.archive_root,
                    filename = excluded.filename,
                    file_size = excluded.file_size,
                    mtime = excluded.mtime,
                    exif_date = excluded.exif_date,
                    camera = excluded.camera,
                    lens = excluded.lens,
                    iso = excluded.iso,
                    aperture = excluded.aperture,
                    shutter = excluded.shutter,
                    is_raw = excluded.is_raw,
                    is_video = excluded.is_video,
                    sidecar_mtime = excluded.sidecar_mtime,
                    sidecar_culling_json = excluded.sidecar_culling_json,
                    indexed_at = excluded.indexed_at;"
            )?;

            for file in files {
                let norm_path = normalize_canonical_path(&file.path);
                let mtime = if file.mtime != 0 {
                    file.mtime
                } else {
                    let path_obj = Path::new(&file.path);
                    fs::metadata(path_obj)
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0)
                };
                let sidecar_mtime = if file.culling != CullingState::default() {
                    let path_obj = Path::new(&file.path);
                    let sidecar_path = get_sidecar_path(path_obj);
                    fs::metadata(&sidecar_path)
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                } else {
                    None
                };
                let exif_date_str = file.date.map(|d| d.format("%Y-%m-%dT%H:%M:%S").to_string());
                let sidecar_json = serde_json::to_string(&file.culling).ok();

                file_stmt.execute((
                    &norm_path,
                    &norm_root,
                    &file.name,
                    file.size as i64,
                    mtime,
                    exif_date_str,
                    &file.camera,
                    &file.lens,
                    &file.iso,
                    &file.aperture,
                    &file.shutter,
                    file.is_raw,
                    file.is_video,
                    sidecar_mtime,
                    sidecar_json,
                    now,
                ))?;
            }

            let mut dir_stmt = tx.prepare(
                "INSERT INTO archive_directories (path, archive_root)
                 VALUES (?1, ?2)
                 ON CONFLICT(path) DO UPDATE SET archive_root = excluded.archive_root;"
            )?;

            for dir in directories {
                let norm_dir = normalize_canonical_path(dir);
                dir_stmt.execute((&norm_dir, &norm_root))?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    /// Fast sidecar culling update in database when user rates/colors a photo.
    pub fn update_culling(&self, path: &str, culling: &CullingState, sidecar_mtime: Option<i64>) -> Result<()> {
        let norm_path = normalize_canonical_path(path);
        let sidecar_json = serde_json::to_string(culling)?;
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE archive_files
             SET sidecar_culling_json = ?1, sidecar_mtime = ?2
             WHERE canonical_path = ?3",
            (&sidecar_json, sidecar_mtime, &norm_path),
        )?;
        Ok(())
    }

    /// Deletes specific file paths from database.
    pub fn delete_files(&self, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare("DELETE FROM archive_files WHERE canonical_path = ?1")?;
            for p in paths {
                let norm = normalize_canonical_path(p);
                stmt.execute([&norm])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Deletes folder and all contained files from database.
    pub fn delete_folders(&self, folders: &[String]) -> Result<()> {
        if folders.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        {
            let mut file_stmt = tx.prepare(
                "DELETE FROM archive_files WHERE canonical_path = ?1 OR canonical_path LIKE ?2"
            )?;
            let mut dir_stmt = tx.prepare(
                "DELETE FROM archive_directories WHERE path = ?1 OR path LIKE ?2"
            )?;
            for folder in folders {
                let norm = normalize_canonical_path(folder);
                let pattern = format!("{}/%", norm);
                file_stmt.execute((&norm, &pattern))?;
                dir_stmt.execute((&norm, &pattern))?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Typ C: Rebuild / Force Full Re-Index. Wipes catalog for `root`.
    pub fn rebuild_archive_catalog(&self, root: &str) -> Result<()> {
        let norm_root = normalize_canonical_path(root);
        let pattern = format!("{}/%", norm_root);
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM archive_files WHERE archive_root = ?1 OR canonical_path = ?1 OR canonical_path LIKE ?2",
            (&norm_root, &pattern),
        )?;
        tx.execute(
            "DELETE FROM archive_directories WHERE archive_root = ?1 OR path = ?1 OR path LIKE ?2",
            (&norm_root, &pattern),
        )?;
        tx.execute(
            "INSERT INTO archive_meta (root_path, is_fully_indexed, last_scan_completed_at)
             VALUES (?1, 0, NULL)
             ON CONFLICT(root_path) DO UPDATE SET is_fully_indexed = 0",
            [&norm_root],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Checks whether the archive at `root` is fully indexed. Defaults to false if no record exists.
    pub fn is_archive_fully_indexed(&self, root: &str) -> Result<bool> {
        let norm_root = normalize_canonical_path(root);
        let conn = self.conn.lock().unwrap();
        let status: rusqlite::Result<i64> = conn.query_row(
            "SELECT is_fully_indexed FROM archive_meta WHERE root_path = ?1",
            [&norm_root],
            |row| row.get(0),
        );
        match status {
            Ok(val) => Ok(val != 0),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
            Err(e) => Err(anyhow::anyhow!(e)),
        }
    }

    /// Sets indexing completion status for `root`.
    pub fn set_archive_indexing_status(&self, root: &str, is_fully_indexed: bool) -> Result<()> {
        let norm_root = normalize_canonical_path(root);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let val = if is_fully_indexed { 1 } else { 0 };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO archive_meta (root_path, is_fully_indexed, last_scan_completed_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(root_path) DO UPDATE SET
                 is_fully_indexed = excluded.is_fully_indexed,
                 last_scan_completed_at = CASE WHEN excluded.is_fully_indexed = 1 THEN excluded.last_scan_completed_at ELSE archive_meta.last_scan_completed_at END",
            (&norm_root, val, now),
        )?;
        Ok(())
    }

    /// Resets is_fully_indexed flag for all archives when entire disk cache is cleared.
    pub fn reset_all_fully_indexed_flags(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE archive_meta SET is_fully_indexed = 0", [])?;
        Ok(())
    }

    /// Typ B: Inkrementeller Delta-Scan (Hintergrund-Sync).
    /// Recursively traverses directory reading ONLY `(mtime, size)` metadata.
    /// Performs zero EXIF/thumbnail decoding for unchanged files.
    /// Detects new files, updated sidecars, updated files, and tombstone deletions.
    pub fn sync_archive_delta<P>(
        &self,
        root: &Path,
        scan_id: u64,
        controller: &ScanController,
        mut on_progress: P,
    ) -> Result<ArchiveDeltaResult>
    where
        P: FnMut(ArchiveScanProgress),
    {
        let norm_root = normalize_canonical_path(&root.to_string_lossy());
        if !root.exists() || !root.is_dir() {
            return Ok(ArchiveDeltaResult {
                root_path: norm_root,
                added: Vec::new(),
                updated: Vec::new(),
                removed: Vec::new(),
                new_dirs: Vec::new(),
            });
        }

        // 1. Fetch currently known files in SQLite
        let mut known_db_map: HashMap<String, (i64, i64, Option<i64>)> = HashMap::new();
        let mut known_dirs_set: HashSet<String> = HashSet::new();
        {
            let pattern = format!("{}/%", norm_root);
            let populate = |conn: &Connection,
                            map: &mut HashMap<String, (i64, i64, Option<i64>)>,
                            dirs: &mut HashSet<String>|
             -> Result<()> {
                let mut stmt = conn.prepare(
                    "SELECT canonical_path, file_size, mtime, sidecar_mtime
                     FROM archive_files
                     WHERE archive_root = ?1 OR canonical_path = ?1 OR canonical_path LIKE ?2",
                )?;
                let rows = stmt.query_map((&norm_root, &pattern), |row| {
                    let p: String = row.get(0)?;
                    let sz: i64 = row.get(1)?;
                    let mt: i64 = row.get(2)?;
                    let sc: Option<i64> = row.get(3)?;
                    Ok((p, (sz, mt, sc)))
                })?;
                for r in rows {
                    let (p, data) = r?;
                    map.insert(p, data);
                }

                let mut dir_stmt = conn.prepare(
                    "SELECT path FROM archive_directories
                     WHERE archive_root = ?1 OR path = ?1 OR path LIKE ?2",
                )?;
                let dir_rows =
                    dir_stmt.query_map((&norm_root, &pattern), |row| row.get::<_, String>(0))?;
                for d in dir_rows {
                    dirs.insert(d?);
                }
                Ok(())
            };

            if self.db_path.is_some() {
                if let Ok(conn) = self.get_read_conn() {
                    populate(&conn, &mut known_db_map, &mut known_dirs_set)?;
                } else {
                    let conn = self.conn.lock().unwrap();
                    populate(&conn, &mut known_db_map, &mut known_dirs_set)?;
                }
            } else {
                let conn = self.conn.lock().unwrap();
                populate(&conn, &mut known_db_map, &mut known_dirs_set)?;
            }
        }

        let mut seen_files: HashSet<String> = HashSet::new();
        let mut discovered_dirs: HashSet<String> = HashSet::new();
        let mut added_files: Vec<ArchiveFile> = Vec::new();
        let mut updated_files: Vec<ArchiveFile> = Vec::new();
        let mut sidecar_mtimes_on_disk: HashMap<String, i64> = HashMap::new();
        let mut unmodified_candidates: Vec<(String, PathBuf, Option<i64>)> = Vec::new();
        let mut last_progress_time = Instant::now();
        let mut scanned_count = 0usize;
        let mut scanned_bytes = 0u64;

        on_progress(ArchiveScanProgress {
            scan_id,
            files_found: known_db_map.len(),
            total_bytes: 0,
            current_dir: norm_root.clone(),
            is_paused: false,
            is_cancelled: false,
            is_complete: false,
            phase: Some("syncing".to_string()),
            total_files: None,
        });

        // 2. Walk directory reading metadata only
        let walker = WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                if e.file_type().is_dir() {
                    if let Some(name) = e.file_name().to_str() {
                        if name.starts_with('.') && name != "." {
                            return false;
                        }
                        if name.eq_ignore_ascii_case("$RECYCLE.BIN")
                            || name.eq_ignore_ascii_case("System Volume Information")
                        {
                            return false;
                        }
                    }
                }
                true
            });

        let mut entry_counter = 0usize;
        for entry in walker.filter_map(|e| e.ok()) {
            if controller.check_pause_or_cancel() {
                break;
            }

            entry_counter += 1;
            if entry_counter % 64 == 0 {
                if !crate::thumbnail::wait_while_viewport_active(Some(controller)) {
                    break;
                }
            }

            let path = entry.path();
            if entry.file_type().is_dir() {
                if path != root {
                    let dir_norm = normalize_canonical_path(&path.to_string_lossy());
                    discovered_dirs.insert(dir_norm);
                }
                continue;
            }

            if entry.file_type().is_file() {
                let path_str = path.to_string_lossy();
                if path_str.ends_with(".rrdata") {
                    let base_image_str = &path_str[..path_str.len() - 7];
                    let norm_base = normalize_canonical_path(base_image_str);
                    let sc_mtime = entry
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64);
                    if let Some(mt) = sc_mtime {
                        sidecar_mtimes_on_disk.insert(norm_base, mt);
                    }
                    continue;
                }

                if is_supported_archive_file(path) {
                    let norm_path = normalize_canonical_path(&path_str);
                    seen_files.insert(norm_path.clone());
                    scanned_count += 1;

                    let meta = entry.metadata().ok();
                    let file_size = meta.as_ref().map(|m| m.len() as i64).unwrap_or(0);
                    let mtime = meta
                        .as_ref()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);

                    scanned_bytes += file_size.max(0) as u64;

                    if let Some(&(known_size, known_mtime, known_sidecar_mtime)) = known_db_map.get(&norm_path) {
                        if file_size == known_size && mtime == known_mtime {
                            // File unmodified: defer sidecar check until after walk
                            // (avoids thousands of individual fs::metadata SMB round-trips!)
                            unmodified_candidates.push((norm_path.clone(), path.to_path_buf(), known_sidecar_mtime));
                        } else {
                            // File content modified
                            if let Some(af) = create_archive_file(path) {
                                updated_files.push(af);
                            }
                        }
                    } else {
                        // Newly discovered file
                        if let Some(af) = create_archive_file(path) {
                            added_files.push(af);
                        }
                    }

                    if last_progress_time.elapsed().as_millis() >= 200 {
                        last_progress_time = Instant::now();
                        on_progress(ArchiveScanProgress {
                            scan_id,
                            files_found: scanned_count,
                            total_bytes: scanned_bytes,
                            current_dir: norm_path.clone(),
                            is_paused: controller.is_paused(),
                            is_cancelled: controller.is_cancelled(),
                            is_complete: false,
                            phase: Some("syncing".to_string()),
                            total_files: None,
                        });
                    }
                }
            }
        }

        // 2b. Check sidecars for unmodified files in-memory using sidecar_mtimes_on_disk (O(1), zero SMB calls!)
        for (norm_path, orig_path, known_sidecar_mtime) in unmodified_candidates {
            if controller.check_pause_or_cancel() {
                break;
            }
            let current_sidecar_mtime = sidecar_mtimes_on_disk.get(&norm_path).copied();
            if current_sidecar_mtime != known_sidecar_mtime {
                // Sidecar changed or was added/removed: update culling in DB and emit to updated_files
                let culling = if current_sidecar_mtime.is_some() {
                    read_sidecar(&orig_path)
                } else {
                    CullingState::default()
                };
                let _ = self.update_culling(&norm_path, &culling, current_sidecar_mtime);
                if let Some(mut af) = create_archive_file(&orig_path) {
                    af.culling = culling;
                    updated_files.push(af);
                }
            }
        }

        if controller.is_cancelled() {
            on_progress(ArchiveScanProgress {
                scan_id,
                files_found: scanned_count,
                total_bytes: scanned_bytes,
                current_dir: String::new(),
                is_paused: false,
                is_cancelled: true,
                is_complete: false,
                phase: Some("syncing".to_string()),
                total_files: None,
            });
            return Ok(ArchiveDeltaResult {
                root_path: norm_root,
                added: Vec::new(),
                updated: Vec::new(),
                removed: Vec::new(),
                new_dirs: Vec::new(),
            });
        }

        // 3. Tombstone reconciliation: detect deleted files
        let mut removed_paths: Vec<String> = Vec::new();
        for (known_path, _) in &known_db_map {
            if !seen_files.contains(known_path) && !Path::new(known_path).exists() {
                removed_paths.push(known_path.clone());
            }
        }

        // 4. Directory reconciliation
        let new_dirs: Vec<String> = discovered_dirs
            .iter()
            .filter(|d| !known_dirs_set.contains(*d))
            .cloned()
            .collect();

        let removed_dirs: Vec<String> = known_dirs_set
            .iter()
            .filter(|d| !discovered_dirs.contains(*d) && !Path::new(d).exists())
            .cloned()
            .collect();

        // 5. Commit changes to catalog
        if !added_files.is_empty() || !new_dirs.is_empty() {
            let _ = self.upsert_archive_files(&norm_root, &added_files, &new_dirs);
        }
        if !updated_files.is_empty() {
            let _ = self.upsert_archive_files(&norm_root, &updated_files, &[]);
        }
        if !removed_paths.is_empty() {
            let _ = self.delete_files(&removed_paths);
        }
        if !removed_dirs.is_empty() {
            let _ = self.delete_folders(&removed_dirs);
        }

        let is_cancelled = controller.is_cancelled();
        if !is_cancelled && (!added_files.is_empty() || !updated_files.is_empty()) {
            let _ = self.set_archive_indexing_status(&norm_root, false);
        }
        on_progress(ArchiveScanProgress {
            scan_id,
            files_found: scanned_count,
            total_bytes: scanned_bytes,
            current_dir: String::new(),
            is_paused: false,
            is_cancelled,
            is_complete: !is_cancelled,
            phase: Some("syncing".to_string()),
            total_files: Some(scanned_count),
        });

        Ok(ArchiveDeltaResult {
            root_path: norm_root,
            added: added_files,
            updated: updated_files,
            removed: removed_paths,
            new_dirs,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn test_catalog_init_and_query_cached_files() {
        let temp_dir = std::env::temp_dir().join(format!("rr_catalog_test1_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();
        let db_path = temp_dir.join("archive_catalog.db");
        let catalog = ArchiveCatalog::new_with_db_path(&db_path).unwrap();

        assert_eq!(catalog.get_cached_count("/photos").unwrap(), 0);

        let files = vec![
            ArchiveFile {
                path: "/photos/2024/img1.jpg".into(),
                name: "img1.jpg".into(),
                size: 2048,
                date: None,
                camera: Some("Sony A7IV".into()),
                lens: None,
                iso: None,
                aperture: None,
                shutter: None,
                culling: CullingState::default(),
                is_raw: false,
                is_video: false,
                mtime: 1700000000,
            },
            ArchiveFile {
                path: "/photos/2024/sub/img2.arw".into(),
                name: "img2.arw".into(),
                size: 40960,
                date: None,
                camera: Some("Sony A7IV".into()),
                lens: None,
                iso: None,
                aperture: None,
                shutter: None,
                culling: CullingState::default(),
                is_raw: true,
                is_video: false,
                mtime: 1700000001,
            },
        ];
        let dirs = vec!["/photos/2024".into(), "/photos/2024/sub".into()];

        catalog.upsert_archive_files("/photos", &files, &dirs).unwrap();

        // 1. Root query
        assert_eq!(catalog.get_cached_count("/photos").unwrap(), 2);
        let result = catalog.get_cached_archive_files("/photos").unwrap();
        assert_eq!(result.files.len(), 2);
        assert_eq!(result.directories.len(), 2);

        // 2. Hierarchical inheritance: sub-location inherits parent entries immediately!
        assert_eq!(catalog.get_cached_count("/photos/2024/sub").unwrap(), 1);
        let sub_result = catalog.get_cached_archive_files("/photos/2024/sub").unwrap();
        assert_eq!(sub_result.files.len(), 1);
        assert_eq!(sub_result.files[0].name, "img2.arw");
        assert!(sub_result.files[0].is_raw);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_delta_sync_added_modified_tombstone() {
        let temp_dir = std::env::temp_dir().join(format!("rr_catalog_test2_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let root = temp_dir.join("photo_archive");
        fs::create_dir_all(&root).unwrap();

        let db_path = temp_dir.join("archive_catalog.db");
        let catalog = ArchiveCatalog::new_with_db_path(&db_path).unwrap();

        // Create file 1
        let f1_path = root.join("photo1.jpg");
        {
            let mut f = File::create(&f1_path).unwrap();
            f.write_all(b"image data 1").unwrap();
        }

        // Run initial delta sync (equivalent to indexing)
        let controller = ScanController::new();
        let delta1 = catalog.sync_archive_delta(&root, 1, &controller, |_| {}).unwrap();
        assert_eq!(delta1.added.len(), 1);
        assert_eq!(delta1.removed.len(), 0);
        assert_eq!(catalog.get_cached_count(&root.to_string_lossy()).unwrap(), 1);

        // Second delta sync without changes: zero added, zero updated
        let delta2 = catalog.sync_archive_delta(&root, 2, &controller, |_| {}).unwrap();
        assert_eq!(delta2.added.len(), 0);
        assert_eq!(delta2.updated.len(), 0);
        assert_eq!(delta2.removed.len(), 0);

        // Add file 2, and delete file 1
        let f2_path = root.join("photo2.jpg");
        {
            let mut f = File::create(&f2_path).unwrap();
            f.write_all(b"image data 2").unwrap();
        }
        fs::remove_file(&f1_path).unwrap();

        let delta3 = catalog.sync_archive_delta(&root, 3, &controller, |_| {}).unwrap();
        assert_eq!(delta3.added.len(), 1);
        assert_eq!(delta3.added[0].name, "photo2.jpg");
        assert_eq!(delta3.removed.len(), 1);
        assert!(delta3.removed[0].ends_with("photo1.jpg"));

        // Verify catalog updated correctly
        assert_eq!(catalog.get_cached_count(&root.to_string_lossy()).unwrap(), 1);
        let cached = catalog.get_cached_archive_files(&root.to_string_lossy()).unwrap();
        assert_eq!(cached.files.len(), 1);
        assert_eq!(cached.files[0].name, "photo2.jpg");

        // Rebuild catalog wipes everything
        catalog.rebuild_archive_catalog(&root.to_string_lossy()).unwrap();
        assert_eq!(catalog.get_cached_count(&root.to_string_lossy()).unwrap(), 0);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_archive_indexing_status() {
        let temp_dir = std::env::temp_dir().join(format!("rr_catalog_meta_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let root = temp_dir.join("photo_archive");
        fs::create_dir_all(&root).unwrap();

        let db_path = temp_dir.join("archive_catalog.db");
        let catalog = ArchiveCatalog::new_with_db_path(&db_path).unwrap();

        let root_str = root.to_string_lossy();
        // Unindexed default (no record yet) returns false
        assert!(!catalog.is_archive_fully_indexed(&root_str).unwrap());

        // Explicitly set incomplete (e.g. scan started or interrupted)
        catalog.set_archive_indexing_status(&root_str, false).unwrap();
        assert!(!catalog.is_archive_fully_indexed(&root_str).unwrap());

        let res = catalog.get_cached_archive_files(&root_str).unwrap();
        assert!(!res.is_fully_indexed);

        // Mark completed
        catalog.set_archive_indexing_status(&root_str, true).unwrap();
        assert!(catalog.is_archive_fully_indexed(&root_str).unwrap());
        let res2 = catalog.get_cached_archive_files(&root_str).unwrap();
        assert!(res2.is_fully_indexed);

        // Rebuild resets to incomplete
        catalog.rebuild_archive_catalog(&root_str).unwrap();
        assert!(!catalog.is_archive_fully_indexed(&root_str).unwrap());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_normalize_canonical_path() {
        #[cfg(not(target_os = "windows"))]
        {
            assert_eq!(normalize_canonical_path("//Volumes/Media/Photos"), "/Volumes/Media/Photos");
            assert_eq!(normalize_canonical_path("///Volumes/Media/Photos/"), "/Volumes/Media/Photos");
            assert_eq!(normalize_canonical_path("/Volumes/Media/Photos"), "/Volumes/Media/Photos");
        }
        assert_eq!(normalize_canonical_path("C:\\Photos\\Archive\\"), "C:/Photos/Archive");
    }
}
