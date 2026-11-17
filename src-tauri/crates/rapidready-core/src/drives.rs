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

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let is_external = disk.is_removable();

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

/// Free space on the volume that holds `path` (the mounted disk with the longest matching mount
/// point), or `None` when no mounted disk contains it.
pub fn available_space_for(path: &std::path::Path) -> Option<u64> {
    let key = |p: &std::path::Path| {
        let s = p.to_string_lossy().replace('\\', "/");
        if cfg!(any(target_os = "windows", target_os = "macos")) {
            s.to_lowercase()
        } else {
            s
        }
    };
    let target = key(path);
    let disks = Disks::new_with_refreshed_list();
    disks
        .iter()
        .filter(|d| target.starts_with(&key(d.mount_point())))
        .max_by_key(|d| d.mount_point().as_os_str().len())
        .map(|d| d.available_space())
}
