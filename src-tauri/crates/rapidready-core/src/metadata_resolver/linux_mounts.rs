//! Remote filesystem detection for Linux based on `/proc/self/mountinfo`.
//!
//! `statfs` magic numbers alone are not enough on Linux:
//! - SMB2/3 mounts (today's default for NAS shares) report `SMB2_SUPER_MAGIC`,
//!   not the legacy `CIFS_SUPER_MAGIC`.
//! - Desktop-mounted shares (GNOME/Nautilus via gvfs, KDE/Dolphin via kio-fuse),
//!   sshfs and rclone are all FUSE mounts, and FUSE is also used for *local*
//!   filesystems such as ntfs-3g, so the FUSE magic number cannot be treated as
//!   "remote" on its own.
//!
//! The mount table carries the real filesystem type (`cifs`, `nfs4`,
//! `fuse.gvfsd-fuse`, `fuse.sshfs`, ...) and the mount source, which lets us
//! classify mounts precisely.
//!
//! The parsing helpers are platform independent so they are unit-tested on every OS;
//! only `is_remote_mount` touches `/proc` and is used on Linux only.

#![cfg_attr(any(target_os = "macos", target_os = "windows"), allow(dead_code))]

use std::path::{Path, PathBuf};

/// Kernel filesystem types that are always network filesystems.
const REMOTE_FS_TYPES: &[&str] = &[
    "cifs", "smb3", "smbfs", "nfs", "nfs4", "ceph", "afs", "glusterfs", "lustre", "gpfs",
    "beegfs", "davfs", "ncpfs", "coda",
];

/// FUSE subtypes (`fuse.<subtype>`) that are network or remote-protocol filesystems.
/// `gvfsd-fuse` (GNOME) and `kio-fuse` (KDE) expose smb://, sftp://, dav://, mtp:// etc.
/// None of these support a local trash or fast random access.
const REMOTE_FUSE_SUBTYPES: &[&str] = &[
    "gvfsd-fuse", "kio-fuse", "sshfs", "rclone", "s3fs", "goofys", "gcsfuse", "davfs2",
    "glusterfs", "ceph-fuse", "curlftpfs", "smbnetfs",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MountEntry {
    pub mount_point: PathBuf,
    pub fs_type: String,
    pub source: String,
}

/// Decodes the octal escapes the kernel uses in mountinfo paths
/// (`\040` = space, `\011` = tab, `\012` = newline, `\134` = backslash).
fn unescape_mount_path(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\'
            && i + 3 < bytes.len()
            && bytes[i + 1..=i + 3].iter().all(|b| (b'0'..=b'7').contains(b))
        {
            let v = (bytes[i + 1] - b'0') as u32 * 64
                + (bytes[i + 2] - b'0') as u32 * 8
                + (bytes[i + 3] - b'0') as u32;
            if v <= 0xFF {
                out.push(v as u8);
                i += 4;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Parses the contents of `/proc/<pid>/mountinfo`.
///
/// Line format (see `man 5 proc`):
/// `36 35 98:0 /mnt1 /mnt2 rw,noatime master:1 - ext3 /dev/root rw,errors=continue`
/// The optional fields before the ` - ` separator vary in number.
pub(crate) fn parse_mountinfo(content: &str) -> Vec<MountEntry> {
    content
        .lines()
        .filter_map(|line| {
            let (pre, post) = line.split_once(" - ")?;
            let mount_point = pre.split(' ').nth(4)?;
            let mut post_fields = post.split(' ');
            let fs_type = post_fields.next()?;
            let source = post_fields.next().unwrap_or("");
            Some(MountEntry {
                mount_point: PathBuf::from(unescape_mount_path(mount_point)),
                fs_type: fs_type.to_string(),
                source: unescape_mount_path(source),
            })
        })
        .collect()
}

/// Returns the mount that contains `path`: the longest matching mount point.
/// On ties the later entry wins, because a later mount on the same mount point shadows earlier ones.
pub(crate) fn find_mount_for<'a>(mounts: &'a [MountEntry], path: &Path) -> Option<&'a MountEntry> {
    let mut best: Option<&MountEntry> = None;
    for m in mounts {
        if path.starts_with(&m.mount_point) {
            let better = match best {
                None => true,
                Some(b) => m.mount_point.components().count() >= b.mount_point.components().count(),
            };
            if better {
                best = Some(m);
            }
        }
    }
    best
}

/// Classifies a mount as remote/network based on its filesystem type and source.
pub(crate) fn is_remote_mount_entry(entry: &MountEntry) -> bool {
    let fs_type = entry.fs_type.as_str();
    if REMOTE_FS_TYPES.contains(&fs_type) {
        return true;
    }
    if let Some(subtype) = fs_type.strip_prefix("fuse.").or_else(|| fs_type.strip_prefix("fuseblk.")) {
        if REMOTE_FUSE_SUBTYPES.contains(&subtype) {
            return true;
        }
    }
    if fs_type == "fuse" || fs_type.starts_with("fuse.") {
        // Unknown FUSE filesystem: a URL-like source (davfs2: "https://...") means remote.
        // Local FUSE filesystems (ntfs-3g, exfat-fuse, AppImage) use a device or name as source.
        return entry.source.contains("://");
    }
    false
}

/// Linux: determines whether `path` lives on a remote mount using `/proc/self/mountinfo`.
/// Returns `None` if the mount table cannot be read or no mount matches,
/// so the caller can fall back to `statfs`.
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub(crate) fn is_remote_mount(path: &Path) -> Option<bool> {
    let content = std::fs::read_to_string("/proc/self/mountinfo").ok()?;
    let mounts = parse_mountinfo(&content);

    // Resolve symlinks (e.g. ~/Pictures/NAS -> /mnt/nas) on the deepest existing ancestor.
    let existing = path.ancestors().find(|a| a.exists()).unwrap_or(path);
    let resolved = std::fs::canonicalize(existing).unwrap_or_else(|_| existing.to_path_buf());

    find_mount_for(&mounts, &resolved).map(is_remote_mount_entry)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
22 1 259:2 / / rw,relatime shared:1 - btrfs /dev/nvme0n1p3 rw,seclabel,compress=zstd:1
23 22 259:2 /home /home rw,relatime shared:2 - btrfs /dev/nvme0n1p3 rw,seclabel,compress=zstd:1
40 22 0:36 / /mnt/nas rw,relatime shared:80 - cifs //192.168.1.10/photos rw,vers=3.1.1,cache=strict
41 22 0:37 / /mnt/nfs rw,relatime shared:81 - nfs4 nas.local:/volume1/photos rw,vers=4.2
42 22 0:38 / /run/user/1000/gvfs rw,nosuid,nodev,relatime shared:90 - fuse.gvfsd-fuse gvfsd-fuse rw,user_id=1000,group_id=1000
43 22 8:33 / /run/media/alice/EOS_DIGITAL rw,nosuid,nodev,relatime shared:91 - vfat /dev/sdc1 rw,fmask=0022
44 22 8:17 / /run/media/alice/My\\040Passport rw,nosuid,nodev,relatime shared:92 - fuseblk /dev/sdb1 rw,user_id=0,group_id=0
45 22 0:40 / /home/alice/remote rw,nosuid,nodev,relatime shared:93 - fuse.sshfs alice@server:/data rw,user_id=1000
46 22 0:41 / /mnt/dav rw,nosuid,nodev,relatime shared:94 - fuse https://dav.example.com/photos rw,user_id=0
47 22 0:42 / /run/user/1000/kio-fuse-AbCdEf rw,nosuid,nodev,relatime shared:95 - fuse.kio-fuse kio-fuse rw,user_id=1000
";

    fn remote(path: &str) -> Option<bool> {
        let mounts = parse_mountinfo(SAMPLE);
        find_mount_for(&mounts, Path::new(path)).map(is_remote_mount_entry)
    }

    #[test]
    fn parses_fields_and_escapes() {
        let mounts = parse_mountinfo(SAMPLE);
        assert_eq!(mounts.len(), 10);
        assert_eq!(mounts[2].mount_point, PathBuf::from("/mnt/nas"));
        assert_eq!(mounts[2].fs_type, "cifs");
        assert_eq!(mounts[2].source, "//192.168.1.10/photos");
        assert_eq!(mounts[6].mount_point, PathBuf::from("/run/media/alice/My Passport"));
    }

    #[test]
    fn handles_optional_fields_and_garbage() {
        let line = "50 22 0:50 / /mnt/x rw shared:1 master:2 propagate_from:3 - nfs host:/x rw\nnot a mountinfo line\n";
        let mounts = parse_mountinfo(line);
        assert_eq!(mounts.len(), 1);
        assert_eq!(mounts[0].fs_type, "nfs");
        assert_eq!(mounts[0].mount_point, PathBuf::from("/mnt/x"));
    }

    #[test]
    fn unescapes_octal_sequences() {
        assert_eq!(unescape_mount_path("/a\\040b"), "/a b");
        assert_eq!(unescape_mount_path("/a\\134b"), "/a\\b");
        assert_eq!(unescape_mount_path("/trailing\\04"), "/trailing\\04");
        assert_eq!(unescape_mount_path("/plain"), "/plain");
    }

    #[test]
    fn network_shares_are_remote() {
        assert_eq!(remote("/mnt/nas/2024/IMG_0001.CR3"), Some(true));
        assert_eq!(remote("/mnt/nfs/archive"), Some(true));
        assert_eq!(remote("/run/user/1000/gvfs/smb-share:server=nas,share=photos/x.jpg"), Some(true));
        assert_eq!(remote("/run/user/1000/kio-fuse-AbCdEf/smb/nas/photos"), Some(true));
        assert_eq!(remote("/home/alice/remote/pics"), Some(true));
        assert_eq!(remote("/mnt/dav/pics"), Some(true));
    }

    #[test]
    fn local_disks_are_not_remote() {
        assert_eq!(remote("/home/alice/Pictures"), Some(false));
        assert_eq!(remote("/run/media/alice/EOS_DIGITAL/DCIM"), Some(false));
        // ntfs-3g external drive: FUSE, but local
        assert_eq!(remote("/run/media/alice/My Passport/Photos"), Some(false));
        // Prefix match must be component-wise: /mnt/nasbackup is not inside /mnt/nas
        assert_eq!(remote("/mnt/nasbackup"), Some(false));
    }

    #[test]
    fn most_specific_mount_wins() {
        let mounts = parse_mountinfo(SAMPLE);
        let m = find_mount_for(&mounts, Path::new("/home/alice/remote/a")).unwrap();
        assert_eq!(m.fs_type, "fuse.sshfs");
        let m = find_mount_for(&mounts, Path::new("/home/alice/other")).unwrap();
        assert_eq!(m.mount_point, PathBuf::from("/home"));
    }

    #[test]
    fn later_mount_on_same_point_shadows_earlier() {
        let content = "\
22 1 8:1 / / rw - ext4 /dev/sda1 rw
30 22 8:2 / /mnt/data rw - ext4 /dev/sda2 rw
31 22 0:40 / /mnt/data rw - cifs //nas/data rw
";
        let mounts = parse_mountinfo(content);
        let m = find_mount_for(&mounts, Path::new("/mnt/data/x")).unwrap();
        assert_eq!(m.fs_type, "cifs");
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    #[test]
    fn live_mount_table_classifies_temp_dir() {
        // The live table must be readable and the temp dir resolvable; we don't assert the
        // result because CI runners may have unusual layouts, only that detection doesn't fail.
        assert!(is_remote_mount(&std::env::temp_dir()).is_some());
    }
}
