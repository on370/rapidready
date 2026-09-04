use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;

pub const TAG_PICK: &str = "rr:pick";
pub const TAG_REJECT: &str = "rr:reject";

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct CullingState {
    pub flag: Option<i8>, // 1 = Pick, -1 = Reject, None/0 = Unrated
    pub rating: u8,       // 0 to 5
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

pub fn get_sidecar_path(original_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.rrdata", original_path.to_string_lossy()))
}

pub fn read_sidecar(original_path: &Path) -> CullingState {
    let sidecar_path = get_sidecar_path(original_path);
    if let Ok(contents) = fs::read_to_string(&sidecar_path) {
        return parse_sidecar_json(&contents);
    }
    CullingState::default()
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

        // 3. Tags & Flag Adapter (rr:pick and rr:reject)
        if let Some(tags_arr) = val.get("tags").and_then(|v| v.as_array()) {
            let mut clean_tags = Vec::new();
            for item in tags_arr {
                if let Some(s) = item.as_str() {
                    if s == TAG_PICK {
                        state.flag = Some(1);
                    } else if s == TAG_REJECT {
                        state.flag = Some(-1);
                    } else {
                        clean_tags.push(s.to_string());
                    }
                }
            }
            state.tags = clean_tags;
        }

        // Fallback: Check if flag was written as a native number
        if state.flag.is_none() {
            if let Some(f) = val.get("flag").and_then(|v| v.as_i64()) {
                if f == 1 {
                    state.flag = Some(1);
                } else if f == -1 {
                    state.flag = Some(-1);
                }
            }
        }

        return state;
    }
    CullingState::default()
}

pub fn write_sidecar(original_path: &Path, state: &CullingState) -> anyhow::Result<()> {
    let sidecar_path = get_sidecar_path(original_path);

    // Load existing JSON if available, or create new default map
    let mut root: serde_json::Value = if sidecar_path.exists() {
        if let Ok(contents) = fs::read_to_string(&sidecar_path) {
            serde_json::from_str(&contents).unwrap_or_else(|_| serde_json::json!({}))
        } else {
            serde_json::json!({})
        }
    } else {
        serde_json::json!({})
    };

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

    // 4. Update tags with flag adapter (rr:pick, rr:reject)
    let had_tags_array = matches!(obj.get("tags"), Some(serde_json::Value::Array(_)));
    let mut updated_tags: Vec<String> = match obj.get("tags") {
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str())
            .filter(|s| *s != TAG_PICK && *s != TAG_REJECT)
            .map(|s| s.to_string())
            .collect(),
        _ => Vec::new(),
    };

    // Retain any existing tags from state
    for tag in &state.tags {
        if tag != TAG_PICK && tag != TAG_REJECT && !updated_tags.contains(tag) {
            updated_tags.push(tag.clone());
        }
    }

    // Add pick / reject flag
    match state.flag {
        Some(1) => updated_tags.push(TAG_PICK.to_string()),
        Some(-1) => updated_tags.push(TAG_REJECT.to_string()),
        _ => {}
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

    // 6. Write back formatted JSON
    let json = serde_json::to_string_pretty(&root)?;
    fs::write(&sidecar_path, json)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_rapidraw_with_null_tags() {
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
        };
        write_sidecar(&img_path, &state).unwrap();

        // Read file back directly from disk as raw JSON
        let read_back_raw = fs::read_to_string(&sidecar_path).unwrap();
        let val: serde_json::Value = serde_json::from_str(&read_back_raw).unwrap();

        // 1. Rating updated
        assert_eq!(val["rating"], 5);

        // 2. Flag written to tags
        let tags = val["tags"].as_array().unwrap();
        assert!(tags.iter().any(|t| t == TAG_PICK));

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
        };
        write_sidecar(&img_path, &state).unwrap();

        let read1 = read_sidecar(&img_path);
        assert_eq!(read1.flag, Some(1));
        assert_eq!(read1.rating, 2);
        assert_eq!(read1.tags, vec!["vacation"]);

        // 2. Transition from Pick to Reject
        state.flag = Some(-1);
        write_sidecar(&img_path, &state).unwrap();

        let read2 = read_sidecar(&img_path);
        assert_eq!(read2.flag, Some(-1));
        assert_eq!(read2.tags, vec!["vacation"]);

        // 3. Transition to Unflagged
        state.flag = None;
        write_sidecar(&img_path, &state).unwrap();

        let read3 = read_sidecar(&img_path);
        assert_eq!(read3.flag, None);
        assert_eq!(read3.tags, vec!["vacation"]);

        // Check raw JSON
        let raw = fs::read_to_string(&sidecar_path).unwrap();
        let val: serde_json::Value = serde_json::from_str(&raw).unwrap();
        let tags: Vec<String> = val["tags"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
        assert!(!tags.contains(&TAG_PICK.to_string()));
        assert!(!tags.contains(&TAG_REJECT.to_string()));
        assert_eq!(tags, vec!["vacation"]);

        // Clean up
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_read_real_user_testdata() {
        let test_file = Path::new("/Volumes/eMion2T/Ole/projects/soft/RapidReady/testdata/dest/2014/2014-05-01/IMG_3163.CR2");
        if test_file.exists() {
            let state = read_sidecar(test_file);
            // In Ole's file, rating was set to 3 in RapidRAW
            assert_eq!(state.rating, 3);
        }
    }
}
