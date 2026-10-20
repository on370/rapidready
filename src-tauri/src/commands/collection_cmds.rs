use rapidready_core::collection_export::{CollectionExportOptions, run_collection_export};
use rapidready_core::collections::{
    add_to_collection as core_add_to_collection,
    create_collection_item as core_create_collection_item,
    delete_collection_item as core_delete_collection_item,
    load_collections as core_load_collections,
    prune_collections_by_library as core_prune_collections_by_library,
    prune_paths_from_all_collections as core_prune_paths_from_all_collections,
    remove_from_collection as core_remove_from_collection,
    reorder_collection_images as core_reorder_collection_images,
    rename_collection_item as core_rename_collection_item,
    save_collections as core_save_collections,
    sort_collection_by_exif as core_sort_collection_by_exif, AlbumItem,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct CollectionExportState(pub Arc<AtomicBool>);

#[tauri::command]
pub async fn get_collections(app: AppHandle) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    core_load_collections(&app_dir)
}

#[tauri::command]
pub async fn save_collections(app: AppHandle, tree: Vec<AlbumItem>) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    core_save_collections(tree, &app_dir)
}

#[tauri::command]
pub async fn add_to_collection(app: AppHandle, album_id: String, paths: Vec<String>) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_add_to_collection(&mut tree, &album_id, &paths) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn remove_from_collection(app: AppHandle, album_id: String, paths: Vec<String>) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_remove_from_collection(&mut tree, &album_id, &paths) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn reorder_collection_images(app: AppHandle, album_id: String, new_order: Vec<String>) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_reorder_collection_images(&mut tree, &album_id, &new_order) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn create_collection_item(
    app: AppHandle,
    parent_id: Option<String>,
    name: String,
    is_group: bool,
    icon: Option<String>,
    library_root: Option<String>,
) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let id = format!("album-{}", now);
    let new_item = if is_group {
        AlbumItem::Group { id, name, icon, library_root, children: Vec::new() }
    } else {
        AlbumItem::Album { id, name, icon, library_root, images: Vec::new() }
    };
    core_create_collection_item(&mut tree, parent_id.as_deref(), new_item);
    core_save_collections(tree.clone(), &app_dir)?;
    Ok(tree)
}

#[tauri::command]
pub async fn rename_collection_item(app: AppHandle, target_id: String, new_name: String) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_rename_collection_item(&mut tree, &target_id, &new_name) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn delete_collection_item(app: AppHandle, target_id: String) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_delete_collection_item(&mut tree, &target_id) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn sort_collection_by_exif(app: AppHandle, target_id: String) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_sort_collection_by_exif(&mut tree, &target_id) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn prune_from_all_collections(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_prune_paths_from_all_collections(&mut tree, &paths) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn prune_collections_by_library(app: AppHandle, library_root: String) -> Result<Vec<AlbumItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut tree = core_load_collections(&app_dir)?;
    if core_prune_collections_by_library(&mut tree, &library_root) {
        core_save_collections(tree.clone(), &app_dir)?;
    }
    Ok(tree)
}

#[tauri::command]
pub async fn export_collection(
    app: AppHandle,
    state: tauri::State<'_, CollectionExportState>,
    options: CollectionExportOptions,
) -> Result<usize, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let tree = core_load_collections(&app_dir)?;

    fn find_album_images(items: &[AlbumItem], target_id: &str) -> Option<Vec<String>> {
        for item in items {
            match item {
                AlbumItem::Album { id, images, .. } if id == target_id => return Some(images.clone()),
                AlbumItem::Group { children, .. } => {
                    if let Some(imgs) = find_album_images(children, target_id) {
                        return Some(imgs);
                    }
                }
                _ => {}
            }
        }
        None
    }

    let images = find_album_images(&tree, &options.album_id)
        .ok_or_else(|| format!("Collection with id '{}' not found", options.album_id))?;

    state.0.store(false, Ordering::Relaxed);
    let is_cancelled = Arc::clone(&state.0);
    let app_clone = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        run_collection_export(&images, &options, is_cancelled, move |progress| {
            let _ = app_clone.emit("collection-export-progress", progress);
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Export task join error: {}", e))?
}

#[tauri::command]
pub fn cancel_collection_export(state: tauri::State<'_, CollectionExportState>) -> Result<(), String> {
    state.0.store(true, Ordering::Relaxed);
    Ok(())
}
