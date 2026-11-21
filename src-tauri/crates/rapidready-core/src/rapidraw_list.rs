//! "Open list" hand-off to RapidRAW.
//!
//! RapidReady writes the currently visible (filtered + sorted) list of photos to a small JSON
//! file and launches RapidRAW with `--open-list <file>`. RapidRAW then shows exactly that list in
//! its filmstrip and opens the active photo.
//!
//! Format (version 1):
//! ```json
//! { "version": 1, "source": "RapidReady", "title": "...", "paths": ["..."], "active": "..." }
//! ```

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub const OPEN_LIST_VERSION: u32 = 1;
pub const OPEN_LIST_SOURCE: &str = "RapidReady";
pub const OPEN_LIST_PREFIX: &str = "rapidraw-list-";
/// How many list files we keep around (older ones are deleted after each write).
pub const OPEN_LIST_KEEP: usize = 5;

static COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize)]
struct OpenListPayload<'a> {
    version: u32,
    source: &'a str,
    title: &'a str,
    paths: &'a [String],
    active: &'a str,
}

/// True if the executable / app bundle at `path` is named RapidRAW (file stem `rapidraw`,
/// case-insensitive), e.g. `RapidRAW.exe`, `RapidRaw.exe`, `RapidRAW.app`, `rapidraw`.
pub fn is_rapidraw_executable_path(path: &str) -> bool {
    let trimmed = path.trim().trim_end_matches(['/', '\\']);
    let file = trimmed.rsplit(['/', '\\']).next().unwrap_or("");
    let stem = match file.rfind('.') {
        Some(i) if i > 0 => &file[..i],
        _ => file,
    };
    stem.eq_ignore_ascii_case("rapidraw")
}

/// True when the configured editor is RapidRAW: the `rapidraw` preset (also the default when no
/// developer is given), or the `custom` developer pointing at a RapidRAW executable.
/// Mirrors `isRapidRawDeveloper` in `src/utils/rapidrawList.ts`.
pub fn is_rapidraw_developer(developer: Option<&str>, custom_path: Option<&str>) -> bool {
    match developer.map(|d| d.to_ascii_lowercase()).as_deref() {
        None | Some("rapidraw") => true,
        Some("custom") => custom_path.is_some_and(is_rapidraw_executable_path),
        _ => false,
    }
}

/// The custom RapidRAW executable to launch, if the custom developer is a RapidRAW build that
/// exists on disk. macOS `.app` bundles are resolved to their inner binary.
pub fn custom_rapidraw_executable(developer: Option<&str>, custom_path: Option<&str>) -> Option<PathBuf> {
    if !developer.is_some_and(|d| d.eq_ignore_ascii_case("custom")) {
        return None;
    }
    let cp = custom_path.map(str::trim).filter(|s| !s.is_empty())?;
    if !is_rapidraw_executable_path(cp) {
        return None;
    }
    let p = PathBuf::from(cp);
    if p.is_dir() {
        // App bundle: <X>.app/Contents/MacOS/<binary>
        let macos = p.join("Contents").join("MacOS");
        for name in ["RapidRAW", "RapidRaw", "rapidraw"] {
            let bin = macos.join(name);
            if bin.is_file() {
                return Some(bin);
            }
        }
        return None;
    }
    if p.is_file() { Some(p) } else { None }
}

/// Default directory for list files: `<temp>/RapidReady`.
pub fn default_open_list_dir() -> PathBuf {
    std::env::temp_dir().join("RapidReady")
}

/// Validates the list, writes it atomically (tmp file + rename) into `dir` and removes older
/// list files so that at most `keep` remain. Returns the path of the new JSON file.
pub fn write_open_list(
    dir: &Path,
    title: &str,
    paths: &[String],
    active: &str,
    keep: usize,
) -> Result<PathBuf, String> {
    if paths.is_empty() {
        return Err("Open list is empty".to_string());
    }
    if !paths.iter().any(|p| p == active) {
        return Err("Active photo is not part of the list".to_string());
    }

    std::fs::create_dir_all(dir)
        .map_err(|e| format!("Failed to create list directory {}: {}", dir.display(), e))?;

    let payload = OpenListPayload {
        version: OPEN_LIST_VERSION,
        source: OPEN_LIST_SOURCE,
        title,
        paths,
        active,
    };
    let json = serde_json::to_vec_pretty(&payload)
        .map_err(|e| format!("Failed to serialize list: {}", e))?;

    // Millis + per-process counter, zero padded so the names sort chronologically.
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let name = format!("{}{:015}-{:06}.json", OPEN_LIST_PREFIX, millis, seq % 1_000_000);
    let final_path = dir.join(&name);
    let tmp_path = dir.join(format!("{}.tmp", name));

    if let Err(e) = std::fs::write(&tmp_path, &json) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("Failed to write list file: {}", e));
    }
    if let Err(e) = std::fs::rename(&tmp_path, &final_path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("Failed to finalize list file: {}", e));
    }

    cleanup_old_lists(dir, keep.max(1));
    Ok(final_path)
}

/// Deletes all but the newest `keep` list files (plus any leftover `.tmp` files) in `dir`.
pub fn cleanup_old_lists(dir: &Path, keep: usize) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let mut lists: Vec<(String, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with(OPEN_LIST_PREFIX) {
            continue;
        }
        if name.ends_with(".json.tmp") {
            // Stale temp file from an interrupted write (only remove if it is not brand new).
            let is_old = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok())
                .map(|age| age.as_secs() > 60)
                .unwrap_or(false);
            if is_old {
                let _ = std::fs::remove_file(entry.path());
            }
        } else if name.ends_with(".json") {
            lists.push((name, entry.path()));
        }
    }
    if lists.len() <= keep {
        return;
    }
    lists.sort_by(|a, b| a.0.cmp(&b.0));
    let remove_count = lists.len() - keep;
    for (_, path) in lists.into_iter().take(remove_count) {
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "rapidready_open_list_test_{}_{}",
            tag,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn list_files(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn writes_valid_json() {
        let dir = test_dir("json");
        let paths = vec![
            "C:\\photos\\a.ARW".to_string(),
            "D:\\x\\b.jpg".to_string(),
            "/Users/me/Ünïcode ✓/c.CR3".to_string(),
        ];
        let file = write_open_list(&dir, "Picks · sorted by rating", &paths, "D:\\x\\b.jpg", 5).unwrap();
        assert!(file.exists());
        assert!(file.file_name().unwrap().to_string_lossy().starts_with(OPEN_LIST_PREFIX));

        let raw = std::fs::read_to_string(&file).unwrap();
        let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(v["version"], 1);
        assert_eq!(v["source"], "RapidReady");
        assert_eq!(v["title"], "Picks · sorted by rating");
        assert_eq!(v["active"], "D:\\x\\b.jpg");
        let arr = v["paths"].as_array().unwrap();
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[0], "C:\\photos\\a.ARW");
        assert_eq!(arr[2], "/Users/me/Ünïcode ✓/c.CR3");

        // No temp files left behind
        assert!(list_files(&dir).iter().all(|n| !n.ends_with(".tmp")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_empty_or_missing_active() {
        let dir = test_dir("invalid");
        assert!(write_open_list(&dir, "t", &[], "a", 5).is_err());
        let paths = vec!["a".to_string(), "b".to_string()];
        assert!(write_open_list(&dir, "t", &paths, "c", 5).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn keeps_only_last_n_files() {
        let dir = test_dir("cleanup");
        let paths = vec!["a".to_string()];
        let mut written = Vec::new();
        for _ in 0..8 {
            written.push(write_open_list(&dir, "t", &paths, "a", 3).unwrap());
        }
        // Unrelated files must survive
        std::fs::write(dir.join("other.json"), b"{}").unwrap();
        write_open_list(&dir, "t", &paths, "a", 3).unwrap();

        let files = list_files(&dir);
        let lists: Vec<&String> = files.iter().filter(|n| n.starts_with(OPEN_LIST_PREFIX)).collect();
        assert_eq!(lists.len(), 3);
        assert!(files.contains(&"other.json".to_string()));
        // The oldest ones are gone, the most recent from the loop survives
        assert!(!written[0].exists());
        assert!(written[7].exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn detects_rapidraw_executables() {
        assert!(is_rapidraw_executable_path("C:\\dev\\RapidRAW-integration\\src-tauri\\target\\release\\RapidRAW.exe"));
        assert!(is_rapidraw_executable_path("C:\\Apps\\RapidRaw.exe"));
        assert!(is_rapidraw_executable_path("/Applications/RapidRAW.app"));
        assert!(is_rapidraw_executable_path("/Applications/RapidRAW.app/"));
        assert!(is_rapidraw_executable_path("/usr/local/bin/rapidraw"));
        assert!(!is_rapidraw_executable_path("C:\\Apps\\RapidRAW-old.exe"));
        assert!(!is_rapidraw_executable_path("C:\\RapidRAW\\darktable.exe"));
        assert!(!is_rapidraw_executable_path(""));

        assert!(is_rapidraw_developer(None, None));
        assert!(is_rapidraw_developer(Some("rapidraw"), None));
        assert!(is_rapidraw_developer(Some("RapidRAW"), Some("C:\\x\\darktable.exe")));
        assert!(is_rapidraw_developer(Some("custom"), Some("D:\\RapidRAW.exe")));
        assert!(!is_rapidraw_developer(Some("custom"), Some("D:\\Lightroom.exe")));
        assert!(!is_rapidraw_developer(Some("custom"), None));
        assert!(!is_rapidraw_developer(Some("darktable"), Some("D:\\RapidRAW.exe")));
    }

    #[test]
    fn resolves_custom_rapidraw_executable() {
        let dir = test_dir("custom_exe");
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("RapidRAW.exe");
        std::fs::write(&exe, b"").unwrap();
        let other = dir.join("darktable.exe");
        std::fs::write(&other, b"").unwrap();
        let exe_s = exe.to_string_lossy().to_string();

        assert_eq!(custom_rapidraw_executable(Some("custom"), Some(&exe_s)), Some(exe.clone()));
        // Not the custom developer, not RapidRAW, or missing -> None (caller uses normal discovery)
        assert_eq!(custom_rapidraw_executable(Some("rapidraw"), Some(&exe_s)), None);
        assert_eq!(custom_rapidraw_executable(Some("custom"), Some(&other.to_string_lossy())), None);
        let missing = dir.join("missing").join("RapidRAW.exe");
        assert_eq!(custom_rapidraw_executable(Some("custom"), Some(&missing.to_string_lossy())), None);
        assert_eq!(custom_rapidraw_executable(Some("custom"), None), None);

        // macOS-style app bundle resolves to the inner binary
        let bundle = dir.join("RapidRAW.app");
        std::fs::create_dir_all(bundle.join("Contents").join("MacOS")).unwrap();
        let inner = bundle.join("Contents").join("MacOS").join("RapidRAW");
        std::fs::write(&inner, b"").unwrap();
        assert_eq!(
            custom_rapidraw_executable(Some("custom"), Some(&bundle.to_string_lossy())),
            Some(inner)
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn handles_large_lists() {
        let dir = test_dir("large");
        let paths: Vec<String> = (0..10_000)
            .map(|i| format!("C:\\Photos\\2026\\2026-11-17\\DSC{:05}.ARW", i))
            .collect();
        let active = paths[4321].clone();
        let file = write_open_list(&dir, "Big", &paths, &active, 5).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(v["paths"].as_array().unwrap().len(), 10_000);
        assert_eq!(v["active"], active.as_str());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
