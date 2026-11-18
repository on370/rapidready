//! Discovery of the RapidRAW binary and its headless command-line export
//! (`RapidRAW export <source> --output <file> --format jpeg --quality <q> [--keep-metadata]`).
//! Headless mode renders a photo with the edits from its sidecar and exits without opening a window.

use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use anyhow::{anyhow, bail, Context, Result};

/// RapidRAW's GPU processing failed (typically after it fell back to its OpenGL backend).
/// Its output is unusable, often a black image, and every following render would fail the same way.
#[derive(Debug)]
pub struct RapidRawGpuFailure(pub String);

impl std::fmt::Display for RapidRawGpuFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "RapidRAW GPU processing failed: {}", self.0)
    }
}

impl std::error::Error for RapidRawGpuFailure {}

/// Log lines that show RapidRAW's GPU processing broke, even when it still exits with code 0.
const GPU_FAILURE_MARKERS: [&str; 4] = [
    "is invalid",
    "error C1068",
    "Could not lock adapter context",
    "Falling back to OpenGL backend",
];

/// Returns the first stderr line that shows a RapidRAW GPU failure, if any.
pub fn detect_gpu_failure(stderr: &str) -> Option<String> {
    stderr
        .lines()
        .map(str::trim)
        .find(|line| GPU_FAILURE_MARKERS.iter().any(|m| line.contains(m)))
        .map(str::to_string)
}

/// Candidate RapidRAW executable locations on Windows (user and system-wide installs).
pub fn windows_binary_candidates(env: impl Fn(&str) -> Option<String>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(local) = env("LOCALAPPDATA") {
        candidates.push(Path::new(&local).join("Programs").join("RapidRaw").join("RapidRaw.exe"));
        candidates.push(Path::new(&local).join("RapidRaw").join("RapidRaw.exe"));
    }
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(dir) = env(var) {
            candidates.push(Path::new(&dir).join("RapidRaw").join("RapidRaw.exe"));
        }
    }
    candidates
}

/// Candidate RapidRAW executable locations inside the macOS app bundle.
pub fn macos_binary_candidates(home: Option<&str>) -> Vec<PathBuf> {
    let mut candidates = vec![PathBuf::from("/Applications/RapidRAW.app/Contents/MacOS/RapidRAW")];
    if let Some(home) = home {
        candidates.push(Path::new(home).join("Applications/RapidRAW.app/Contents/MacOS/RapidRAW"));
    }
    candidates
}

/// Candidate RapidRAW executables on Linux: every `PATH` entry with a `rapidraw` binary.
pub fn linux_binary_candidates(path_var: Option<&str>) -> Vec<PathBuf> {
    let Some(path_var) = path_var else {
        return Vec::new();
    };
    std::env::split_paths(path_var)
        .flat_map(|dir| [dir.join("rapidraw"), dir.join("RapidRAW")])
        .collect()
}

/// Locates the installed RapidRAW executable, if any.
pub fn find_rapidraw_binary() -> Option<PathBuf> {
    let env = |key: &str| std::env::var(key).ok();

    let candidates = if cfg!(target_os = "windows") {
        windows_binary_candidates(env)
    } else if cfg!(target_os = "macos") {
        macos_binary_candidates(env("HOME").as_deref())
    } else {
        linux_binary_candidates(env("PATH").as_deref())
    };
    if let Some(found) = candidates.into_iter().find(|p| p.is_file()) {
        return Some(found);
    }

    // macOS: the app bundle may live anywhere, ask Spotlight for it
    #[cfg(target_os = "macos")]
    if let Ok(out) = Command::new("mdfind")
        .arg("kMDItemCFBundleIdentifier == 'io.github.CyberTimon.RapidRAW'")
        .output()
    {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines().map(str::trim).filter(|l| !l.is_empty()) {
            let bin = Path::new(line).join("Contents/MacOS/RapidRAW");
            if bin.is_file() {
                return Some(bin);
            }
        }
    }

    None
}

/// Returns true if a user-configured custom editor path points at RapidRAW
/// (`RapidRAW.exe`, a `rapidraw` binary or a `RapidRAW.app` bundle).
pub fn custom_path_is_rapidraw(custom_path: &Path) -> bool {
    custom_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| {
            let n = n.to_lowercase();
            n == "rapidraw" || n == "rapidraw.exe" || n == "rapidraw.app"
        })
        .unwrap_or(false)
}

/// Resolves the RapidRAW executable for the configured RAW developer.
/// Returns `None` unless RapidRAW is the configured editor and its binary exists.
pub fn resolve_rapidraw_binary(developer: Option<&str>, custom_path: Option<&str>) -> Option<PathBuf> {
    match developer.unwrap_or("rapidraw").to_lowercase().as_str() {
        "rapidraw" => find_rapidraw_binary(),
        "custom" => {
            let path = PathBuf::from(custom_path?.trim());
            if !custom_path_is_rapidraw(&path) {
                return None;
            }
            let bin = if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("app")) {
                path.join("Contents/MacOS/RapidRAW")
            } else {
                path
            };
            bin.is_file().then_some(bin)
        }
        _ => None,
    }
}

/// Builds the arguments for a headless RapidRAW JPEG export of a single file.
pub fn build_headless_export_args(source: &Path, output: &Path, quality: u8, keep_metadata: bool) -> Vec<OsString> {
    let mut args: Vec<OsString> = vec![
        "export".into(),
        source.as_os_str().to_owned(),
        "--output".into(),
        output.as_os_str().to_owned(),
        "--format".into(),
        "jpeg".into(),
        "--quality".into(),
        quality.clamp(1, 100).to_string().into(),
    ];
    if keep_metadata {
        args.push("--keep-metadata".into());
    }
    args
}

/// Extracts a readable error from RapidRAW's stderr, which also carries its log output.
pub fn summarize_rapidraw_stderr(stderr: &str) -> Option<String> {
    let lines: Vec<&str> = stderr.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    lines
        .iter()
        .rev()
        .find(|l| l.to_lowercase().contains("failed"))
        .or_else(|| lines.last())
        .map(|l| l.to_string())
}

/// Renders `source` with its RapidRAW edits into the JPEG file `output`.
/// Waits for RapidRAW to finish: the process is never killed, since killing it during GPU init
/// leaves RapidRAW's crash flag behind and makes it switch to its OpenGL fallback backend.
/// Returns a [`RapidRawGpuFailure`] error if RapidRAW's log shows broken GPU processing.
/// No output file is left behind when the render fails.
pub fn render_with_rapidraw(
    binary: &Path,
    source: &Path,
    output: &Path,
    quality: u8,
    keep_metadata: bool,
) -> Result<()> {
    let result = run_headless_export(binary, source, output, quality, keep_metadata);
    if result.is_err() {
        let _ = std::fs::remove_file(output);
    }
    result
}

fn run_headless_export(binary: &Path, source: &Path, output: &Path, quality: u8, keep_metadata: bool) -> Result<()> {
    let mut command = Command::new(binary);
    command
        .args(build_headless_export_args(source, output, quality, keep_metadata))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().context("Failed to start RapidRAW")?;

    // Drain stderr on a separate thread so RapidRAW's logging can never fill the pipe and block it
    let stderr_reader = child.stderr.take().map(|mut pipe| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = pipe.read_to_string(&mut buf);
            buf
        })
    });
    let status = child.wait().context("Failed to wait for RapidRAW")?;
    let stderr = stderr_reader.and_then(|h| h.join().ok()).unwrap_or_default();

    // Checked first: with a broken GPU backend RapidRAW may still exit 0 and write a black image
    if let Some(line) = detect_gpu_failure(&stderr) {
        return Err(RapidRawGpuFailure(line).into());
    }
    if !status.success() {
        let detail = summarize_rapidraw_stderr(&stderr).unwrap_or_else(|| status.to_string());
        return Err(anyhow!("RapidRAW: {}", detail));
    }
    if !output.is_file() {
        // RapidRAW versions before 1.6.0 have no headless export and ignore the request
        bail!("RapidRAW did not write an output file (RapidRAW 1.6.0 or newer is required)");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_windows_candidates() {
        let env = |key: &str| match key {
            "LOCALAPPDATA" => Some("/local".to_string()),
            "ProgramFiles" => Some("/pf".to_string()),
            _ => None,
        };
        let c = windows_binary_candidates(env);
        assert_eq!(c.len(), 3);
        assert_eq!(c[0], Path::new("/local/Programs/RapidRaw/RapidRaw.exe"));
        assert_eq!(c[1], Path::new("/local/RapidRaw/RapidRaw.exe"));
        assert_eq!(c[2], Path::new("/pf/RapidRaw/RapidRaw.exe"));
    }

    #[test]
    fn test_macos_and_linux_candidates() {
        let mac = macos_binary_candidates(Some("/Users/me"));
        assert_eq!(mac.len(), 2);
        assert!(mac[1].starts_with("/Users/me/Applications/RapidRAW.app"));

        assert!(linux_binary_candidates(None).is_empty());
        let joined = std::env::join_paths(["/usr/bin", "/opt/bin"]).unwrap();
        let linux = linux_binary_candidates(joined.to_str());
        assert_eq!(linux.len(), 4);
        assert_eq!(linux[0], Path::new("/usr/bin").join("rapidraw"));
    }

    #[test]
    fn test_custom_path_detection() {
        assert!(custom_path_is_rapidraw(Path::new(r"C:\Apps\RapidRAW.exe")));
        assert!(custom_path_is_rapidraw(Path::new("/Applications/RapidRAW.app")));
        assert!(custom_path_is_rapidraw(Path::new("/usr/bin/rapidraw")));
        assert!(!custom_path_is_rapidraw(Path::new("/usr/bin/darktable")));
        assert!(resolve_rapidraw_binary(Some("darktable"), None).is_none());
        assert!(resolve_rapidraw_binary(Some("custom"), Some("/nope/darktable")).is_none());
    }

    #[test]
    fn test_build_args() {
        let args = build_headless_export_args(Path::new("in.ARW"), Path::new("out.jpg"), 0, true);
        let args: Vec<String> = args.iter().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(
            args,
            ["export", "in.ARW", "--output", "out.jpg", "--format", "jpeg", "--quality", "1", "--keep-metadata"]
        );
        let args = build_headless_export_args(Path::new("a"), Path::new("b"), 90, false);
        assert_eq!(args.len(), 8);
    }

    #[test]
    fn test_detect_gpu_failure() {
        let fixtures = [
            "2026-11-17 02:10:11 [ERROR] Shader compile failed: 0(57) : error C1068: array index out of bounds",
            "2026-11-17 02:10:11 [ERROR] wgpu error: ComputePipeline with 'Compute Pipeline' label is invalid",
            "thread 'tokio-runtime-worker' panicked: Could not lock adapter context. This is most-likely a deadlock.",
            "2026-11-17 02:10:09 [WARN] GPU Driver crash detected on last run! Falling back to OpenGL backend.",
        ];
        for line in fixtures {
            let stderr = format!("2026 [INFO] Logger initialized
{}
Headless export completed successfully.
", line);
            assert_eq!(detect_gpu_failure(&stderr).as_deref(), Some(line));
        }

        let healthy = "2026 [INFO] Using GPU adapter: NVIDIA GeForce RTX 3080 Ti (Vulkan, DiscreteGpu)
                       2026 [INFO] [process_image_for_export] 6000x4000 processed on GPU in 209ms
                       Headless export completed successfully.
";
        assert_eq!(detect_gpu_failure(healthy), None);
    }

    #[test]
    fn test_summarize_stderr() {
        let stderr = "2026 [INFO] Logger initialized\n\
                      Headless export failed: Source path does not exist: x.ARW\n";
        assert_eq!(
            summarize_rapidraw_stderr(stderr).as_deref(),
            Some("Headless export failed: Source path does not exist: x.ARW")
        );
        assert_eq!(summarize_rapidraw_stderr("one\ntwo\n").as_deref(), Some("two"));
        assert_eq!(summarize_rapidraw_stderr("  \n"), None);
    }
}
