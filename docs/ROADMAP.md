# RapidReady — Technical Roadmap & Backlog

> **Purpose:** Central architectural roadmap, milestone tracking, and detailed design specifications for RapidReady.

> [!IMPORTANT]
> **Documentation Synchronization Rule (Standing Policy):**  
> Whenever marking tasks as completed (`- [x]`), always verify and synchronize corresponding entries in [`app/README.md`](../README.md) (such as *Supported Formats & Media*, *Key Features*, or *Roadmap* notes) so public-facing documentation remains accurate and up to date!

---

## 🔄 Ongoing Engineering Policies
- [ ] **README Synchronization:** Verify and update `app/README.md` whenever shipping new features or checking off roadmap items.
- [ ] **Data Safety & Non-Destructive Ingest:** Source media and camera RAW files must NEVER be modified. All metadata, tags, ratings, and edits reside strictly in non-destructive sidecars.

---

## 🚀 Released Milestones

### Released in `v0.3.6-beta` (Build `0096`)
- [x] **GPS Metadata Display & 1-Click Map Navigation (`v0.3.6-beta` / Build `0089`):**
  - Native EXIF extraction of `GPSLatitude`, `GPSLongitude`, and `GPSAltitude` with direction and reference resolution in `metadata_resolver.rs`.
  - Non-destructive `.rrdata` sidecar override support (sidecar GPS takes precedence over camera EXIF).
  - Clean "Location / GPS" card in `LibraryInspector.tsx` with dual display (photographic DMS `48° 08' 14" N, 11° 34' 32" E` and decimal degrees `48.1372°, 11.5754°`).
  - 1-click external map opening via `@tauri-apps/plugin-opener`.
- [x] **Configurable GPS Map Provider (`v0.3.6-beta` / Build `008A`):**
  - Settings selection: Google Maps in browser, OpenStreetMap in browser, or internal viewer (placeholder).
- [x] **Full HEIC / HEIF / HIF Support (`v0.3.6-beta` / Build `008B`):**
  - Added `heic`, `heif`, `hif`, `webp`, `avif` to scanner, archive, and command whitelists.
  - Native fallback decoding and preview streaming via `get_max_preview_jpeg`.
  - Import companion pairing (`RAW + HIF` / `RAW + HEIC`) and dynamic format badges in Grid and Filmstrip.
  - Verified with real camera and iPhone samples (30/30 Rust unit tests passing).
- [x] **Import Step 2 – Source Disconnection Detection & Recovery (`v0.3.6-beta` / Build `008E`):**
  - Background polling (`check_path_exists`, 1.2s interval) detects unplugged SD cards or unmounted drives during pre-import preview.
  - Replaces preview tree with an intuitive warning card and `[ ← Back to Source Selection ]` button.
  - Automatic reconnection: Re-inserting the card restores the preview tree instantly without losing file selection state.
  - Synchronized navigation: Returning to step 1 while disconnected resets stale paths and scan states cleanly.
- [x] **Developer Housekeeping, Multi-Platform Tooling & Windows UNC Fixes (`v0.3.6-beta` / Build `0096`):**
  - Centralized all architecture and platform specifications inside the Git-tracked tree (`app/docs/ARCHITECTURE.md`, `app/docs/ROADMAP.md`, `app/docs/PLATFORM_WINDOWS.md`, `app/docs/PLATFORM_LINUX.md`).
  - Added standard `CONTRIBUTING.md` and Keep-a-Changelog compliant `CHANGELOG.md`.
  - Created 1-click developer launchers and production release packaging scripts in `app/scripts/` (`dev.bat`, `build-installer.bat`, `dev.sh`, `build-dmg.sh`) with comprehensive header documentation (Purpose, Explanation, Usage) and `--no-bump` support.
  - Resolved Windows UNC network paths for custom `rr-image://` protocol enabling seamless NAS media loading on Windows.

### Released in `v0.3.5-beta-RC1` (Build `0088`)
- [x] **Progressive NAS Streaming & Interactive Scan Controller (`v0.3.5-beta-RC1` / Build `0075`):**
  - Two-phase connection handling: 300 ms debounced `ArchiveConnectingOverlay` for slow network shares.
  - Floating `ArchiveScanBanner`: Live photo counters, accumulated megabytes, and current directory tracking.
  - True 0% CPU pause/resume via Rust `Condvar` and atomic `AtomicBool` cancellation flags.
  - Resumable scanning (`existing_paths` skip-check) without losing previously indexed photos.
- [x] **QA Audit Package A – Data Safety & Depth Integrity (`v0.3.5-beta-RC1` / Build `0081`):**
  - Atomic `.rrdata` sidecar writing via temporary files (`.{stem}.tmp.{thread_id}.{pid}`) and `fs::rename`.
  - Removed arbitrary `max_depth(4)` directory recursion limit.
  - Concurrency scan-guard with monotonic `scan_id` preventing folder-switching race conditions.
- [x] **QA Audit Package B – Large Archive Performance (`v0.3.5-beta-RC1` / Build `0083`):**
  - $O(1)$ `imageIndexMap` in Zustand store eliminating linear $O(N)$ path lookups for 50,000+ photo collections.
  - Throttled tree building (350 ms debouncing) and decoupling sidebar re-renders from culling actions.
- [x] **QA Audit Package C – Error Handling & Toast Notifications (`v0.3.5-beta-RC1` / Build `0085`):**
  - Sidecar file watcher error broadcasting for disconnected network shares.
  - Non-blocking batch culling error reporting with detailed per-file failure metrics.
  - Global, non-intrusive toast notification system (`ToastContainer.tsx`).
- [x] **Window Geometry & Sidebar Protection (`v0.3.5-beta-RC1` / Build `0088`):**
  - Enforced minimum grid width (`min-w-[400px]`) and window dimensions (1024×680) preventing panel collapse.
- [x] **Startup View Preference (`v0.3.5-beta-RC1` / Build `0078`):**
  - Configurable default view: Start in Library (default) or Import mode.

### Released in `v0.3.0-beta` (Build `0074`)
- [x] **Native RAW Full-Resolution Preview Extractor (`v0.3.0-beta`):**
  - Direct bitstream extraction of 20–60 MP embedded sensor JPEGs from CR2, CR3, ARW, NEF, and DNG in 12–19 ms.
  - Zero-cost EXIF orientation injection without lossy software re-encoding.
- [x] **1:1 Sensor-Pixel Loupe Zoom (`v0.3.0-beta`):**
  - Pixel-accurate 100% zoom in Loupe view bypassing OS scaling limits.
- [x] **Import Step 2 – Progressive Lightbox Inspection (`v0.3.0-beta`):**
  - Two-stage progressive loading (instant 512px preview followed by full-res crossfade).
  - Full-screen lightbox modal with 1:1 pixel peeping (`Z`), interactive minimap, keyboard navigation, and `Space` toggle.
- [x] **Import Destination Prominence (`v0.3.0-beta`):**
  - `DestinationInfoBar` displaying active destination path, volume space, and fast switching.

### Released in `v0.2.0-beta` & `v0.2.1-beta` (Build `0062`)
- [x] **Color Labels (`v0.2.0-beta`):** 5 standard colors with shortcuts `6` (Red), `7` (Yellow), `8` (Green), `9` (Blue).
- [x] **Tag Management & Autocomplete (`v0.2.0-beta`):** Live tag suggestions, frequency counting, and keyboard navigation.
- [x] **Modular Filter Bar (`v0.2.0-beta`):** Orthogonal dropdown filtering across ratings, colors, flags, and tags.
- [x] **EXIF-First Date Resolution (`v0.2.1-beta`):** `DateTimeOriginal` priority with multi-tier header streaming (256 KB / 2 MB slices).
- [x] **RAW Orientation Integrity (`v0.2.1-beta`):** Isolated RAW embedded previews preventing companion JPEG rotation corruption.

---

## 📌 Active Backlog & Future Milestones

### Milestone: Multi-RAW Developer & Universal Sidecar Architecture
- [ ] **Industry Standard Adobe XMP Sidecars (`.xmp`) & Multi-RAW Developer Integration:**
  - **Context & Goal:**  
    RapidReady currently operates with RapidRAW's proprietary JSON sidecars (`<file>.rrdata`). Professional photographers and studio workflows frequently use established RAW converters such as **Adobe Lightroom Classic / Camera Raw**, **Capture One**, **Darktable**, **RawTherapee / ART**, and **DxO PhotoLab**. RapidReady should serve as the universal, high-speed ingest and culling hub for all of them.
  - **Universal Standard: Adobe XMP (ISO 16684-1):**
    - File naming conventions:
      - `IMG_0001.CR2.xmp` (Lightroom standard for RAW files, preventing collisions with companion JPEGs).
      - `IMG_0001.xmp` (Standard for non-RAW files or Darktable/RawTherapee).
    - Standardized field mappings:
      - **Ratings:** `xmp:Rating="3"` (0 to 5 stars).
      - **Color Labels:** `xmp:Label="Red"` (*Red, Yellow, Green, Blue, Purple*).
      - **Picks & Rejects:** `photoshop:Urgency` / `xmp:Pick`.
      - **Tags & Keywords:** `<dc:subject><rdf:Bag><rdf:li>Tag</rdf:li></rdf:Bag></dc:subject>`.
      - **Geotags:** `exif:GPSLatitude`, `exif:GPSLongitude`, `exif:GPSAltitude`.
      - **Orientation:** `tiff:Orientation`.
  - **Supported Target Ecosystems:**
    1. **RapidRAW:** `.rrdata` (JSON sidecar adapter).
    2. **Adobe Lightroom Classic / Camera Raw / Bridge:** Direct `.xmp` sidecar synchronization.
    3. **Capture One:** Synchronous XMP rating, color label, and IPTC metadata ingestion.
    4. **Darktable:** Native XMP reading and writing.
    5. **RawTherapee / ART:** XMP sidecar reading with `.pp3` development files.
    6. **DxO PhotoLab:** XMP metadata reading with `.dop` optical modules.
  - **Architectural Implementation Roadmap:**
    1. *Rust `SidecarProvider` Trait (`rapidready-core::sidecar`):*
       - Abstract monolithic `culling.rs` into a pluggable trait:
         ```rust
         pub trait SidecarProvider: Send + Sync {
             fn read_metadata(&self, image_path: &Path) -> Result<Option<CullingState>, SidecarError>;
             fn write_metadata(&self, image_path: &Path, state: &CullingState) -> Result<(), SidecarError>;
         }
         ```
       - `RrDataSidecarProvider`: RapidRAW JSON implementation.
       - `XmpSidecarProvider`: High-performance streaming XML parser/writer for standard XMP.
    2. *Configurable Preferred RAW Developer & Dual-Write Mode:*
       - Settings option: *Preferred RAW Developer: RapidRAW | Adobe Lightroom Classic | Capture One | Darktable*.
       - **Dual-Write Synchronization:** Option to write both `.rrdata` AND `.xmp` simultaneously. Photographers can cull in RapidReady and open their archive in either RapidRAW OR Lightroom without losing ratings or labels!
    3. *Dynamic "Open in..." Shortcuts:*
       - Upgrade shortcut `R` to open the configured RAW converter or show a quick-launch menu.

---

### Milestone: High-Scale Cache Architecture (Large Archives & NAS Workflows)
- [ ] **Persistent Local Disk Cache for Previews & Thumbnails (Lightroom & Picasa Model):**
  - **The Reference: Why was Google Picasa "Arrow-Fast" on Network Drives?**
    - Photographers frequently cite Picasa as the gold standard for navigating massive multi-terabyte photo libraries on slow NAS storage: Initial indexing took time, but subsequent browsing was **100% instant at 60 FPS**, even when the NAS was asleep.
    - *How Picasa achieved this:*
      1. **No heavy RDBMS overhead:** Picasa used its custom `db3` flat-file column format (`.pmp` files) mapped directly into virtual memory via OS `mmap`. Metadata queries, sorting, and date filters were raw pointer operations in RAM (< 1 ms across 500,000 images).
      2. **Packed binary thumbnail container (`thumbindex.db`) instead of loose files:** Storing 100,000 individual image files on disk causes filesystem fragmentation, inode exhaustion, and severe random-read seek penalties on both APFS and NTFS. Picasa packed thumbnails linearly into large binary blobs (`thumbindex.db`); fetching a thumbnail was a single sequential byte-range read (`lseek` + `read`) with zero filesystem traversal.
      3. **Complete offline-first decoupling:** Once indexed, all grid scrolling, search, and preview browsing was served 100% from local NVMe storage. The remote NAS was never touched during normal browsing — original RAW files were only accessed when 1:1 sensor zoom or export was requested.
      4. **Fast MTime/Size Validation:** A background daemon validated only `(mtime, file_size)` tuples. Unmodified files were never touched again.
  - **Architecture for RapidReady:**
    1. *Strict separation from SQLite:* SQLite (`import_index.db`) remains dedicated to structured relational metadata; no binary image BLOBs inside SQLite.
    2. *Zero clutter on user storage:* Cache files are kept strictly on the local system NVMe (`~/Library/Caches/de.rapidready.app/` / `%LOCALAPPDATA%\RapidReady\Cache\`), never on customer NAS volumes.
    3. *Two-Tier Cache Strategy:*
       - **Tier 1 (Grid Micro-Thumbnails 256px / 512px):** Packed chunk files (e.g. 64 MB / 256 MB binary segments) or a memory-mapped key-value store (LMDB / Sled in Rust) avoiding inode overhead.
       - **Tier 2 (Full-Res Screen Previews 2048px):** High-quality WebP files on local NVMe for instant fullscreen loupe switching.
    4. *Instant Grid on Open:* Opening an indexed archive renders the grid immediately from local NVMe (< 20 ms), while network SMB scans run decoupled in the background to detect new or modified files.

- [ ] **Speculative RAM Viewport Caching:**
  - Prefetching neighboring thumbnails in RAM (`visible_index ± 20`) during idle pauses (> 150 ms).
  - Strict priority queuing and cancellation to prevent saturating the browser 6-socket connection limit.

---

### Milestone: Geodata & Map Integration
- [ ] **Manual Geotagging & Coordinate Editor in Sidecars (Option B):**
  - Allow photographers to assign or edit GPS coordinates for cameras lacking built-in GPS receivers.
  - Non-destructive persistence in `.rrdata` (and `.xmp`) sidecars under `"gps": { "latitude", "longitude", "altitude" }`.
  - Smart clipboard parsing: One-click paste of standard Google Maps coordinate strings (e.g. `"48.137154, 11.575421"`).
  - Batch assignment: Apply identical location coordinates to multiple selected images simultaneously.

- [ ] **Native In-App Map Viewer:**
  - Interactive map modal directly within RapidReady (via Leaflet / OpenStreetMap or MapLibre vector tiles) avoiding external browser round-trips.
  - Interactive pin placement for manual geotagging.
  - Optional offline tile caching for remote field work.

---

### Milestone: Media Compatibility & Video Pipeline
- [ ] **Complete Native Video Pipeline (Ingestion, Thumbnails, Playback):**
  - Ingestion and library recognition of modern camera video formats: `.mp4`, `.mov`, `.mts`, `.m2ts` (AVCHD), `.mkv`, `.webm`, `.crm` (Canon Cinema RAW), `.nev` (Nikon N-RAW).
  - Native MP4/QuickTime `moov.mvhd` atom parsing in `date_resolver.rs` for accurate recording timestamp and duration.
  - Grid & filmstrip poster thumbnails with video badge and formatted runtime (`[ ▶ 02:45 ]`).
  - Streaming custom protocol handler supporting HTTP 206 Partial Content (range requests) enabling instant scrubbing through 10–50 GB 4K/8K video files without full-file buffering.
  - Embedded video player in `LoupeViewer.tsx` with standard shortcuts (`Space` toggle, `J`/`K`/`L` scrubbing).

- [ ] **Extended Vintage & Exotic RAW Formats:**
  - Leica (`.rwl`), Hasselblad Studio (`.fff`), Phase One / Leaf / Mamiya (`.iiq`, `.mos`), Canon Legacy (`.crw`), Sony/Minolta (`.sr2`, `.srf`, `.mrw`), Olympus (`.ori`), Epson (`.erf`).
  - Next-gen raster formats: JPEG XL (`.jxl`), WebP (`.webp`), AVIF (`.avif`).

---

### Milestone: Import Step 2 Enhancements
- [ ] **Optional Grid View Mode for Pre-Import Culling:**
  - Toggle between hierarchical tree structure and tile grid view in `ImportPreviewStep`.
  - Virtualized rendering with fast-path `scale=0` IFD1 extraction.
  - Batch selection controls directly on tiles.

- [ ] **RAW Sensor Signal vs. In-Camera Processed Previews:**
  - Visual indicators distinguishing neutral RAW data from baked-in camera styles (contrast boost, monochrome picture styles) preventing accidental deselection during pre-import culling.

---

### Milestone: Library & Inspector UI Ergonomics
- [ ] **Collapsible Inspector Cards & Sections:**
  - **Context & Goal:**
    As the Inspector panel (`LibraryInspector.tsx`) grows with rich metadata and tooling (Culling, Rating & Colors, Tag suggestions, Technical EXIF, and GPS / Location), vertical space on laptop screens can become tight.
  - **Requirements & Behavior:**
    - The uppermost section displaying the active image preview and core file badges remains permanently visible as the primary visual reference.
    - All subsequent sections and cards (Culling / Flags / Ratings / Color Labels, Tag Management, Camera EXIF & Exposure Details, Location / GPS Map navigation) should be individually collapsible via an interactive chevron toggle button (`>` / `v`).
    - Clean header styling with smooth expand/collapse transition.
    - Section collapse states should be persisted (e.g. in local storage) so photographers can customize and retain their preferred Inspector layout across sessions.

---

### Milestone: Application Lifecycle, Updates & Distribution
- [ ] **GitHub Release Update Check (Startup & Manual Menu Action):**
  - **Context & Goal:**
    Notify users when a newer version of RapidReady is published on GitHub, ensuring photographers receive bugfixes, performance optimizations, and newly supported camera formats without manual checking.
  - **Requirements & Behavior:**
    - **Startup Check:** On application launch, trigger a lightweight, non-blocking background check against the GitHub Releases endpoint (`https://api.github.com/repos/on370/RapidReady/releases/latest`).
    - **Manual "Check for Updates..." Menu Action:**
      - Add a dedicated "Check for Updates..." item in the native application menu (under the macOS App Menu, and under Help / Tools on Windows/Linux).
      - Include a manual `[ Check for Updates Now ]` trigger button in `SettingsView.tsx`.
      - If up to date, show an immediate confirmation toast (e.g. *"You're using the latest version of RapidReady (v0.3.6-beta)"*).
    - Compare remote release tag with local SemVer from `build-info.json` / `package.json`.
    - If a newer version is available:
      - Display a clean dialog or notification banner indicating the new version number and brief release headline.
      - Provide a primary action button to open `https://github.com/on370/RapidReady/releases/latest` in the user's default browser via `@tauri-apps/plugin-opener`.
      - Include dismiss options: `[ Remind Me Later ]` and `[ Skip This Version ]` (stored in settings to avoid recurring prompts for a skipped version).
      - Add a toggle in Settings (`SettingsView.tsx`): *Automatically check for updates on startup* (enabled by default).



