# Changelog

All notable changes to RapidReady will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
