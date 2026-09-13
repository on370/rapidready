# Changelog

All notable changes to RapidReady will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.6-beta] - 2026-09-13

Feature and platform release introducing configurable GPS Map Provider selection, full modern raster format support (HEIC / HEIF / HIF), disconnected source media detection with automatic recovery in import preview, Windows UNC network share fixes for NAS archives, and complete open-source developer tooling.

### Added
- **Configurable GPS Map Provider (`SettingsView.tsx` & `LibraryInspector.tsx`):**
  - Instant photographic location viewing with 1-click external map opening via `@tauri-apps/plugin-opener`.
  - Configurable map provider in Settings: Google Maps in browser, OpenStreetMap in browser, or internal viewer placeholder.
  - Native EXIF parsing for `GPSLatitude`, `GPSLongitude`, and `GPSAltitude` with direction and reference resolution (`N/S`, `E/W`, `Above/Below Sea Level`).
  - Dual coordinate presentation: Photographic Degrees-Minutes-Seconds (DMS) and decimal degrees.
  - Non-destructive `.rrdata` sidecar override support (sidecar GPS coordinates take precedence over camera EXIF).
- **HEIC / HEIF / HIF & Modern Raster Formats:**
  - Full ingestion support for `.heic`, `.heif`, `.hif` (Sony & Canon 10-bit HDR), `.webp`, and `.avif` across scanner, archive indexer, commands, and fallback preview pipelines.
  - Automatic RAW+HIF / RAW+HEIC companion pairing in pre-import scan view.
  - Dynamic badges in Grid and Filmstrip reflecting active raster formats (`RAW+HIF`, `HEIC`, `HIF`, etc.).
  - Verified against mirrorless camera and smartphone test fixtures (30 unit tests passing).
- **Import Step 2 – Source Disconnection Detection & Recovery:**
  - Real-time background polling (`check_path_exists`, 1.2s interval) detects disconnected or unmounted SD cards and external drives.
  - Replaces preview tree with an informative disconnected warning card and direct `[ ← Back to Source Selection ]` return button.
  - Automatic reconnection: Re-inserting the card restores the preview tree seamlessly without losing selection state.
  - Synchronized navigation: Returning to step 1 while disconnected immediately resets stale paths and scan states cleanly.
- **Developer Documentation & Cross-Platform Tooling:**
  - Centralized in-repository technical documentation: [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/PLATFORM_WINDOWS.md`](docs/PLATFORM_WINDOWS.md), and [`docs/PLATFORM_LINUX.md`](docs/PLATFORM_LINUX.md).
  - Added standardized [`CONTRIBUTING.md`](CONTRIBUTING.md) guide and Keep-a-Changelog compliant release tracking.
  - 1-click cross-platform developer launchers and packaging scripts in `scripts/` (`dev.bat`, `build-installer.bat`, `dev.sh`, `build-dmg.sh`) with detailed header documentation (Purpose, Explanation, and Usage) and `--no-bump` support.

### Fixed & Improved
- **Windows UNC Network Share Streaming (`lib.rs`):**
  - Resolved `rr-image://` custom protocol handling on Windows for UNC paths (e.g. `\\server\share\photos\...`).
  - Strips redundant leading slashes inserted by browser HTTP requests to ensure reliable thumbnail and preview extraction from NAS shares on Windows.
- **Windows NSIS Build Packaging (`build-installer.bat`):**
  - Automatically resolves Tauri's local NSIS compiler path (`%LOCALAPPDATA%\tauri\NSIS\Bin`) and system installations.
- **Build Number Control (`bump-build.js`):**
  - Added `--no-bump` CLI argument and `NO_BUMP=1` environment variable support to produce repeatable release and debug builds without incrementing the hexadecimal build number.

## [0.3.5-beta-RC1] - 2026-09-12

Major stabilization release featuring two-phase progressive NAS streaming with pause/resume controls, atomic sidecar persistence, large archive performance optimizations, and comprehensive QA audit fixes.

### Added
- **Two-Phase Progressive NAS Streaming:**
  - 300 ms debounced `ArchiveConnectingOverlay` for slow network shares and waking NAS drives.
  - Floating `ArchiveScanBanner` with live photo counter, accumulated MB, and active folder path.
  - True 0% CPU pause/resume via Rust `Condvar` and atomic `AtomicBool` cancellation flags.
  - Resumable scanning with fast-skip for previously indexed paths.
- **Data Integrity & Atomic Sidecars:**
  - Atomic writing of `.rrdata` sidecars using temporary files and atomic rename (`std::fs::rename`).
  - Removed arbitrary `max_depth(4)` directory traversal limit for deeply nested structures.
  - Concurrency scan-guard with monotonic `scan_id` preventing folder-switching race conditions.
- **Large Archive Scalability:**
  - $O(1)$ `imageIndexMap` in Zustand store eliminating linear path search bottlenecks for 50,000+ photo collections.
  - Throttled tree building (350 ms debouncing) and decoupling sidebar re-renders from culling actions.
- **Error Handling & Notifications:**
  - Network share disconnect detection in sidecar file watcher.
  - Non-blocking batch culling error reporting with detailed per-file failure metrics.
  - Global, non-intrusive toast notification system (`ToastContainer.tsx`).
- **Startup Preference & Window Geometry:**
  - Configurable startup view (Library by default, Import optional).
  - Enforced minimum grid width (`min-w-[400px]`) and window dimensions (1024×680) preventing panel collapse.

## [0.3.0-beta] - 2026-09-11

Major release introducing a native RAW full-resolution preview extractor, 1:1 sensor-pixel loupe zooming, a progressive import preview with full-screen lightbox inspection, multi-tier thumbnails, and minimal-scroll grid stability.

### Added
- **Native RAW Full-Resolution Extractor (`rapidready-core`):**
  - Direct bitstream extraction of high-resolution embedded JPEGs directly from RAW containers (Sony ARW, Canon CR2/CR3, Ricoh DNG, Nikon NEF, etc.) delivering pristine 20–60 MP sensor resolution in 12–19 ms.
  - Zero-cost EXIF orientation tag injection directly into the JPEG stream (0.001 ms) avoiding lossy re-encoding and preserving full sensor fidelity for rotated RAWs and JPEGs.
- **Pin-Sharp 1:1 Sensor-Pixel Loupe Zoom:**
  - True 1:1 sensor-pixel mapping in Loupe mode for critical focus and sharpness inspection, eliminating macOS QuickLook downscaling limits.
- **Multi-Tier Thumbnail Pipeline:**
  - `scale=0` (160×120 fast-path) exclusively for ultra-dense grids (15×14 tiles).
  - `scale=1` (256px) and `scale=2` (512px) for crisp rendering on high-DPI and Retina displays in grid, filmstrip, and inspectors.
- **Import Step 2 – Progressive Preview & Full-Screen Lightbox:**
  - Fast-path 512px preview rendering immediately in the file inspector, followed by automatic background arrival of full sensor resolution.
  - Full-screen lightbox modal for pre-import inspection with 1:1 pixel peeping (`Z`), smooth drag panning, interactive minimap, keyboard navigation (`←` / `→`), and direct culling (`Space`).
- **Import Destination Prominence:**
  - Added `DestinationInfoBar` in Step 2 displaying the active destination folder, free disk space warnings, and quick destination switching.

### Fixed & Improved
- **Grid Scroll Stability & Minimal-Scroll Algorithm:**
  - Preserved persistent DOM scroll state when switching between Loupe and Grid views.
  - Implemented an intelligent minimal-scroll algorithm keeping the selected photo visible with zero displacement if already in view, or scrolling by the minimum necessary rows upon navigation or container resize.
- **Ricoh GR DNG Thumbnail Quality:**
  - Implemented native embedded preview extraction (720×480 in < 0.2 ms) for DNG files lacking IFD1 thumbnails, eliminating blurred 16×16 generic macOS file icons.

## [0.2.1-beta] - 2026-09-09

Bugfix release ensuring strict EXIF capture date priority during import and eliminating thumbnail orientation inversions for RAW files.

### Changed & Fixed
- **EXIF-First Date Resolution & Tiered Streaming:**
  - Prioritized camera EXIF metadata (`DateTimeOriginal`, `DateTimeDigitized`) as the primary authority for capture dates during scanning and import.
  - Implemented multi-tiered header streaming for TIFF/RAW files (256 KB fast slice, 2 MB extended slice, full container fallback), eliminating 100% full-file buffering from slow SD cards and speeding up card scans by up to 500x.
  - Fixed an issue where files without dates in their filename (e.g. `004.ARW`) were erroneously assigned the filesystem copy timestamp and imported into today's folder.
  - Maintained filename date parsing as a secondary fallback for EXIF-less media (scans, screenshots).
- **RAW Thumbnail Isolation & Orientation Integrity:**
  - Eliminated companion JPEG redirection in thumbnail and preview generation; RAW files (`.ARW`, `.CR2`, etc.) are now strictly rendered from their own pristine embedded camera previews.
  - Fixed portrait RAW photos displaying upside-down (180° inverted) or in landscape when accompanied by third-party rotated or edited JPEGs (e.g. via Windows Photo Viewer).
  - Ensured RAW file EXIF orientation is authoritative and cannot be superseded by companion files.

## [0.2.0-beta] - 2026-09-08

Major feature release introducing Color Labels, Tag Management with live Autocomplete, modular Filter Bar dropdowns, enhanced Culling Toolbar ergonomics, and complete sidecar tag persistence.

### Added
- **Color Labels (Farblabels):**
  - 5 industry-standard color labels (Red, Yellow, Green, Blue, Purple) for enhanced visual sorting.
  - Dedicated numeric keyboard shortcuts: `6` (Red), `7` (Yellow), `8` (Green), `9` (Blue).
  - Dynamic multi-color palette popup in Culling Toolbar and permanent color picker in Inspector.
  - Color badge indicators rendered on thumbnails in both Grid and Filmstrip views.
  - Color label selection integrated into thumbnail right-click Context Menu.
- **Tag Management & Autocomplete:**
  - Keyword/tag management in Inspector with non-destructive `.rrdata` sidecar persistence.
  - Interactive suggestions dropdown with live filtering, folder usage frequency counts, and full keyboard navigation (`↓`, `↑`, `Enter`, `Esc`).
- **Consolidated Filter Bar:**
  - Modular dropdown menus for Ratings (`≥1★`–`≥5★`), Colors, and Tags with image frequency counters and active checkmarks.
  - Selected filters displayed as active accent pills with instant one-click reset (`✕`).
  - Completely orthogonal filtering: combine flags (Picks/Rejects), ratings, colors, and tags seamlessly.
- **Right-Aligned Share / Export Popover:**
  - Replaced bulky action buttons with a clean, right-aligned "Teilen" (Share) popover menu with responsive label collapse (`[ 📤 Teilen ▾ ]` on wide screens, compact icon `[ 📤 ]` on narrow widths).
  - Direct actions to edit in RapidRAW (`R`) or reveal in macOS Finder / Windows Explorer (`Cmd+Shift+F` / `Ctrl+Shift+F`).
- **Help & Shortcut Synchronization:**
  - Updated global help modal (`Cmd+/` / `F1`) and contextual info popovers with color labels, arrow navigation (`←` / `→`), `J` / `K` keys, and platform-specific Finder/Explorer actions.

### Changed & Fixed
- **Culling Toolbar Ergonomics:** Relocated the Delete Rejected button (`[ 🗑 (count) ]`) immediately adjacent to the `P / U / X` decision controls with live count indicator, preventing misclicks via confirmation modal.
- **Sidecar Tag Persistence & Deletion:** Fixed `.rrdata` sidecar writer in `rapidready-core` to ensure deleted tags are properly removed from sidecars on disk.
- **Non-Destructive EXIF & Orientation:** Preserved custom orientation and existing EXIF/adjustments across sidecar updates.

## [0.1.1-beta] - 2026-09-06

Windows port stabilization, thumbnail performance optimizations, and QA audit fixes.

### Added
- **Windows Installer:** Standalone NSIS installer package for Windows x64 (`currentUser`).
- **HTTP Cache Headers:** Added `Cache-Control: public, max-age=86400, immutable` to custom protocol image responses for instant reverse-scrolling from browser memory.
- **Graceful Window Launch:** Window is created initially hidden (`visible: false`) and smoothly revealed once the React UI is fully rendered, eliminating startup black screen.

### Changed & Fixed
- **Thumbnail Memory & Stability:** Reverted full-resolution image serving in thumbnail views; thumbnails are strictly downscaled 256x256 JPEGs via `thumb-rs` with in-memory LRU caching, preventing GPU and RAM exhaustion.
- **Orphan Request Cancellation:** In-flight thumbnail HTTP requests are aborted on unmount when scrolling past rows, preventing queue saturation and eliminating reverse-scrolling lag.
- **Scale Cascade Optimization (PERF-1):** Reduced trial scale cascade on Windows from `[10, 8, 4, 2]` to `[4, 2]`.
- **Cross-Platform Protocols (CLEAN-1):** Corrected fallback URL format to distinguish between Windows and macOS.
- **Path Normalization (CLEAN-2 & CLEAN-3):** Centralized duplicate `norm()` logic into `normalizePath` and guarded path-template slash normalization behind `#[cfg(target_os = "windows")]`.
- **Folder Tree & Virtual Collections:** Fixed Windows backslash path matching for the directory tree and "Letzter Import" collection.

## [0.1.0-beta] - 2026-09-05

Initial public beta release of RapidReady (MVP).

### Added
- **High-Performance RAW Engine:** Instant extraction of high-resolution embedded preview JPEGs from proprietary camera RAW formats (Canon CR2/CR3, Sony ARW, Nikon NEF, Adobe DNG, Olympus ORF, Fujifilm RAF, Panasonic RW2) without slow demosaicing.
- **SD Card & Media Auto-Detection:** Automatically detects connected SD cards and camera media with live hot-plug and unplug detection.
- **Smart Import & Organization:**
  - Customizable directory naming structures (by capture date, custom token templates, project name, or flat).
  - Saved Archive Locations with bookmarking, relinking, and in-place folder creation.
  - Import Profiles with instant creation (`Save as new...`), editing, and switching.
  - Duplicate detection based on SHA-256 and EXIF capture date to prevent re-importing already imported photos.
  - RAW + JPEG pairing detection with statistics.
- **Zero-Lag Library Viewer & Culling:**
  - Split-view folder browser with recursive directory scanning.
  - High-performance virtualized thumbnail grid.
  - Loupe view with fluid zoom, pan, and synchronized filmstrip.
  - One-touch culling flags (`Pick`, `Reject`, `Unflag`) with instant non-destructive sidecar file writing (`.rapidraw.json`).
- **RapidRaw Integration:** Direct launch of culled photos into [RapidRaw](https://www.getrapidraw.com/).
- **macOS Installer:** Guided `.dmg` disk image with custom background and drag-to-install `/Applications` link.
- **Bilingual Support:** Full English and German interfaces with automatic system language detection and manual override in Settings.
