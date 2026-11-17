//! Where the disk cache (thumbnail chunks + screen previews) lives and how big it may get.
//!
//! Stored as `cache_settings.json` next to the archive catalog. The location is read once at
//! startup, because the cache is opened then and its index rows point into its chunk files; a new
//! location therefore takes effect on the next launch, when the old cache is moved there (or
//! deleted, if the user chose to start empty). The size limit applies immediately.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const SETTINGS_FILE: &str = "cache_settings.json";
/// The cache folder inside the app's default cache directory.
pub const DEFAULT_CACHE_SUBDIR: &str = "disk_cache_v2";
/// The cache folder created inside a folder the user chose, so it never mixes with their files.
pub const CUSTOM_CACHE_SUBDIR: &str = "RapidReady Cache";
/// Smallest size limit accepted: below this the cache would churn constantly.
pub const MIN_SIZE_LIMIT: u64 = 1024 * 1024 * 1024; // 1 GB

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CacheSettings {
    /// The folder the user chose; the cache lives in `<location>/RapidReady Cache`.
    /// `None` = the app's default cache directory.
    pub location: Option<String>,
    /// Maximum total cache size in bytes; `None` = unlimited.
    pub max_bytes: Option<u64>,
    /// A location change waiting for the next launch.
    pub pending: Option<PendingMove>,
    /// Why the last location change could not be applied, shown in Settings until the next change.
    pub last_move_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingMove {
    /// The cache folder in use when the change was made.
    pub from_dir: String,
    /// `location` before the change, restored if the move fails.
    pub previous_location: Option<String>,
    /// Move the existing cache to the new place (true) or start empty there (false).
    pub move_existing: bool,
}

impl CacheSettings {
    pub fn load(app_data_dir: &Path) -> Self {
        fs::read_to_string(app_data_dir.join(SETTINGS_FILE))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, app_data_dir: &Path) -> Result<(), String> {
        fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        let tmp = app_data_dir.join(format!("{SETTINGS_FILE}.tmp"));
        fs::write(&tmp, json).map_err(|e| e.to_string())?;
        fs::rename(&tmp, app_data_dir.join(SETTINGS_FILE)).map_err(|e| e.to_string())
    }

    /// The cache folder this configuration points at.
    pub fn cache_dir(&self, default_dir: &Path) -> PathBuf {
        cache_dir_for(self.location.as_deref(), default_dir)
    }
}

/// The cache folder for a chosen location (`None` = default).
pub fn cache_dir_for(location: Option<&str>, default_dir: &Path) -> PathBuf {
    match location {
        Some(loc) => Path::new(loc).join(CUSTOM_CACHE_SUBDIR),
        None => default_dir.to_path_buf(),
    }
}

/// What startup should do with the cache folder.
pub struct StartupCache {
    /// The folder to open, or `None` when it cannot be used this session (e.g. its drive is not
    /// connected): the app then runs without a disk cache rather than writing to another folder,
    /// because the index rows point into the configured folder's chunk files.
    pub dir: Option<PathBuf>,
    /// The folder is new and empty: its index rows must be cleared after opening.
    pub start_fresh: bool,
    pub settings: CacheSettings,
}

/// Applies a pending location change, then returns the folder to open.
pub fn prepare_startup(app_data_dir: &Path, default_dir: &Path) -> StartupCache {
    let mut settings = CacheSettings::load(app_data_dir);
    let mut start_fresh = false;

    if let Some(pending) = settings.pending.take() {
        let from = PathBuf::from(&pending.from_dir);
        let to = settings.cache_dir(default_dir);
        let result = if same_dir(&from, &to) {
            Ok(())
        } else if pending.move_existing && from.exists() {
            move_dir(&from, &to)
        } else {
            // Start empty: the old cache is deleted, the new folder starts with no index rows.
            let _ = fs::remove_dir_all(&from);
            start_fresh = true;
            fs::create_dir_all(&to).map_err(|e| e.to_string())
        };
        match result {
            Ok(()) => settings.last_move_error = None,
            Err(e) => {
                eprintln!("Could not move the disk cache to {}: {e}", to.display());
                settings.location = pending.previous_location;
                settings.last_move_error = Some(e);
                start_fresh = false;
            }
        }
        let _ = settings.save(app_data_dir);
    }

    let dir = settings.cache_dir(default_dir);
    let usable = if settings.location.is_some() {
        // Only create the cache folder itself when its parent (the chosen folder) is still there.
        dir.parent().is_some_and(Path::is_dir) && fs::create_dir_all(&dir).is_ok()
    } else {
        fs::create_dir_all(&dir).is_ok()
    };
    if !usable {
        eprintln!("Disk cache folder {} is not available; running without a disk cache", dir.display());
    }
    StartupCache { dir: usable.then_some(dir), start_fresh, settings }
}

/// Checks that `location` can hold the cache, before it is saved. Returns the cache folder.
pub fn validate_location(location: &str, current_dir: Option<&Path>) -> Result<PathBuf, String> {
    let chosen = Path::new(location);
    if !chosen.is_dir() {
        return Err(format!("The folder {location} does not exist."));
    }
    let target = chosen.join(CUSTOM_CACHE_SUBDIR);
    if let Some(current) = current_dir {
        if same_dir(&target, current) {
            return Ok(target);
        }
        if is_inside(&target, current) || is_inside(current, &target) {
            return Err("The new cache folder can't be inside the current one (or the other way round).".into());
        }
    }
    if target.exists() && fs::read_dir(&target).map(|mut d| d.next().is_some()).unwrap_or(true) {
        return Err(format!(
            "{} already exists and is not empty. Choose another folder or empty it first.",
            target.display()
        ));
    }
    let probe = chosen.join(".rapidready-write-test");
    fs::write(&probe, b"").map_err(|e| format!("RapidReady can't write to {location}: {e}"))?;
    let _ = fs::remove_file(probe);
    Ok(target)
}

/// Moves a folder: a rename on the same volume, otherwise copy everything, then delete the source.
/// A failed copy leaves the source untouched and removes the partial copy.
pub fn move_dir(from: &Path, to: &Path) -> Result<(), String> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // An empty leftover target (e.g. created by a previous launch) would block the rename.
    if to.exists() {
        let _ = fs::remove_dir(to);
    }
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    if let Err(e) = copy_dir(from, to) {
        let _ = fs::remove_dir_all(to);
        return Err(format!("copying the cache failed: {e}"));
    }
    fs::remove_dir_all(from).map_err(|e| format!("the cache was copied, but the old folder could not be removed: {e}"))
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else {
            fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}

fn key(p: &Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    let s = s.trim_end_matches('/').to_string();
    if cfg!(any(target_os = "windows", target_os = "macos")) { s.to_lowercase() } else { s }
}

pub fn same_dir(a: &Path, b: &Path) -> bool {
    key(a) == key(b)
}

fn is_inside(child: &Path, parent: &Path) -> bool {
    key(child).starts_with(&format!("{}/", key(parent)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("rr_cache_settings_{name}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn pending_move_moves_the_cache_and_clears_pending() {
        let root = temp("move");
        let app = root.join("app");
        let default_dir = root.join("default/disk_cache_v2");
        fs::create_dir_all(default_dir.join("chunks")).unwrap();
        fs::write(default_dir.join("chunks/chunk_0001.bin"), b"thumbs").unwrap();
        let chosen = root.join("elsewhere");
        fs::create_dir_all(&chosen).unwrap();

        CacheSettings {
            location: Some(chosen.to_string_lossy().into()),
            pending: Some(PendingMove {
                from_dir: default_dir.to_string_lossy().into(),
                previous_location: None,
                move_existing: true,
            }),
            ..Default::default()
        }
        .save(&app)
        .unwrap();

        let s = prepare_startup(&app, &default_dir);
        let new_dir = chosen.join(CUSTOM_CACHE_SUBDIR);
        assert_eq!(s.dir.as_deref(), Some(new_dir.as_path()));
        assert!(!s.start_fresh);
        assert_eq!(fs::read(new_dir.join("chunks/chunk_0001.bin")).unwrap(), b"thumbs");
        assert!(!default_dir.exists());
        assert!(CacheSettings::load(&app).pending.is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn start_empty_deletes_the_old_cache() {
        let root = temp("fresh");
        let app = root.join("app");
        let default_dir = root.join("default/disk_cache_v2");
        fs::create_dir_all(&default_dir).unwrap();
        fs::write(default_dir.join("x"), b"old").unwrap();
        let chosen = root.join("elsewhere");
        fs::create_dir_all(&chosen).unwrap();
        CacheSettings {
            location: Some(chosen.to_string_lossy().into()),
            pending: Some(PendingMove {
                from_dir: default_dir.to_string_lossy().into(),
                previous_location: None,
                move_existing: false,
            }),
            ..Default::default()
        }
        .save(&app)
        .unwrap();

        let s = prepare_startup(&app, &default_dir);
        assert!(s.start_fresh);
        assert!(!default_dir.exists());
        assert!(chosen.join(CUSTOM_CACHE_SUBDIR).is_dir());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_custom_folder_runs_without_cache_and_keeps_setting() {
        let root = temp("missing");
        let app = root.join("app");
        let default_dir = root.join("default/disk_cache_v2");
        let gone = root.join("unplugged-drive");
        CacheSettings { location: Some(gone.to_string_lossy().into()), ..Default::default() }
            .save(&app)
            .unwrap();
        let s = prepare_startup(&app, &default_dir);
        assert!(s.dir.is_none());
        assert!(!gone.exists(), "must not create the chosen folder itself");
        assert_eq!(CacheSettings::load(&app).location, Some(gone.to_string_lossy().into()));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn validation_rejects_non_empty_targets_and_nesting() {
        let root = temp("validate");
        let current = root.join("current");
        fs::create_dir_all(&current).unwrap();
        assert!(validate_location(&root.join("nope").to_string_lossy(), Some(&current)).is_err());
        assert!(validate_location(&current.to_string_lossy(), Some(&current)).is_err(), "inside current");
        let busy = root.join("busy");
        fs::create_dir_all(busy.join(CUSTOM_CACHE_SUBDIR)).unwrap();
        fs::write(busy.join(CUSTOM_CACHE_SUBDIR).join("f"), b"x").unwrap();
        assert!(validate_location(&busy.to_string_lossy(), Some(&current)).is_err());
        let ok = root.join("ok");
        fs::create_dir_all(&ok).unwrap();
        assert_eq!(validate_location(&ok.to_string_lossy(), Some(&current)).unwrap(), ok.join(CUSTOM_CACHE_SUBDIR));
        let _ = fs::remove_dir_all(root);
    }
}
