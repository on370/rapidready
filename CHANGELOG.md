# Changelog

All notable changes to RapidReady will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.5] - 2026-10-07

Performance and stability release introducing speculative RAM viewport caching with live visual buffer bubbles, library-scoped virtual collections with RapidRAW parity and temporary location protection, comprehensive technical EXIF inspection in the Inspector, high-speed SSD scan throttling to eliminate event-loop starvation, and export compatibility for images with embedded HDR gain maps.

### Added
- **Speculative RAM Viewport Caching & Live Visual Buffer Indicators (`thumbnail.rs`, `LibraryGrid.tsx`, `LoupeViewer.tsx`):**
  - **Proactive Loupe Preloading:** Lookahead preloading of +1 to +5 images in the flip direction (and 1 image backwards buffer) directly in the Rust background thread (`spawn_blocking`). Prewarms Scale 2 (720px preview) and Full-Res Preview (scale 100) concurrently.
  - **Proactive Grid Preloading:** Lookahead preloading of +3 rows in scroll direction (and 1 row behind) during 150ms idle pauses.
  - **Live Buffer Count Badges:** Floating dark-glassmorphism count badges indicating cached thumbnails in RAM (`▲ top / ▼ bottom` in Grid view; `◀ left / ▶ right` in Loupe view).
  - **Zero-Latency Navigation Invalidation:** Atomic cancellation tokens (`WARMUP_TOKEN`) in Rust and frontend listeners immediately abort pending preloads when the user flips or scrolls, preserving 100% UI responsiveness.
- **Comprehensive Technical EXIF & Camera Metadata Hub (`metadata_resolver.rs`, `formatMetadata.ts`, `LibraryInspector.tsx`):**
  - Extended camera and exposure details card in the Inspector panel:
    - Clean shutter speed (e.g. `1/250s`, `2.5s`) and aperture (`f/2.8`) formatting with decimal rounding limits.
    - **Exposure Program:** Manual (M), Aperture Priority (Av/A), Shutter Priority (Tv/S), Program (P), Creative and Scene modes.
    - **Metering Mode:** Multi-segment / Evaluative Matrix, Center-Weighted Average, Spot, Partial.
    - **Flash State:** Fired vs. Did not fire, with fill flash and red-eye reduction detection.
    - **White Balance & Color Temperature:** Auto vs. Manual/Preset with Kelvin color temperature.
    - **35mm Equivalent Focal Length:** Sensor crop-factor conversion (`FocalLengthIn35mmFilm`).
    - **Subject / Focus Distance:** Distance to focal plane in meters.
    - **Color Space:** sRGB, Adobe RGB, Display P3, Uncalibrated.
    - **Exposure Compensation:** EV bias indicator (e.g. `+0.7 EV`).
    - **Camera & Lens Identity:** Unified camera make/model and optical lens specification display.
- **Library-Scoped Virtual Collections (Weg B) & Lifecycle Protection Dialog (`collections.rs`, `collectionsStore.ts`, `TempLocationCollectionsModal.tsx`):**
  - **Library-Scoped Sidebar Filtering:** Collections are now scoped to the active library root (`libraryRoot`), ensuring sidebar album lists strictly match the active library and eliminating empty collection views when switching between locations.
  - **RapidRAW Central Storage Interoperability:** Maintains full compatibility with RapidRAW's central `albums.json` via atomic Last-Write-Wins (LWW) synchronization.
  - **Temporary Location Protection Dialog:** Prompts users when navigating away from temporary locations containing curated collections, offering to save the folder as a permanent library location, discard temporary collections, or cancel the switch.

### Changed & Improved
- **High-Speed Archive Scan Throttling & Event-Loop Protection (`App.tsx`):**
  - Batched chunk ingestion during active directory scans: buffers incoming 100-file chunks and throttles store updates (max once every 200ms or 500 images) to eliminate JavaScript main-thread starvation and UI freezing on fast NVMe SSDs and APFS volumes.
  - Decoupled progress updates: the floating scan banner counter (`files_found` / transfer rate) updates continuously and smoothly while the grid updates in controlled batches.
  - Automatic flushing of remaining buffered images when scanning completes.
  - Restored 100% deterministic alphabetical path sorting in `LibraryCenter.tsx`.
- **UI Ergonomics & Splitter Handles (`App.css`, `LibraryView.tsx`):**
  - Expanded invisible hit-target grab zones for panel splitters and scroll handles, preventing cursor slipping and eliminating layout conflicts between scrollbars and resizers.
- **Collection Export GUI Polish (`ExportCollectionModal.tsx`):**
  - Refined layout and control alignment in the collection export dialog.

### Fixed
- **Collection Export HDR Gain Map Compatibility (`collection_export.rs`, `thumbnail.rs`):**
  - Resolved an export failure and image corruption issue for photos containing embedded HDR gain maps (Apple, Adobe, and Ultra HDR / ISO 21496-1 gain map metadata) in JPEG and RAW companion files.
- **Startup Modal Hierarchy & Z-Index Collision (`AboutModal.tsx`, `TourWelcomePrompt.tsx`):**
  - Prevented the About modal from blocking user interaction during startup, elevated modal z-index (`z-[9990]`), and guarded onboarding prompts against modal occlusion.
- **Scan Ingestion Cache Interference (`LibraryGrid.tsx`, `LoupeViewer.tsx`):**
  - Enforced strict state guards ensuring speculative thumbnail warmup is completely suspended while an archive scan is active (`scanning` or `connecting`).

## [0.4.0] - 2026-09-27

Major milestone release dropping the beta suffix! Introduces hardware-accelerated dual-view Focus Peaking powered by darktable's Difference-of-Gradients bandpass filter, Virtual Collections (Albums) with custom drag-and-drop sequencing and EXIF-injected export, automatic filesystem reconciliation for external editors (e.g., RapidRAW), instant background scan cancellation in the Rust core, format quick-selection pills in import preview, an interactive onboarding tour with an overhauled help system, and enhanced UI ergonomics.

### Added
- **Hardware-Accelerated Focus Peaking & Sharpness Inspection (`FocusPeakingOverlay.tsx`, `ZoomableImage.tsx`, `LibraryInspector.tsx`):**
  - **Dual-View Sharpness Inspection:** Instant Focus Peaking toggle (`F` key) available simultaneously in the 1:1 Loupe Viewer and the Inspector preview panel.
  - **darktable-Inspired Difference-of-Gradients Bandpass Filter:**
    - High-performance WebGL fragment shader implementation evaluating focus metrics across two spatial scales (close gradient at $\Delta = 1\text{px}$, far gradient at $\Delta = 2\text{px}$).
    - Distinguishes genuine optical micro-contrast from blurry macro-contrasts, reliably ignoring out-of-focus background bokeh, bright skylines, and high-contrast out-of-focus edges (e.g. tree branches against a bright sky).
    - Integrated $3\times3$ noise-floor threshold (`microRange < 0.012`) to eliminate false positives on high-ISO sensor grain.
  - **Customizable Signal Indicators:**
    - 4 vibrant peaking colors: Neon Green (`#00ff40`), Vivid Red (`#ff2a4b`), Electric Cyan (`#00e5ff`), and Bright Yellow (`#ffee00`).
    - 3 calibrated sensitivity presets: High (`0.020`), Normal (`0.040`), and Low (`0.070`).
    - Zero-latency GPU canvas synchronization during 120 FPS panning, zooming transitions, and minimap navigation.
- **Virtual Collections (Albums) & Custom Sequencing (`CollectionsTree.tsx`, `collectionsStore.ts`):**
  - **Hierarchical Virtual Collections:** Dedicated tree view in the left sidebar allowing flexible organization into albums and nested album folders without duplicating physical image assets on disk.
  - **Drag-and-Drop Manual Sequencing:** Intuitive re-ordering of photos within collections to establish custom narrative sequences independent of capture timestamp or filename.
  - **Import-Time Collection Assignment:** Ingested media can be assigned directly to an existing or newly created collection right inside the Import wizard.
- **Collection Export Engine with EXIF Injection (`ExportCollectionModal.tsx`, `export.rs`):**
  - Full-featured collection exporter supporting standard exports and sequential numerical renaming (e.g., `001_Project.jpg`, `002_Project.jpg`).
  - Automatic EXIF injection preserving capture dates, camera orientation, and culling metadata tags.
- **Native Background Import Scan Cancellation (`scanner.rs`, `commands.rs`):**
  - Dedicated `[ ✕ Cancel ]` button during storage scans with atomic cancellation tokens (`AtomicBool`) in the Rust backend.
  - Immediately aborts recursive directory traversal and releases hardware I/O handles without blocking the UI thread.
- **Format Filter Pills in Import Preview (`ImportPreviewStep.tsx`):**
  - Interactive format selection badges in Step 2 of the import wizard (`RAW`, `JPG`, `HEIC`, `Video`).
  - One-click filtering of mixed-media cards with real-time recalculation of selected image count and disk storage requirements.
- **Automatic Filesystem Reconciliation (`sync.rs`, `libraryStore.ts`):**
  - Proactive detection and background synchronization of folder and metadata modifications executed by external companion software (such as RapidRAW or external file managers).
- **"Entire Archive" Flat Overview (`LibraryLeftSidebar.tsx`):**
  - One-click toggle in the folder sidebar displaying all photos across all archive folders in a unified flat grid.
- **Interactive Onboarding Tour & Revamped Help System (`TourWelcomePrompt.tsx`, `HelpPopover.tsx`):**
  - Interactive visual walkthrough for new users explaining ingestion, culling flags, filmstrip controls, and inspector features.
  - Redesigned in-app help popover and shortcut cheatsheet reflecting all new keyboard bindings.

### Changed & Improved
- **Safety Separation for Collection Items:** Clear, differentiated action dialog when deleting images inside a collection: non-destructively *Remove from Collection* vs. permanently *Delete from Disk*.
- **Splitter Ergonomics:** Expanded invisible hover and grab zones (7px) for sidebar dividers, eliminating cursor slipping when resizing panels.
- **Grid Layout Stability:** Eliminated subpixel jitter and layout oscillation during dynamic sidebar resizing and window adjustment.

## [0.3.7-beta] - 2026-09-18

Major feature release introducing GEO Part 1 (universal geotagging & intelligent coordinate editor), folder management with native context menus and permanent deletion protection for network shares / NAS, native View menu navigation, live transfer rate throughput diagnostics, in-app update checks, and instant workspace cleanup scripts.

### Added
- **GEO Part 1 – Universal Geotagging & Intelligent GPS Editor (`LibraryInspector.tsx` & `geo.ts`):**
  - Robust multi-format client-side parser supporting direct paste of:
    - **Google Maps URLs** (standard search, place links, `@lat,lon,zoom`, `?q=`, `?ll=`).
    - **Apple Maps URLs** (`?ll=`, `?sll=`, `?q=`, `?coordinate=`).
    - **OpenStreetMap URLs** (`?mlat=...&mlon=...`, `#map=...`).
    - **Geo-URIs** (RFC 5870, with or without altitude).
    - **DMS (Degrees, Minutes, Seconds)** with photographic prime mark resilience (`′`, `″`, `’`, `”`, `´`, `\``, `''`), German `O` (Ost) and English `E`, decimal seconds with comma or dot, and prefix/suffix cardinal directions.
    - **DMM (Degrees, Decimal Minutes)** for marine and GPS handheld formats.
    - **Decimal Degrees (DD)** supporting dot notation, space separation, and European semicolon/comma notation (`48,137154; 11,575421`).
    - Real-time validity and range checks ($-90 \le \text{lat} \le +90$, $-180 \le \text{lon} \le +180$) with clear visual feedback.
  - Interactive Inspector Location Card:
    - Live parsing preview in green (`✓ 48° 08' 14" N, 11° 34' 32" E (48.137154°, 11.575421°)`).
    - Dedicated edit mode with pencil icon and `+ Add coordinates...`.
    - 1-click **"Remove GPS"** action: writes `"gps": null` to the `.rrdata` sidecar to non-destructively override and conceal camera EXIF coordinates (e.g. for privacy).
    - Batch application across all selected photos with visual indicator (*"Applies to X selected images"*).
    - Full keyboard workflow: `Enter` to save, `Escape` to cancel.
  - Rust Backend Persistence (`culling.rs`, `metadata_resolver.rs`, `commands.rs`):
    - Non-destructive atomic sidecar writing under `"gps": { "latitude": ..., "longitude": ..., "altitude": ... }` preserving all ratings, color labels, tags, and orientation.
    - Asynchronous batch IPC command `set_gps_batch` with per-file success metrics.
- **Destructive Operations Safety Hardening & Zero-Trust Backend (`commands.rs`, `LibraryLeftSidebar.tsx`, `LibraryCenter.tsx`):**
  - **Zero-Trust Backend Containment:** Implemented `is_strictly_inside_root` and `is_system_critical_path` in Rust backend. Deletions of folders or files must reside strictly inside the active archive root. Directory traversal (`..`), partial prefix matching, and deleting the archive root itself are rejected. System-critical paths (`/`, `/Users`, `/System`, `C:\`, `C:\Windows`, etc.) are protected by a hard blocklist.
  - **Backend Safety Override for Local Files:** Independent filesystem mount verification before any permanent deletion. If a deletion request specifies `to_trash: false` but targets local storage, a backend safety override forces `trash::delete()`. Permanent erasure is strictly restricted to verified network shares / NAS.
  - **Unified Safe-Focus Destructive Modal:** Replaced native OS dialogs (`ask()`) with custom `DestructiveConfirmModal` for all folder and file deletion operations (local and NAS). The **Cancel** button is auto-focused by default, preventing accidental Enter key confirmations.
  - **Robust Network Share / NAS Detection (`are_any_network_paths`):** Direct mount attribute inspection (AFP, SMB, NFS, CIFS on macOS/Linux; UNC and `DRIVE_REMOTE` on Windows) verifying both archive root and target paths to reliably trigger the permanent erasure warning alert.
  - **Scan-in-Progress Protection:** Folder deletions are blocked while an archive scan is running (`scanning`, `connecting`, `paused`) to prevent race conditions with background directory walkers.
  - **Partial Batch Failure Handling:** `delete_files` now returns a structured `DeleteFilesResult { deleted, failed }`, cleanly updating the library view for all deleted files while displaying toast warnings for any failed items without leaving ghost thumbnails.
- **Native Video Thumbnail Extraction & Format Badges (Media Pipeline Phase 1):**
  - Included video files (`.mp4`, `.mov`, `.m4v`, `.avi`) in archive scanning and library indexing.
  - Hardware-accelerated native keyframe extraction via OS video frameworks (QuickLook / `AVAssetImageGenerator` on macOS, Windows Shell / Media Foundation on Windows).
  - Clean format badges (`[MOV]`, `[MP4]`) in Grid, Filmstrip, and Inspector with video container metadata metrics.
- **Folder Management & Tree Context Menu (`LibraryLeftSidebar.tsx` & `FolderContextMenu.tsx`):**
  - Native-feeling right-click context menu on folder tree nodes in the library sidebar:
    - **"Im Finder anzeigen"** (macOS) / **"Im Explorer anzeigen"** (Windows).
    - **"Alle Unterordner aufklappen"** / **"Alle Unterordner einklappen"**.
    - **"Alle Bilder in diesem Ordner auswählen"**.
    - **"Nur verworfene Bilder (X) in diesem Ordner löschen..."** (quick culling purge).
    - **"Neuer Unterordner..."** (`mkdir`).
    - **"Ordner umbenennen..."** (renames folder and atomically updates index path mappings).
    - **"Ordner löschen..."** with protected archive root and destructive confirmation.
  - **Network Share / NAS Permanent Deletion Warning:**
    - Detects whether files reside on local storage (with OS Trash support) or on a network share / NAS (SMB, NFS, UNC).
    - Prominently displays an unmistakable red warning alert informing that NAS deletions cannot be moved to the Trash and will be permanently erased.
  - **Dynamic Folder Selection Indicator Bubbling:**
    - When collapsing any parent directory, the active photo indicator and camera badge smoothly bubble up to the nearest visible ancestor folder.
- **Multi-Selection Ergonomics (OS Parity for Cmd/Ctrl+Click):**
  - Achieved parity with macOS Finder and Windows File Explorer: `Cmd+Click` / `Ctrl+Click` on an already selected photo toggles it off cleanly without resetting the rest of the selection set.
  - Stable anchor tracking for subsequent `Shift+Click` range selections.
- **Live Transfer Rate Throughput Tooltip (`throughput.ts`):**
  - Real-time rolling-window calculation ($\Delta \text{bytes} / \Delta t$) during archive scanning and import transfer.
  - Hover tooltip over MB/GB badges displaying live transfer speed (`MB/s` / `GB/s`), network rate (`Mb/s` / `Gb/s`), peak session throughput, and ETA.
- **In-App Update Check & Native Menu Integration (`updateService.ts` & `UpdateNotificationModal.tsx`):**
  - Background startup check against GitHub Releases API with Content Security Policy network allowance.
  - Native menu item **"Check for Updates..."** in the macOS Application Menu (Apfelmenü) and Help Menu.
  - Two-tier settings switch: automatic checks and pre-release/beta notifications.
  - Strict SemVer comparison treating `x.y.z-beta-RCn` builds correctly as pre-releases of `x.y.z-beta` and `x.y.z`.
  - Clean notification modal with release notes link and 1-click download.
- **Native View Menu Navigation & Global Shortcuts:**
  - Added native "View" menu items:
    - `Import` (`Cmd+1` / `Ctrl+1`)
    - `Library` (`Cmd+2` / `Ctrl+2`)
    - `Settings` (`Cmd+,` / `Ctrl+,`)
    - `Toggle Fullscreen`
  - Global keyboard shortcuts and documentation in Help Modal (`HelpModal.tsx`).
- **Workspace Cleanup Scripts (`clean.sh` & `clean.bat`):**
  - Standalone scripts to instantly reclaim 15–25+ GB of Cargo debug build caches (`src-tauri/target/debug/deps`) in seconds with zero toolchain dependencies.
  - `npm run clean` shortcut in `package.json`.
  - Optional `--deep` / `--all` to clean `node_modules`.

### Changed & Improved
- **Toolchain Auto-Detection:**
  - `build-dmg.sh`, `dev.sh`, and `set-version.sh` automatically detect and load active `mise` environments for Node and Rust.
- **CSP Configuration (`tauri.conf.json`):**
  - Added `connect-src 'self' https://api.github.com;` to enable reliable in-app update checks without WebKit CSP blocking.

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
  - Centralized in-repository technical documentation: [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/PLATFORM_MACOS.md`](docs/PLATFORM_MACOS.md), [`docs/PLATFORM_WINDOWS.md`](docs/PLATFORM_WINDOWS.md), and [`docs/PLATFORM_LINUX.md`](docs/PLATFORM_LINUX.md).
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
