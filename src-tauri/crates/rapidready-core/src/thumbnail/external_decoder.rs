//! Linux fallback decoders for formats the pure-Rust pipeline cannot handle.
//!
//! macOS decodes HEIC/HEIF/AVIF stills and video poster frames in-process via ImageIO /
//! QuickLook, and Windows via the Shell thumbnail cache (`thumb_rs`). Linux has no such
//! OS service, so this module shells out to optional, user-installed command line tools:
//!
//! * **HEIC / HEIF / HIF / AVIF stills:** `heif-dec` (libheif >= 1.17) or its older name
//!   `heif-convert`; falls back to `ffmpeg` (which can also decode HEIF stills).
//! * **Video poster frames:** `ffmpeg` (frame at 1 s, or the first frame for short clips).
//!
//! Both tools apply the container's rotation (HEIF `irot`/`imir`, video display matrix),
//! so returned pixels are already display-oriented.
//!
//! Guardrails (see ROADMAP "FFmpeg Compatibility Layer"):
//! * Binaries are probed once per process (`PATH` lookup); absent tools mean a silent no-op.
//! * Every invocation runs with a hard timeout and is killed when it expires.
//! * A global concurrency cap keeps background cache warming from saturating the CPU.
//! * Failures are remembered per (path, size, mtime) so broken files are not re-decoded
//!   on every scroll.
//! * Only called on cache misses, never on the L1/L2 thumbnail fast path.

use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Condvar, LazyLock, Mutex, OnceLock};
use std::time::{Duration, Instant};

use image::DynamicImage;
use lru::LruCache;

/// Still-image containers decoded via libheif (`heif-dec`) or ffmpeg.
const HEIF_EXTENSIONS: &[&str] = &["heic", "heif", "hif", "avif"];

/// Maximum number of external decoder processes running at the same time.
const MAX_CONCURRENT_DECODES: usize = 2;

const HEIF_TIMEOUT: Duration = Duration::from_secs(10);
const VIDEO_TIMEOUT: Duration = Duration::from_secs(15);

/// Seek position for video poster frames (skips black fade-ins of the first frames).
const VIDEO_SEEK_SECONDS: &str = "1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaKind {
    Heif,
    Video,
}

/// Classifies `path` by extension; `None` means the external decoders are not responsible.
pub fn media_kind(path: &Path) -> Option<MediaKind> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    if HEIF_EXTENSIONS.contains(&ext.as_str()) {
        Some(MediaKind::Heif)
    } else if crate::metadata_resolver::is_video_path(path) {
        Some(MediaKind::Video)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Tool discovery
// ---------------------------------------------------------------------------

#[derive(Debug)]
struct HeifTool {
    path: PathBuf,
    supports_quiet: bool,
    supports_auto_correct: bool,
}

#[derive(Debug, Default)]
struct Tools {
    heif: Option<HeifTool>,
    ffmpeg: Option<PathBuf>,
}

static TOOLS: OnceLock<Tools> = OnceLock::new();

fn find_in_path(name: &str) -> Option<PathBuf> {
    use std::os::unix::fs::PermissionsExt;
    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var)
        .map(|dir| dir.join(name))
        .find(|candidate| {
            std::fs::metadata(candidate)
                .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
                .unwrap_or(false)
        })
}

fn probe_heif_tool() -> Option<HeifTool> {
    let path = find_in_path("heif-dec").or_else(|| find_in_path("heif-convert"))?;
    // Feature-detect optional flags from --help (older libheif versions reject unknown options).
    let help = Command::new(&path)
        .arg("--help")
        .stdin(Stdio::null())
        .output()
        .map(|o| {
            let mut text = String::from_utf8_lossy(&o.stdout).into_owned();
            text.push_str(&String::from_utf8_lossy(&o.stderr));
            text
        })
        .unwrap_or_default();
    Some(HeifTool {
        path,
        supports_quiet: help.contains("--quiet"),
        // Works around Sony HIF full-range flag mismatch (washed-out colours).
        supports_auto_correct: help.contains("--auto-correct"),
    })
}

fn tools() -> &'static Tools {
    TOOLS.get_or_init(|| Tools {
        heif: probe_heif_tool(),
        ffmpeg: find_in_path("ffmpeg"),
    })
}

/// Returns true if an external decoder for `path`'s media type is installed.
pub fn is_supported(path: &Path) -> bool {
    let t = tools();
    match media_kind(path) {
        Some(MediaKind::Heif) => t.heif.is_some() || t.ffmpeg.is_some(),
        Some(MediaKind::Video) => t.ffmpeg.is_some(),
        None => false,
    }
}

// ---------------------------------------------------------------------------
// Guardrails: concurrency cap, negative cache, timeouts, temp files
// ---------------------------------------------------------------------------

static ACTIVE_DECODES: (Mutex<usize>, Condvar) = (Mutex::new(0), Condvar::new());

struct DecodeSlot;

impl DecodeSlot {
    fn acquire() -> Self {
        let (lock, cvar) = &ACTIVE_DECODES;
        let mut active = lock.lock().unwrap_or_else(|e| e.into_inner());
        while *active >= MAX_CONCURRENT_DECODES {
            active = cvar.wait(active).unwrap_or_else(|e| e.into_inner());
        }
        *active += 1;
        DecodeSlot
    }
}

impl Drop for DecodeSlot {
    fn drop(&mut self) {
        let (lock, cvar) = &ACTIVE_DECODES;
        let mut active = lock.lock().unwrap_or_else(|e| e.into_inner());
        *active = active.saturating_sub(1);
        cvar.notify_one();
    }
}

type FileKey = (PathBuf, u64, i64);

static FAILED_FILES: LazyLock<Mutex<LruCache<FileKey, ()>>> =
    LazyLock::new(|| Mutex::new(LruCache::new(NonZeroUsize::new(4096).unwrap())));

fn file_key(path: &Path) -> Option<FileKey> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    Some((path.to_path_buf(), meta.len(), mtime))
}

fn has_failed_before(key: &FileKey) -> bool {
    FAILED_FILES
        .lock()
        .map(|mut c| c.get(key).is_some())
        .unwrap_or(false)
}

fn remember_failure(key: FileKey) {
    if let Ok(mut c) = FAILED_FILES.lock() {
        c.put(key, ());
    }
}

/// Unique scratch directory, removed (with everything the tool wrote into it) on drop.
struct ScratchDir(PathBuf);

impl ScratchDir {
    fn create() -> Option<Self> {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "rapidready-decode-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&dir).ok()?;
        Some(ScratchDir(dir))
    }
}

impl Drop for ScratchDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Runs `cmd` with all stdio detached; kills it if it exceeds `timeout`.
fn run_with_timeout(cmd: &mut Command, timeout: Duration) -> bool {
    let mut child = match cmd
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}

/// Makes a path safe to pass as a positional CLI argument (never starts with '-').
fn positional_arg(path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        Path::new(".").join(path)
    }
}

/// Opens the first decodable image the tool wrote into `dir`
/// (libheif writes `out-1.jpg`, `out-2.jpg`, ... for multi-image files).
fn open_output(dir: &Path, expected: &Path) -> Option<DynamicImage> {
    if expected.exists() {
        return image::open(expected).ok();
    }
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file())
        .collect();
    files.sort();
    files.into_iter().find_map(|p| image::open(p).ok())
}

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

fn decode_with_heif_tool(tool: &HeifTool, path: &Path, dir: &Path) -> Option<DynamicImage> {
    let out = dir.join("out.jpg");
    let mut cmd = Command::new(&tool.path);
    if tool.supports_quiet {
        cmd.arg("--quiet");
    }
    if tool.supports_auto_correct {
        cmd.arg("--auto-correct");
    }
    cmd.args(["-q", "92"]).arg(positional_arg(path)).arg(&out);
    if !run_with_timeout(&mut cmd, HEIF_TIMEOUT) {
        return None;
    }
    open_output(dir, &out)
}

fn ffmpeg_scale_filter(max_px: u32) -> String {
    // Downscale inside ffmpeg (never upscale), preserving aspect ratio.
    format!(
        "scale='min({m},iw)':'min({m},ih)':force_original_aspect_ratio=decrease",
        m = max_px
    )
}

fn decode_with_ffmpeg(
    ffmpeg: &Path,
    path: &Path,
    dir: &Path,
    max_px: u32,
    seek: Option<&str>,
    timeout: Duration,
) -> Option<DynamicImage> {
    // BMP output avoids mjpeg encoder colour-range restrictions; JPEG encoding happens in Rust.
    let out = dir.join("frame.bmp");
    // The `file:` prefix stops ffmpeg from interpreting ':' in file names as a protocol.
    let mut input = std::ffi::OsString::from("file:");
    input.push(path.as_os_str());

    let mut cmd = Command::new(ffmpeg);
    cmd.args(["-nostdin", "-hide_banner", "-loglevel", "error", "-y"]);
    if let Some(ss) = seek {
        cmd.args(["-ss", ss]);
    }
    cmd.arg("-i")
        .arg(&input)
        .args(["-map", "0:v:0", "-frames:v", "1", "-vf"])
        .arg(ffmpeg_scale_filter(max_px))
        .args(["-f", "image2", "-c:v", "bmp"])
        .arg(&out);
    if !run_with_timeout(&mut cmd, timeout) {
        return None;
    }
    open_output(dir, &out)
}

fn decode_heif(path: &Path, dir: &Path, max_px: u32) -> Option<DynamicImage> {
    let t = tools();
    if let Some(img) = t.heif.as_ref().and_then(|tool| decode_with_heif_tool(tool, path, dir)) {
        return Some(img);
    }
    let ffmpeg = t.ffmpeg.as_deref()?;
    decode_with_ffmpeg(ffmpeg, path, dir, max_px, None, HEIF_TIMEOUT)
}

fn decode_video(path: &Path, dir: &Path, max_px: u32) -> Option<DynamicImage> {
    let ffmpeg = tools().ffmpeg.as_deref()?;
    // Prefer a frame at 1 s (skips black fade-ins); clips shorter than that yield no
    // frame, so retry from the start.
    decode_with_ffmpeg(ffmpeg, path, dir, max_px, Some(VIDEO_SEEK_SECONDS), VIDEO_TIMEOUT)
        .or_else(|| decode_with_ffmpeg(ffmpeg, path, dir, max_px, None, VIDEO_TIMEOUT))
}

/// Decodes a display-oriented preview of a HEIF-family still or a video poster frame,
/// at most `max_px` on the long edge. Returns `None` if the type is not handled, no
/// suitable tool is installed, the file failed before, or decoding fails / times out.
pub fn decode_preview(path: &Path, max_px: u32) -> Option<DynamicImage> {
    let kind = media_kind(path)?;
    if !is_supported(path) {
        return None;
    }
    let key = file_key(path)?;
    if has_failed_before(&key) {
        return None;
    }

    let result = {
        let _slot = DecodeSlot::acquire();
        let scratch = ScratchDir::create()?;
        match kind {
            MediaKind::Heif => decode_heif(path, &scratch.0, max_px),
            MediaKind::Video => decode_video(path, &scratch.0, max_px),
        }
    };

    match result {
        Some(img) if img.width() > 0 && img.height() > 0 => {
            if img.width().max(img.height()) > max_px {
                Some(img.thumbnail(max_px, max_px))
            } else {
                Some(img)
            }
        }
        _ => {
            remember_failure(key);
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_media_kinds() {
        assert_eq!(media_kind(Path::new("/a/IMG_0001.HEIC")), Some(MediaKind::Heif));
        assert_eq!(media_kind(Path::new("/a/DSC00001.HIF")), Some(MediaKind::Heif));
        assert_eq!(media_kind(Path::new("/a/x.avif")), Some(MediaKind::Heif));
        assert_eq!(media_kind(Path::new("/a/C0001.MP4")), Some(MediaKind::Video));
        assert_eq!(media_kind(Path::new("/a/clip.mov")), Some(MediaKind::Video));
        assert_eq!(media_kind(Path::new("/a/x.jpg")), None);
        assert_eq!(media_kind(Path::new("/a/x.ARW")), None);
        assert_eq!(media_kind(Path::new("/a/noext")), None);
    }

    #[test]
    fn relative_paths_never_look_like_options() {
        assert_eq!(positional_arg(Path::new("-x.heic")), PathBuf::from("./-x.heic"));
        assert_eq!(positional_arg(Path::new("/abs/-x.heic")), PathBuf::from("/abs/-x.heic"));
    }

    #[test]
    fn timeout_kills_long_running_process() {
        let start = Instant::now();
        let ok = run_with_timeout(Command::new("sleep").arg("5"), Duration::from_millis(200));
        assert!(!ok);
        assert!(start.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn concurrency_cap_is_enforced() {
        use std::sync::atomic::AtomicUsize;
        use std::sync::Arc;
        let peak = Arc::new(AtomicUsize::new(0));
        let current = Arc::new(AtomicUsize::new(0));
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let (peak, current) = (peak.clone(), current.clone());
                std::thread::spawn(move || {
                    let _slot = DecodeSlot::acquire();
                    let now = current.fetch_add(1, Ordering::SeqCst) + 1;
                    peak.fetch_max(now, Ordering::SeqCst);
                    std::thread::sleep(Duration::from_millis(30));
                    current.fetch_sub(1, Ordering::SeqCst);
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        assert!(peak.load(Ordering::SeqCst) <= MAX_CONCURRENT_DECODES);
    }

    #[test]
    fn missing_and_unsupported_files_return_none() {
        assert!(decode_preview(Path::new("/nonexistent/clip.mp4"), 720).is_none());
        assert!(decode_preview(Path::new("/etc/hostname"), 720).is_none());
    }

    /// End-to-end check against real tools; skipped when they are not installed.
    #[test]
    fn decodes_generated_video_and_heif_when_tools_present() {
        let t = tools();
        let Some(ffmpeg) = t.ffmpeg.clone() else { return };
        let dir = ScratchDir::create().unwrap();

        // 1920x1080 clip tagged with 90° display rotation -> portrait poster frame.
        let land = dir.0.join("land.mp4");
        let rot = dir.0.join("rot.mp4");
        let short = dir.0.join("short.mov");
        let run_ffmpeg = |args: &[&str]| {
            Command::new(&ffmpeg)
                .args(["-nostdin", "-loglevel", "error", "-y"])
                .args(args)
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        };
        if !run_ffmpeg(&["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=25", "-t", "2",
                  "-pix_fmt", "yuv420p", land.to_str().unwrap()]) {
            return; // ffmpeg build without a usable encoder
        }
        assert!(run_ffmpeg(&["-display_rotation", "90", "-i", land.to_str().unwrap(), "-c", "copy",
                      rot.to_str().unwrap()]));
        assert!(run_ffmpeg(&["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25", "-t", "0.3",
                      "-pix_fmt", "yuv420p", short.to_str().unwrap()]));

        let img = decode_preview(&land, 720).expect("landscape poster frame");
        assert_eq!((img.width(), img.height()), (720, 405));

        let img = decode_preview(&rot, 720).expect("rotated poster frame");
        assert_eq!((img.width(), img.height()), (405, 720));

        // Shorter than the 1 s seek point -> falls back to the first frame.
        let img = decode_preview(&short, 720).expect("short clip poster frame");
        assert_eq!((img.width(), img.height()), (640, 360));

        // Broken file -> None, and remembered as failed.
        let broken = dir.0.join("broken.mp4");
        std::fs::write(&broken, b"not a video").unwrap();
        assert!(decode_preview(&broken, 720).is_none());
        assert!(has_failed_before(&file_key(&broken).unwrap()));

        // HEIC via heif-enc if available.
        if let Some(enc) = find_in_path("heif-enc") {
            let png = dir.0.join("src.png");
            let heic = dir.0.join("photo.heic");
            assert!(run_ffmpeg(&["-f", "lavfi", "-i", "testsrc2=size=1600x1200", "-frames:v", "1",
                          png.to_str().unwrap()]));
            let ok = Command::new(enc)
                .args(["-q", "70"])
                .arg(&png)
                .arg("-o")
                .arg(&heic)
                .stdout(Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if ok {
                let img = decode_preview(&heic, 720).expect("heic preview");
                assert_eq!((img.width(), img.height()), (720, 540));
            }
        }
    }

    /// Public thumbnail API must route videos to the external decoder for both the grid
    /// thumbnail (scale 1, 720 px) and the inspector/loupe preview (2560 px cap).
    #[test]
    fn public_preview_api_uses_external_decoder() {
        let Some(ffmpeg) = tools().ffmpeg.clone() else { return };
        let dir = ScratchDir::create().unwrap();
        let clip = dir.0.join("pipeline.mp4");
        let ok = Command::new(&ffmpeg)
            .args(["-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                   "testsrc2=size=1920x1080:rate=25", "-t", "2", "-pix_fmt", "yuv420p"])
            .arg(&clip)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            return;
        }

        let thumb = crate::thumbnail::get_preview_jpeg(&clip, 1).expect("grid thumbnail");
        assert_eq!(&thumb[..2], &[0xFF, 0xD8]);
        assert_eq!(crate::thumbnail::parse_jpeg_dimensions(&thumb), Some((720, 405)));

        let max = crate::thumbnail::get_max_preview_jpeg(&clip).expect("max preview");
        assert_eq!(crate::thumbnail::parse_jpeg_dimensions(&max), Some((1920, 1080)));

        // Explicit user rotation (90° CW) is applied on top of the decoded frame.
        let rotated = crate::thumbnail::get_preview_jpeg_with_orient(&clip, 1, Some(6))
            .expect("rotated thumbnail");
        assert_eq!(crate::thumbnail::parse_jpeg_dimensions(&rotated), Some((405, 720)));
    }
}
