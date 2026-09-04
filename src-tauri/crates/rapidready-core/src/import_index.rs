use rusqlite::{Connection, OptionalExtension};
use std::path::Path;
use anyhow::{Result, Context};
use std::sync::{Arc, Mutex};
use std::fs;

pub struct ImportIndex {
    conn: Arc<Mutex<Connection>>,
}

impl ImportIndex {
    pub fn new(app_data_dir: &Path) -> Result<Self> {
        if !app_data_dir.exists() {
            fs::create_dir_all(app_data_dir)?;
        }
        
        let db_path = app_data_dir.join("import_index.db");
        let conn = Connection::open(&db_path)
            .context("Failed to open import_index database")?;
            
        // Enable WAL mode for safety and concurrency
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;",
        )?;

        let mut index = Self {
            conn: Arc::new(Mutex::new(conn)),
        };

        index.migrate()?;
        
        Ok(index)
    }

    fn migrate(&mut self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let user_version: u32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

        if user_version == 0 {
            conn.execute(
                "CREATE TABLE imported_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_hash TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    original_name TEXT NOT NULL,
                    target_path TEXT NOT NULL,
                    import_date DATETIME DEFAULT CURRENT_TIMESTAMP
                )",
                [],
            )?;
            conn.execute(
                "CREATE INDEX idx_hash_size ON imported_files (file_hash, file_size)",
                [],
            )?;
            conn.execute("PRAGMA user_version = 1", [])?;
        }

        Ok(())
    }

    pub fn is_imported(&self, file_hash: &str, file_size: u64) -> Result<bool> {
        if file_hash.is_empty() || file_size == 0 {
            return Ok(false);
        }
        let conn = self.conn.lock().unwrap();
        let exists: Option<i32> = conn.query_row(
            "SELECT 1 FROM imported_files WHERE file_hash = ?1 AND file_size = ?2 LIMIT 1",
            (file_hash, file_size as i64),
            |row| row.get(0),
        ).optional()?;

        Ok(exists.is_some())
    }

    pub fn mark_imported(&self, file_hash: &str, file_size: u64, original_name: &str, target_path: &str) -> Result<()> {
        if file_hash.is_empty() || file_size == 0 {
            return Ok(());
        }
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO imported_files (file_hash, file_size, original_name, target_path) VALUES (?1, ?2, ?3, ?4)",
            (file_hash, file_size as i64, original_name, target_path),
        )?;
        Ok(())
    }

    pub fn get_imported_sizes(&self) -> Result<std::collections::HashSet<u64>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT DISTINCT file_size FROM imported_files")?;
        let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
        let mut sizes = std::collections::HashSet::new();
        for s in rows.flatten() {
            if s >= 0 {
                sizes.insert(s as u64);
            }
        }
        Ok(sizes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_import_index_sizes() {
        let temp_dir = std::env::temp_dir().join(format!("rr_idx_test_{}", std::process::id()));
        let index = ImportIndex::new(&temp_dir).unwrap();

        let initial_sizes = index.get_imported_sizes().unwrap();
        assert!(initial_sizes.is_empty());

        index.mark_imported("hash123", 1024, "test.jpg", "/dest/test.jpg").unwrap();
        index.mark_imported("hash456", 2048, "test2.jpg", "/dest/test2.jpg").unwrap();

        let sizes = index.get_imported_sizes().unwrap();
        assert_eq!(sizes.len(), 2);
        assert!(sizes.contains(&1024));
        assert!(sizes.contains(&2048));
        assert!(!sizes.contains(&4096));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_import_index_false_positive_prevention() {
        let temp_dir = std::env::temp_dir().join(format!("rr_idx_fp_test_{}", std::process::id()));
        let index = ImportIndex::new(&temp_dir).unwrap();

        // 1. Empty hash / zero size never matches
        assert!(!index.is_imported("", 1024).unwrap());
        assert!(!index.is_imported("somehash", 0).unwrap());
        assert!(!index.is_imported("", 0).unwrap());

        // 2. Mark imported file A
        index.mark_imported("hashA", 5000, "IMG_0001.CR3", "/dest/IMG_0001.CR3").unwrap();

        // 3. File B has identical size 5000, but different hash -> MUST NOT match (No false positive!)
        assert!(!index.is_imported("hashB", 5000).unwrap());

        // 4. File C has identical hash "hashA", but different size -> MUST NOT match
        assert!(!index.is_imported("hashA", 5001).unwrap());

        // 5. File A with matching hash and matching size -> MUST match
        assert!(index.is_imported("hashA", 5000).unwrap());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
