use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};

pub use crate::culling_xmp::{
    find_existing_xmp_path, get_xmp_write_path, parse_sidecar_xmp, read_xmp_gps,
    read_xmp_gps_from_str, write_sidecar_xmp, write_sidecar_xmp_to_path, write_xmp_gps,
};

pub const TAG_PICK: &str = "rr:pick";
pub const TAG_REJECT: &str = "rr:reject";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SidecarMode {
    #[default]
    Rrdata,
    Dual,
    Xmp,
}

static SIDECAR_MODE: AtomicU8 = AtomicU8::new(0); // 0 = Rrdata, 1 = Dual, 2 = Xmp

pub fn set_sidecar_mode(mode: SidecarMode) {
    let val = match mode {
        SidecarMode::Rrdata => 0,
        SidecarMode::Dual => 1,
        SidecarMode::Xmp => 2,
    };
    SIDECAR_MODE.store(val, Ordering::SeqCst);
}

pub fn get_sidecar_mode() -> SidecarMode {
    match SIDECAR_MODE.load(Ordering::SeqCst) {
        1 => SidecarMode::Dual,
        2 => SidecarMode::Xmp,
        _ => SidecarMode::Rrdata,
    }
}

/// Serializes tests that depend on the process-global sidecar settings.
///
/// `SIDECAR_MODE` and the XMP naming mode are global, but cargo runs tests on parallel
/// threads: a test switching to XMP mode made unrelated tests write `.xmp` instead of
/// `.rrdata` and fail at random. Every test that writes sidecars or changes these modes
/// holds this guard; it resets both modes to their defaults on acquire and on drop.
#[cfg(test)]
pub(crate) struct SidecarTestGuard {
    _lock: std::sync::MutexGuard<'static, ()>,
}

#[cfg(test)]
impl Drop for SidecarTestGuard {
    fn drop(&mut self) {
        reset_sidecar_modes_for_test();
    }
}

#[cfg(test)]
fn reset_sidecar_modes_for_test() {
    set_sidecar_mode(SidecarMode::Rrdata);
    crate::culling_xmp::set_xmp_naming_mode("standard");
}

#[cfg(test)]
pub(crate) fn sidecar_test_guard() -> SidecarTestGuard {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    // A panicking test poisons the mutex; the state is reset below, so keep going.
    let lock = LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    reset_sidecar_modes_for_test();
    SidecarTestGuard { _lock: lock }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct CullingState {
    pub flag: Option<i8>, // 1 = Pick, -1 = Reject, None/0 = Unrated
    pub rating: u8,       // 0 to 5
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub orientation: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidecar_source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_override: Option<String>, // ISO "YYYY-MM-DDTHH:MM:SS"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_shift_seconds: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub copyright: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage_terms: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

pub fn get_sidecar_path(original_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.rrdata", original_path.to_string_lossy()))
}

/// Reads culling state with single source of truth (SSoT) resolution between .rrdata and .xmp:
/// - If only .rrdata exists -> .rrdata wins (sidecar_source = "rrdata")
/// - If only .xmp exists -> .xmp wins (sidecar_source = "xmp")
/// - If both exist -> compare filesystem modification timestamps (mtime):
///   - If .xmp is strictly newer -> .xmp wins (sidecar_source = "both_xmp")
///   - Otherwise -> .rrdata wins (sidecar_source = "both_rrdata")
/// - If neither exists -> default CullingState (sidecar_source = None)
pub fn read_sidecar(original_path: &Path) -> CullingState {
    let rr_path = get_sidecar_path(original_path);
    let xmp_path = find_existing_xmp_path(original_path);

    let rr_meta = if rr_path.is_file() {
        fs::metadata(&rr_path).ok()
    } else {
        None
    };
    let xmp_meta = xmp_path.as_ref().and_then(|p| fs::metadata(p).ok());

    match (rr_meta, xmp_meta) {
        (Some(rr_m), Some(xmp_m)) => {
            let rr_time = rr_m.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            let xmp_time = xmp_m.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            if xmp_time > rr_time {
                let mut state = xmp_path
                    .and_then(|p| fs::read_to_string(p).ok())
                    .map(|c| parse_sidecar_xmp(&c))
                    .unwrap_or_default();
                state.sidecar_source = Some("both_xmp".to_string());
                state
            } else {
                let mut state = fs::read_to_string(&rr_path)
                    .map(|c| parse_sidecar_json(&c))
                    .unwrap_or_default();
                state.sidecar_source = Some("both_rrdata".to_string());
                state
            }
        }
        (Some(_), None) => {
            let mut state = fs::read_to_string(&rr_path)
                .map(|c| parse_sidecar_json(&c))
                .unwrap_or_default();
            state.sidecar_source = Some("rrdata".to_string());
            state
        }
        (None, Some(_)) => {
            let mut state = xmp_path
                .and_then(|p| fs::read_to_string(p).ok())
                .map(|c| parse_sidecar_xmp(&c))
                .unwrap_or_default();
            state.sidecar_source = Some("xmp".to_string());
            state
        }
        (None, None) => CullingState::default(),
    }
}

/// Reads GPS coordinates from sidecars with mtime SSoT resolution.
pub fn read_sidecar_gps(original_path: &Path) -> Option<(Option<f64>, Option<f64>, Option<f64>)> {
    let rr_path = get_sidecar_path(original_path);
    let xmp_path = find_existing_xmp_path(original_path);

    let rr_meta = if rr_path.is_file() {
        fs::metadata(&rr_path).ok()
    } else {
        None
    };
    let xmp_meta = xmp_path.as_ref().and_then(|p| fs::metadata(p).ok());

    match (rr_meta, xmp_meta) {
        (Some(rr_m), Some(xmp_m)) => {
            let rr_time = rr_m.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            let xmp_time = xmp_m.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            if xmp_time > rr_time {
                read_xmp_gps(original_path).or_else(|| read_rrdata_gps(&rr_path))
            } else {
                read_rrdata_gps(&rr_path).or_else(|| read_xmp_gps(original_path))
            }
        }
        (Some(_), None) => read_rrdata_gps(&rr_path),
        (None, Some(_)) => read_xmp_gps(original_path),
        (None, None) => None,
    }
}

fn read_rrdata_gps(rr_path: &Path) -> Option<(Option<f64>, Option<f64>, Option<f64>)> {
    let contents = fs::read_to_string(rr_path).ok()?;
    let val = serde_json::from_str::<serde_json::Value>(&contents).ok()?;
    let gps_val = val.get("gps")?;
    if gps_val.is_null() {
        // Explicit removal/clearing
        Some((None, None, None))
    } else if let Some(gps_obj) = gps_val.as_object() {
        let lat = gps_obj.get("latitude").and_then(|v| v.as_f64());
        let lon = gps_obj.get("longitude").and_then(|v| v.as_f64());
        let alt = gps_obj.get("altitude").and_then(|v| v.as_f64());
        if lat.is_some() || lon.is_some() {
            Some((lat, lon, alt))
        } else if gps_obj.get("latitude").map_or(false, |v| v.is_null()) {
            Some((None, None, None))
        } else {
            None
        }
    } else {
        None
    }
}

pub fn parse_sidecar_json(contents: &str) -> CullingState {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(contents) {
        let mut state = CullingState::default();

        // 1. Rating (0-5)
        if let Some(r) = val.get("rating").and_then(|v| v.as_u64()) {
            state.rating = r.min(5) as u8;
        }

        // 2. Color (if present)
        if let Some(c) = val.get("color").and_then(|v| v.as_str()) {
            state.color = Some(c.to_string());
        }

        // 3. Orientation override (1, 3, 6, 8)
        if let Some(o) = val.get("orientation").and_then(|v| v.as_u64()) {
            state.orientation = Some(o as u32);
        }

        // 4. Native "flag" field (highest priority) & Tags cleanup / Legacy fallback
        let has_explicit_flag_key = val.get("flag").is_some();
        if let Some(flag_val) = val.get("flag") {
            if let Some(s) = flag_val.as_str() {
                match s.trim().to_ascii_lowercase().as_str() {
                    "pick" | "picked" => state.flag = Some(1),
                    "reject" | "rejected" => state.flag = Some(-1),
                    "none" | "unflagged" | "" => state.flag = None,
                    _ => {}
                }
            } else if let Some(f) = flag_val.as_i64() {
                if f == 1 {
                    state.flag = Some(1);
                } else if f == -1 {
                    state.flag = Some(-1);
                }
            }
        }

        if let Some(tags_arr) = val.get("tags").and_then(|v| v.as_array()) {
            let mut clean_tags = Vec::new();
            for item in tags_arr {
                if let Some(s) = item.as_str() {
                    if s == TAG_PICK {
                        if !has_explicit_flag_key {
                            state.flag = Some(1);
                        }
                    } else if s == TAG_REJECT {
                        if !has_explicit_flag_key {
                            state.flag = Some(-1);
                        }
                    } else {
                        let clean = s.strip_prefix("user:").unwrap_or(s);
                        if !clean.is_empty() && !clean_tags.iter().any(|t| t == clean) {
                            clean_tags.push(clean.to_string());
                        }
                    }
                }
            }
            state.tags = clean_tags;
        }

        // 5. Date override & Time shift
        if let Some(d) = val.get("date_override").or_else(|| val.get("dateOverride")).and_then(|v| v.as_str()) {
            let trimmed = d.trim();
            if !trimmed.is_empty() {
                state.date_override = Some(trimmed.to_string());
            }
        }
        if let Some(s) = val.get("time_shift_seconds").or_else(|| val.get("timeShiftSeconds")).and_then(|v| v.as_i64()) {
            state.time_shift_seconds = Some(s);
        }

        // 6. Editorial metadata (flat root or nested in "editorial" object)
        let editorial_obj = val.get("editorial").and_then(|v| v.as_object());
        let extract_str = |k1: &str, k2: Option<&str>| -> Option<String> {
            val.get(k1)
                .or_else(|| k2.and_then(|k| val.get(k)))
                .or_else(|| editorial_obj.and_then(|obj| obj.get(k1)))
                .or_else(|| k2.and_then(|k| editorial_obj.and_then(|obj| obj.get(k))))
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        };

        state.artist = extract_str("artist", None);
        state.copyright = extract_str("copyright", None);
        state.usage_terms = extract_str("usage_terms", Some("usageTerms"));
        state.title = extract_str("title", None);
        state.description = extract_str("description", None);

        return state;
    }
    CullingState::default()
}

/// Cycles orientation:
/// CW: 1 (0°) -> 6 (90° CW) -> 3 (180°) -> 8 (270° CW) -> 1
/// CCW: 1 (0°) -> 8 (270° CW) -> 3 (180°) -> 6 (90° CW) -> 1
pub fn next_orientation(current: u32, direction: &str) -> u32 {
    let current_norm = match current {
        1 | 3 | 6 | 8 => current,
        _ => 1,
    };
    if direction == "ccw" || direction == "left" {
        match current_norm {
            1 => 8,
            8 => 3,
            3 => 6,
            6 => 1,
            _ => 1,
        }
    } else {
        // default "cw" / "right"
        match current_norm {
            1 => 6,
            6 => 3,
            3 => 8,
            8 => 1,
            _ => 1,
        }
    }
}

/// Returns true if an existing `.rrdata` file still contains legacy `rr:pick` / `rr:reject` tags
/// or unprefixed user tags (missing `"user:"` / `"ai:"` prefix).
pub fn rrdata_needs_flag_migration(rr_path: &Path) -> bool {
    let Ok(contents) = fs::read_to_string(rr_path) else {
        return false;
    };
    if contents.contains(TAG_PICK) || contents.contains(TAG_REJECT) {
        return true;
    }
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&contents) {
        if let Some(tags_arr) = val.get("tags").and_then(|v| v.as_array()) {
            for item in tags_arr {
                if let Some(s) = item.as_str() {
                    let trimmed = s.trim();
                    if !trimmed.is_empty()
                        && trimmed != TAG_PICK
                        && trimmed != TAG_REJECT
                        && !trimmed.starts_with("user:")
                        && !trimmed.starts_with("ai:")
                    {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn format_rrdata_tag(tag: &str) -> String {
    let trimmed = tag.trim();
    if trimmed.starts_with("user:") || trimmed.starts_with("ai:") {
        trimmed.to_string()
    } else {
        format!("user:{}", trimmed)
    }
}

/// Loads an existing `.rrdata` so it can be patched in place.
///
/// RapidRAW stores its edits (`adjustments`, masks, ...) in the same file. If an existing sidecar
/// cannot be read or parsed, writing RapidReady's fields into a fresh object would silently delete
/// those edits, so that is an error and the file is left untouched. A missing or whitespace-only
/// file holds nothing to lose and starts as an empty object.
fn load_rrdata_for_patch(sidecar_path: &Path) -> anyhow::Result<serde_json::Value> {
    let contents = match fs::read_to_string(sidecar_path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(serde_json::json!({})),
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Cannot read existing sidecar {}: {} (left unchanged to protect RapidRAW edits)",
                sidecar_path.display(),
                e
            ))
        }
    };
    if contents.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }
    serde_json::from_str(&contents).map_err(|e| {
        anyhow::anyhow!(
            "Existing sidecar {} is not valid JSON ({}); left unchanged to protect RapidRAW edits",
            sidecar_path.display(),
            e
        )
    })
}

pub fn write_sidecar_rrdata(original_path: &Path, state: &CullingState) -> anyhow::Result<()> {
    let sidecar_path = get_sidecar_path(original_path);

    // Load existing JSON (keeps RapidRAW's fields), or start a new map if there is none
    let mut root = load_rrdata_for_patch(&sidecar_path)?;

    let obj = root.as_object_mut().ok_or_else(|| anyhow::anyhow!("Root is not a JSON object"))?;

    // 1. Ensure version is set (RapidRAW expects version 1)
    if !obj.contains_key("version") {
        obj.insert("version".to_string(), serde_json::json!(1));
    }

    // 2. Patch rating
    obj.insert("rating".to_string(), serde_json::json!(state.rating));

    // 3. If adjustments does not exist, initialize with null (RapidRAW format)
    if !obj.contains_key("adjustments") {
        obj.insert("adjustments".to_string(), serde_json::Value::Null);
    }

    // 4. Clean tags (strip legacy rr:pick / rr:reject, format with "user:" prefix) and write native "flag" field
    let had_tags_array = matches!(obj.get("tags"), Some(serde_json::Value::Array(_)));
    let updated_tags: Vec<String> = state
        .tags
        .iter()
        .filter(|s| *s != TAG_PICK && *s != TAG_REJECT && !s.trim().is_empty())
        .map(|s| format_rrdata_tag(s))
        .collect();

    match state.flag {
        Some(1) => {
            obj.insert("flag".to_string(), serde_json::json!("pick"));
        }
        Some(-1) => {
            obj.insert("flag".to_string(), serde_json::json!("reject"));
        }
        _ => {
            obj.insert("flag".to_string(), serde_json::Value::Null);
        }
    }

    if updated_tags.is_empty() {
        if had_tags_array {
            obj.insert("tags".to_string(), serde_json::json!([]));
        } else {
            obj.insert("tags".to_string(), serde_json::Value::Null);
        }
    } else {
        obj.insert("tags".to_string(), serde_json::json!(updated_tags));
    }

    // 5. Update color if provided
    if let Some(ref c) = state.color {
        obj.insert("color".to_string(), serde_json::json!(c));
    } else if obj.contains_key("color") {
        obj.remove("color");
    }

    // 6. Update orientation if provided
    if let Some(o) = state.orientation {
        obj.insert("orientation".to_string(), serde_json::json!(o));
    } else if obj.contains_key("orientation") {
        obj.remove("orientation");
    }

    // 7. Update date override & time shift
    if let Some(ref d) = state.date_override {
        obj.insert("date_override".to_string(), serde_json::json!(d));
    } else if obj.contains_key("date_override") {
        obj.remove("date_override");
    }
    if let Some(s) = state.time_shift_seconds {
        obj.insert("time_shift_seconds".to_string(), serde_json::json!(s));
    } else if obj.contains_key("time_shift_seconds") {
        obj.remove("time_shift_seconds");
    }

    // 8. Update editorial metadata
    if let Some(ref a) = state.artist {
        obj.insert("artist".to_string(), serde_json::json!(a));
    } else if obj.contains_key("artist") {
        obj.remove("artist");
    }
    if let Some(ref c) = state.copyright {
        obj.insert("copyright".to_string(), serde_json::json!(c));
    } else if obj.contains_key("copyright") {
        obj.remove("copyright");
    }
    if let Some(ref u) = state.usage_terms {
        obj.insert("usage_terms".to_string(), serde_json::json!(u));
    } else if obj.contains_key("usage_terms") {
        obj.remove("usage_terms");
    }
    if let Some(ref t) = state.title {
        obj.insert("title".to_string(), serde_json::json!(t));
    } else if obj.contains_key("title") {
        obj.remove("title");
    }
    if let Some(ref d) = state.description {
        obj.insert("description".to_string(), serde_json::json!(d));
    } else if obj.contains_key("description") {
        obj.remove("description");
    }

    // If an existing "editorial" object was present, clean it up or remove to avoid stale data
    if obj.contains_key("editorial") {
        obj.remove("editorial");
    }

    // 9. Write back formatted JSON atomically (write to unique temp file in same directory + rename)
    let json = serde_json::to_string_pretty(&root)?;
    let parent = sidecar_path.parent().unwrap_or_else(|| Path::new("."));
    let pid = std::process::id();
    let thread_id = std::thread::current().id();
    let file_stem = sidecar_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("sidecar");
    let tmp_path = parent.join(format!(".{}.tmp.{:?}.{}", file_stem, thread_id, pid));

    if let Err(e) = fs::write(&tmp_path, json) {
        let _ = fs::remove_file(&tmp_path);
        return Err(e.into());
    }

    if let Err(e) = fs::rename(&tmp_path, &sidecar_path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(e.into());
    }

    Ok(())
}

pub fn write_sidecar(original_path: &Path, state: &CullingState) -> anyhow::Result<()> {
    match get_sidecar_mode() {
        SidecarMode::Rrdata => {
            write_sidecar_rrdata(original_path, state)?;
            // If an XMP already exists on disk, update it too so it stays in sync
            if find_existing_xmp_path(original_path).is_some() {
                let _ = write_sidecar_xmp(original_path, state);
            }
        }
        SidecarMode::Dual => {
            let res_rr = write_sidecar_rrdata(original_path, state);
            let res_xmp = write_sidecar_xmp(original_path, state);
            res_rr?;
            res_xmp?;
        }
        SidecarMode::Xmp => {
            write_sidecar_xmp(original_path, state)?;
            // If .rrdata already exists on disk, update it too
            let rr_path = get_sidecar_path(original_path);
            if rr_path.is_file() {
                let _ = write_sidecar_rrdata(original_path, state);
            }
        }
    }
    Ok(())
}

/// Atomically updates or clears GPS coordinates in the .rrdata sidecar.
/// If latitude and longitude are Some, writes or updates `"gps": { "latitude": ..., "longitude": ..., "altitude": ... }`.
/// If latitude and longitude are None, sets `"gps": null` to explicitly override/remove location.
/// Preserves all existing culling metadata (ratings, flags, tags, color, orientation, adjustments).
pub fn write_gps_sidecar_rrdata(
    original_path: &Path,
    latitude: Option<f64>,
    longitude: Option<f64>,
    altitude: Option<f64>,
) -> anyhow::Result<()> {
    let sidecar_path = get_sidecar_path(original_path);

    // Load existing JSON (keeps RapidRAW's fields), or start a new map if there is none
    let mut root = load_rrdata_for_patch(&sidecar_path)?;

    let obj = root.as_object_mut().ok_or_else(|| anyhow::anyhow!("Root is not a JSON object"))?;

    // 1. Ensure version is set (RapidRAW expects version 1)
    if !obj.contains_key("version") {
        obj.insert("version".to_string(), serde_json::json!(1));
    }

    // 2. If adjustments does not exist, initialize with null (RapidRAW format)
    if !obj.contains_key("adjustments") {
        obj.insert("adjustments".to_string(), serde_json::Value::Null);
    }

    // 3. Update or clear gps object
    match (latitude, longitude) {
        (Some(lat), Some(lon)) => {
            let mut gps_map = serde_json::Map::new();
            gps_map.insert("latitude".to_string(), serde_json::json!(lat));
            gps_map.insert("longitude".to_string(), serde_json::json!(lon));
            if let Some(alt) = altitude {
                gps_map.insert("altitude".to_string(), serde_json::json!(alt));
            }
            obj.insert("gps".to_string(), serde_json::Value::Object(gps_map));
        }
        _ => {
            // Explicit null to override camera EXIF if present
            obj.insert("gps".to_string(), serde_json::Value::Null);
        }
    }

    // 4. Write back formatted JSON atomically
    let json = serde_json::to_string_pretty(&root)?;
    let parent = sidecar_path.parent().unwrap_or_else(|| Path::new("."));
    let pid = std::process::id();
    let thread_id = std::thread::current().id();
    let file_stem = sidecar_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("sidecar");
    let tmp_path = parent.join(format!(".{}.tmp.{:?}.{}", file_stem, thread_id, pid));

    if let Err(e) = fs::write(&tmp_path, json) {
        let _ = fs::remove_file(&tmp_path);
        return Err(e.into());
    }

    if let Err(e) = fs::rename(&tmp_path, &sidecar_path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(e.into());
    }

    Ok(())
}

pub fn write_gps_sidecar(
    original_path: &Path,
    latitude: Option<f64>,
    longitude: Option<f64>,
    altitude: Option<f64>,
) -> anyhow::Result<()> {
    match get_sidecar_mode() {
        SidecarMode::Rrdata => {
            write_gps_sidecar_rrdata(original_path, latitude, longitude, altitude)?;
            if find_existing_xmp_path(original_path).is_some() {
                let _ = write_xmp_gps(original_path, latitude, longitude, altitude);
            }
        }
        SidecarMode::Dual => {
            let res_rr = write_gps_sidecar_rrdata(original_path, latitude, longitude, altitude);
            let res_xmp = write_xmp_gps(original_path, latitude, longitude, altitude);
            res_rr?;
            res_xmp?;
        }
        SidecarMode::Xmp => {
            write_xmp_gps(original_path, latitude, longitude, altitude)?;
            let rr_path = get_sidecar_path(original_path);
            if rr_path.is_file() {
                let _ = write_gps_sidecar_rrdata(original_path, latitude, longitude, altitude);
            }
        }
    }
    Ok(())
}

pub fn write_editorial_sidecar(
    original_path: &Path,
    artist: Option<Option<String>>,
    copyright: Option<Option<String>>,
    usage_terms: Option<Option<String>>,
    title: Option<Option<String>>,
    description: Option<Option<String>>,
) -> anyhow::Result<CullingState> {
    let mut state = read_sidecar(original_path);

    let apply_patch = |current: &mut Option<String>, patch: Option<Option<String>>| {
        if let Some(val_opt) = patch {
            match val_opt {
                Some(text) if !text.trim().is_empty() => *current = Some(text.trim().to_string()),
                _ => *current = None,
            }
        }
    };

    apply_patch(&mut state.artist, artist);
    apply_patch(&mut state.copyright, copyright);
    apply_patch(&mut state.usage_terms, usage_terms);
    apply_patch(&mut state.title, title);
    apply_patch(&mut state.description, description);

    write_sidecar(original_path, &state)?;
    Ok(read_sidecar(original_path))
}

pub fn write_date_override_sidecar(
    original_path: &Path,
    date_override: Option<Option<String>>,
    time_shift_seconds: Option<Option<i64>>,
) -> anyhow::Result<CullingState> {
    let mut state = read_sidecar(original_path);

    if let Some(date_opt) = date_override {
        match date_opt {
            Some(text) if !text.trim().is_empty() => {
                state.date_override = Some(text.trim().to_string());
            }
            _ => state.date_override = None,
        }
    }

    if let Some(shift_opt) = time_shift_seconds {
        match shift_opt {
            Some(val) if val != 0 => state.time_shift_seconds = Some(val),
            _ => state.time_shift_seconds = None,
        }
    }

    write_sidecar(original_path, &state)?;
    Ok(read_sidecar(original_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_rapidraw_with_null_tags() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        let json = r#"{
            "version": 1,
            "rating": 3,
            "adjustments": {
                "exposure": 0.5,
                "contrast": 10
            },
            "tags": null,
            "exif": {
                "Make": "Canon"
            }
        }"#;

        let state = parse_sidecar_json(json);
        assert_eq!(state.rating, 3);
        assert_eq!(state.flag, None);
        assert!(state.tags.is_empty());
    }

    #[test]
    fn test_read_rapidraw_with_pick_and_reject_tags() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        let pick_json = r#"{
            "version": 1,
            "rating": 4,
            "tags": ["landscape", "rr:pick"]
        }"#;
        let pick_state = parse_sidecar_json(pick_json);
        assert_eq!(pick_state.rating, 4);
        assert_eq!(pick_state.flag, Some(1));
        assert_eq!(pick_state.tags, vec!["landscape"]);

        let reject_json = r#"{
            "version": 1,
            "rating": 1,
            "tags": ["blurry", "rr:reject"]
        }"#;
        let reject_state = parse_sidecar_json(reject_json);
        assert_eq!(reject_state.rating, 1);
        assert_eq!(reject_state.flag, Some(-1));
        assert_eq!(reject_state.tags, vec!["blurry"]);
    }

    #[test]
    fn test_non_destructive_write_preserves_adjustments_and_exif() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        let temp_dir = std::env::temp_dir().join(format!("rr_test_{}", std::process::id()));
        fs::create_dir_all(&temp_dir).unwrap();
        let img_path = temp_dir.join("photo.CR2");
        let sidecar_path = temp_dir.join("photo.CR2.rrdata");

        // Simulate a pre-existing RapidRAW file with adjustments
        let initial_json = r#"{
            "version": 1,
            "rating": 0,
            "adjustments": {
                "aiPatches": [],
                "exposure": 1.25,
                "curves": { "blue": [{"x": 0, "y": 0}] }
            },
            "tags": null,
            "exif": {
                "Camera": "RICOH GR III",
                "ISO": 200
            }
        }"#;
        fs::write(&sidecar_path, initial_json).unwrap();

        // Perform culling in RapidReady: set Pick and 5 stars
        let state = CullingState {
            flag: Some(1),
            rating: 5,
            color: None,
            tags: vec![],
            orientation: None,
            sidecar_source: None,
            ..Default::default()
        };
        write_sidecar(&img_path, &state).unwrap();

        // Read file back directly from disk as raw JSON
        let read_back_raw = fs::read_to_string(&sidecar_path).unwrap();
        let val: serde_json::Value = serde_json::from_str(&read_back_raw).unwrap();

        // 1. Rating updated
        assert_eq!(val["rating"], 5);

        // 2. Native flag written, no rr:pick in tags
        assert_eq!(val["flag"], "pick");
        assert!(val["tags"].is_null() || !val["tags"].as_array().unwrap().iter().any(|t| t == TAG_PICK));

        // 3. Adjustments and EXIF 100% PRESERVED!
        assert_eq!(val["adjustments"]["exposure"], 1.25);
        assert_eq!(val["adjustments"]["curves"]["blue"][0]["x"], 0);
        assert_eq!(val["exif"]["Camera"], "RICOH GR III");
        assert_eq!(val["exif"]["ISO"], 200);
        assert_eq!(val["version"], 1);

        // Clean up
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_flag_transitions() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        let temp_dir = std::env::temp_dir().join(format!("rr_test_trans_{}", std::process::id()));
        fs::create_dir_all(&temp_dir).unwrap();
        let img_path = temp_dir.join("test.dng");
        let sidecar_path = temp_dir.join("test.dng.rrdata");

        // 1. New file -> Pick
        let mut state = CullingState {
            flag: Some(1),
            rating: 2,
            color: None,
            tags: vec!["vacation".to_string()],
            orientation: None,
            sidecar_source: None,
            ..Default::default()
        };
        write_sidecar(&img_path, &state).unwrap();

        let read1 = read_sidecar(&img_path);
        assert_eq!(read1.flag, Some(1));
        assert_eq!(read1.rating, 2);
        assert_eq!(read1.tags, vec!["vacation"]);
        let val1: serde_json::Value = serde_json::from_str(&fs::read_to_string(&sidecar_path).unwrap()).unwrap();
        assert_eq!(val1["flag"], "pick");
        assert_eq!(val1["tags"], serde_json::json!(["user:vacation"]));

        // 2. Transition from Pick to Reject
        state.flag = Some(-1);
        write_sidecar(&img_path, &state).unwrap();

        let read2 = read_sidecar(&img_path);
        assert_eq!(read2.flag, Some(-1));
        assert_eq!(read2.tags, vec!["vacation"]);
        let val2: serde_json::Value = serde_json::from_str(&fs::read_to_string(&sidecar_path).unwrap()).unwrap();
        assert_eq!(val2["flag"], "reject");
        assert_eq!(val2["tags"], serde_json::json!(["user:vacation"]));

        // 3. Transition to Unflagged
        state.flag = None;
        write_sidecar(&img_path, &state).unwrap();

        let read3 = read_sidecar(&img_path);
        assert_eq!(read3.flag, None);
        assert_eq!(read3.tags, vec!["vacation"]);

        // Check raw JSON
        let raw = fs::read_to_string(&sidecar_path).unwrap();
        let val: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(val["flag"], serde_json::Value::Null);
        let tags: Vec<String> = val["tags"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
        assert!(!tags.contains(&TAG_PICK.to_string()));
        assert!(!tags.contains(&TAG_REJECT.to_string()));
        assert_eq!(tags, vec!["user:vacation"]);

        // Clean up
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_rrdata_native_flag_and_legacy_fallback() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        // 1. Native string flags (including case-insensitivity)
        let s_pick = parse_sidecar_json(r#"{"flag": "PICK", "tags": ["nature"]}"#);
        assert_eq!(s_pick.flag, Some(1));
        assert_eq!(s_pick.tags, vec!["nature"]);

        let s_reject = parse_sidecar_json(r#"{"flag": "Reject", "tags": []}"#);
        assert_eq!(s_reject.flag, Some(-1));

        // 2. Legacy .rrdata without "flag" key falls back to rr:pick / rr:reject in tags and cleans tags
        let s_legacy = parse_sidecar_json(r#"{"rating": 3, "tags": ["sunset", "rr:pick"]}"#);
        assert_eq!(s_legacy.flag, Some(1));
        assert_eq!(s_legacy.rating, 3);
        assert_eq!(s_legacy.tags, vec!["sunset"]);

        // 3. Explicit "flag": null overrides legacy rr:pick in tags, while still cleaning tags
        let s_explicit_null = parse_sidecar_json(r#"{"flag": null, "tags": ["sunset", "rr:pick"]}"#);
        assert_eq!(s_explicit_null.flag, None);
        assert_eq!(s_explicit_null.tags, vec!["sunset"]);

        // 4. Roundtrip check for "user:" / "ai:" prefixes
        let parsed = parse_sidecar_json(r#"{"flag": "pick", "tags": ["Testga", "user:rtest", "ai:sunset"]}"#);
        assert_eq!(parsed.tags, vec!["Testga", "rtest", "ai:sunset"]);

        let temp_dir = std::env::temp_dir().join(format!("rr_user_prefix_{}", std::process::id()));
        fs::create_dir_all(&temp_dir).unwrap();
        let img_path = temp_dir.join("test_tags.arw");
        let rr_path = get_sidecar_path(&img_path);

        // Unprefixed tag in file triggers migration check
        fs::write(&rr_path, r#"{"flag": "pick", "tags": ["Testga"]}"#).unwrap();
        assert!(rrdata_needs_flag_migration(&rr_path));

        write_sidecar_rrdata(&img_path, &parsed).unwrap();
        let raw_written: serde_json::Value = serde_json::from_str(&fs::read_to_string(&rr_path).unwrap()).unwrap();
        assert_eq!(raw_written["tags"], serde_json::json!(["user:Testga", "user:rtest", "ai:sunset"]));
        assert!(!rrdata_needs_flag_migration(&rr_path));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_sidecar_orientation_cycle_and_persistence() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        assert_eq!(next_orientation(1, "cw"), 6);
        assert_eq!(next_orientation(6, "cw"), 3);
        assert_eq!(next_orientation(3, "cw"), 8);
        assert_eq!(next_orientation(8, "cw"), 1);

        assert_eq!(next_orientation(1, "ccw"), 8);
        assert_eq!(next_orientation(8, "ccw"), 3);
        assert_eq!(next_orientation(3, "ccw"), 6);
        assert_eq!(next_orientation(6, "ccw"), 1);

        let temp_dir = std::env::temp_dir().join(format!("rr_orient_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);
        let img_path = temp_dir.join("photo.jpg");
        let sidecar_path = temp_dir.join("photo.jpg.rrdata");

        let mut state = CullingState {
            orientation: Some(6),
            ..Default::default()
        };
        write_sidecar(&img_path, &state).unwrap();

        let read = read_sidecar(&img_path);
        assert_eq!(read.orientation, Some(6));

        state.orientation = Some(next_orientation(read.orientation.unwrap(), "cw"));
        assert_eq!(state.orientation, Some(3));
        write_sidecar(&img_path, &state).unwrap();

        let read2 = read_sidecar(&img_path);
        assert_eq!(read2.orientation, Some(3));

        let _ = fs::remove_file(&sidecar_path);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_tags_and_color_persistence_and_deletion() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        let temp_dir = std::env::temp_dir().join(format!("rr_tags_color_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);
        let img_path = temp_dir.join("sample.arw");

        // 1. Initial write with tags and color
        let mut state = CullingState {
            flag: Some(1),
            rating: 4,
            color: Some("red".to_string()),
            tags: vec!["Portrait".to_string(), "Studio".to_string()],
            orientation: None,
            sidecar_source: None,
            ..Default::default()
        };
        write_sidecar(&img_path, &state).unwrap();

        let read1 = read_sidecar(&img_path);
        assert_eq!(read1.color, Some("red".to_string()));
        assert_eq!(read1.tags, vec!["Portrait", "Studio"]);
        assert_eq!(read1.flag, Some(1));

        // 2. Delete one tag and change color
        state.tags = vec!["Portrait".to_string()];
        state.color = Some("blue".to_string());
        write_sidecar(&img_path, &state).unwrap();

        let read2 = read_sidecar(&img_path);
        assert_eq!(read2.color, Some("blue".to_string()));
        assert_eq!(read2.tags, vec!["Portrait"]);

        // 3. Clear all tags and color
        state.tags = vec![];
        state.color = None;
        write_sidecar(&img_path, &state).unwrap();

        let read3 = read_sidecar(&img_path);
        assert_eq!(read3.color, None);
        assert!(read3.tags.is_empty());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_atomic_sidecar_write() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        let temp_dir = std::env::temp_dir().join(format!("rr_atomic_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);
        let img_path = temp_dir.join("test_atomic.cr2");
        let sidecar_path = temp_dir.join("test_atomic.cr2.rrdata");

        let state = CullingState {
            flag: Some(1),
            rating: 5,
            color: Some("purple".to_string()),
            tags: vec!["atomic".to_string()],
            orientation: None,
            sidecar_source: None,
            ..Default::default()
        };

        write_sidecar(&img_path, &state).unwrap();
        assert!(sidecar_path.exists(), "Sidecar file must exist after write");

        // Verify no leftover .tmp files
        let entries: Vec<_> = fs::read_dir(&temp_dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".tmp."))
            .collect();
        assert!(entries.is_empty(), "No temporary files should remain after atomic write");

        let read = read_sidecar(&img_path);
        assert_eq!(read.rating, 5);
        assert_eq!(read.flag, Some(1));
        assert_eq!(read.color, Some("purple".to_string()));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_write_gps_sidecar_and_override() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        set_sidecar_mode(SidecarMode::Rrdata);
        let temp_dir = std::env::temp_dir().join(format!("rr_gps_write_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);
        let img_path = temp_dir.join("test_gps.cr2");
        let sidecar_path = temp_dir.join("test_gps.cr2.rrdata");

        // Write GPS coordinates
        write_gps_sidecar(&img_path, Some(48.137154), Some(11.575421), Some(520.0)).unwrap();
        assert!(sidecar_path.exists());

        // Verify JSON contents
        let contents = fs::read_to_string(&sidecar_path).unwrap();
        let val: serde_json::Value = serde_json::from_str(&contents).unwrap();
        let gps = val.get("gps").and_then(|v| v.as_object()).unwrap();
        assert_eq!(gps.get("latitude").and_then(|v| v.as_f64()), Some(48.137154));
        assert_eq!(gps.get("longitude").and_then(|v| v.as_f64()), Some(11.575421));
        assert_eq!(gps.get("altitude").and_then(|v| v.as_f64()), Some(520.0));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_clear_gps_sidecar() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        set_sidecar_mode(SidecarMode::Rrdata);
        let temp_dir = std::env::temp_dir().join(format!("rr_gps_clear_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);
        let img_path = temp_dir.join("test_clear.cr2");
        let sidecar_path = temp_dir.join("test_clear.cr2.rrdata");

        // First write coordinates
        write_gps_sidecar(&img_path, Some(48.137154), Some(11.575421), None).unwrap();
        
        // Then clear coordinates (None, None, None)
        write_gps_sidecar(&img_path, None, None, None).unwrap();

        let contents = fs::read_to_string(&sidecar_path).unwrap();
        let val: serde_json::Value = serde_json::from_str(&contents).unwrap();
        assert!(val.get("gps").unwrap().is_null(), "GPS should be explicit null");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_gps_sidecar_preserves_culling() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        let temp_dir = std::env::temp_dir().join(format!("rr_gps_pres_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);
        let img_path = temp_dir.join("test_pres.cr2");

        // 1. Write culling state
        let culling = CullingState {
            flag: Some(1),
            rating: 4,
            color: Some("yellow".to_string()),
            tags: vec!["Vacation".to_string(), "Munich".to_string()],
            orientation: Some(6),
            sidecar_source: None,
            ..Default::default()
        };
        write_sidecar(&img_path, &culling).unwrap();

        // 2. Write GPS coordinates
        write_gps_sidecar(&img_path, Some(48.137154), Some(11.575421), Some(515.0)).unwrap();

        // 3. Verify culling is preserved
        let read_culling = read_sidecar(&img_path);
        assert_eq!(read_culling.rating, 4);
        assert_eq!(read_culling.flag, Some(1));
        assert_eq!(read_culling.color, Some("yellow".to_string()));
        assert_eq!(read_culling.tags, vec!["Vacation", "Munich"]);
        assert_eq!(read_culling.orientation, Some(6));

        // 4. Update culling rating to 5
        let mut updated_culling = read_culling;
        updated_culling.rating = 5;
        write_sidecar(&img_path, &updated_culling).unwrap();

        // 5. Verify GPS is still preserved in sidecar
        let sidecar_path = get_sidecar_path(&img_path);
        let contents = fs::read_to_string(&sidecar_path).unwrap();
        let val: serde_json::Value = serde_json::from_str(&contents).unwrap();
        let gps = val.get("gps").and_then(|v| v.as_object()).unwrap();
        assert_eq!(gps.get("latitude").and_then(|v| v.as_f64()), Some(48.137154));
        assert_eq!(gps.get("longitude").and_then(|v| v.as_f64()), Some(11.575421));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_xmp_read_write_roundtrip() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        let temp_dir = std::env::temp_dir().join(format!("rr_xmp_rt_{}", std::process::id()));
        fs::create_dir_all(&temp_dir).unwrap();
        let img_path = temp_dir.join("photo.ARW");

        // Set global mode to XMP
        set_sidecar_mode(SidecarMode::Xmp);

        // 1. Write initial culling
        let state = CullingState {
            flag: Some(1),
            rating: 5,
            color: Some("green".to_string()),
            tags: vec!["landscape".to_string(), "mountains".to_string()],
            orientation: Some(6),
            sidecar_source: None,
            ..Default::default()
        };
        write_sidecar(&img_path, &state).unwrap();

        let read = read_sidecar(&img_path);
        assert_eq!(read.rating, 5);
        assert_eq!(read.flag, Some(1));
        assert_eq!(read.color, Some("green".to_string()));
        assert_eq!(read.tags, vec!["landscape", "mountains"]);
        assert_eq!(read.orientation, Some(6));
        assert_eq!(read.sidecar_source, Some("xmp".to_string()));

        // 2. Reject transition
        let reject_state = CullingState {
            flag: Some(-1),
            rating: 0,
            color: None,
            tags: vec!["blurry".to_string()],
            orientation: None,
            sidecar_source: None,
            ..Default::default()
        };
        write_sidecar(&img_path, &reject_state).unwrap();

        let read2 = read_sidecar(&img_path);
        assert_eq!(read2.rating, 0);
        assert_eq!(read2.flag, Some(-1));
        assert_eq!(read2.color, None);
        assert_eq!(read2.tags, vec!["blurry"]);

        // Reset mode
        set_sidecar_mode(SidecarMode::Rrdata);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_xmp_non_destructive_preservation() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        let temp_dir = std::env::temp_dir().join(format!("rr_xmp_nd_{}", std::process::id()));
        fs::create_dir_all(&temp_dir).unwrap();
        let img_path = temp_dir.join("lightroom_edit.dng");
        let xmp_path = temp_dir.join("lightroom_edit.xmp");

        // Pre-populate with Lightroom and darktable blocks
        let initial_xmp = r#"<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   xmlns:darktable="http://darktable.sf.net/">
   <crs:Exposure2012>+1.25</crs:Exposure2012>
   <crs:Highlights2012>-30</crs:Highlights2012>
   <darktable:history>
     <darktable:step num="1" module="exposure" enabled="1"/>
   </darktable:history>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>"#;
        fs::write(&xmp_path, initial_xmp).unwrap();

        // Perform culling write in RapidReady
        let state = CullingState {
            flag: Some(1),
            rating: 4,
            color: Some("blue".to_string()),
            tags: vec!["urban".to_string()],
            orientation: Some(1),
            sidecar_source: None,
            ..Default::default()
        };
        write_sidecar_xmp(&img_path, &state).unwrap();

        let read_back = fs::read_to_string(&xmp_path).unwrap();

        // 1. Preserves external development blocks
        assert!(read_back.contains("<crs:Exposure2012>+1.25</crs:Exposure2012>"));
        assert!(read_back.contains("<crs:Highlights2012>-30</crs:Highlights2012>"));
        assert!(read_back.contains("<darktable:step num=\"1\" module=\"exposure\" enabled=\"1\"/>"));

        // 2. Properly updated culling values
        assert!(read_back.contains("xmp:Rating=\"4\"") || read_back.contains("<xmp:Rating>4</xmp:Rating>"));
        assert!(read_back.contains("xmp:Label=\"Blue\"") || read_back.contains("<xmp:Label>Blue</xmp:Label>"));
        assert!(read_back.contains("<rdf:li>urban</rdf:li>"));
        assert!(read_back.contains("<rdf:li>rr:pick</rdf:li>"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_ssot_mtime_coexistence() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        let temp_dir = std::env::temp_dir().join(format!("rr_ssot_{}", std::process::id()));
        fs::create_dir_all(&temp_dir).unwrap();
        let img_path = temp_dir.join("photo.CR3");
        let _rr_path = temp_dir.join("photo.CR3.rrdata");
        let xmp_path = temp_dir.join("photo.xmp");

        // 1. Create .rrdata first
        let rr_state = CullingState {
            rating: 2,
            ..Default::default()
        };
        write_sidecar_rrdata(&img_path, &rr_state).unwrap();

        // Sleep briefly to ensure distinct mtime
        std::thread::sleep(std::time::Duration::from_millis(50));

        // 2. Create .xmp with newer modification time
        let xmp_state = CullingState {
            rating: 5,
            ..Default::default()
        };
        write_sidecar_xmp_to_path(&xmp_path, &xmp_state).unwrap();

        // .xmp is newer -> xmp wins as SSoT
        let read1 = read_sidecar(&img_path);
        assert_eq!(read1.rating, 5);
        assert_eq!(read1.sidecar_source, Some("both_xmp".to_string()));

        // Sleep briefly and update .rrdata so .rrdata is newer
        std::thread::sleep(std::time::Duration::from_millis(50));
        let rr_state_newer = CullingState {
            rating: 3,
            ..Default::default()
        };
        write_sidecar_rrdata(&img_path, &rr_state_newer).unwrap();

        // .rrdata is now newer -> rrdata wins as SSoT
        let read2 = read_sidecar(&img_path);
        assert_eq!(read2.rating, 3);
        assert_eq!(read2.sidecar_source, Some("both_rrdata".to_string()));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_editorial_and_date_override_roundtrip() {
        let _sidecar_guard = crate::culling::sidecar_test_guard();
        set_sidecar_mode(SidecarMode::Rrdata);
        let temp_dir = std::env::temp_dir().join(format!("rr_editorial_test_{}", std::process::id()));
        fs::create_dir_all(&temp_dir).unwrap();
        let img_path = temp_dir.join("photo.CR2");

        // 1. Write editorial in rrdata
        write_editorial_sidecar(
            &img_path,
            Some(Some("Jane Doe".to_string())),
            Some(Some("© 2026 Jane Doe".to_string())),
            Some(Some("Editorial Use Only".to_string())),
            Some(Some("Alpine Summit".to_string())),
            Some(Some("Sunset over the mountains".to_string())),
        ).unwrap();

        let read = read_sidecar(&img_path);
        assert_eq!(read.artist.as_deref(), Some("Jane Doe"));
        assert_eq!(read.copyright.as_deref(), Some("© 2026 Jane Doe"));
        assert_eq!(read.usage_terms.as_deref(), Some("Editorial Use Only"));
        assert_eq!(read.title.as_deref(), Some("Alpine Summit"));
        assert_eq!(read.description.as_deref(), Some("Sunset over the mountains"));

        // 2. Write date override & time shift
        write_date_override_sidecar(
            &img_path,
            Some(Some("2026-07-20T18:45:00".to_string())),
            Some(Some(3600)),
        ).unwrap();

        let read2 = read_sidecar(&img_path);
        assert_eq!(read2.date_override.as_deref(), Some("2026-07-20T18:45:00"));
        assert_eq!(read2.time_shift_seconds, Some(3600));
        // Verify editorial preserved!
        assert_eq!(read2.artist.as_deref(), Some("Jane Doe"));

        // 3. Roundtrip with XMP
        set_sidecar_mode(SidecarMode::Xmp);
        write_editorial_sidecar(
            &img_path,
            Some(Some("John Smith".to_string())),
            None, // unchanged
            None, // unchanged
            None, // unchanged
            None, // unchanged
        ).unwrap();

        let read_xmp = read_sidecar(&img_path);
        assert_eq!(read_xmp.artist.as_deref(), Some("John Smith"));
        assert_eq!(read_xmp.copyright.as_deref(), Some("© 2026 Jane Doe"));
        assert_eq!(read_xmp.date_override.as_deref(), Some("2026-07-20T18:45:00"));

        set_sidecar_mode(SidecarMode::Rrdata);
        let _ = fs::remove_dir_all(&temp_dir);
    }
}

/// `.rrdata` files are shared with RapidRAW, which stores its edits (`adjustments`, masks, ...)
/// in them. RapidReady must never replace such a file with only its own fields.
#[cfg(test)]
mod rrdata_safety_tests {
    use super::*;

    const RAPIDRAW_EDITS: &str = r#"{"version":1,"rating":2,"adjustments":{"exposure":1.35,"masks":[{"id":"m1"}]},"tags":["user:wedding"],"rapidraw_only":{"keep":true}}"#;

    fn setup(name: &str, sidecar_contents: Option<&str>) -> (std::path::PathBuf, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("rr_rrdata_safety_{}_{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let img = dir.join("DSC00042.ARW");
        fs::write(&img, b"raw").unwrap();
        if let Some(c) = sidecar_contents {
            fs::write(get_sidecar_path(&img), c).unwrap();
        }
        (dir, img)
    }

    fn rated(rating: u8) -> CullingState {
        CullingState { rating, ..CullingState::default() }
    }

    #[test]
    fn truncated_rrdata_is_not_overwritten() {
        // e.g. interrupted write by another tool, sync conflict, half-transferred NAS file
        let truncated = &RAPIDRAW_EDITS[..RAPIDRAW_EDITS.len() - 1];
        let (dir, img) = setup("truncated", Some(truncated));

        let res = write_sidecar_rrdata(&img, &rated(4));

        assert!(res.is_err(), "must refuse to overwrite an unparseable sidecar");
        assert_eq!(fs::read_to_string(get_sidecar_path(&img)).unwrap(), truncated, "file must stay untouched");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn truncated_rrdata_is_not_overwritten_by_gps_write() {
        let truncated = &RAPIDRAW_EDITS[..RAPIDRAW_EDITS.len() - 1];
        let (dir, img) = setup("truncated_gps", Some(truncated));

        let res = write_gps_sidecar_rrdata(&img, Some(47.5), Some(8.5), None);

        assert!(res.is_err());
        assert_eq!(fs::read_to_string(get_sidecar_path(&img)).unwrap(), truncated);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn valid_rrdata_keeps_rapidraw_edits() {
        let (dir, img) = setup("valid", Some(RAPIDRAW_EDITS));

        write_sidecar_rrdata(&img, &rated(4)).unwrap();

        let v: serde_json::Value = serde_json::from_str(&fs::read_to_string(get_sidecar_path(&img)).unwrap()).unwrap();
        assert_eq!(v["rating"], 4);
        assert_eq!(v["adjustments"]["exposure"], 1.35);
        assert_eq!(v["adjustments"]["masks"][0]["id"], "m1");
        assert_eq!(v["rapidraw_only"]["keep"], true);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn empty_rrdata_is_treated_as_new() {
        // An empty file holds nothing to lose; refusing it would block rating that image forever.
        let (dir, img) = setup("empty", Some("  \n"));

        write_sidecar_rrdata(&img, &rated(3)).unwrap();

        let v: serde_json::Value = serde_json::from_str(&fs::read_to_string(get_sidecar_path(&img)).unwrap()).unwrap();
        assert_eq!(v["rating"], 3);
        let _ = fs::remove_dir_all(&dir);
    }
}
