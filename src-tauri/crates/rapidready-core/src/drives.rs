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
        
        let path_str = mount_path.to_string_lossy();
        
        #[cfg(target_os = "macos")]
        let is_external = path_str.starts_with("/Volumes/") && !path_str.ends_with("Macintosh HD");
        
        #[cfg(not(target_os = "macos"))]
        let is_external = disk.is_removable();

        // Heuristic: Camera SD cards almost always have a DCIM folder at the root.
        let has_dcim = mount_path.join("DCIM").exists() || mount_path.join("dcim").exists();

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
