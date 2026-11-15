use sysinfo::Disks;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct DriveInfo {
    pub name: String,
    pub path: PathBuf,
    pub total_space: u64,
    pub available_space: u64,
    pub is_removable: bool,
}

pub fn get_removable_drives() -> Vec<DriveInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut drives = Vec::new();
    
    for disk in &disks {
        // macOS typically mounts everything in /Volumes
        // we might also want to explicitly check is_removable, but sometimes SD cards aren't marked as removable
        // depending on the card reader. On macOS, any mount under /Volumes that isn't Macintosh HD is often an external drive.
        let mount_path = disk.mount_point();
        if !mount_path.exists() {
            continue;
        }
        
        // Heuristic: Camera SD cards almost always have a DCIM folder at the root.
        let has_dcim = mount_path.join("DCIM").exists() || mount_path.join("dcim").exists();

        #[cfg(target_os = "macos")]
        let is_external = {
            let path_str = mount_path.to_string_lossy();
            path_str.starts_with("/Volumes/") && !path_str.ends_with("Macintosh HD")
        };
        
        #[cfg(target_os = "windows")]
        let is_external = {
            let path_str = mount_path.to_string_lossy();
            !path_str.starts_with("C:") && (disk.is_removable() || has_dcim)
        };

        // Linux: many USB card readers report removable=0 in /sys/block/*/removable,
        // so also accept anything mounted by udisks / the desktop under the standard
        // user-media locations (/run/media/$USER/..., /media/$USER/..., /media/...).
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let is_external = disk.is_removable() || is_user_media_mount(mount_path);

        // We only show it as a quick-select "SD Card" if it's an external drive AND has a DCIM folder.
        // Otherwise, large external SSDs would clutter the UI.
        if is_external && has_dcim {
            drives.push(DriveInfo {
                name: disk.name().to_string_lossy().into_owned(),
                path: mount_path.to_path_buf(),
                total_space: disk.total_space(),
                available_space: disk.available_space(),
                is_removable: disk.is_removable(),
            });
        }
    }
    
    drives
}

/// Returns true if `mount_path` lives under a standard Linux removable-media
/// mount root (`/run/media`, `/media`, `/mnt`) and is not the root itself.
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn is_user_media_mount(mount_path: &std::path::Path) -> bool {
    ["/run/media", "/media", "/mnt"].iter().any(|root| {
        mount_path.starts_with(root) && mount_path != std::path::Path::new(root)
    })
}

#[cfg(all(test, not(any(target_os = "macos", target_os = "windows"))))]
mod tests {
    use super::is_user_media_mount;
    use std::path::Path;

    #[test]
    fn user_media_mounts_are_detected() {
        assert!(is_user_media_mount(Path::new("/run/media/alice/EOS_DIGITAL")));
        assert!(is_user_media_mount(Path::new("/media/alice/NIKON D850")));
        assert!(is_user_media_mount(Path::new("/media/SDCARD")));
        assert!(is_user_media_mount(Path::new("/mnt/sd")));
    }

    #[test]
    fn system_mounts_are_not_user_media() {
        assert!(!is_user_media_mount(Path::new("/")));
        assert!(!is_user_media_mount(Path::new("/home")));
        assert!(!is_user_media_mount(Path::new("/media")));
        assert!(!is_user_media_mount(Path::new("/run/media")));
        assert!(!is_user_media_mount(Path::new("/mediafiles")));
    }
}
