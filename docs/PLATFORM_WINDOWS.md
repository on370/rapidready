# RapidReady — Windows Platform & Build Guide

> **Target Platform:** Windows 10 / Windows 11 (x64)  
> **Packaging:** NSIS Standalone Installer (`.exe`)

---

## 1. Prerequisites & Environment Setup

Ensure the following prerequisites are installed on your Windows development workstation:

1. **Node.js & npm:**
   - Node.js LTS (v18, v20, or v22).
   - Verify in PowerShell: `node -v` and `npm -v`.

2. **Rust Toolchain:**
   - Install via [rustup.rs](https://rustup.rs/) using the default `x86_64-pc-windows-msvc` target.
   - Verify: `rustc --version` and `cargo --version`.

3. **Microsoft C++ Build Tools (Visual Studio 2022):**
   - Install Visual Studio 2022 Community or the standalone [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
   - **Required Workload:** *"Desktop development with C++"*.
   - Ensure the **MSVC v143 toolset** and the latest **Windows 10/11 SDK** are selected.

4. **Microsoft Edge WebView2 Runtime:**
   - Pre-installed on Windows 10 and 11. (If missing, download from Microsoft's evergreen bootstrapper).

---

## 2. Quick Start & Development

We provide convenient 1-click batch scripts in the [`scripts/`](../scripts/) folder:

### Launching Development Mode
Double-click [`scripts/dev.bat`](../scripts/dev.bat) or run from PowerShell / Command Prompt:
```cmd
scripts\dev.bat
```
*Behind the scenes:* This checks your environment, installs missing dependencies (`npm install`), and launches Vite together with Tauri via `npm run tauri dev`.

### Running Unit Tests
```cmd
cd src-tauri
cargo test -p rapidready-core
```

---

## 3. Building the Production NSIS Installer

To build the release binary and package the standalone NSIS installer (`.exe`):

Double-click [`scripts/build-installer.bat`](../scripts/build-installer.bat) or run:
```cmd
scripts\build-installer.bat
```

### Artifact Location
Upon completion, the installer is placed at:
```
src-tauri\target\release\bundle\nsis\RapidReady_<version>_x64-setup.exe
```

---

## 4. Key Windows Considerations & Gotchas

1. **Path Normalization (Backslashes vs. Slashes):**
   - Windows uses drive letters and backslashes (e.g. `C:\Users\Photo\Archive`).
   - The Rust core normalizes paths internally. Always use `Path` / `PathBuf` rather than manual string concatenation.
   - In React, paths are normalized via `normalizePath()` to ensure cross-platform map lookups.

2. **File Locking during I/O:**
   - Windows strictly enforces file sharing locks (`ERROR_SHARING_VIOLATION`).
   - RapidReady performs atomic writes by writing to a unique temporary file (`.{stem}.tmp.{thread_id}.{pid}`) in the same folder and using `std::fs::rename` (which is atomic on NTFS).

3. **Windows SmartScreen Note:**
   - Because RapidReady is open-source and not signed with an expensive commercial EV certificate, Windows SmartScreen will display an informational banner (*"Windows protected your PC"*).
   - Instruct users to click **More info** and then **Run anyway**.
