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
        let conn = self.conn.lock().unwrap();
        let exists: Option<i32> = conn.query_row(
            "SELECT 1 FROM imported_files WHERE file_hash = ?1 AND file_size = ?2 LIMIT 1",
            (file_hash, file_size as i64),
            |row| row.get(0),
        ).optional()?;

        Ok(exists.is_some())
    }

    pub fn mark_imported(&self, file_hash: &str, file_size: u64, original_name: &str, target_path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO imported_files (file_hash, file_size, original_name, target_path) VALUES (?1, ?2, ?3, ?4)",
            (file_hash, file_size as i64, original_name, target_path),
        )?;
        Ok(())
    }
}
