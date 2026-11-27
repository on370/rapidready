use rusqlite::{Connection, OpenFlags};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use super::header_parser::{
    get_effective_orientation, parse_header_orientation, parse_tiff_header_slice,
};
use super::jpeg_extract::inject_orientation_into_jpeg;

/// Global toggle for using external developer previews (RapidRAW, darktable, Lightroom .dng).
/// Enabled by default.
static USE_DEVELOPER_PREVIEWS: AtomicBool = AtomicBool::new(true);

pub fn clear_ram_thumbnail_cache() {
    if let Ok(mut cache) = super::THUMBNAIL_CACHE.lock() {
        cache.clear();
    }
}

pub fn set_use_developer_previews(enabled: bool) {
    let prev = USE_DEVELOPER_PREVIEWS.swap(enabled, Ordering::SeqCst);
    if prev != enabled {
        clear_ram_thumbnail_cache();
    }
}

use std::cell::Cell;

thread_local! {
    static DEV_PREVIEWS_OVERRIDE: Cell<Option<bool>> = const { Cell::new(None) };
}

pub fn with_developer_previews_override<R>(override_opt: Option<bool>, f: impl FnOnce() -> R) -> R {
    if override_opt.is_none() {
        return f();
    }
    struct Guard(Option<bool>);
    impl Drop for Guard {
        fn drop(&mut self) {
            DEV_PREVIEWS_OVERRIDE.with(|c| c.set(self.0));
        }
    }
    let prev = DEV_PREVIEWS_OVERRIDE.with(|c| c.replace(override_opt));
    let _guard = Guard(prev);
    f()
}

pub fn get_use_developer_previews() -> bool {
    DEV_PREVIEWS_OVERRIDE
        .with(|c| c.get())
        .unwrap_or_else(|| USE_DEVELOPER_PREVIEWS.load(Ordering::Relaxed))
}

// ============================================================================
// 1. Cross-Platform Standard OS Directory Helpers
// ============================================================================

fn user_home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

fn os_cache_root() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        user_home_dir().map(|h| h.join("Library").join("Caches"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .or_else(|| user_home_dir().map(|h| h.join(".cache")))
    }
}

fn os_data_root() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        user_home_dir().map(|h| h.join("Library").join("Application Support"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(PathBuf::from)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| user_home_dir().map(|h| h.join(".local").join("share")))
    }
}

fn os_config_root() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        user_home_dir().map(|h| h.join(".config"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| user_home_dir().map(|h| h.join(".config")))
    }
}

// ============================================================================
// 2. RapidRAW Preview Cache Integration
// ============================================================================

const RAPIDRAW_IDENTIFIER: &str = "io.github.CyberTimon.RapidRAW";

fn rapidraw_thumbnails_dir() -> Option<PathBuf> {
    let base = os_cache_root()?.join(RAPIDRAW_IDENTIFIER);
    #[cfg(target_os = "windows")]
    {
        let win_cache = base.join("cache").join("thumbnails");
        if win_cache.is_dir() {
            return Some(win_cache);
        }
    }
    let dir = base.join("thumbnails");
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

fn rapidraw_settings_path() -> Option<PathBuf> {
    if let Some(data_dir) = os_data_root() {
        let p = data_dir.join(RAPIDRAW_IDENTIFIER).join("settings.json");
        if p.is_file() {
            return Some(p);
        }
    }
    #[cfg(target_os = "windows")]
    if let Some(local_dir) = os_cache_root() {
        let p = local_dir.join(RAPIDRAW_IDENTIFIER).join("settings.json");
        if p.is_file() {
            return Some(p);
        }
    }
    if let Some(cfg_dir) = os_config_root() {
        let p = cfg_dir.join(RAPIDRAW_IDENTIFIER).join("settings.json");
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn default_true() -> bool {
    true
}

fn default_baseline_exposure_val() -> f32 {
    0.7
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct RapidRawSettingsStub {
    #[serde(default = "default_true")]
    enable_baseline_exposure: bool,
    #[serde(default = "default_baseline_exposure_val")]
    baseline_exposure: f32,
    #[serde(default = "default_true")]
    compensate_highlight_preservation: bool,
    #[serde(default)]
    tonemapper_override_enabled: Option<bool>,
    #[serde(default)]
    default_raw_tonemapper: Option<String>,
    #[serde(default)]
    default_non_raw_tonemapper: Option<String>,
    #[serde(default)]
    always_decode_raw_thumbnails: Option<bool>,
}

impl Default for RapidRawSettingsStub {
    fn default() -> Self {
        Self {
            enable_baseline_exposure: true,
            baseline_exposure: 0.7,
            compensate_highlight_preservation: true,
            tonemapper_override_enabled: Some(false),
            default_raw_tonemapper: Some("agx".to_string()),
            default_non_raw_tonemapper: Some("basic".to_string()),
            always_decode_raw_thumbnails: Some(false),
        }
    }
}

#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
struct BaselineOptions {
    baseline_exposure: Option<f32>,
    compensate_highlight_preservation: bool,
}

impl RapidRawSettingsStub {
    fn resolve_tonemapper_override(&self, is_raw: bool) -> Option<u32> {
        if !self.tonemapper_override_enabled.unwrap_or(false) {
            return None;
        }
        let tm = if is_raw {
            self.default_raw_tonemapper.as_deref().unwrap_or("agx")
        } else {
            self.default_non_raw_tonemapper.as_deref().unwrap_or("basic")
        };
        Some(if tm == "agx" { 1 } else { 0 })
    }

    fn thumbnail_render_key(&self, is_raw: bool) -> String {
        let tm_override = self.resolve_tonemapper_override(is_raw);
        let non_raw_tm_override = self.resolve_tonemapper_override(false);
        let baseline = BaselineOptions {
            baseline_exposure: self
                .enable_baseline_exposure
                .then_some(self.baseline_exposure),
            compensate_highlight_preservation: self.compensate_highlight_preservation,
        };
        format!(
            "RenderOptions {{ tonemapper_override: {:?}, non_raw_tonemapper_override: {:?}, \
             baseline: {:?} }}{:?}",
            tm_override,
            non_raw_tm_override,
            baseline,
            self.always_decode_raw_thumbnails
        )
    }
}

struct CachedRapidRawConfig {
    settings: RapidRawSettingsStub,
    thumbs_dir: Option<PathBuf>,
    last_checked: Instant,
    settings_mtime: Option<SystemTime>,
}

static RAPIDRAW_CONFIG_CACHE: LazyLock<Mutex<Option<CachedRapidRawConfig>>> =
    LazyLock::new(|| Mutex::new(None));

fn get_rapidraw_config() -> (RapidRawSettingsStub, Option<PathBuf>) {
    let mut guard = RAPIDRAW_CONFIG_CACHE
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(ref cached) = *guard {
        if cached.last_checked.elapsed() < Duration::from_secs(5) {
            return (cached.settings.clone(), cached.thumbs_dir.clone());
        }
    }

    let settings_path = rapidraw_settings_path();
    let current_mtime = settings_path
        .as_ref()
        .and_then(|p| fs::metadata(p).ok())
        .and_then(|m| m.modified().ok());

    if let Some(ref mut cached) = *guard {
        if cached.settings_mtime == current_mtime && cached.thumbs_dir.is_some() {
            cached.last_checked = Instant::now();
            return (cached.settings.clone(), cached.thumbs_dir.clone());
        }
    }

    let settings = settings_path
        .as_ref()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<RapidRawSettingsStub>(&s).ok())
        .unwrap_or_default();
    let thumbs_dir = rapidraw_thumbnails_dir();

    *guard = Some(CachedRapidRawConfig {
        settings: settings.clone(),
        thumbs_dir: thumbs_dir.clone(),
        last_checked: Instant::now(),
        settings_mtime: current_mtime,
    });

    (settings, thumbs_dir)
}

fn is_rapidraw_raw_extension(path: &Path) -> bool {
    const RR_RAW_EXTS: &[&str] = &[
        "dng", "crw", "cr2", "cr3", "raw", "erf", "raf", "3fr", "fff", "kdc", "dcr", "mos", "mef",
        "mrw", "nef", "nrw", "orf", "ori", "rw2", "pef", "srw", "arw", "srf", "sr2",
    ];
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| RR_RAW_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_rapidraw_adjustments_edited(adj: &serde_json::Value) -> bool {
    match adj {
        serde_json::Value::Null => false,
        serde_json::Value::Object(map) => {
            if map.is_empty() {
                return false;
            }
            if map.len() == 1
                && map.get("baselineExposure").and_then(|v| v.as_bool()) == Some(true)
            {
                return false;
            }
            true
        }
        _ => false,
    }
}

fn mtime_secs(meta: &fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

/// Memoised RapidRAW hash resolution: (img_mtime, rrdata_mtime, render_key, candidate hashes or None if unedited).
struct RapidRawHashEntry {
    img_mtime: u64,
    rr_mtime: u64,
    render_key: String,
    hashes: Option<Vec<String>>,
}

static RAPIDRAW_HASH_CACHE: LazyLock<Mutex<HashMap<PathBuf, RapidRawHashEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn compute_rapidraw_hashes(
    path: &Path,
    sidecar_path: &Path,
    img_mod_time: u64,
    render_key: &str,
) -> Option<Vec<String>> {
    let content = fs::read_to_string(sidecar_path).ok()?;
    let mut root_val: serde_json::Value = serde_json::from_str(&content).ok()?;
    let adjustments = root_val
        .get_mut("adjustments")
        .map(std::mem::take)
        .unwrap_or(serde_json::Value::Null);

    // Match RapidRAW's remove_legacy_rating behavior
    let mut adjustments = adjustments;
    if let Some(obj) = adjustments.as_object_mut() {
        if obj.remove("rating").is_some() && obj.is_empty() {
            adjustments = serde_json::Value::Null;
        }
    }

    // Only use RapidRAW preview if the image has actual adjustments in .rrdata
    if !is_rapidraw_adjustments_edited(&adjustments) {
        return None;
    }

    let adjustments_bytes = serde_json::to_vec(&adjustments).ok()?;

    // Try with path as given, and with normalized slashes on Windows if needed
    let path_str = path.to_string_lossy();
    #[allow(unused_mut)]
    let mut candidate_paths = vec![path_str.as_ref().to_string()];
    #[cfg(target_os = "windows")]
    {
        let fwd = path_str.replace('\\', "/");
        if fwd.as_str() != path_str.as_ref() {
            candidate_paths.push(fwd);
        }
    }

    let hashes = candidate_paths
        .iter()
        .map(|p_str| {
            let mut hasher = blake3::Hasher::new();
            hasher.update(p_str.as_bytes());
            hasher.update(&img_mod_time.to_le_bytes());
            hasher.update(&adjustments_bytes);
            hasher.update(render_key.as_bytes());
            hasher.finalize().to_hex().to_string()
        })
        .collect();
    Some(hashes)
}

/// Attempts to locate and read RapidRAW's pre-rendered preview JPEG for `path`.
pub fn try_read_rapidraw_cached_preview(path: &Path, scale: u32) -> Option<Vec<u8>> {
    // Short-circuit BEFORE touching the NAS/filesystem if RapidRAW's local cache directory does not exist.
    let (settings, thumbs_dir_opt) = get_rapidraw_config();
    let thumbs_dir = thumbs_dir_opt?;

    let sidecar_path = crate::culling::get_sidecar_path(path);
    let rr_mtime = mtime_secs(&fs::metadata(&sidecar_path).ok()?)?;

    let img_mod_time = mtime_secs(&fs::metadata(path).ok()?)?;
    let is_raw = is_rapidraw_raw_extension(path);
    let render_key = settings.thumbnail_render_key(is_raw);

    let cached = {
        let guard = RAPIDRAW_HASH_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        guard.get(path).and_then(|e| {
            if e.img_mtime == img_mod_time && e.rr_mtime == rr_mtime && e.render_key == render_key {
                Some(e.hashes.clone())
            } else {
                None
            }
        })
    };
    let hashes = match cached {
        Some(h) => h,
        None => {
            let h = compute_rapidraw_hashes(path, &sidecar_path, img_mod_time, &render_key);
            let mut guard = RAPIDRAW_HASH_CACHE.lock().unwrap_or_else(|e| e.into_inner());
            if guard.len() > 100_000 {
                guard.clear();
            }
            guard.insert(
                path.to_path_buf(),
                RapidRawHashEntry {
                    img_mtime: img_mod_time,
                    rr_mtime,
                    render_key,
                    hashes: h.clone(),
                },
            );
            h
        }
    }?;

    for cache_hash in hashes {
        let medium_path = thumbs_dir.join(format!("{}_medium.jpg", cache_hash));
        let small_path = thumbs_dir.join(format!("{}_small.jpg", cache_hash));

        // For grid micro-icons (scale == 0), prefer small if available, else medium.
        // For standard grid (scale == 1, 2) and loupe (scale >= 100), prefer medium (1280px) for sharpness!
        let (primary, secondary) = if scale == 0 {
            (&small_path, &medium_path)
        } else {
            (&medium_path, &small_path)
        };

        for candidate in [primary, secondary] {
            if let Ok(bytes) = fs::read(candidate) {
                if bytes.len() >= 4 && bytes[0] == 0xFF && bytes[1] == 0xD8 {
                    return Some(bytes);
                }
            }
        }
    }

    None
}

// ============================================================================
// 3. darktable Preview Cache Integration (library.db + mipmaps-*.d)
// ============================================================================

struct DarktableCacheState {
    library_db_path: Option<PathBuf>,
    mipmap_dirs: Vec<PathBuf>,
    last_checked: Instant,
    folder_to_film_id: HashMap<String, i64>,
    db_mtime: Option<SystemTime>,
}

static DARKTABLE_STATE: LazyLock<Mutex<Option<DarktableCacheState>>> =
    LazyLock::new(|| Mutex::new(None));

fn find_darktable_paths() -> (Option<PathBuf>, Vec<PathBuf>) {
    let mut db_path = None;
    if let Some(cfg) = os_config_root() {
        let p = cfg.join("darktable").join("library.db");
        if p.is_file() {
            db_path = Some(p);
        }
    }
    #[cfg(target_os = "windows")]
    if db_path.is_none() {
        if let Some(appdata) = os_data_root() {
            let p = appdata.join("darktable").join("library.db");
            if p.is_file() {
                db_path = Some(p);
            }
        }
    }

    let mut mipmap_dirs = Vec::new();
    let mut cache_roots = Vec::new();
    if let Some(cache_root) = os_cache_root() {
        cache_roots.push(cache_root.join("darktable"));
    }
    #[cfg(target_os = "macos")]
    if let Some(home) = user_home_dir() {
        let unix_cache = home.join(".cache").join("darktable");
        if !cache_roots.contains(&unix_cache) {
            cache_roots.push(unix_cache);
        }
    }

    for dt_cache in cache_roots {
        if let Ok(entries) = fs::read_dir(&dt_cache) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if name.starts_with("mipmaps-") && name.ends_with(".d") && !mipmap_dirs.contains(&p) {
                        mipmap_dirs.push(p);
                    }
                }
            }
        }
    }

    (db_path, mipmap_dirs)
}

fn ensure_darktable_state(guard: &mut Option<DarktableCacheState>) {
    let needs_refresh = match *guard {
        Some(ref state) => state.last_checked.elapsed() > Duration::from_secs(10),
        None => true,
    };

    if needs_refresh {
        let (db_path, mipmap_dirs) = find_darktable_paths();
        let current_mtime = db_path
            .as_ref()
            .and_then(|p| fs::metadata(p).ok())
            .and_then(|m| m.modified().ok());

        let mut folder_map = guard
            .as_ref()
            .filter(|s| s.db_mtime == current_mtime)
            .map(|s| s.folder_to_film_id.clone())
            .unwrap_or_default();

        if folder_map.is_empty() && !mipmap_dirs.is_empty() {
            if let Some(ref db_p) = db_path {
                if let Ok(conn) = Connection::open_with_flags(
                    db_p,
                    OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
                ) {
                    let _ = conn.busy_timeout(Duration::from_millis(200));
                    if let Ok(mut stmt) = conn.prepare("SELECT id, folder FROM film_rolls") {
                        if let Ok(rows) = stmt.query_map([], |r| {
                            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
                        }) {
                            for row in rows.flatten() {
                                folder_map.insert(row.1.replace('\\', "/"), row.0);
                            }
                        }
                    }
                }
            }
        }

        *guard = Some(DarktableCacheState {
            library_db_path: db_path,
            mipmap_dirs,
            last_checked: Instant::now(),
            folder_to_film_id: folder_map,
            db_mtime: current_mtime,
        });
    }
}

fn has_darktable_mipmap_dirs() -> bool {
    let mut guard = DARKTABLE_STATE.lock().unwrap_or_else(|e| e.into_inner());
    ensure_darktable_state(&mut guard);
    guard
        .as_ref()
        .map(|s| !s.mipmap_dirs.is_empty())
        .unwrap_or(false)
}

fn lookup_darktable_image_id(path: &Path) -> Option<(i64, Vec<PathBuf>)> {
    let parent = path.parent()?.to_string_lossy().to_string();
    let filename = path.file_name()?.to_string_lossy().to_string();

    let mut guard = DARKTABLE_STATE.lock().unwrap_or_else(|e| e.into_inner());
    ensure_darktable_state(&mut guard);

    let state = guard.as_ref()?;
    if state.mipmap_dirs.is_empty() {
        return None;
    }
    let db_path = state.library_db_path.as_ref()?;
    let norm_parent = parent.replace('\\', "/");
    let film_id = *state.folder_to_film_id.get(norm_parent.trim_end_matches('/'))?;
    let mipmap_dirs = state.mipmap_dirs.clone();
    let db_path_clone = db_path.clone();
    let db_mtime = state.db_mtime;
    drop(guard);

    {
        let ids = DARKTABLE_ID_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((cached_mtime, cached_id)) = ids.get(path) {
            if *cached_mtime == db_mtime {
                return cached_id.map(|id| (id, mipmap_dirs));
            }
        }
    }

    let lookup = || -> Option<i64> {
        let conn = Connection::open_with_flags(
            &db_path_clone,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .ok()?;
        let _ = conn.busy_timeout(Duration::from_millis(200));

        // Only use darktable preview if the image has been edited in darktable (history_end > 0)
        let mut stmt = conn
            .prepare("SELECT id FROM images WHERE film_id = ?1 AND filename = ?2 AND history_end > 0 ORDER BY version ASC LIMIT 1")
            .ok()?;
        stmt.query_row((film_id, &filename), |row| row.get(0)).ok()
    };
    let img_id = lookup();

    {
        let mut ids = DARKTABLE_ID_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        if ids.len() > 100_000 {
            ids.clear();
        }
        ids.insert(path.to_path_buf(), (db_mtime, img_id));
    }

    img_id.map(|id| (id, mipmap_dirs))
}

/// Memoised darktable image ids per file, invalidated when library.db changes.
static DARKTABLE_ID_CACHE: LazyLock<Mutex<HashMap<PathBuf, (Option<SystemTime>, Option<i64>)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Attempts to locate and read darktable's pre-rendered mipmap JPEG for `path`.
pub fn try_read_darktable_cached_preview(path: &Path, scale: u32) -> Option<Vec<u8>> {
    // Short-circuit BEFORE touching the NAS/filesystem if darktable has no local mipmaps cache.
    if !has_darktable_mipmap_dirs() {
        return None;
    }

    // Only check darktable if an .xmp sidecar exists for this file
    let xmp_path = crate::culling::find_existing_xmp_path(path)?;
    if !xmp_path.is_file() {
        return None;
    }

    let (img_id, mipmap_dirs) = lookup_darktable_image_id(path)?;

    // darktable mipmap levels: 0..8 (0=tiny, 1=180px, 2=360px, 3=720px, 4=1440px, 5=2560px+, 6..8=full)
    let levels: &[u8] = if scale == 0 {
        &[2, 1, 3, 4]
    } else if scale >= 100 {
        &[6, 5, 4, 3, 2]
    } else {
        &[4, 3, 5, 2, 1]
    };

    let filename = format!("{}.jpg", img_id);
    for dir in &mipmap_dirs {
        for &lvl in levels {
            let candidate = dir.join(lvl.to_string()).join(&filename);
            if candidate.is_file() {
                if let Ok(bytes) = fs::read(&candidate) {
                    if bytes.len() >= 4 && bytes[0] == 0xFF && bytes[1] == 0xD8 {
                        return Some(bytes);
                    }
                }
            }
        }
    }

    None
}

// ============================================================================
// 4. Adobe Lightroom DNG Embedded Preview Extraction (handles EOF IFD0)
// ============================================================================

/// Extracts the rendered preview JPEG embedded inside a `.dng` file by Adobe Lightroom / Camera Raw.
/// Handles both standard IFD0-at-start DNGs and Lightroom-updated DNGs where IFD0 was moved to the end of the file.
pub fn try_extract_lightroom_dng_preview(
    path: &Path,
    scale: u32,
    target_orient: Option<u32>,
) -> Option<Vec<u8>> {
    let ext = path.extension()?.to_str()?;
    if !ext.eq_ignore_ascii_case("dng") {
        return None;
    }

    let mut file = fs::File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();
    if file_len < 64 {
        return None;
    }

    let mut head = [0u8; 8];
    file.read_exact(&mut head).ok()?;
    let is_le = if &head[0..2] == b"II" {
        true
    } else if &head[0..2] == b"MM" {
        false
    } else {
        return None;
    };

    let ifd0_offset = if is_le {
        u32::from_le_bytes([head[4], head[5], head[6], head[7]])
    } else {
        u32::from_be_bytes([head[4], head[5], head[6], head[7]])
    } as u64;

    // Collect all JPEG preview streams (offset, length, width, height) from IFD0 and its SubIFDs
    let candidates = collect_dng_jpeg_previews(&mut file, file_len, is_le, ifd0_offset)?;
    if candidates.is_empty() {
        return None;
    }

    // Choose the best preview based on requested scale:
    // - For Loupe / 100% (scale >= 100): pick the highest resolution JPEG preview
    // - For Micro-thumbnail (scale == 0): pick smallest preview >= 160px, or largest available
    // - For Grid (scale == 1, 2): pick largest preview >= 640px (e.g. 1024x683 or 1600x1200)
    let chosen = if scale >= 100 {
        candidates
            .iter()
            .max_by_key(|c| (c.width as u64) * (c.height as u64))
    } else if scale == 0 {
        candidates
            .iter()
            .filter(|c| c.width.max(c.height) >= 160 && c.length >= 4_000)
            .min_by_key(|c| c.width.max(c.height))
            .or_else(|| candidates.iter().max_by_key(|c| c.length))
    } else {
        candidates
            .iter()
            .filter(|c| c.width.max(c.height) >= 600 && c.length <= 4_000_000)
            .max_by_key(|c| (c.width as u64) * (c.height as u64))
            .or_else(|| {
                candidates
                    .iter()
                    .max_by_key(|c| (c.width as u64) * (c.height as u64))
            })
    }?;

    if chosen.offset + (chosen.length as u64) > file_len || chosen.length < 1024 {
        return None;
    }

    file.seek(SeekFrom::Start(chosen.offset)).ok()?;
    let mut jpeg_bytes = vec![0u8; chosen.length as usize];
    file.read_exact(&mut jpeg_bytes).ok()?;

    if jpeg_bytes.len() < 4 || jpeg_bytes[0] != 0xFF || jpeg_bytes[1] != 0xD8 {
        return None;
    }

    let eff_orient = target_orient
        .or(chosen.ifd0_orientation)
        .or_else(|| get_effective_orientation(path))
        .unwrap_or(1);

    if eff_orient != 1 || parse_header_orientation(&jpeg_bytes).unwrap_or(1) != 1 {
        Some(inject_orientation_into_jpeg(&jpeg_bytes, eff_orient as u16))
    } else {
        Some(jpeg_bytes)
    }
}

#[derive(Debug, Clone, Copy)]
struct DngPreviewCandidate {
    offset: u64,
    length: u32,
    width: u32,
    height: u32,
    ifd0_orientation: Option<u32>,
}

fn read_u16_at(buf: &[u8], off: usize, is_le: bool) -> Option<u16> {
    let b = buf.get(off..off + 2)?;
    Some(if is_le {
        u16::from_le_bytes([b[0], b[1]])
    } else {
        u16::from_be_bytes([b[0], b[1]])
    })
}

fn read_u32_at(buf: &[u8], off: usize, is_le: bool) -> Option<u32> {
    let b = buf.get(off..off + 4)?;
    Some(if is_le {
        u32::from_le_bytes([b[0], b[1], b[2], b[3]])
    } else {
        u32::from_be_bytes([b[0], b[1], b[2], b[3]])
    })
}

fn collect_dng_jpeg_previews(
    file: &mut fs::File,
    file_len: u64,
    is_le: bool,
    ifd0_offset: u64,
) -> Option<Vec<DngPreviewCandidate>> {
    let mut to_visit = vec![ifd0_offset];
    let mut visited = std::collections::HashSet::new();
    let mut candidates = Vec::new();
    let mut root_orientation = None;

    // Fast path: if IFD0 is within the first 128 KB, read a 128 KB header chunk once
    let mut header_buf = vec![0u8; (file_len.min(128 * 1024)) as usize];
    file.seek(SeekFrom::Start(0)).ok()?;
    let n = file.read(&mut header_buf).ok()?;
    header_buf.truncate(n);

    while let Some(ifd_off) = to_visit.pop() {
        if !visited.insert(ifd_off) || ifd_off + 2 > file_len || visited.len() > 24 {
            continue;
        }

        // Read the IFD table (up to 4 KB is plenty for an IFD + inline arrays)
        let mut local_buf = Vec::new();
        let ifd_slice: &[u8] = if (ifd_off as usize) + 2048 <= header_buf.len() {
            &header_buf[ifd_off as usize..]
        } else {
            let read_len = (file_len.saturating_sub(ifd_off)).min(4096) as usize;
            local_buf.resize(read_len, 0);
            if file.seek(SeekFrom::Start(ifd_off)).is_err() {
                continue;
            }
            if file.read_exact(&mut local_buf).is_err() {
                continue;
            }
            &local_buf
        };

        let num_entries = match read_u16_at(ifd_slice, 0, is_le) {
            Some(n) if n <= 256 => n as usize,
            _ => continue,
        };

        let mut subfile_type = 0u32;
        let mut width = 0u32;
        let mut height = 0u32;
        let mut compression = 0u16;
        let mut photometric = 0u16;
        let mut strip_off = None;
        let mut strip_len = None;
        let mut jpeg_off = None;
        let mut jpeg_len = None;

        for i in 0..num_entries {
            let entry = 2 + i * 12;
            if entry + 12 > ifd_slice.len() {
                break;
            }
            let tag = read_u16_at(ifd_slice, entry, is_le).unwrap_or(0);
            let typ = read_u16_at(ifd_slice, entry + 2, is_le).unwrap_or(0);
            let count = read_u32_at(ifd_slice, entry + 4, is_le).unwrap_or(0);
            let val_u32 = read_u32_at(ifd_slice, entry + 8, is_le).unwrap_or(0);
            let val_u16 = read_u16_at(ifd_slice, entry + 8, is_le).unwrap_or(0);
            let val_num = if typ == 3 && count == 1 {
                val_u16 as u32
            } else {
                val_u32
            };

            match tag {
                0x00FE => subfile_type = val_num,
                0x0100 => width = val_num,
                0x0101 => height = val_num,
                0x0103 => compression = val_u16,
                0x0106 => photometric = val_u16,
                0x0112 => {
                    if (1..=8).contains(&val_u16) && root_orientation.is_none() {
                        root_orientation = Some(val_u16 as u32);
                    }
                }
                0x0111 => {
                    if count == 1 {
                        strip_off = Some(val_num as u64);
                    }
                }
                0x0117 => {
                    if count == 1 {
                        strip_len = Some(val_num);
                    }
                }
                0x0201 => jpeg_off = Some(val_num as u64),
                0x0202 => jpeg_len = Some(val_num),
                0x014A => {
                    // SubIFDs
                    if count == 1 {
                        to_visit.push(val_u32 as u64);
                    } else if count > 1 && count <= 16 {
                        let arr_off = val_u32 as u64;
                        let byte_len = (count as usize) * 4;
                        if (arr_off as usize) + byte_len <= header_buf.len() {
                            for k in 0..(count as usize) {
                                if let Some(sub) =
                                    read_u32_at(&header_buf, (arr_off as usize) + k * 4, is_le)
                                {
                                    to_visit.push(sub as u64);
                                }
                            }
                        } else if arr_off + (byte_len as u64) <= file_len {
                            let mut arr_buf = vec![0u8; byte_len];
                            if file.seek(SeekFrom::Start(arr_off)).is_ok()
                                && file.read_exact(&mut arr_buf).is_ok()
                            {
                                for k in 0..(count as usize) {
                                    if let Some(sub) = read_u32_at(&arr_buf, k * 4, is_le) {
                                        to_visit.push(sub as u64);
                                    }
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        let next_ptr = 2 + num_entries * 12;
        if let Some(next_ifd) = read_u32_at(ifd_slice, next_ptr, is_le) {
            if next_ifd > 0 && (next_ifd as u64) < file_len {
                to_visit.push(next_ifd as u64);
            }
        }

        // Check if this IFD is a reduced-resolution preview JPEG (SubfileType bit 0 set, or explicit JPEG)
        // Note: In DNG, main Lossless JPEG RAW sensor data has subfile_type == 0 and photometric == 32803 (CFA) or 34892 (LinearRaw).
        // Preview JPEGs have subfile_type & 1 != 0 (usually 1 or 0x10001) and compression 6 or 7 (or explicit 0x0201).
        let is_preview_ifd = (subfile_type & 1) != 0 && photometric != 32803;
        if let (Some(off), Some(len)) = (jpeg_off, jpeg_len) {
            if len > 1024 && len <= 12_000_000 {
                candidates.push(DngPreviewCandidate {
                    offset: off,
                    length: len,
                    width: width.max(640),
                    height: height.max(480),
                    ifd0_orientation: root_orientation,
                });
            }
        } else if is_preview_ifd && (compression == 6 || compression == 7) {
            if let (Some(off), Some(len)) = (strip_off, strip_len) {
                if len > 1024 && len <= 12_000_000 {
                    candidates.push(DngPreviewCandidate {
                        offset: off,
                        length: len,
                        width,
                        height,
                        ifd0_orientation: root_orientation,
                    });
                }
            }
        }
    }

    // Backfill root_orientation on all candidates
    if root_orientation.is_some() {
        for c in &mut candidates {
            c.ifd0_orientation = root_orientation;
        }
    }

    // Also parse header_buf with standard parse_tiff_header_slice in case root_orientation wasn't in IFD0
    if root_orientation.is_none() {
        let info = parse_tiff_header_slice(&header_buf, 0);
        if info.orientation.is_some() {
            for c in &mut candidates {
                c.ifd0_orientation = info.orientation;
            }
        }
    }

    Some(candidates)
}

// ============================================================================
// 5. Unified Entrypoint & Sidecar Timestamp Resolution
// ============================================================================

const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "m4v", "avi", "mkv", "mts", "m2ts", "wmv", "webm", "flv",
];

fn is_video_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| VIDEO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Tracks the last seen blake3 hash of the `adjustments` JSON block per image,
/// so culling-only updates written by RapidReady (rating/flag/color/tags) do NOT
/// invalidate cached thumbnails.
static LAST_ADJUSTMENTS_HASH: LazyLock<Mutex<HashMap<PathBuf, Option<[u8; 32]>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Returns `true` only if `sidecar_path` contains actual external developer edits that
/// changed since the last check (ignoring culling-only writes made inside RapidReady).
pub fn detect_external_developer_edit_change(img_path: &Path, sidecar_path: &Path) -> bool {
    let ext = sidecar_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if ext == "rrdata" {
        if get_rapidraw_config().1.is_none() {
            return false;
        }
        let adj_hash = fs::read_to_string(sidecar_path)
            .ok()
            .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
            .and_then(|mut root| {
                let mut adj = root
                    .get_mut("adjustments")
                    .map(std::mem::take)
                    .unwrap_or(serde_json::Value::Null);
                if let Some(obj) = adj.as_object_mut() {
                    if obj.remove("rating").is_some() && obj.is_empty() {
                        adj = serde_json::Value::Null;
                    }
                }
                if !is_rapidraw_adjustments_edited(&adj) {
                    return None;
                }
                serde_json::to_vec(&adj)
                    .ok()
                    .map(|b| *blake3::hash(&b).as_bytes())
            });

        let mut guard = LAST_ADJUSTMENTS_HASH
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if guard.len() > 100_000 {
            guard.clear();
        }
        let prev = guard.insert(img_path.to_path_buf(), adj_hash);
        match prev {
            Some(old) => old != adj_hash,
            None => adj_hash.is_some(),
        }
    } else if ext == "xmp" {
        if !has_darktable_mipmap_dirs() {
            return false;
        }
        // Only invalidate for XMP files that contain darktable develop history
        fs::read_to_string(sidecar_path)
            .map(|s| s.contains("darktable:history"))
            .unwrap_or(false)
    } else {
        false
    }
}

/// Computes an effective modification timestamp that changes whenever the image's
/// external developer sidecar (.rrdata or .xmp) or developer preview toggle changes.
/// This ensures L1 RAM and L2 ChunkCache automatically invalidate when an image is edited!
pub fn resolve_effective_mtime_for_cache(path: &Path, base_mtime: i64) -> i64 {
    if !get_use_developer_previews() || is_video_extension(path) {
        return base_mtime;
    }

    let mut max_sidecar_mtime = 0i64;

    // Only stat .rrdata on NAS/disk if RapidRAW's local cache directory actually exists
    if get_rapidraw_config().1.is_some() {
        let rr_path = crate::culling::get_sidecar_path(path);
        if let Ok(meta) = fs::metadata(&rr_path) {
            if let Ok(mod_time) = meta.modified() {
                if let Ok(dur) = mod_time.duration_since(UNIX_EPOCH) {
                    max_sidecar_mtime = max_sidecar_mtime.max(dur.as_secs() as i64);
                }
            }
        }
    }

    // Only stat .xmp on NAS/disk if darktable's local mipmaps cache actually exists
    if has_darktable_mipmap_dirs() {
        if let Some(xmp_path) = crate::culling::find_existing_xmp_path(path) {
            if let Ok(meta) = fs::metadata(&xmp_path) {
                if let Ok(mod_time) = meta.modified() {
                    if let Ok(dur) = mod_time.duration_since(UNIX_EPOCH) {
                        max_sidecar_mtime = max_sidecar_mtime.max(dur.as_secs() as i64);
                    }
                }
            }
        }
    }

    let is_dng = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("dng"))
        .unwrap_or(false);

    if max_sidecar_mtime > 0 {
        // Combine base_mtime and sidecar_mtime so any edit in RapidRAW or darktable invalidates the old unedited chunk
        base_mtime.wrapping_add(max_sidecar_mtime.wrapping_mul(31))
    } else if is_dng {
        // Offset DNG cache key when developer previews are enabled so old 160x120 / unedited DNG chunks are bypassed
        base_mtime.wrapping_add(0x444E47)
    } else {
        base_mtime
    }
}

/// Unified lookup for external developer previews:
/// 1. RapidRAW (`$APPCACHE/io.github.CyberTimon.RapidRAW/thumbnails/<blake3>_medium.jpg`)
/// 2. darktable (`$APPCACHE/darktable/mipmaps-*.d/<level>/<imgid>.jpg` via `library.db`)
/// 3. Adobe Lightroom (`.dng` embedded preview extraction, including EOF IFD0 DNGs)
pub fn try_get_developer_preview(
    path: &Path,
    scale: u32,
    target_orient: Option<u32>,
) -> Option<Vec<u8>> {
    if !get_use_developer_previews() || is_video_extension(path) {
        return None;
    }

    // 1. Check RapidRAW cached preview (if .rrdata exists and has adjustments)
    if let Some(bytes) = try_read_rapidraw_cached_preview(path, scale) {
        return Some(bytes);
    }

    // 2. Check darktable cached preview (if .xmp exists and image is in darktable library.db + mipmaps)
    if let Some(bytes) = try_read_darktable_cached_preview(path, scale) {
        return Some(bytes);
    }

    // 3. Check Lightroom DNG embedded preview (.dng only)
    if let Some(bytes) = try_extract_lightroom_dng_preview(path, scale, target_orient) {
        return Some(bytes);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rapidraw_adjustments_edited_detection() {
        assert!(!is_rapidraw_adjustments_edited(&serde_json::Value::Null));
        assert!(!is_rapidraw_adjustments_edited(&serde_json::json!({})));
        assert!(!is_rapidraw_adjustments_edited(&serde_json::json!({
            "baselineExposure": true
        })));
        assert!(is_rapidraw_adjustments_edited(&serde_json::json!({
            "exposure": 0.5
        })));
        assert!(is_rapidraw_adjustments_edited(&serde_json::json!({
            "baselineExposure": true,
            "contrast": 12
        })));
    }

    #[test]
    fn test_rapidraw_render_key_format() {
        let settings = RapidRawSettingsStub::default();
        let key = settings.thumbnail_render_key(true);
        assert!(key.contains("RenderOptions { tonemapper_override: None"));
        assert!(key.contains("BaselineOptions { baseline_exposure: Some(0.7)"));
    }

    #[test]
    fn test_dng_eof_ifd0_extraction() {
        // Build a minimal synthetic Little-Endian TIFF/DNG with IFD0 placed after a fake JPEG preview
        let mut data = Vec::new();
        // Fake 2048-byte JPEG preview starting at offset 8
        let jpeg_off = 8u32;
        let mut fake_jpeg = vec![0u8; 2048];
        fake_jpeg[0] = 0xFF;
        fake_jpeg[1] = 0xD8;
        fake_jpeg[2] = 0xFF;
        fake_jpeg[3] = 0xE0;
        fake_jpeg[2046] = 0xFF;
        fake_jpeg[2047] = 0xD9;

        let ifd0_off = jpeg_off + fake_jpeg.len() as u32;
        // TIFF header: "II", 42, ifd0_off
        data.extend_from_slice(b"II");
        data.extend_from_slice(&42u16.to_le_bytes());
        data.extend_from_slice(&ifd0_off.to_le_bytes());
        data.extend_from_slice(&fake_jpeg);

        // IFD0 with 6 entries: SubfileType(1), Width(1024), Height(683), Compression(7), StripOffsets, StripByteCounts
        let entries: &[(u16, u16, u32, u32)] = &[
            (0x00FE, 4, 1, 1),
            (0x0100, 4, 1, 1024),
            (0x0101, 4, 1, 683),
            (0x0103, 3, 1, 7),
            (0x0111, 4, 1, jpeg_off),
            (0x0117, 4, 1, fake_jpeg.len() as u32),
        ];
        data.extend_from_slice(&(entries.len() as u16).to_le_bytes());
        for &(tag, typ, count, val) in entries {
            data.extend_from_slice(&tag.to_le_bytes());
            data.extend_from_slice(&typ.to_le_bytes());
            data.extend_from_slice(&count.to_le_bytes());
            data.extend_from_slice(&val.to_le_bytes());
        }
        data.extend_from_slice(&0u32.to_le_bytes()); // next IFD = 0

        let tmp = std::env::temp_dir().join("rapidready_test_eof_ifd0.dng");
        fs::write(&tmp, &data).unwrap();
        let extracted = try_extract_lightroom_dng_preview(&tmp, 1, Some(1));
        let _ = fs::remove_file(&tmp);

        let bytes = extracted.expect("Should extract preview from synthetic EOF-IFD0 DNG");
        assert_eq!(bytes.len(), fake_jpeg.len());
        assert_eq!(&bytes[0..2], &[0xFF, 0xD8]);
    }
}


