use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AlbumItem {
    Album {
        id: String,
        name: String,
        icon: Option<String>,
        images: Vec<String>,
    },
    Group {
        id: String,
        name: String,
        icon: Option<String>,
        children: Vec<AlbumItem>,
    },
}

impl AlbumItem {
    pub fn id(&self) -> &str {
        match self {
            AlbumItem::Album { id, .. } => id,
            AlbumItem::Group { id, .. } => id,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            AlbumItem::Album { name, .. } => name,
            AlbumItem::Group { name, .. } => name,
        }
    }

    pub fn icon(&self) -> Option<&str> {
        match self {
            AlbumItem::Album { icon, .. } => icon.as_deref(),
            AlbumItem::Group { icon, .. } => icon.as_deref(),
        }
    }
}

/// Recursively sorts groups first (alphabetically case-insensitive),
/// followed by albums (alphabetically case-insensitive).
pub fn sort_album_tree(items: &mut [AlbumItem]) {
    items.sort_by(|a, b| {
        let get_sort_key = |item: &AlbumItem| match item {
            AlbumItem::Group { name, .. } => (0, name.to_lowercase()),
            AlbumItem::Album { name, .. } => (1, name.to_lowercase()),
        };
        let key_a = get_sort_key(a);
        let key_b = get_sort_key(b);
        key_a.cmp(&key_b)
    });

    for item in items.iter_mut() {
        if let AlbumItem::Group { children, .. } = item {
            sort_album_tree(children);
        }
    }
}

/// Resolves standard path for RapidReady's albums.json
/// e.g. <app_data_dir>/albums/albums.json
pub fn resolve_rapidready_albums_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("albums").join("albums.json")
}

/// Resolves standard path for RapidRAW's albums.json if it exists on the system
/// macOS: ~/Library/Application Support/io.github.CyberTimon.RapidRAW/albums/albums.json
/// Windows: %APPDATA%/io.github.CyberTimon.RapidRAW/albums/albums.json
/// Linux: ~/.local/share/io.github.CyberTimon.RapidRAW/albums/albums.json
pub fn resolve_rapidraw_albums_path(app_data_dir: &Path) -> Option<PathBuf> {
    if let Some(parent) = app_data_dir.parent() {
        let rapidraw_dir = parent.join("io.github.CyberTimon.RapidRAW");
        let candidate = rapidraw_dir.join("albums").join("albums.json");
        if candidate.exists() || rapidraw_dir.exists() {
            return Some(candidate);
        }
    }

    // Windows fallback check: %APPDATA%\io.github.CyberTimon.RapidRAW
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let candidate = PathBuf::from(appdata)
                .join("io.github.CyberTimon.RapidRAW")
                .join("albums")
                .join("albums.json");
            if candidate.exists() || candidate.parent().map(|p| p.exists()).unwrap_or(false) {
                return Some(candidate);
            }
        }
    }

    None
}

/// Loads collections using Last-Write-Wins (LWW) synchronization with RapidRAW.
/// If RapidRAW has newer changes, mirrors them into RapidReady with backup.
pub fn load_collections(app_data_dir: &Path) -> Result<Vec<AlbumItem>, String> {
    let rr_path = resolve_rapidready_albums_path(app_data_dir);
    let raw_path_opt = resolve_rapidraw_albums_path(app_data_dir);

    let mut load_from = rr_path.clone();

    if let Some(ref raw_path) = raw_path_opt {
        if raw_path.exists() {
            if rr_path.exists() {
                let mtime_rr = fs::metadata(&rr_path)
                    .and_then(|m| m.modified())
                    .ok();
                let mtime_raw = fs::metadata(raw_path)
                    .and_then(|m| m.modified())
                    .ok();

                if let (Some(t_rr), Some(t_raw)) = (mtime_rr, mtime_raw) {
                    if t_raw > t_rr {
                        // RapidRAW is newer! Import and sync into RapidReady
                        load_from = raw_path.clone();
                    }
                }
            } else {
                // Only RapidRAW exists (first launch of RapidReady on an existing RapidRAW machine)
                load_from = raw_path.clone();
            }
        }
    }

    if !load_from.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&load_from).map_err(|e| e.to_string())?;
    let mut items: Vec<AlbumItem> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    sort_album_tree(&mut items);

    // If we loaded from RapidRAW because it was newer, mirror it directly to RapidReady master file
    if load_from != rr_path {
        let _ = save_collections(items.clone(), app_data_dir);
    }

    Ok(items)
}

/// Saves collections to RapidReady's master file with atomic write and rotation backup (.bak).
/// If RapidRAW directory exists, mirrors identical JSON to RapidRAW's albums.json.
pub fn save_collections(mut tree: Vec<AlbumItem>, app_data_dir: &Path) -> Result<(), String> {
    let rr_path = resolve_rapidready_albums_path(app_data_dir);
    let albums_dir = rr_path.parent().ok_or_else(|| "Invalid albums path".to_string())?;
    if !albums_dir.exists() {
        fs::create_dir_all(albums_dir).map_err(|e| e.to_string())?;
    }

    sort_album_tree(&mut tree);
    let json_string = serde_json::to_string_pretty(&tree).map_err(|e| e.to_string())?;

    // 1. Rotation backup if master file exists
    if rr_path.exists() {
        let bak_path = rr_path.with_extension("json.bak");
        let _ = fs::copy(&rr_path, bak_path);
    }

    // 2. Atomic write to RapidReady master file
    let tmp_path = rr_path.with_extension("tmp");
    fs::write(&tmp_path, &json_string).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &rr_path).map_err(|e| e.to_string())?;

    // 3. Mirror to RapidRAW if available
    if let Some(raw_path) = resolve_rapidraw_albums_path(app_data_dir) {
        if let Some(parent) = raw_path.parent() {
            if parent.exists() || parent.parent().map(|p| p.exists()).unwrap_or(false) {
                let _ = fs::create_dir_all(parent);
                let tmp_raw = raw_path.with_extension("tmp");
                if fs::write(&tmp_raw, &json_string).is_ok() {
                    let _ = fs::rename(&tmp_raw, &raw_path);
                }
            }
        }
    }

    Ok(())
}

pub fn normalize_path_for_cmp(p: &str) -> String {
    let replaced = p.replace('\\', "/");
    #[cfg(target_os = "windows")]
    {
        replaced.to_lowercase()
    }
    #[cfg(not(target_os = "windows"))]
    {
        replaced
    }
}

/// Adds paths to an album, avoiding duplicates. Returns true if modified.
pub fn add_to_collection(tree: &mut [AlbumItem], target_id: &str, paths: &[String]) -> bool {
    for item in tree.iter_mut() {
        match item {
            AlbumItem::Album { id, images, .. } if id == target_id => {
                let mut changed = false;
                for p in paths {
                    let norm_p = normalize_path_for_cmp(p);
                    if !images.iter().any(|existing| normalize_path_for_cmp(existing) == norm_p) {
                        images.push(p.clone());
                        changed = true;
                    }
                }
                return changed;
            }
            AlbumItem::Group { children, .. } => {
                if add_to_collection(children, target_id, paths) {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
}

/// Removes specified paths from an album. Returns true if modified.
pub fn remove_from_collection(tree: &mut [AlbumItem], target_id: &str, paths: &[String]) -> bool {
    for item in tree.iter_mut() {
        match item {
            AlbumItem::Album { id, images, .. } if id == target_id => {
                let initial_len = images.len();
                let norm_targets: Vec<String> = paths.iter().map(|p| normalize_path_for_cmp(p)).collect();
                images.retain(|p| !norm_targets.contains(&normalize_path_for_cmp(p)));
                return images.len() != initial_len;
            }
            AlbumItem::Group { children, .. } => {
                if remove_from_collection(children, target_id, paths) {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
}

/// Prunes specified paths from ALL albums throughout the entire tree. Returns true if any album was modified.
pub fn prune_paths_from_all_collections(tree: &mut [AlbumItem], paths: &[String]) -> bool {
    if paths.is_empty() {
        return false;
    }
    let norm_targets: std::collections::HashSet<String> = paths.iter().map(|p| normalize_path_for_cmp(p)).collect();
    let mut modified = false;

    fn walk(items: &mut [AlbumItem], targets: &std::collections::HashSet<String>, modified: &mut bool) {
        for item in items.iter_mut() {
            match item {
                AlbumItem::Album { images, .. } => {
                    let initial_len = images.len();
                    images.retain(|p| !targets.contains(&normalize_path_for_cmp(p)));
                    if images.len() != initial_len {
                        *modified = true;
                    }
                }
                AlbumItem::Group { children, .. } => {
                    walk(children, targets, modified);
                }
            }
        }
    }

    walk(tree, &norm_targets, &mut modified);
    modified
}

/// Prunes any image whose path starts with the given folder path from ALL albums throughout the entire tree. Returns true if modified.
pub fn prune_folder_from_all_collections(tree: &mut [AlbumItem], folder_path: &str) -> bool {
    let norm_folder = normalize_path_for_cmp(folder_path);
    let prefix = if norm_folder.ends_with('/') {
        norm_folder
    } else {
        format!("{}/", norm_folder)
    };
    let mut modified = false;

    fn walk(items: &mut [AlbumItem], prefix: &str, modified: &mut bool) {
        for item in items.iter_mut() {
            match item {
                AlbumItem::Album { images, .. } => {
                    let initial_len = images.len();
                    images.retain(|p| {
                        let norm = normalize_path_for_cmp(p);
                        !norm.starts_with(prefix) && norm != prefix.trim_end_matches('/')
                    });
                    if images.len() != initial_len {
                        *modified = true;
                    }
                }
                AlbumItem::Group { children, .. } => {
                    walk(children, prefix, modified);
                }
            }
        }
    }

    walk(tree, &prefix, &mut modified);
    modified
}

/// Reorders the images array of an album. Returns true if modified.
pub fn reorder_collection_images(tree: &mut [AlbumItem], target_id: &str, new_order: &[String]) -> bool {
    for item in tree.iter_mut() {
        match item {
            AlbumItem::Album { id, images, .. } if id == target_id => {
                *images = new_order.to_vec();
                return true;
            }
            AlbumItem::Group { children, .. } => {
                if reorder_collection_images(children, target_id, new_order) {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
}

/// Creates a new album or group. If parent_id is None, adds to root.
pub fn create_collection_item(
    tree: &mut Vec<AlbumItem>,
    parent_id: Option<&str>,
    new_item: AlbumItem,
) -> bool {
    if let Some(target_parent) = parent_id {
        fn insert_recursive(items: &mut [AlbumItem], parent_id: &str, item: AlbumItem) -> bool {
            for node in items.iter_mut() {
                if let AlbumItem::Group { id, children, .. } = node {
                    if id == parent_id {
                        children.push(item);
                        sort_album_tree(children);
                        return true;
                    }
                    if insert_recursive(children, parent_id, item.clone()) {
                        return true;
                    }
                }
            }
            false
        }
        if insert_recursive(tree, target_parent, new_item.clone()) {
            sort_album_tree(tree);
            return true;
        }
    }

    tree.push(new_item);
    sort_album_tree(tree);
    true
}

/// Renames an album or group. Returns true if modified.
pub fn rename_collection_item(tree: &mut [AlbumItem], target_id: &str, new_name: &str) -> bool {
    for item in tree.iter_mut() {
        match item {
            AlbumItem::Album { id, name, .. } if id == target_id => {
                *name = new_name.to_string();
                return true;
            }
            AlbumItem::Group { id, name, children, .. } => {
                if id == target_id {
                    *name = new_name.to_string();
                    return true;
                }
                if rename_collection_item(children, target_id, new_name) {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
}

/// Deletes an album or group by id. Returns true if removed.
pub fn delete_collection_item(tree: &mut Vec<AlbumItem>, target_id: &str) -> bool {
    let initial_len = tree.len();
    tree.retain(|item| item.id() != target_id);
    if tree.len() != initial_len {
        return true;
    }

    for item in tree.iter_mut() {
        if let AlbumItem::Group { children, .. } = item {
            if delete_collection_item(children, target_id) {
                return true;
            }
        }
    }
    false
}

/// Sorts the images in an album by EXIF capture date ascending (fallback to filename).
pub fn sort_collection_by_exif(tree: &mut [AlbumItem], target_id: &str) -> bool {
    for item in tree.iter_mut() {
        match item {
            AlbumItem::Album { id, images, .. } if id == target_id => {
                images.sort_by(|a, b| {
                    let path_a = Path::new(a);
                    let path_b = Path::new(b);
                    let date_a = crate::date_resolver::get_fast_creation_date(path_a, None);
                    let date_b = crate::date_resolver::get_fast_creation_date(path_b, None);
                    match (date_a, date_b) {
                        (Some(da), Some(db)) => da.cmp(&db).then_with(|| a.cmp(b)),
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        (None, None) => a.cmp(b),
                    }
                });
                return true;
            }
            AlbumItem::Group { children, .. } => {
                if sort_collection_by_exif(children, target_id) {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tree_sorting_and_crud() {
        let mut tree = vec![
            AlbumItem::Album {
                id: "a1".into(),
                name: "Zebra".into(),
                icon: None,
                images: vec!["img1.jpg".into(), "img2.jpg".into()],
            },
            AlbumItem::Group {
                id: "g1".into(),
                name: "Vacation".into(),
                icon: None,
                children: vec![
                    AlbumItem::Album {
                        id: "a2".into(),
                        name: "Beach".into(),
                        icon: None,
                        images: vec![],
                    }
                ],
            },
        ];

        sort_album_tree(&mut tree);
        // Groups must come first
        assert_eq!(tree[0].name(), "Vacation");
        assert_eq!(tree[1].name(), "Zebra");

        // Add to collection
        assert!(add_to_collection(&mut tree, "a1", &["img3.jpg".into(), "img1.jpg".into()]));
        if let AlbumItem::Album { images, .. } = &tree[1] {
            assert_eq!(images.len(), 3);
            assert_eq!(images, &["img1.jpg", "img2.jpg", "img3.jpg"]);
        }

        // Reorder images
        assert!(reorder_collection_images(&mut tree, "a1", &["img3.jpg".into(), "img1.jpg".into(), "img2.jpg".into()]));
        if let AlbumItem::Album { images, .. } = &tree[1] {
            assert_eq!(images, &["img3.jpg", "img1.jpg", "img2.jpg"]);
        }

        // Remove from collection
        assert!(remove_from_collection(&mut tree, "a1", &["img1.jpg".into()]));
        if let AlbumItem::Album { images, .. } = &tree[1] {
            assert_eq!(images, &["img3.jpg", "img2.jpg"]);
        }

        // Rename
        assert!(rename_collection_item(&mut tree, "a1", "Animals"));
        assert_eq!(tree[1].name(), "Animals");

        // Delete
        assert!(delete_collection_item(&mut tree, "a1"));
        assert_eq!(tree.len(), 1);
    }

    #[test]
    fn test_path_normalization_matching() {
        let mut tree = vec![
            AlbumItem::Album {
                id: "a1".into(),
                name: "CrossPlatform".into(),
                icon: None,
                images: vec!["C:/Photos/image1.jpg".into()],
            }
        ];

        // Should NOT add duplicate even if path has Windows backslashes
        assert!(!add_to_collection(&mut tree, "a1", &["C:\\Photos\\image1.jpg".into()]));
        if let AlbumItem::Album { images, .. } = &tree[0] {
            assert_eq!(images.len(), 1);
        }

        // Should successfully remove even if path has Windows backslashes
        assert!(remove_from_collection(&mut tree, "a1", &["C:\\Photos\\image1.jpg".into()]));
        if let AlbumItem::Album { images, .. } = &tree[0] {
            assert_eq!(images.len(), 0);
        }
    }

    #[test]
    fn test_prune_paths_and_folder_from_all_collections() {
        let mut tree = vec![
            AlbumItem::Album {
                id: "a1".into(),
                name: "Album1".into(),
                icon: None,
                images: vec![
                    "C:/Photos/2026/img1.jpg".into(),
                    "C:/Photos/2026/img2.jpg".into(),
                    "C:/Photos/other.jpg".into(),
                ],
            },
            AlbumItem::Group {
                id: "g1".into(),
                name: "Group1".into(),
                icon: None,
                children: vec![
                    AlbumItem::Album {
                        id: "a2".into(),
                        name: "Album2".into(),
                        icon: None,
                        images: vec![
                            "C:\\Photos\\2026\\img1.jpg".into(),
                            "C:/Photos/standalone.jpg".into(),
                        ],
                    }
                ],
            }
        ];

        // 1. Prune specific path img1.jpg across all albums (Windows vs Unix slash normalization)
        assert!(prune_paths_from_all_collections(&mut tree, &["C:/Photos/2026/img1.jpg".into()]));
        if let AlbumItem::Album { images, .. } = &tree[0] {
            assert_eq!(images, &["C:/Photos/2026/img2.jpg", "C:/Photos/other.jpg"]);
        }
        if let AlbumItem::Group { children, .. } = &tree[1] {
            if let AlbumItem::Album { images, .. } = &children[0] {
                assert_eq!(images, &["C:/Photos/standalone.jpg"]);
            }
        }

        // 2. Prune folder "C:/Photos/2026"
        assert!(prune_folder_from_all_collections(&mut tree, "C:\\Photos\\2026"));
        if let AlbumItem::Album { images, .. } = &tree[0] {
            assert_eq!(images, &["C:/Photos/other.jpg"]);
        }
    }
}
