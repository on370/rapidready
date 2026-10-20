pub mod import_cmds;
pub mod archive_cmds;
pub mod culling_cmds;
pub mod collection_cmds;
pub mod system_cmds;

pub use import_cmds::*;
pub use archive_cmds::*;
pub use culling_cmds::*;
pub use collection_cmds::*;
pub use system_cmds::*;

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_is_network_or_remote_path_local() {
        let current = std::env::current_dir().unwrap();
        assert!(!is_network_or_remote_path(&current));
    }

    #[test]
    fn test_is_network_or_remote_path_real() {
        if Path::new("/Volumes/Media").exists() {
            assert!(is_network_or_remote_path(Path::new("/Volumes/Media")));
            assert!(is_network_path("/Volumes/Media".to_string()));
            assert!(is_network_path("/Volumes/Media/".to_string()));
            assert!(are_any_network_paths(vec!["/Volumes/Media".to_string()]));
            assert!(are_any_network_paths(vec!["/Volumes/Media/".to_string()]));
            assert!(are_any_network_paths(vec!["/some/local/path".to_string(), "/Volumes/Media".to_string()]));
        }
    }

    #[test]
    fn test_is_system_critical_path() {
        assert!(is_system_critical_path(Path::new("/")));
        assert!(is_system_critical_path(Path::new("/Users")));
        assert!(is_system_critical_path(Path::new("/System")));
        assert!(is_system_critical_path(Path::new("/Applications")));
        assert!(is_system_critical_path(Path::new("/bin")));
        assert!(is_system_critical_path(Path::new("/usr/bin")));
        assert!(is_system_critical_path(Path::new("C:\\")));
        assert!(is_system_critical_path(Path::new("C:\\Windows")));
        assert!(is_system_critical_path(Path::new("c:/windows/system32")));
        assert!(is_system_critical_path(Path::new("D:")));
        assert!(is_system_critical_path(Path::new("")));

        // Valid user photo directories should NOT be system critical
        assert!(!is_system_critical_path(Path::new("/Volumes/Storage/Photos/2024/09_Iceland")));
        assert!(!is_system_critical_path(Path::new("/Users/john/Pictures/Archive/2025")));
        assert!(!is_system_critical_path(Path::new("D:\\Photos\\ClientShoots\\2025-01-10")));
    }

    #[test]
    fn test_is_strictly_inside_root() {
        let root = Path::new("/Volumes/Archive/Photos");
        
        // Valid children
        assert!(is_strictly_inside_root(Path::new("/Volumes/Archive/Photos/2024"), root));
        assert!(is_strictly_inside_root(Path::new("/Volumes/Archive/Photos/2024/01_Trip"), root));
        assert!(is_strictly_inside_root(Path::new("/Volumes/Archive/Photos/image.cr3"), root));

        // Root itself must NOT be inside root (cannot delete root!)
        assert!(!is_strictly_inside_root(root, root));

        // Outside paths
        assert!(!is_strictly_inside_root(Path::new("/Volumes/Archive/OtherFolder"), root));
        assert!(!is_strictly_inside_root(Path::new("/Volumes/Archive"), root));
        assert!(!is_strictly_inside_root(Path::new("/Users/john/Pictures"), root));

        // Partial prefix false-positive prevention (Photos_Backup is not Photos!)
        assert!(!is_strictly_inside_root(Path::new("/Volumes/Archive/Photos_Backup/2024"), root));

        // Relative path traversal tricks
        assert!(!is_strictly_inside_root(Path::new("/Volumes/Archive/Photos/../etc/passwd"), root));
    }

    #[test]
    fn test_delete_folder_guardrails() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("rapidready_safety_test_{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&temp_dir);
            std::fs::create_dir_all(temp_dir.join("subfolder")).unwrap();

            let root_str = temp_dir.to_string_lossy().to_string();
            let sub_str = temp_dir.join("subfolder").to_string_lossy().to_string();

            // 1. Refuse deleting root itself
            let err_root = delete_folder_impl(None, root_str.clone(), true, root_str.clone()).await;
            assert!(err_root.is_err());
            assert!(err_root.unwrap_err().contains("not inside the active archive root"));

            // 2. Refuse deleting outside root
            let outside = std::env::temp_dir().to_string_lossy().to_string();
            let err_outside = delete_folder_impl(None, outside, true, root_str.clone()).await;
            assert!(err_outside.is_err());

            // 3. Deleting valid subfolder with to_trash: false on local storage triggers safety override without error
            let ok_sub = delete_folder_impl(None, sub_str.clone(), false, root_str.clone()).await;
            assert!(ok_sub.is_ok());
            assert!(!Path::new(&sub_str).exists());

            let _ = std::fs::remove_dir_all(&temp_dir);
        });
    }

    #[test]
    fn test_delete_files_guardrails() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("rapidready_files_safety_test_{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&temp_dir);
            std::fs::create_dir_all(temp_dir.join("subdir")).unwrap();
            std::fs::write(temp_dir.join("photo1.jpg"), b"test").unwrap();
            std::fs::write(temp_dir.join("photo1.jpg.rrdata"), b"test sidecar").unwrap();

            let root_str = temp_dir.to_string_lossy().to_string();
            let photo_str = temp_dir.join("photo1.jpg").to_string_lossy().to_string();
            let subdir_str = temp_dir.join("subdir").to_string_lossy().to_string();

            // 1. delete_files must reject directories
            let res_dir = delete_files_impl(None, vec![subdir_str], false, Some(root_str.clone())).await.unwrap();
            assert_eq!(res_dir.deleted.len(), 0);
            assert_eq!(res_dir.failed.len(), 1);
            assert!(res_dir.failed[0].1.contains("directory"));

            // 2. delete_files on local path with to_trash: false safely deletes file and sidecar via safety override
            let res_photo = delete_files_impl(None, vec![photo_str.clone()], false, Some(root_str.clone())).await.unwrap();
            assert_eq!(res_photo.deleted.len(), 1);
            assert_eq!(res_photo.failed.len(), 0);
            assert!(!Path::new(&photo_str).exists());
            assert!(!temp_dir.join("photo1.jpg.rrdata").exists());

            let _ = std::fs::remove_dir_all(&temp_dir);
        });
    }
}
