use anyhow::Result;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tokio::fs;
use serde::{Serialize, Deserialize};

use crate::scanner::ScannedFile;
use crate::path_builder::build_target_path_for_file;
use crate::import_index::ImportIndex;
use chrono::{DateTime, NaiveDateTime, TimeZone};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProgress {
    pub files_processed: u32,
    pub total_files: u32,
    pub bytes_processed: u64,
    pub total_bytes: u64,
    pub current_file: String,
    pub current_file_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum TargetAction {
    /// Target name is free: copy the file there.
    Copy,
    /// A byte-identical file already exists under this name (earlier or interrupted import).
    AlreadyPresent,
}

#[derive(Debug, Clone)]
struct PlannedTarget {
    path: PathBuf,
    action: TargetAction,
}

/// "DSC00001.ARW" -> ("DSC00001", Some("ARW")); names without extension or dot-files keep their name as stem.
fn split_name(name: &str) -> (&str, Option<&str>) {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem, Some(ext)),
        _ => (name, None),
    }
}

/// `n == 0` keeps the original name, otherwise "DSC00001_<n>.ARW".
fn name_with_suffix(name: &str, n: u32) -> String {
    if n == 0 {
        return name.to_string();
    }
    match split_name(name) {
        (stem, Some(ext)) => format!("{}_{}.{}", stem, n, ext),
        (stem, None) => format!("{}_{}", stem, n),
    }
}

/// Key for names already handed out in this batch. Compared case-insensitively because
/// archive volumes are often case-insensitive (exFAT, APFS, NTFS).
fn claim_key(p: &Path) -> String {
    p.to_string_lossy().to_lowercase()
}

/// Byte-for-byte comparison; only used when a target name is already taken.
fn files_identical(a: &Path, b: &Path) -> std::io::Result<bool> {
    if std::fs::metadata(a)?.len() != std::fs::metadata(b)?.len() {
        return Ok(false);
    }
    let (mut fa, mut fb) = (File::open(a)?, File::open(b)?);
    let mut buf_a = vec![0u8; 1 << 20];
    let mut buf_b = vec![0u8; 1 << 20];
    loop {
        let n = fa.read(&mut buf_a)?;
        if n == 0 {
            // Same length and every byte so far matched.
            return Ok(true);
        }
        fb.read_exact(&mut buf_b[..n])?;
        if buf_a[..n] != buf_b[..n] {
            return Ok(false);
        }
    }
}

/// Plans a target path for every file of an import batch without ever overwriting a file.
///
/// Files that share source folder and stem (RAW+JPEG pairs, sidecar-like derivatives) form a
/// group and always receive the same suffix, so `DSC00001.ARW` / `DSC00001.JPG` from a second
/// body become `DSC00001_1.ARW` / `DSC00001_1.JPG` and still stack together.
/// A name whose existing file is byte-identical to the source counts as already imported.
fn plan_targets(files: &[ScannedFile], target_dirs: &[PathBuf]) -> Result<Vec<PlannedTarget>> {
    let mut group_order: Vec<(String, String, String)> = Vec::new();
    let mut groups: HashMap<(String, String, String), Vec<usize>> = HashMap::new();
    for (i, file) in files.iter().enumerate() {
        let source_dir = Path::new(&file.path)
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
        let key = (
            claim_key(&target_dirs[i]),
            source_dir,
            split_name(&file.name).0.to_lowercase(),
        );
        groups
            .entry(key.clone())
            .or_insert_with(|| {
                group_order.push(key);
                Vec::new()
            })
            .push(i);
    }

    let mut claimed: HashSet<String> = HashSet::new();
    let mut plan: Vec<Option<PlannedTarget>> = vec![None; files.len()];

    for key in group_order {
        let members = &groups[&key];
        let mut n = 0u32;
        loop {
            let mut candidates = Vec::with_capacity(members.len());
            let mut fits = true;
            for &i in members {
                let candidate = target_dirs[i].join(name_with_suffix(&files[i].name, n));
                if claimed.contains(&claim_key(&candidate)) {
                    fits = false;
                    break;
                }
                if std::fs::symlink_metadata(&candidate).is_ok() {
                    // Taken: only usable if it already holds exactly this file.
                    match files_identical(Path::new(&files[i].path), &candidate) {
                        Ok(true) => candidates.push((i, candidate, TargetAction::AlreadyPresent)),
                        _ => {
                            fits = false;
                            break;
                        }
                    }
                } else {
                    candidates.push((i, candidate, TargetAction::Copy));
                }
            }
            if fits {
                for (i, path, action) in candidates {
                    claimed.insert(claim_key(&path));
                    plan[i] = Some(PlannedTarget { path, action });
                }
                break;
            }
            n += 1;
            if n > 9999 {
                return Err(anyhow::anyhow!(
                    "No free file name for {} in {:?}",
                    files[members[0]].name,
                    target_dirs[members[0]]
                ));
            }
        }
    }

    Ok(plan.into_iter().map(|p| p.expect("every file belongs to a group")).collect())
}

/// Converts a capture time (camera wall-clock time without zone, like EXIF) into an absolute
/// timestamp in `tz`. Ambiguous times at the end of DST use the earlier instant; times inside the
/// spring-forward gap do not exist locally and are moved forward by one hour.
fn local_capture_time_to_system_time<Tz: TimeZone>(naive: NaiveDateTime, tz: &Tz) -> Option<SystemTime> {
    tz.from_local_datetime(&naive)
        .earliest()
        .or_else(|| tz.from_local_datetime(&(naive + chrono::Duration::hours(1))).earliest())
        .map(SystemTime::from)
}

pub async fn execute_import<F>(
    files: Vec<ScannedFile>,
    destination_base: &str,
    template: &str,
    import_index: &ImportIndex,
    date_override: Option<String>,
    mut on_progress: F,
) -> Result<Vec<String>>
where
    F: FnMut(ImportProgress) + Send + 'static,
{
    let total_files = files.len() as u32;
    let total_bytes: u64 = files.iter().map(|f| f.size).sum();
    let mut files_processed = 0;
    let mut bytes_processed = 0;
    let mut imported_paths = Vec::with_capacity(files.len());

    let dest_base = Path::new(destination_base);

    let override_dt = date_override
        .as_deref()
        .and_then(crate::date_resolver::parse_flexible_datetime);

    let needs_camera = template.contains("{camera}");

    let target_dirs: Vec<PathBuf> = files
        .iter()
        .map(|file| {
            let date = override_dt.or(file.date).unwrap_or(DateTime::UNIX_EPOCH.naive_utc());
            let src_path = Path::new(&file.path);
            let camera = if needs_camera {
                crate::metadata_resolver::get_image_metadata(src_path).camera
            } else {
                None
            };
            let relative_dir = build_target_path_for_file(template, &date, Some(src_path), camera.as_deref());
            // Strip leading slashes to prevent join from replacing the base path
            dest_base.join(relative_dir.trim_start_matches('/'))
        })
        .collect();

    // Name planning touches the destination (stat calls, byte comparison on collisions),
    // so run it off the async executor.
    let (files, plan) = tokio::task::spawn_blocking(move || {
        let plan = plan_targets(&files, &target_dirs);
        (files, plan)
    })
    .await?;
    let plan = plan?;

    for (file, target) in files.into_iter().zip(plan) {
        let target_path = target.path;
        let target_path_str = target_path.to_string_lossy().into_owned();

        // Notify progress before copy
        on_progress(ImportProgress {
            files_processed,
            total_files,
            bytes_processed,
            total_bytes,
            current_file: file.name.clone(),
            current_file_path: target_path_str.clone(),
        });

        let source_hash = if !file.hash.is_empty() {
            file.hash.clone()
        } else {
            crate::hasher::hash_file_head(Path::new(&file.path))?
        };

        if target.action == TargetAction::Copy {
            if let Some(target_dir) = target_path.parent() {
                if !target_dir.exists() {
                    fs::create_dir_all(target_dir).await?;
                }
            }

            // The name was free when the batch was planned; never overwrite something that
            // appeared since then (another tool or a second import writing to the archive).
            if fs::symlink_metadata(&target_path).await.is_ok() {
                return Err(anyhow::anyhow!(
                    "Target appeared during import, not overwriting: {}",
                    target_path_str
                ));
            }

            // Copy file
            fs::copy(&file.path, &target_path).await?;

            // VERIFY: size of the copy and hash of its head must match the original
            let source_len = fs::metadata(&file.path).await?.len();
            let target_len = fs::metadata(&target_path).await?.len();
            let target_hash = crate::hasher::hash_file_head(&target_path)?;
            if target_len != source_len || target_hash != source_hash {
                fs::remove_file(&target_path).await?;
                return Err(anyhow::anyhow!("Verification failed after copy: {}", file.name));
            }

            // Set modification time (mtime) on destination file to the capture date.
            // Capture dates are local wall-clock times, so convert via the local time zone.
            let effective_dt = override_dt.or(file.date);
            if let Some(sys_time) = effective_dt
                .and_then(|naive_dt| local_capture_time_to_system_time(naive_dt, &chrono::Local))
            {
                let times = std::fs::FileTimes::new().set_modified(sys_time);
                if let Ok(f) = std::fs::OpenOptions::new().write(true).open(&target_path) {
                    let _ = f.set_times(times);
                }
            }
        }

        // Mark as imported
        let _ = import_index.mark_imported(
            &source_hash,
            file.size,
            &file.name,
            &target_path_str
        );

        // Update progress
        files_processed += 1;
        bytes_processed += file.size;
        imported_paths.push(target_path_str.clone());

        // Notify progress after copy
        on_progress(ImportProgress {
            files_processed,
            total_files,
            bytes_processed,
            total_bytes,
            current_file: file.name.clone(),
            current_file_path: target_path_str,
        });
    }

    Ok(imported_paths)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        root: PathBuf,
        dest: PathBuf,
        index: ImportIndex,
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    fn fixture(name: &str) -> Fixture {
        let root = std::env::temp_dir().join(format!("rr_import_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let dest = root.join("archive");
        std::fs::create_dir_all(&dest).unwrap();
        let index = ImportIndex::new(&root.join("app")).unwrap();
        Fixture { root, dest, index }
    }

    fn dt(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").unwrap()
    }

    fn source_file(fx: &Fixture, rel: &str, content: &[u8], date: &str) -> ScannedFile {
        let p = fx.root.join("card").join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, content).unwrap();
        ScannedFile {
            path: p.to_string_lossy().into_owned(),
            name: p.file_name().unwrap().to_string_lossy().into_owned(),
            size: content.len() as u64,
            date: Some(dt(date)),
            formatted_date: None,
            hash: String::new(),
            already_imported: false,
        }
    }

    fn import(fx: &Fixture, files: Vec<ScannedFile>) -> Vec<String> {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(execute_import(
            files,
            &fx.dest.to_string_lossy(),
            "{year}/{month}-{day}",
            &fx.index,
            None,
            |_| {},
        ))
        .unwrap()
    }

    fn day_dir(fx: &Fixture) -> PathBuf {
        fx.dest.join("2026").join("05-01")
    }

    fn names_in(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn same_name_from_two_card_folders_is_not_overwritten() {
        // Counter rollover (100MSDCF / 101MSDCF) or two bodies of the same brand.
        let fx = fixture("two_folders");
        let a = source_file(&fx, "100MSDCF/DSC00001.ARW", &[b'A'; 4096], "2026-05-01 10:00:00");
        let b = source_file(&fx, "101MSDCF/DSC00001.ARW", &[b'B'; 4096], "2026-05-01 11:00:00");

        let out = import(&fx, vec![a, b]);

        assert_eq!(out.len(), 2);
        assert_ne!(out[0], out[1], "each imported file needs its own target path");
        assert_eq!(names_in(&day_dir(&fx)), vec!["DSC00001.ARW", "DSC00001_1.ARW"]);
        assert_eq!(std::fs::read(day_dir(&fx).join("DSC00001.ARW")).unwrap()[0], b'A');
        assert_eq!(std::fs::read(day_dir(&fx).join("DSC00001_1.ARW")).unwrap()[0], b'B');
    }

    #[test]
    fn existing_archive_file_with_same_name_is_kept() {
        let fx = fixture("existing");
        std::fs::create_dir_all(day_dir(&fx)).unwrap();
        std::fs::write(day_dir(&fx).join("DSC00001.ARW"), [b'X'; 4096]).unwrap();
        let a = source_file(&fx, "100MSDCF/DSC00001.ARW", &[b'A'; 4096], "2026-05-01 10:00:00");

        let out = import(&fx, vec![a]);

        assert_eq!(std::fs::read(day_dir(&fx).join("DSC00001.ARW")).unwrap()[0], b'X', "archived file must survive");
        assert!(out[0].ends_with("DSC00001_1.ARW"), "new file must get a free name, got {}", out[0]);
        assert_eq!(std::fs::read(&out[0]).unwrap()[0], b'A');
    }

    #[test]
    fn raw_jpeg_pair_keeps_matching_suffix() {
        // Body A left DSC00001.JPG in the archive; body B shot RAW+JPEG with the same counter.
        // Both files of B's pair must get the same suffix so RAW+JPEG stacking still pairs them.
        let fx = fixture("pair");
        std::fs::create_dir_all(day_dir(&fx)).unwrap();
        std::fs::write(day_dir(&fx).join("DSC00001.JPG"), [b'J'; 2048]).unwrap();
        let raw = source_file(&fx, "100MSDCF/DSC00001.ARW", &[b'R'; 4096], "2026-05-01 10:00:00");
        let jpg = source_file(&fx, "100MSDCF/DSC00001.JPG", &[b'K'; 2048], "2026-05-01 10:00:00");

        let out = import(&fx, vec![raw, jpg]);

        assert!(out[0].ends_with("DSC00001_1.ARW"), "got {}", out[0]);
        assert!(out[1].ends_with("DSC00001_1.JPG"), "got {}", out[1]);
        assert_eq!(std::fs::read(day_dir(&fx).join("DSC00001.JPG")).unwrap()[0], b'J');
    }

    #[test]
    fn identical_file_is_not_copied_twice() {
        let fx = fixture("identical");
        let a = source_file(&fx, "100MSDCF/DSC00001.ARW", &[b'A'; 4096], "2026-05-01 10:00:00");

        let first = import(&fx, vec![a.clone()]);
        let second = import(&fx, vec![a]);

        assert_eq!(first, second, "re-importing the same file must point to the existing copy");
        assert_eq!(names_in(&day_dir(&fx)), vec!["DSC00001.ARW"]);
    }

    #[test]
    fn suffix_keeps_extension() {
        assert_eq!(name_with_suffix("DSC00001.ARW", 0), "DSC00001.ARW");
        assert_eq!(name_with_suffix("DSC00001.ARW", 2), "DSC00001_2.ARW");
        assert_eq!(name_with_suffix("archive.tar.gz", 1), "archive.tar_1.gz");
        assert_eq!(name_with_suffix("NOEXT", 1), "NOEXT_1");
        assert_eq!(name_with_suffix(".hidden", 1), ".hidden_1");
    }

    #[test]
    fn capture_time_is_interpreted_in_the_given_zone() {
        let berlin_summer = chrono::FixedOffset::east_opt(2 * 3600).unwrap();
        let new_york = chrono::FixedOffset::west_opt(5 * 3600).unwrap();
        let t = local_capture_time_to_system_time(dt("2026-05-01 10:00:00"), &berlin_summer).unwrap();
        assert_eq!(chrono::DateTime::<chrono::Utc>::from(t).naive_utc(), dt("2026-05-01 08:00:00"));
        let t = local_capture_time_to_system_time(dt("2026-05-01 10:00:00"), &new_york).unwrap();
        assert_eq!(chrono::DateTime::<chrono::Utc>::from(t).naive_utc(), dt("2026-05-01 15:00:00"));
    }

    #[test]
    fn mtime_is_set_from_local_capture_time() {
        // Capture times are local wall-clock times. Run the suite with e.g. TZ=Europe/Berlin
        // to exercise a non-UTC zone; in UTC the old and new behaviour coincide.
        let fx = fixture("mtime");
        let a = source_file(&fx, "100MSDCF/C0001.MP4", &[b'V'; 4096], "2026-05-01 10:00:00");

        let out = import(&fx, vec![a]);

        let modified: chrono::DateTime<chrono::Local> =
            std::fs::metadata(&out[0]).unwrap().modified().unwrap().into();
        assert_eq!(modified.naive_local(), dt("2026-05-01 10:00:00"));
    }
}
