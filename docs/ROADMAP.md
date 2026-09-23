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

### Released in `v0.3.7-beta` (Build `00A1`)
- [x] **GEO Part 1: Universal Geotagging & Intelligent GPS Coordinate Editor (`v0.3.7-beta` / Build `009C`):**
  - Universal client-side parser supporting Google Maps, Apple Maps, OpenStreetMap URLs, Geo-URIs (RFC 5870), DMS (Unicode prime resilience, German O / English E, decimal seconds), DMM, and Decimal Degrees (DD).
  - Interactive Inspector location card with live green preview, pencil edit mode, "Remove GPS" action (`"gps": null`), and batch assignment across multiple selected photos.
  - Non-destructive persistence in `.rrdata` sidecars under `"gps": { "latitude": ..., "longitude": ..., "altitude": ... }`.
- [x] **Folder Tree Context Menu & Recursive Folder Operations (`v0.3.7-beta`):**
  - Native-feeling right-click context menu on folder tree nodes: "Reveal in Finder" / "Show in Explorer", "Expand All" / "Collapse All", "Select All in Folder", "Purge Rejects (X)", "New Subfolder...", "Rename...", and "Delete...".
- [x] **NAS & Network Share Permanent Deletion Warning (`v0.3.7-beta`):**
  - Automatic filesystem mount detection: displays an unmistakable red warning prompt alerting that files on network shares / NAS cannot be moved to OS Trash and are permanently deleted.
- [x] **Dynamic Folder Tree Active Selection Bubbling (`v0.3.7-beta`):**
  - Collapsing any parent directory dynamically bubbles the active photo indicator and camera badge up to the nearest visible ancestor node.
- [x] **Multi-Selection Ergonomics (`v0.3.7-beta`):**
  - Finder / Windows Explorer parity for `Cmd+Click` / `Ctrl+Click` (toggle deselect individual items without resetting selection set) and stable anchor tracking for `Shift+Click`.
- [x] **Live Throughput & Transfer Rate Tooltip (`v0.3.7-beta`):**
  - Rolling-window throughput calculation ($\Delta \text{bytes} / \Delta t$) during archive scanning and import transfer with hover tooltip showing live speed (`MB/s` / `GB/s`), network rate (`Mb/s` / `Gb/s`), peak throughput, and ETA.
- [x] **In-App Update Checking & Native Menu Integration (`v0.3.7-beta`):**
  - Background startup check against GitHub Releases API with CSP network enablement, native menu action "Check for Updates..." in macOS App Menu and Help Menu, and SemVer RC compatibility.
- [x] **View Menu Navigation & Global Shortcuts (`v0.3.7-beta`):**
  - Native "View" menu entries for `Import` (`Cmd+1`), `Library` (`Cmd+2`), `Settings` (`Cmd+,`), and `Toggle Fullscreen` with global keyboard shortcuts and Help Modal documentation.
- [x] **Workspace Cleanup Tooling (`v0.3.7-beta`):**
  - Instant cleanup scripts (`clean.sh`, `clean.bat`, `npm run clean`) reclaiming 15–25+ GB of Cargo debug build caches in seconds.

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
  - Centralized all architecture and platform specifications inside the Git-tracked tree (`app/docs/ARCHITECTURE.md`, `app/docs/ROADMAP.md`, `app/docs/PLATFORM_MACOS.md`, `app/docs/PLATFORM_WINDOWS.md`, `app/docs/PLATFORM_LINUX.md`).
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

### Milestone: Professional Culling Precision & Smart Ingest Ergonomics
- [ ] **Focus Peaking & Sharpness Inspection (Grid & Loupe View):**
  - **Context & Goal:** Fast culling requires instantly evaluating whether focus hit the subject's eyes or focal point without continuously zooming in to 100%.
  - **Color Overlay & Zebra Patterns:** Highlight in-focus high-frequency contrast edges with configurable signal colors (e.g. Red, Blue, Green) or zebra hatching.
  - **Dual-View Availability:** Real-time edge detection overlay in Loupe view (Fit & 1:1) and optional sharpness indicators / badges in Grid view thumbnails.
  - **High-Performance Implementation:** Hardware-accelerated WebGL / Canvas shader (< 2 ms overhead) or native Rust edge filter with adjustable threshold levels (Fine / Normal / Coarse).

- [ ] **Import Step 2 – Format Filter Quick Selection (Batch Toggle RAWs / JPGs):**
  - **Context & Goal:** When shooting dual-slot or single-slot RAW + JPG, photographers frequently want to ingest only one format (e.g. only RAWs to save disk space and offload time, or only JPGs for fast client delivery).
  - **Batch Format Toggles:** Dedicated 1-click action buttons / format pills in the Step 2 source preview toolbar (`[ Select only RAWs ]`, `[ Deselect all JPGs ]`, `[ Videos ]`).
  - **Dynamic Volume Feedback:** Instantly recalculates transfer file count, total bytes, and destination disk headroom without requiring manual folder-by-folder unchecking.

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

### Milestone: Virtual Collections & Native RapidRAW Album Synchronization
- [ ] **Non-Destructive Virtual Collections & Automated RapidRAW Album Bridge:**
  - **Context & Goal:**  
    Photographers frequently organize projects, curated selections, or cross-shoot compilations (*"Best of 2026"*, *"Portfolio"*, *"Client Delivery"*) into virtual collections without copying, moving, or duplicating files on disk. As RapidReady serves as the dedicated high-speed companion for RapidRAW, collections in RapidReady must be 100% interoperable with RapidRAW albums without requiring manual import/export steps or fragile duplicate databases.
  - **Data Model Parity with RapidRAW (`AlbumItem` Schema):**
    - Adopt RapidRAW's recursive tree model in `rapidready-core`:
      ```rust
      #[derive(Serialize, Deserialize, Debug, Clone)]
      #[serde(tag = "type", rename_all = "camelCase")]
      pub enum AlbumItem {
          Album {
              id: String,
              name: String,
              icon: Option<String>,
              images: Vec<String>, // Canonical absolute file paths (or virtual copy paths)
          },
          Group {
              id: String,
              name: String,
              icon: Option<String>,
              children: Vec<AlbumItem>, // Arbitrary recursive nesting of album groups
          },
      }
      ```
    - Support custom collection icons (e.g. `plane`, `mountain`, `sun`, `camera`, `map`, `heart`, `star`, `users`, `car`, `briefcase`).
    - Dynamic image counters on album badges (with recursive rollup counters for groups).
  - **Storage Architecture: Independent Primary Storage with Zero-Config RapidRAW Synchronization:**
    - *Cross-Platform Standard AppData Paths:*
      - RapidReady relies on native OS standards via Tauri's `app_data_dir()` resolving to:
        - **macOS:** `~/Library/Application Support/io.github.on370.rapidready/albums/albums.json`
        - **Windows:** `%APPDATA%\io.github.on370.rapidready\albums\albums.json`
        - **Linux (XDG):** `~/.local/share/io.github.on370.rapidready/albums/albums.json` (or `$XDG_DATA_HOME`)
      - RapidRAW's corresponding standard paths:
        - **macOS:** `~/Library/Application Support/io.github.CyberTimon.RapidRAW/albums/albums.json`
        - **Windows:** `%APPDATA%\io.github.CyberTimon.RapidRAW\albums\albums.json`
        - **Linux (XDG):** `~/.local/share/io.github.CyberTimon.RapidRAW/albums/albums.json`
    - *Master File in RapidReady AppData (Data Safety Guard):*
      - Storing collections directly inside RapidRAW's application support directory is an unacceptable data-loss risk (an uninstallation, reset, or cleanup of RapidRAW would wipe RapidReady's collections).
      - RapidReady maintains its own primary master database file in its native AppData directory.
    - *Zero-Configuration Automatic Synchronization (No Manual Settings Switches):*
      - RapidReady automatically checks whether RapidRAW's album directory exists at the platform standard location.
      - **Startup & Window Focus Check (Last-Write-Wins based on `mtime`):**
        - If only RapidRAW's file exists (e.g. initial launch on a workstation with existing RapidRAW albums): Automatically import into RapidReady's master file.
        - If both files exist: Compare file modification timestamps (`mtime`). If RapidRAW's file is newer, RapidReady updates its internal tree from RapidRAW and mirrors it into RapidReady's master file. If RapidReady is newer or identical, RapidReady preserves its own state.
        - If RapidRAW is missing or uninstalled: RapidReady works completely independently from its own master file. Zero data loss.
      - **Save & Mutation Synchronization:**
        - Every modification in RapidReady (creating/deleting albums, reordering, adding/removing images) writes atomically to RapidReady's master file (`write to .tmp -> rename`).
        - If the RapidRAW album directory is detected, the identical JSON tree is mirrored simultaneously to RapidRAW's `albums.json`.
      - **Rolling Safety Backups (`.bak`):**
        - Automatic backup generation (`albums.json.bak`) prior to any sync overwrite, safeguarding against corruption.
  - **UI & Ergonomics Integration:**
    - Dedicated collapsible "Collections" section in `LibraryLeftSidebar.tsx` alongside the folder tree.
    - **Custom Ordering (Drag & Drop Reordering):**
      - In Collection view, default sorting is set to *Custom Order* (`images: Vec<String>` array order).
      - Thumbnails can be freely dragged and dropped within the grid to establish the ideal narrative sequence.
      - Helper shortcuts: *"Sort initially by EXIF capture time"* with subsequent manual fine-tuning.
    - Drag & drop support: Dragging selected thumbnails onto collection nodes in the sidebar adds images without duplicates.
    - Context menu actions on thumbnails: *"Add to Collection..."* with nested group menus.
    - Non-destructive image removal: *"Remove from Collection"* removes the path pointer from the album without touching files on disk.

- [ ] **Sequential Photobook & Web Export with Custom Sizing & Linear EXIF Timestamp Synthesis:**
  - **Context & Goal:**
    Casual users and event photographers frequently experience broken sorting when uploading photos from multiple unsynchronized smartphones/cameras to photobook printers (CEWE, Saal Digital, Blurb), WordPress galleries, or USB drives for TV slideshows. Because cloud exports (Google/Apple Photos) dump files with arbitrary filenames or unsynced timestamps, external systems that sort alphabetically or chronologically destroy the curated narrative order. RapidReady solves this by exporting collections as clean, sequentially numbered files with optional image resizing and linear EXIF timestamp synthesis.
  - **Export Workflow & Configuration Dialog:**
    - Triggered via Collection context menu (*"Export Collection..."*) or toolbar button in Collection view.
    - **Target Directory Picker:** Select destination folder (e.g. Desktop, USB drive, dedicated photobook folder).
    - **Real File Copies (Strict Policy):**
      - Always generates genuine, independent file copies into the destination folder (no symlinks or hardlinks) to ensure universal compatibility when uploading or sharing to external devices.
    - **Configurable Naming Scheme & Sequential Numbering:**
      - Prefix customizable (e.g. `Hochzeit_2026_`, `Portfolio_`).
      - Zero-padded counter: `0001` (4 digits) or `001` (3 digits).
      - Format templates:
        - `Hochzeit_0001.jpg`, `Hochzeit_0002.jpg` (clean sequential numbering for photobooks).
        - `001_IMG_4821.jpg` (prefix numbering preserving original camera filename).
    - **Image Sizing & Export Presets (Picasa-Style Flexibility):**
      - **Full Resolution / Original Quality:** Bit-for-bit lossless copy of the original JPEG/media without re-encoding.
      - **4K Ultra HD (3840px Long Edge):** Optimal for high-res TV slideshows and large-format digital displays.
      - **Web Standard / Full HD (2048px Long Edge):** Ideal for WordPress blogs, websites, and cloud sharing.
      - **Email / Compact (1024px Long Edge):** Lightweight files for fast messaging and email attachments.
      - **Custom Dimension & Quality:** User-defined max width/height and JPEG compression quality (70%–100%).
    - **Synthetic Linear EXIF Timestamp Option ("The Secret Sauce"):**
      - Optional checkbox: *☑ „Synthesize linear EXIF timestamps (+10s per photo)“*.
      - For platforms (such as certain web CMS plugins, Apple Shared Albums, or cloud viewers) that strictly sort by EXIF `DateTimeOriginal` rather than filename, RapidReady writes an incrementing timestamp ($t_{\text{base}} + i \times 10\,\text{seconds}$) into the copied files.
      - Guarantees the narrative order remains 100% unbreakable across **both** filename-sorted and EXIF-date-sorted 3rd-party systems.

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
    5. *Hierarchical Cache Inheritance across Nested Library Locations:*
       - **Architectural Question & Challenge:** Photographers often register multiple Library Locations in RapidReady that overlap hierarchically (e.g. `/Volumes/Photos` as a master location, alongside `/Volumes/Photos/2024` or `/Volumes/Photos/2024/09_Iceland` as focused quick-access locations).
       - If Location A is a sub-directory of Location B (or B is a parent of A), an index or thumbnail DB already exists partially or completely.
       - **Design Requirement:**
         - Key entries in the persistent cache must be based on normalized canonical absolute paths (or a volume UUID + relative path scheme) rather than scope-relative offsets.
         - Opening a sub-location (`/Volumes/Photos/2024`) immediately inherits 100% of the cache entries already generated when `/Volumes/Photos` was scanned.
         - Conversely, scanning a parent location discovers and reuses already-indexed sub-locations without re-extracting thumbnails or re-reading EXIF data.
         - Avoid separate redundant DB instances per registered location; maintain a unified, path-indexed cache store per local workstation.

- [ ] **Speculative RAM Viewport Caching:**
  - Prefetching neighboring thumbnails in RAM (`visible_index ± 20`) during idle pauses (> 150 ms).
  - Strict priority queuing and cancellation to prevent saturating the browser 6-socket connection limit.

---

- [x] **GEO Part 1: Universal Geotagging & Intelligent GPS Coordinate Editor (`v0.3.7-beta` / Build `009C`):**
  - **Context & Goal:**
    Photographers frequently shoot with mirrorless or medium format cameras without built-in GPS (e.g. Fuji X-T5, Leica M, Hasselblad, older DSLRs), or require manual location corrections. Pasting coordinates from disparate sources (Google Maps URLs, Apple Maps, OpenStreetMap, German comma notation, degrees-minutes-seconds) is traditionally painful and error-prone.
  - **Universal Input Parser (Pure Client-Side Engine):**
    - **Google Maps & Web URLs:** Direct paste of web URLs (`https://www.google.com/maps?q=48.137154,11.575421`, `https://www.google.com/maps/@48.137154,11.575421,17z`, `https://maps.apple.com/?ll=...`, `https://www.openstreetmap.org/?mlat=...`, `geo:48.137154,11.575421`).
    - **Decimal Degrees (DD):** Standard dot notation (`48.137154, 11.575421`), space-separated (`48.137154 11.575421`), and European comma notation (`48,137154; 11,575421`).
    - **Degrees, Minutes, Seconds (DMS):** Photographic standard (`48° 08' 13.8" N, 11° 34' 31.5" E`) with unicode apostrophe resilience (`' / ’ / ′`, `" / ” / ″`).
    - **Degrees, Decimal Minutes (DMM / NMEA):** Marine & GPS handheld format (`48° 08.230' N, 11° 34.525' E`).
    - **Cardinal Direction Prefix/Suffix:** `N/S/E/W` handling with proper sign conversion (South/West = negative).
  - **Inspector UI & Feedback:**
    - Dedicated edit button (`Pencil` / *„Add coordinates...“*) in `LibraryInspector.tsx`.
    - Live parsing preview showing normalized DMS and decimal degrees in green checkmark state (`✓ 48° 08' 14" N, 11° 34' 32" E (48.137154°, 11.575421°)`).
    - Validation error guidance when unparseable or out of bounds ($-90 \le \text{lat} \le +90$, $-180 \le \text{lon} \le +180$).
  - **Non-Destructive Persistence:**
    - Written to `.rrdata` sidecar under `"gps": { "latitude": lat, "longitude": lon }` (already given priority override in Rust `metadata_resolver.rs`).
    - Batch application: Apply to all selected photos in the grid.

- [ ] **GEO Part 2: Native In-App Map Viewer & Geographic Photo Explorer:**
  - **Context & Vision:**
    A full-fledged, embedded interactive map viewer (e.g. via MapLibre Vector Tiles or Leaflet with OpenStreetMap / vector tiles) instead of relying solely on external browser round-trips to Google or OpenStreetMap.
  - **Two-Way Dual Functionality:**
    1. **Interactive Location Assignment (Geotagging):**
       - Assign or adjust coordinates by clicking directly on the map for the active photo or multiple selected photos.
       - Available either as an embedded mini-map inside the Inspector panel or within the full map view.
    2. **Geographic Exploration & Photo Selection (Apple Photos / Lightroom Maps Paradigm):**
       - Visualize all geotagged photos across the map using location pins/markers ("inverted teardrops with circle cutout") displaying the photo count.
       - **Dynamic Zoom-Dependent Clustering:**
         - *Zoomed Out (Country / Continent level):* Geographically adjacent locations aggregate into regional cluster badges displaying the aggregate photo count.
         - *Zoomed In (City / Street level):* Large clusters smoothly de-aggregate into smaller sub-clusters and finally individual photo pins.
       - **Direct Selection into the Grid:**
         - Clicking any cluster badge or individual pin immediately filters and selects the corresponding photos within the main photo grid.
  - **UI Architecture (No Modal Overlay):**
    - Because the map interacts directly with the photo grid in real time (map selection filters photos in the grid), the map viewer **must not be a modal pop-up / dialog** that conceals the workspace.
    - *Candidate Layout Concepts (to be finalized during design phase):*
      - Dedicated primary view mode alongside Grid and Loupe: `[ Grid ] [ Loupe ] [ Map ]`, retaining a synchronized filmstrip or split grid within the map view.
      - Split workspace layout (e.g. top half map, bottom half photo grid).
      - Dockable bottom/side panel or an interactive, expandable Inspector map card.
  - **Offline Capability:**
    - Optional local tile caching for field work, travel, and remote assignments without active internet connectivity.

---

### Milestone: Media Compatibility & Video Pipeline
- [x] **Phase 1: Native High-Performance Video Thumbnail Extraction & UI Media Badge (Low-Hanging Fruit):**
  - **Context & Goal:**
    RapidReady already indexes and imports video files (`.mp4`, `.mov`, `.m4v`, `.avi`) from camera memory cards. However, in the Library view, video files were omitted from the archive scanner, and when opened, lacked visual distinction and lightweight video thumbnail caching. Phase 1 provides instant visual recognition and snappy, native OS thumbnail generation without bundling multi-hundred-megabyte FFmpeg binaries.
  - **Technical Architecture & Capabilities:**
    - **Scanner & Whitelist Alignment:** Synchronize `archive.rs` supported extensions with `scanner.rs` to include `mp4`, `mov`, `m4v`, `avi`.
    - **Native OS Hardware Decoding:**
      - macOS: Leverage native QuickLook / `AVAssetImageGenerator` via OS video frameworks to grab representative poster frames without loading entire video streams.
      - Windows: Delegate to Windows Shell Thumbnail Cache / Media Foundation (`IShellItemImageFactory`).
      - Avoid black opening frames: QuickLook and OS thumbnail engines automatically seek to optimal keyframes (~0.5s–1.0s into the stream).
    - **Safe Protocol Streaming (`rr-image://`):**
      - Direct full-res requests for video files to `get_max_preview_jpeg` (serving a crisp 1080p/4K poster JPEG) rather than attempting raw multi-gigabyte file reads into RAM.
    - **UI Badging & Visual Hierarchy:**
      - Distinctive video badge (e.g. `▶ MP4` / `▶ MOV`) with video-specific styling on Grid and Filmstrip thumbnail tiles.
      - Play icon indicator on thumbnail tiles in Grid and Filmstrip.
      - Inspector and Loupe view compatibility displaying poster frame and file metrics cleanly.

- [ ] **Phase 2: Video Container Metadata & Duration Extraction:**
  - Fast native header parsing (MP4/QuickTime `moov.mvhd` atom, AVI header) in `date_resolver.rs` and `metadata_resolver.rs`.
  - Extract precise creation timestamps, video duration (formatted as `MM:SS` or `HH:MM:SS`), resolution, codec, and framerate without external dependencies.
  - Display runtime badge overlay on Grid and Filmstrip tiles (`[ ▶ 02:45 ]`).

- [ ] **Phase 3: Video Streaming Protocol (HTTP 206 Partial Content) & In-App Playback:**
  - Upgrade custom Tauri streaming protocol handler (`rr-video://` or `rr-image://`) with HTTP 206 Partial Content and byte-range request support (`Range: bytes=start-end`).
  - Enables zero-lag instant scrubbing across 10–50 GB 4K/8K camera video files (Sony XAVC S, Canon Cinema RAW Lite, Apple ProRes) without memory exhaustion.
  - Embedded HTML5 `<video>` player in `LoupeViewer.tsx` with standard shortcuts (`Space` toggle playback, `J`/`K`/`L` reverse/pause/forward scrubbing, `Left`/`Right` frame stepping).


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
- [ ] **Switchable Masonry Grid Layout (Alternative to Fixed-Ratio Grid):**
  - **Context & Goal:**
    Currently, the Library Grid (`LibraryGrid.tsx`) displays photos in a uniform square tile matrix. While this provides a structured, predictable layout for rapid culling, photographers shooting mixed landscape (3:2, 16:9), portrait (2:3, 4:5), and panorama compositions experience heavy letterboxing/pillarboxing or cropped thumbnail previews. A switchable **Masonry Grid** (dynamically flowing columns or justified aspect-ratio rows, similar to Apple Photos, Lightroom Web, or Unsplash) displays every photo in its natural proportions with zero wasted space.
  - **Requirements & Technical Architecture:**
    - **Interactive Toggle Control:**
      - View mode toggle in the library toolbar / footer controls (e.g. icon switcher next to the thumbnail size slider: `Uniform Square Grid` vs. `Masonry Flow Grid`).
      - Keyboard shortcut (e.g. `Shift+G`) to quickly toggle between uniform and masonry layouts without taking hands off the keyboard.
      - State persisted in `libraryUIStore` / `localStorage` (`gridMode: 'uniform' | 'masonry'`) to restore user preference across application restarts.
    - **High-Performance Virtualized Layout:**
      - Maintain smooth 60 FPS scrolling across large archives (10,000–50,000+ photos) using column-based virtualization or justified row bin-packing.
      - Calculate item dimensions dynamically from cached EXIF/metadata dimensions (`width` / `height` and orientation) without loading full image bitmaps into memory.
    - **Culling & Selection Parity:**
      - 100% feature parity in Masonry mode: range selection (`Shift+Click`), individual toggling (`Cmd/Ctrl+Click`), rating/color/flag badges, drag selection, and context menus.

- [x] **Collapsible Inspector Cards & Sections:**
  - **Context & Goal:**
    As the Inspector panel (`LibraryInspector.tsx`) grows with rich metadata and tooling (Culling, Rating & Colors, Tag suggestions, Technical EXIF, and GPS / Location), vertical space on laptop screens can become tight.
  - **Requirements & Behavior:**
    - The uppermost section displaying the active image preview and core file badges remains permanently visible as the primary visual reference.
    - All subsequent sections and cards (Culling / Flags / Ratings / Color Labels, Tag Management, Camera EXIF & Exposure Details, Location / GPS Map navigation) should be individually collapsible via an interactive chevron toggle button (`>` / `v`).
    - Clean header styling with smooth expand/collapse transition.
    - Section collapse states should be persisted (e.g. in local storage) so photographers can customize and retain their preferred Inspector layout across sessions.

- [x] **Live Throughput & Transfer Rate Tooltip in Status Bar (MB/s & Gb/s):**
  - **Context & Goal:**
    When indexing large archives (`ArchiveScanBanner.tsx`) or transferring photos during import (`ImportExecuteStep.tsx`), RapidReady displays accumulated data volume in MB/GB (e.g. `(450.2 MB)`). Photographers frequently want to inspect their actual real-time transfer throughput to diagnose hardware bottlenecks (e.g. identifying whether an SD card reader is limited by USB 2.0 vs. UHS-II bus speeds, or verifying 1 GbE vs. 10 GbE NAS network saturation).
  - **Requirements & Behavior:**
    - Compute a rolling-window average ($\Delta \text{bytes} / \Delta t$ over a 1.0–1.5s interval) to smooth out bursty filesystem buffer flushes and network spikes.
    - Display an informative tooltip when hovering over the MB badge in the status bar/banner:
      - **Live Transfer Speed:** Human-readable photographic rate (`MB/s` or `GB/s`) alongside network rate (`Mb/s` or `Gb/s`), e.g.:  
        `⚡ Transfer Rate: 84.5 MB/s (676 Mb/s)`
      - **Session Metrics:** Include peak throughput and estimated time to completion (ETA) when total workload is known.
    - Consistent styling matching RapidReady's dark glassmorphism theme (`#18181b/95` backdrop with subtle border and mono typography).

- [x] **Dynamic Folder Tree Active Selection Indicator Bubbling on Collapse:**
  - **Context & Goal:**
    In Library view (`LibraryLeftSidebar.tsx`), when an active photo is selected in the grid, its containing folder is highlighted in the folder tree (orange accent border and camera icon). When any parent folder above it is collapsed with `>` / `v`, the selection indicator currently disappears from view, leaving the photographer without context as to where the active file is located.
  - **Requirements & Behavior:**
    - When a subtree containing the active image is collapsed, the selection indicator and camera badge must dynamically "bubble up" to the nearest visible ancestor node in the tree hierarchy.
    - As soon as the user expands the parent directory again, the indicator smoothly migrates back down to the exact subfolder.

- [x] **Native Multi-Selection Ergonomics (Finder & Windows Explorer Parity for Cmd/Ctrl+Click):**
  - **Context & Goal:**
    When a photographer selects all photos in a folder (`Cmd+A` / `Ctrl+A`) and subsequently attempts to deselect individual photos using `Cmd+Click` (macOS) or `Ctrl+Click` (Windows), the current selection behavior can become erratic or unresponsive.
  - **Requirements & Behavior:**
    - Achieve 100% behavioral parity with macOS Finder and Windows File Explorer.
    - `Cmd+Click` / `Ctrl+Click` on an already selected item must reliably toggle it off (remove from `selectedPaths`) without resetting the rest of the selection set.
    - The active photo (`activeImageIndex`) must handle deselection gracefully (e.g. keeping visual focus or transferring active status to the next remaining selected item).
    - Maintain stable anchor tracking for subsequent `Shift+Click` range extensions.

---

### Milestone: Data Safety & File Operations
- [x] **Unmistakable Permanent Deletion Warning for Network & NAS Storage:**
  - **Context & Goal:**
    When deleting rejected images (`X`) from network shares (SMB/NFS on macOS, UNC paths on Windows), the operating system does NOT have a Recycle Bin / Trash. Unlike local internal drives where files move to the OS Trash and can be recovered, deletions on a NAS are **immediate and permanent**. The current dialog states files will be moved to the Trash, which is dangerously misleading on network storage.
  - **Requirements & Behavior:**
    - Detect whether target files / archive root reside on a remote network share or NAS (UNC path on Windows, non-local mount `statfs` on macOS).
    - If on local storage with Trash support: Display the standard "Move {{count}} images to Trash" prompt.
    - If on a network share / NAS: Display an explicit, unmistakable **Permanent Deletion Warning** with a prominent warning triangle (`!`), clearly informing the photographer:
      *"ATTENTION: The selected files are located on a network share / NAS. They CANNOT be moved to the Trash and will be PERMANENTLY and IRREVOCABLY deleted from disk!"*
    - Action buttons: Red *"Permanently Delete"* confirmation button vs. *"Cancel"*.

- [x] **Folder Tree Context Menu & Recursive Folder Deletion / Management:**
  - **Context & Goal:**
    Currently, RapidReady only allows deleting individual image files. When a photographer reorganizes shoots, eliminates discarded subfolders, or manages whole subtrees in `LibraryLeftSidebar.tsx`, there is no way to perform folder-level operations directly within the app. Adding a native-feeling context menu on folder tree nodes bridges this workflow gap, matching expectations set by Adobe Lightroom, Photo Mechanic, and OS file managers.
  - **Requirements & Behavior:**
    - **Context Menu Trigger:** Right-click on any folder tree node in `LibraryLeftSidebar.tsx` opens a custom dark-glass context menu.
    - **Menu Actions:**
      - *Navigation & View:*
        - **"Im Finder anzeigen"** (macOS) / **"Im Explorer anzeigen"** (Windows) via existing `show_in_finder` Tauri command.
        - **"Alle Unterordner aufklappen"** (`Expand All`) / **"Alle Unterordner einklappen"** (`Collapse All`).
        - **"Alle Bilder in diesem Ordner auswählen"**: Selects all images belonging to this subtree in the grid/filmstrip.
      - *Culling Shortcut:*
        - **"Nur verworfene Bilder (X) in diesem Ordner löschen..."**: Scans this specific folder subtree for images flagged as `-1` (Reject) and prompts for their deletion, leaving picks/unrated photos intact.
      - *Filesystem Operations:*
        - **"Neuer Unterordner..."**: Creates a new subdirectory (`mkdir`) within the targeted folder.
        - **"Ordner umbenennen..."**: Renames the folder and atomically updates all internal path mappings in `images` and `imageIndexMap`.
        - **"Ordner löschen..."** *(Destructive Action, highlighted in red)*:
          - Protected Root: The archive root folder cannot be deleted (option disabled or hidden).
          - Confirmation Dialog: Clearly lists the folder name, path, known image count, and explains that **all contents and subdirectories** will be deleted.
          - OS Trash vs. NAS Deletion:
            - On local storage: Moves entire folder to Trash (`trash::delete`).
            - On Network/NAS: Prompts with explicit **red warning triangle** alerting that files on network shares are permanently and irrevocably wiped without Trash support (`fs::remove_dir_all`).
          - State Cleanup: Removes all images under the deleted path from `libraryStore`, cleans `selectedPaths`, and gracefully steps `activeFolderPath` up to the parent directory.

- [ ] **Harmonized Two-Stage Folder Tree Deletion & Guarded Settings Switches:**
  - **Context & Goal:**
    Currently, right-clicking on a folder tree node allows triggering recursive folder deletion directly from the context menu (subject to confirmation). In contrast, image deletion in RapidReady enforces a disciplined, two-stage methodology: images are first flagged for rejection (`X`), and only deleted in a second explicit step via the toolbar trash bin. Deleting entire folder hierarchies directly from a context menu poses high operational risk (especially on network/NAS shares without a Recycle Bin). This item harmonizes folder tree deletion with image deletion by introducing the same two-stage mark-and-delete paradigm, guarded by configurable settings switches.
  - **The Two-Stage Folder Deletion Paradigm:**
    - *Stage 1 (Mark / Stage for Deletion):* Right-clicking a folder presents an action to mark/stage the folder (and its contained photos) as rejected / scheduled for deletion (e.g., visual strikethrough or red danger badge on the tree node).
    - *Stage 2 (Commit Deletion):* The existing trash bin button in the toolbar commits the deletion of both rejected photos and folders staged for deletion in one unified, transactional workflow.
  - **Settings Configuration (`SettingsView.tsx`):**
    - Add two new toggles in Settings under *Data Safety* / *File Operations*:
      1. **Switch 1 (Master Guard):** *"Enable Folder Deletion in Context Menu"* (Controls whether any delete/mark-for-deletion action appears in the folder tree right-click context menu).
         - *Default:* **OFF** (`false`).
      2. **Switch 2 (Direct Mode Sub-Toggle):** *"Allow Direct Folder Deletion (Bypass Two-Stage Mark & Delete)"* (Only active when Switch 1 is enabled. When enabled, allows immediate direct deletion prompts from the context menu; when disabled, enforces the safe two-stage mark-then-delete workflow).
         - *Default:* **OFF** (`false`).
  - **Benefits & Safety Guarantees:**
    - Establishes a consistent, uniform deletion methodology across both image assets and filesystem directories.
    - Prevents accidental, catastrophic removal of multi-gigabyte folder trees by requiring conscious user opt-in in application settings.

---

### Milestone: Application Lifecycle, Updates & Distribution
- [x] **GitHub Release Update Check (Startup & Manual Menu Action):**
  - **Context & Goal:**
    Notify users when a newer version of RapidReady is published on GitHub, ensuring photographers receive bugfixes, performance optimizations, and newly supported camera formats without manual checking.
  - **Requirements & Behavior:**
    - **Startup Check:** On application launch, trigger a lightweight, non-blocking background check against the GitHub Releases endpoint (`https://api.github.com/repos/on370/RapidReady/releases`).
    - **Manual "Check for Updates..." Menu Action:**
      - Add a dedicated "Check for Updates..." item in the native application menu (under the macOS App Menu, and under Help / Tools on Windows/Linux).
      - Include a manual `[ Check for Updates Now ]` trigger button in `SettingsView.tsx`.
      - If up to date, show an immediate confirmation toast (e.g. *"You're using the latest version of RapidReady (v0.3.6-beta)"*).
    - **Two-Tier Configuration Switches in Settings (`SettingsView.tsx`):**
      - **Master Switch 1:** *"Automatically check for updates on startup"* (enabled by default).
      - **Dependent Switch 2:** *"Notify about pre-release / beta versions (when currently running a beta build)"*:
        - *Stable Build Rule:* If the user is running a non-beta release (e.g. `v1.0.0`), RapidReady **never** notifies about beta versions. Switch 2 is hidden or permanently disabled.
        - *Beta Build Rule:* If the user is running a beta version (e.g. `0.3.x-beta`), Switch 2 is active. When checked, newer beta releases trigger update prompts; when unchecked, notifications are suppressed until a newer official stable release is published.
        - *Dependency Link:* When Master Switch 1 is toggled off, Switch 2 is automatically turned off and grayed out (`disabled`).
    - Compare remote release tag with local SemVer from `build-info.json` / `package.json`.
    - If a newer version is available:
      - Display a clean dialog or notification banner indicating the new version number and brief release headline.
      - Provide a primary action button to open `https://github.com/on370/RapidReady/releases/latest` in the user's default browser via `@tauri-apps/plugin-opener`.
      - Include dismiss options: `[ Remind Me Later ]` and `[ Skip This Version ]` (stored in settings to avoid recurring prompts for a skipped version).

---

### Milestone: Onboarding & Guided First-Time User Experience (FTUX)
- [ ] **Interactive Guided Onboarding Tour with Dynamic Spotlight Callouts ("Wandernde Erklär-Blasen"):**
  - **Context & Goal:**
    First-time users, photographers migrating from legacy photo managers, or users unfamiliar with modern multi-panel layouts (such as the compact left icon sidebar or non-destructive culling sidecars) benefit from an interactive, lightweight guided tour that introduces the core GUI touchpoints in under 60 seconds without overwhelming them.
  - **Best-Practice Lifecycle & Triggering Architecture:**
    1. *First-Launch Detection:*
       - Track `hasCompletedOnboarding: boolean` (or `onboardingState: 'unseen' | 'completed' | 'dismissed'`) in `settingsStore` (persisted to `localStorage` / settings).
       - When the app is launched for the very first time, after the 2.5s splashscreen fades out, present a friendly, non-intrusive welcome prompt:
         - *"Welcome to RapidReady! Would you like a quick 1-minute guided tour of the key features?"*
         - Primary action: `[ Start Guided Tour ]` | Secondary action: `[ Skip / Maybe Later ]`.
    2. *Dismissal & Cancellation Handling (Best Practice):*
       - The tour can be dismissed at any step via an `[ × ]` close button or `[ Skip Tour ]`.
       - **Standing Rule:** Never nag users on subsequent application restarts if they explicitly cancelled! Once cancelled or finished, `hasCompletedOnboarding` is set to `true`.
       - When skipped, show a subtle confirmation toast:
         - *"Tour skipped. You can restart the tour anytime via Help → 'Start Guided Tour...'."*
    3. *Manual Replay Anytime:*
       - Add a permanent entry in the native **Help Menu**:
         - *"Start Guided Tour..."* (`CmdOrCtrl+Shift+T` or under Help).
       - Provide a quick button in **Settings View** under *About* or *General*:
         - *"Replay Guided Tour"*.
       - Triggering the replay resets the tour to Step 1, navigates to the initial view, and launches the spotlight overlay immediately.
  - **Visual Design & Overlay Architecture:**
    1. *Spotlight & Dimmed Backdrop Cutout:*
       - Semi-transparent backdrop (`rgba(0, 0, 0, 0.65)` with CSS backdrop-blur) dims irrelevant workspace areas.
       - Dynamic SVG/CSS mask cutout highlighting the target UI element with a subtle, pulsating accent glow border (`ring-2 ring-accent/60 animate-pulse`).
    2. *Floating Anchored Callout / Popover:*
       - Dynamically positioned relative to the target element (`top`, `bottom`, `left`, `right` with automatic viewport flip/shift prevention).
       - Directional pointer arrow pointing directly toward the highlighted control.
    3. *Step Navigation & Header Controls:*
       - Title and concise explanation localized via `i18n` (`locales/{de,en}/onboarding.json`).
       - Step indicator & progress dots: e.g. `Step 2 of 6` (`••○•••`).
       - Navigation buttons:
         - `[ ← Previous ]` (disabled on Step 1).
         - `[ Next → ]` (transitions smoothly to the next spotlight target; transforms to `[ Get Started! ]` on the final step).
         - `[ Skip ]` / `[ × ]` to exit early.
       - Keyboard support: `Enter` / `ArrowRight` (Next), `ArrowLeft` (Previous), `Escape` (Exit).
  - **Curated Tour Stops (Key Touchpoints of the RapidReady GUI):**
    1. **Stop 1: Navigation Sidebar (`Sidebar.tsx`):**
       - Target: Left icon sidebar.
       - Highlight: Direct switching between *Import*, *Library / Archive*, and *Settings*, plus quick access to Help & About.
    2. **Stop 2: Archive Locations & Folder Tree (`LibraryLeftSidebar.tsx`):**
       - Target: Folder tree panel.
       - Highlight: Fast browsing across SSDs, memory cards, and NAS network shares. Right-click context menu for Finder/Explorer Reveal and folder management.
    3. **Stop 3: Rapid Culling & Filter Bar (`LibraryCenter.tsx` / `FilterBar`):**
       - Target: Top filter bar.
       - Highlight: Instant zero-lag filtering by Ratings (1–5), Picks (`P`), Rejects (`X`), and Color Labels (`6`–`9`).
    4. **Stop 4: Instant 1:1 Sensor Zoom & Viewport (`LoupeViewer.tsx`):**
       - Target: Grid/Loupe switcher or central viewer.
       - Highlight: Toggle Grid (`G`) and Loupe (`E`). Press `Z` for instant 1:1 pixel peeping directly from embedded sensor JPEGs without conversion lag.
    5. **Stop 5: Non-Destructive Inspector & Geotagging (`LibraryInspector.tsx`):**
       - Target: Right sidebar (Inspector).
       - Highlight: Technical EXIF, non-destructive ratings in `.rrdata` sidecars, and universal GPS editor with 1-click map opening.
    6. **Stop 6: RapidRAW Bridge & Help (`Sidebar.tsx` / Help):**
       - Target: Help icon / status bar.
       - Highlight: One-key handover to RapidRAW (`R`) for RAW processing, and full shortcut reference via `Cmd+/` or `F1`.
  - **Multi-View State Awareness:**
    - The tour controller intelligently switches `activeView` if a tour stop targets an element in another view (e.g. automatically navigating from Import to Library when introducing the Folder Tree or Inspector).

---

### Milestone: Local Intelligent AI Ingest, Semantic Search & Facial Recognition
- [ ] **On-Device Private AI Engine for Semantic Discovery, Smart Tagging & People Clustering:**
  - **Context & Goal:**
    Managing and retrieving photos across multi-terabyte collections (weddings, client events, sports, family archives, wildlife) traditionally requires tedious manual keyword tagging. RapidReady will introduce a privacy-first, 100% on-device AI engine that automatically extracts semantic visual features and clusters human faces, providing Google Photos- and Apple Photos-grade search capabilities without transmitting any data over the network.
  - **The Two Functional Pillars:**
    1. **Pillar A: Facial Detection, Recognition & People Clustering (Apple Photos Paradigm):**
       - *Face Detection & Landmarks:* Ultra-fast, lightweight detector (e.g. SCRFD or YuNet, ~2–3 MB ONNX model) locating face bounding boxes and facial landmarks.
       - *Face Embeddings:* Normalized feature representation (e.g. MobileFaceNet or ArcFace) generating a compact 128- or 512-dimensional vector per face.
       - *Automated Rust Clustering (DBSCAN / HNSW):* High-speed vector grouping in `rapidready-core` linking similar faces across thousands of images into identity clusters (*"Person with 98% similarity on 215 photos"*).
       - *People UI:* Dedicated *People View / Tab* displaying circular avatar bubbles sorted by frequency. Supports one-click naming (*"Anna"*), merging duplicate identity bubbles, hiding unnamed strangers, and combined filtering (`Person: Anna AND Ben`).
    2. **Pillar B: Zero-Shot Semantic Vector Search & Content Understanding (CLIP Paradigm):**
       - *Vision-Language Embedding:* Quantized on-device model (e.g. MobileCLIP or ViT-B/32 ONNX) projecting image thumbnails and arbitrary text queries into a shared embedding space.
       - *Instant Natural Language Querying:* Global search bar in Library view supporting descriptive searches without prior manual labeling (e.g. `"vintage red car"`, `"dog running on beach"`, `"bride and groom sunset"`, `"night skyline with fireworks"`).
       - *Ranking & Speed:* Cosine similarity comparisons executed in milliseconds directly in SQLite or Rust RAM index, sorting the photo grid by relevance score.
  - **Opt-In Model Delivery (RapidRAW Parity & Lightweight Installer):**
    - The base RapidReady installer remains feather-light (~45 MB), shipping only the native runtime bindings (`libonnxruntime` or pure Rust Candle).
    - AI features are disabled by default. Enabling *"Local AI Search & Facial Recognition"* in Settings triggers an asynchronous one-time download of the quantized ONNX models (~50–80 MB total) into the workstation's standard application support directory (`~/Library/Application Support/io.github.on370.rapidready/models/` on macOS, `%LOCALAPPDATA%` on Windows).
    - Displays a clean progress bar during provisioning, ensuring users on low-bandwidth connections or older hardware retain full control over disk usage.
  - **Strict Separation: SQLite Index vs. Non-Destructive Sidecars:**
    - *Internal SQLite Index (`import_index.db`):*
      - High-dimensional vector embeddings, face bounding boxes, and clustering graph nodes reside strictly in internal database tables (`faces`, `people`, `image_embeddings`).
      - Enables instantaneous searches without modifying files on disk or cluttering directory trees.
    - *Explicit Smart Suggestions in Inspector (`LibraryInspector.tsx`):*
      - To prevent polluting `.rrdata` / `.xmp` sidecars with speculative AI classifications, detected keywords and identities are presented as interactive **Smart Suggestion Chips**:
        - **Suggested Tags:** `AI Suggestions: [ + Mountain ] [ + Sunset ] [ + Golden Hour ]`.
        - **Detected People:** `Detected: [ + Anna ] [ + Lukas ]`.
      - Clicking any chip promotes it into an official user tag committed to the `.rrdata` / `.xmp` sidecar.
      - Includes a `[ Accept All Suggestions ]` shortcut for fast batch approval on selected photos.
  - **High-Throughput, Zero-Impact Ingest Architecture:**
    - **No RAW Conversion Overhead:** The AI engine analyzes pre-cached 256/512px thumbnails or embedded camera sensor JPEGs already extracted by the ingest pipeline. Inference requires only 5–15 ms per photo on Apple Silicon (via CoreML / Apple Neural Engine) or modern PC hardware (DirectML / CUDA / AVX2).
    - **Idle Background Worker:** Scanning executes strictly in background threads with low OS scheduling priority. Automatically pauses during user interactions (culling, scrolling, zoom peeping, or RapidRAW handover) ensuring 100% fluid 60 FPS UI responsiveness.



