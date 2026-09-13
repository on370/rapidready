# RapidReady — macOS Platform & Build Guide

> **Target Platform:** macOS 12 (Monterey) or later (Apple Silicon `aarch64` & Intel `x86_64`)  
> **Packaging:** Standalone Application Bundle (`.app`) & Apple Disk Image (`.dmg`)

---

## 1. Prerequisites & Environment Setup

Ensure the following prerequisites are installed on your macOS development workstation:

1. **Xcode Command Line Tools:**
   - Provides the Clang C/C++ compiler and Apple SDK header files.
   - Install via Terminal:
     ```bash
     xcode-select --install
     ```
   - Verify: `clang --version`.

2. **Node.js & npm:**
   - Node.js LTS (v18, v20, or v22).
   - Install via [Homebrew](https://brew.sh/) or your preferred version manager (e.g. `mise`, `nvm`):
     ```bash
     brew install node
     ```
   - Verify: `node -v` and `npm -v`.

3. **Rust Toolchain:**
   - Install via [rustup.rs](https://rustup.rs/):
     ```bash
     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
     ```
   - Standard toolchain defaults to `aarch64-apple-darwin` on Apple Silicon or `x86_64-apple-darwin` on Intel Macs.
   - (Optional) Add universal target support:
     ```bash
     rustup target add aarch64-apple-darwin x86_64-apple-darwin
     ```
   - Verify: `rustc --version` and `cargo --version`.

4. **Web Engine:**
   - RapidReady uses macOS's built-in **WebKit / WKWebView** engine. No additional web runtime installation is required.

---

## 2. Quick Start & Development Workflow

We provide a convenient 1-click launch script in the [`scripts/`](../scripts/) folder:

### Launching Development Mode
```bash
./scripts/dev.sh
```
*Behind the scenes:* This script validates your Node and Cargo environment, runs `npm install` if `node_modules/` is missing, starts the Vite development server on `http://localhost:1420`, and launches the native Tauri desktop window with Hot Module Replacement (HMR).

### WebKit Web Inspector (Developer Tools)
In development/debug builds, right-click anywhere in the app and select **Inspect Element** (or press `Option + Command + I`) to open the native WebKit Web Inspector for inspecting DOM elements, styles, console logs, and network traffic.

### Running Unit Tests
Execute the Rust core test suite (30 unit tests covering progressive RAW extraction, HEIC/HIF support, GPS metadata, atomic sidecars, and date resolvers):
```bash
cd src-tauri
cargo test -p rapidready-core
```

---

## 3. Building the Production macOS Release (.dmg)

To compile the optimized release binary and package the standalone macOS Disk Image (`.dmg`):

```bash
./scripts/build-dmg.sh
```

To preserve the current hexadecimal build number without incrementing (useful for testing release candidates or hotfixes):
```bash
./scripts/build-dmg.sh --no-bump
# or: NO_BUMP=1 ./scripts/build-dmg.sh
```

### Artifact Locations
Upon completion, the bundled release artifacts are placed at:
- **Disk Image (`.dmg`):**
  ```
  src-tauri/target/release/bundle/dmg/RapidReady_<version>_<arch>.dmg
  ```
- **Application Bundle (`.app`):**
  ```
  src-tauri/target/release/bundle/macos/RapidReady.app
  ```

### Custom DMG Background & Drag-to-Install Layout
RapidReady's DMG is styled with a custom dark-themed installation layout configured in [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) under `bundle.macOS.dmg`:
- **Window Geometry:** 660 × 400 pt.
- **Icon Placement:**
  - `RapidReady.app` icon at `(180, 220)`.
  - `/Applications` folder shortcut at `(480, 220)`.
- **Background Artwork:** Stored at `src-tauri/dmg-background.png`. To regenerate the artwork, use the included Swift utility script:
  ```bash
  swift scripts/generate_dmg_background.swift
  ```

---

## 4. Key macOS Considerations & Gotchas

1. **Gatekeeper & Quarantine (Unsigned Open-Source Builds):**
   - As an open-source project without a paid Apple Developer ID certificate or Apple notarization ticket, macOS Gatekeeper blocks opening on first launch with:  
     *"RapidReady can’t be opened because Apple cannot check it for malicious software."*
   - **Workarounds for contributors and testers:**
     - **Finder:** Right-click (or Control-click) `RapidReady.app` in `/Applications`, select **Open**, and click **Open** in the confirmation prompt.
     - **Terminal:** Strip the quarantine extended attribute:
       ```bash
       xattr -cr /Applications/RapidReady.app
       ```

2. **Removable Media & SD Card Mounting:**
   - macOS automatically mounts external volumes (SD cards, CFexpress cards, external SSDs) under `/Volumes/<VolumeName>/`.
   - RapidReady's scanner reads directly from POSIX paths. Polling via `check_path_exists` (1.2s interval) detects card ejects during import preview and provides instant recovery when re-inserted.

3. **High-DPI / Retina Display Scaling:**
   - Apple displays utilize 2× or 3× scaling (`devicePixelRatio`).
   - The custom `rr-image://` streaming protocol delivers full-resolution embedded JPEGs directly into the WebKit image cache. In Loupe mode (`Z`), 1:1 sensor-pixel mapping inspects critical sharpness without QuickLook downsampling.

4. **Native macOS Menu Bar & Keybindings:**
   - Standard macOS shortcuts are mapped natively:
     - `Command + ,` — Opens Settings.
     - `Command + Q` — Quits RapidReady.
     - `Command + W` — Closes the active window.
     - `Space` / `Z` — Direct photo culling and 1:1 Loupe inspection.
