# RapidReady — Technical Roadmap & Backlog

> **Purpose:** Central architectural roadmap, milestone tracking, and detailed design specifications for RapidReady.

> [!IMPORTANT]
> **Documentation Synchronization Rule (Standing Policy):**  
> Whenever marking tasks as completed (`- [x]`), always verify and synchronize corresponding entries in [`app/README.md`](../README.md) (such as *Supported Formats & Media*, *Key Features*, or *Roadmap* notes) so public-facing documentation remains accurate and up to date!

---

## 🔄 Ongoing Engineering Policies
- [ ] **README Synchronization:** Verify and update `app/README.md` whenever shipping new features or checking off roadmap items.
- [ ] **Data Safety & Non-Destructive Ingest:** Source media and camera RAW files must NEVER be modified. All metadata, tags, ratings, and edits reside strictly in non-destructive sidecars.
- [ ] **Cache & Thumbnail Pipeline Protection (Strict Freeze Guardrail):** The two-tier L1 RAM (`THUMBNAIL_CACHE`) + L2 SSD (`chunk_cache.rs` / `archive_catalog.rs`) thumbnail pipeline, the `rr-image://` protocol fast-path in `lib.rs`, and the virtualized grid/filmstrip preloading in `LibraryGrid.tsx` / `LoupeViewer.tsx` are performance-critical and verified. Unless a task explicitly targets thumbnail caching, **NEVER modify** `chunk_cache.rs`, `archive_catalog.rs`, `thumbnail.rs`, `lib.rs` (`rr-image://` handler), or `LibraryGrid.tsx` (scroll/virtualizer/warmup logic), and **NEVER** introduce synchronous EXIF parsing into Phase 1/Phase 2 directory scanning or thumbnail generation.

---

## 🚀 Released Milestones

### Released in `v0.5.3` (Build `0167`)
- [x] **Comprehensive Technical EXIF Extraction & Collapsible Details Drawer (`metadata_resolver/`, `InspectorCameraCard.tsx`, `InspectorFileInfoCard.tsx`, `LoupeViewer.tsx`):**
  - **Intelligent Camera Make & Model Fusion (`combine_camera_make_and_model`):** Harmonizes camera manufacturer and model strings, strips corporate legal suffixes (`CORPORATION`, `COMPANY, LTD.`), standardizes brand casing (`Sony`, `Fujifilm`, `Nikon`, `Canon`, `Olympus`, `Ricoh`), deduplicates repetitive model prefixes, and preserves mobile devices (`iPhone 13 Pro`).
  - **`LensSpecification` Fallback (Tag `0xA432`):** Automatically decodes rational lens specification quadruples `[min_fl, max_fl, min_ap, max_ap]` into clean photographer notation (e.g. `24-70 mm f/2.8`) when camera firmware omits `LensModel`.
  - **Extended Technical EXIF Metadata (0 ms Additional I/O):** Single-pass extraction of standard EXIF fields directly from the opened header: exposure program (with bracket detection), metering mode, white balance (with light source mapping), flash status (bitmask decoding for fill, auto, red-eye), color space, subject focus distance, digital zoom ratio, body/lens serial numbers, and sub-second capture timestamps (`subsec_time`).
  - **35mm Equivalent Focal Length Indicator:** Displays 35mm equivalent focal length inline for crop sensors (e.g. `10.4 mm (28 mm eq.)` / `(28 mm KB)`), maintaining clean single focal length notation for full-frame cameras.
  - **Collapsible "Extended Details" Drawer:** Integrated directly into `InspectorCameraCard.tsx` with persistent toggle state in `localStorage` (`cameraDetails_open`), displaying a compact monospace summary badge (`M · BKT · sRGB`) when collapsed, and an organized 2-column key-value grid with smart hiding (zero empty rows) when expanded.
  - **Sub-Second Precision in File Info:** Appends sub-second capture fractions to the capture date tooltip (`title`) in `InspectorFileInfoCard.tsx`.
  - **Loupe View Full EXIF Passthrough:** Replaced legacy partial metadata query with full technical EXIF resolution during Loupe navigation, ensuring zero latency when expanding inspector cards.
- [x] **Accurate Sub-1.0 Photo/s Transfer Rates & Hardened Rolling Window (GitHub Issue #3) (`ArchiveScanBanner.tsx`):**
  - **Dynamic Decimal Rate Formatting (`formatPhotoRate`):** Eliminates misleading `0 photos/s` or `0.0 photos/s` readouts on slow NAS shares or large video files by rendering rates $\ge 10$ as integers (`12 photos/s`), rates between $0.1$ and $10$ with one decimal (`1.4 photos/s`), and low rates $< 0.1$ with two decimals (`0.05 photos/s`).
  - **Live Fallback Rate:** Uses `avgItemsPerSec` as an immediate fallback whenever the momentary rolling rate drops to 0 during long-running single-file transfers.
  - **Hardened Monotonic Rolling Sample Window:** Preserves older reference points with lower `done` count in `useSmoothedEta` even during multi-second single-file operations, preventing sample buffer starvation and ETA spikes.
  - **Quicker ETA Responsiveness:** Reduced sample history requirement from 1.5s to 0.8s for faster rate adaptation.
- [x] **Dedicated In-App Documentation: "Archive, Scanning & High-Speed Cache" (`HelpArchive.tsx`, `HelpModal.tsx`):**
  - Added new bilingual documentation section explaining the two-tier L1 RAM / L2 persistent SSD chunk cache architecture, archive sync modes (<kbd>F5</kbd>, <kbd>Shift</kbd>+<kbd>F5</kbd>), and NAS optimization guidelines.
  - Enhanced `FeatureCard` with optional badge support (`HelpShared.tsx`, `HelpMetadata.tsx`).
- [x] **i18n & User Experience Polish:**
  - **Settings Guided Tour Synchronization (`SettingsView.tsx`, `settings.json`, `onboarding.json`):** Unified locale keys for tour reset and settings cards, eliminating German fallback text in English UI mode.
  - **Localized Video Poster Frame Indicator:** Replaced hardcoded text in `LoupeViewer.tsx` with localized `{t('inspector.videoPosterFrame')}` string.
- [x] **Pure Structural Modularization (Zero Logic Change):**
  - Modularized `thumbnail.rs` (3,345 lines) into `thumbnail/` module directory (`mod.rs`, `header_parser.rs`, `jpeg_extract.rs`, `imageio_ffi.rs`, `worker.rs`, `tests.rs`).
  - Modularized `metadata_resolver.rs` (1,127 lines) into `metadata_resolver/` module directory (`mod.rs`, `formatters.rs`, `monochrome.rs`).
  - Modularized `commands.rs` (1,974 lines) into `commands/` module directory (`mod.rs`, `import_cmds.rs`, `archive_cmds.rs`, `culling_cmds.rs`, `collection_cmds.rs`, `system_cmds.rs`).
  - Modularized `LibraryInspector.tsx` (1,400 lines) into lightweight orchestrator and dedicated sub-cards under `inspector/`.

### Released in `v0.5.2` (Build `015E`)
- [x] **Cross-Platform & Windows Build Hardening (`metadata_resolver.rs`, `thumbnail.rs`, `lib.rs`):**
  - **RFC 3484 (`unsafe_extern_blocks`) Compliance:** Updated Win32 API extern block in `metadata_resolver.rs` to `unsafe extern "system"` and macOS bindings in `lib.rs` to `unsafe extern "C"`, ensuring clean compilation on modern Rust toolchains on Windows.
  - **Compiler Warning Elimination:** Scoped macOS-specific ImageIO variables in `thumbnail.rs` to `#[cfg(target_os = "macos")]`, eliminating compiler warnings across non-macOS platforms.
- [x] **Viewport Scalability & Large-Display Grid Optimization (`lib.rs`, `thumbnail.rs`, `GridThumbnailItem.tsx`):**
  - Expanded protocol handler cancellation window from 48 to 256 in `lib.rs`, preventing high-density viewports (e.g. 13x13 or 18x15 = 169–270 tiles) from prematurely aborting visible requests with HTTP 499 while reliably discarding scrolled-away tiles.
  - Post-semaphore fast-cache re-check serving concurrent and worker-cached images instantly in 0 ms.
  - Realtime progress polling during viewport loads (`wait_while_viewport_active_with_poll`), advancing the info dialog counter smoothly in real time without freezing.
  - Resilient grid retry backoff with up to 25 attempts for slow network shares.
- [x] **Prevent Global ChunkCache Wipe & Isolated Invalidation (`chunk_cache.rs`, `commands.rs`, `libraryStore.ts`):**
  - Targeted single-archive rebuild invalidation via `remove_entries_for_keys`, fully protecting other SSD and NAS archives from cache eviction.
  - Explicit cache reset synchronization (`reset_all_fully_indexed_flags()`) when clearing the disk cache.
  - Cooperative viewport throttling every 64 entries in delta synchronization.
  - Grid streaming chunk deduplication (`appendImageChunk`).
  - Automatic on-read self-healing for legacy black RAW fallback chunks (`is_legacy_black_raw_chunk`).
- [x] **Older TIFF RAW Thumbnail Extraction (Canon Digic II / Olympus ORF) (`thumbnail.rs`):**
  - Fixed 16-bit SHORT TIFF Tag `0x0103` (`Compression`) parsing where uninitialized upper 16 bits previously caused valid 1536×1024 JPEG previews in IFD0 to be discarded.
- [x] **Speculative RAM Viewport Caching & Live Visual Buffer Indicators Restored (`thumbnail.rs`, `LibraryGrid.tsx`, `LoupeViewer.tsx`):**
  - **L1 RAM Pre-Warming Architecture:** Introduced `is_thumbnail_ram_cached` in `thumbnail.rs` to clearly differentiate between the high-speed in-memory L1 LRU cache (`THUMBNAIL_CACHE`) and the persistent on-disk L2 chunk cache (`chunk_cache.rs`).
  - **Local SSD-to-RAM Streaming:** In `warm_thumbnail_cache_with_progress`, pre-cached thumbnails resident on SSD in the chunk cache are proactively and asynchronously streamed into L1 RAM in `< 0.5 ms` without any SMB/NAS network I/O, guaranteeing instant 60 FPS scrolling and zero-latency grid browsing.
  - **Grid View Lookahead Restored:** Removed the erroneous `isFullyIndexed` gate in `LibraryGrid.tsx`, re-enabling automatic lookahead preloading (+3 rows in scroll direction, 1 row behind) during 150 ms scroll-settle pauses for fully indexed archives.
  - **Live RAM Buffer Bubbles Restored:** Re-enabled floating dark-glassmorphism buffer count badges indicating cached thumbnails in RAM (`▲ top / ▼ bottom` in Grid View; `◀ left / ▶ right` in Loupe/Filmstrip View).
  - **Optimized Full-Res Loupe Warmup:** Restricted scale 100 Loupe warmup to the immediate next 1–2 photos in the culling direction, eliminating network bandwidth saturation when culling high-resolution RAW archives over NAS shares.
- [x] **Thumbnail & Inspector Orientation Synchronization (GitHub Issue #2) (`thumbnail.rs`):**
  - Consistent orientation across Grid thumbnails, Filmstrip, and Loupe inspector view for portrait images (EXIF orientations 6 and 8) without manual `.rrdata` sidecars.
  - Injected effective EXIF orientation during in-memory preview downscaling and in macOS ImageIO thumbnail generation.
  - Automated regression test `test_issue_2_thumb_and_inspector_orientation_consistency`.
- [x] **Edge-to-Edge Format-Filling Loupe Viewer (`ZoomableImage.tsx`):**
  - Non-zoomed photo viewport styling updated to `width: 100%`, `height: 100%` with `object-contain`, ensuring 3:2 camera photos utilize the full display viewport area.
- [x] **Performance & Stability Polish Across Archive Pipeline:**
  - Canonical path normalization (`normalize_canonical_path`) stripping leading `//Volumes/...` double slashes on macOS.
  - Viewport full-res semaphore (`FULLRES_SEMAPHORE`, 2 permits) & pruning of stale requests >48 photos behind.
  - Clean `#161619` placeholder styling with smooth opacity fade-in transition.
  - Decoupled `setGridScrollTop` from synchronous `onScroll` into a 150 ms idle debounce.
  - Camera body and lens EXIF metadata string sanitization in `metadata_resolver.rs`.
  - Progress counter clamped to 99% until complete indexing of all files.

### Released in `v0.5.1` (Build `013B`)
- [x] **Universal Camera RAW Safety Net & Format Extensions (`thumbnail.rs`, `date_resolver.rs`):**
  - **Two-Tier Architecture:** In `get_preview_jpeg_with_orient_and_hints`, if fast 256/768 KB header-slice extraction yields no preview (e.g. Sigma X3F `FOVb` container, deeply nested Olympus ORF preview, or rare exotic RAW variants), RapidReady automatically falls back to full-stream embedded JPEG scanning (`extract_largest_embedded_jpeg`), downscales the preview in-memory to 720px, and stores it in the local SQLite chunk cache.
  - **Zero Blank Tiles:** Ensures 100% of camera RAW files across all supported manufacturers render sharp thumbnails in Grid View without blank/black placeholder tiles.
  - **Fast-Path Camera Tags:** Added native single-read header extraction for Panasonic Lumix RW2 (`0x002E`/`0x002F` `JpgFromRaw`) and Olympus/OM System ORF (`0x0280` `PreviewImage` + `IIRO`/`IIRS` capture date magic in `date_resolver.rs`).
- [x] **Fujifilm RAW (`.raf`) Header Parser & Fast Grid Thumbnail Ingest:**
  - Dedicated RAF header parser recognizing `FUJIFILMCCD-RAW ` signature and reading the embedded preview JPEG offset (offset 84) and length (offset 88) directly from the directory table.
  - Generates instant Grid View thumbnails downscaled in-memory to 720px via ImageIO, keeping the local chunk cache compact while rendering full sensor previews in Loupe View.
  - Native capture date resolution (`date_resolver`) and camera EXIF extraction (`metadata_resolver`) for all Fujifilm cameras (X-T, X-Pro, X100, X-E, GFX series).
- [x] **Statistics Hover Bubble Alignment & Responsive Layout (GitHub Issue #1):**
  - Left-aligned floating card (`left-0`) with arrow pointer at `ml-7`, ensuring the statistics bubble expands into the visible center view rather than overflowing under the left archive tree pane on narrow windows.
  - Constrained scan banner width to `max-w-full` preventing container overflows.
  - Expanded hover trigger encompassing phase pill, `(?)` icon, and the photo progress counter.
- [x] **Archive Cache Status Indicator (`LibraryLeftSidebar.tsx`):**
  - Subtle lightning icon (`Zap`) in the active archive selector in the left tree sidebar displaying whether the archive is fully cached (100% offline-ready in orange) or currently indexing in the background, with localized hover tooltips.

### Released in `v0.5.0` (Build `0135`)
- [x] **Persistent Local Disk Cache (Picasa & Lightroom Model) (Sprint 2 - Phase 2.1 & 2.2):**
  - Packed binary chunk containers (`chunk_XXXX.bin`, 64 MB rolling segments) on local NVMe disk (`~/Library/Caches/de.rapidready.app/chunk_cache` / `%LOCALAPPDATA%\RapidReady\Cache`).
  - High-concurrency SQLite index (`archive_catalog.sqlite`) mapping canonical paths, sizes, mtimes, orientations, and scales to chunk offsets.
  - Single-seek $O(1)$ byte-range retrieval (`lseek` + `read`), eliminating inode exhaustion and filesystem fragmentation across 100,000+ files.
  - 100% offline-first browsing: Once cached, photo grid and filmstrip are served 100% locally from NVMe at 60 FPS without touching remote NAS/SMB shares.
  - Automatic incremental delta sync (`reconcile_archive_delta`) detecting added, modified, or deleted files on archive reconnection.
- [x] **Canon CR2 High-Resolution Preview & Differentiated In-Memory Downscaling:**
  - Validates TIFF strip compression tags (`Compression == 6 || 7`), safely discarding uncompressed raw Bayer sensor data (860 KB IFD2 slice) and giant sensor streams (>8 MB).
  - Raised preview ceiling to 8 MB, allowing Canon CR2's full-sensor IFD0 preview (5472×3648, 2.5–5.5 MB) to be captured instead of falling back to the 160×120 micro-thumbnail.
  - Previews $\le 1.5\,\text{MB}$ (Sony ARW 504 KB, Canon CR3 400 KB, Ricoh DNG 54 KB) are direct-stored with 0 ms CPU time; full-sensor previews $> 1.5\,\text{MB}$ (Canon CR2) are downscaled in-memory via Apple ImageIO in ~20 ms to 720px thumbnails (~80–120 KB), keeping the chunk cache compact (1 GB instead of 35 GB for 10,000 images) while keeping the grid razor-sharp. Full sensor resolution is strictly preserved for Loupe View / Zoom (`scale >= 100`).
- [x] **Loupe View Viewport Debouncing & Network Request Cancellation:**
  - 100 ms debounce for central viewport and EXIF metadata loading, skipping intermediate frames during rapid arrow navigation or fast double-clicking on slow network shares.
  - Zero-latency instantaneous feedback (0 ms) for filmstrip cursor, image counter, and status bar.
  - Proactive request abort (`img.onload = null; img.src = ''; canceled = true;`) cutting in-flight network connections immediately on image switch.
- [x] **Phase 2 Throughput Smoothing & GUI Responsiveness on Fast SSDs:**
  - Deferred disk flushes to 64 MB chunk boundary rollover, removing synchronous per-thumbnail `fsync` calls and eliminating disk I/O lockups.
  - Paced progress reporting at ~6.6 Hz (150 ms) instead of unthrottled bursts (`done % 10 == 0`), eliminating React main-thread starvation.
  - Cooperative CPU yielding (`std::thread::yield_now()`) to ensure background worker threads do not starve UI rendering.
  - Accurate live transfer rate calculation tracking real accumulated bytes (`processed_bytes`) for correct MB/s throughput display.
- [x] **Grid View Format Badge Contrast & Legibility:**
  - Refined background translucency and typography for format pills (`JPG`, `RAW`, `VID`), ensuring crisp, high-contrast readability against both light and dark photo backgrounds.

### Released in `v0.4.5` (Build `0129`)
- [x] **Network-Aware In-Process Thumbnail Pipeline & Zero-Download 256 KB Header Slice (`v0.4.5` / Build `0129`):**
  - High-performance overhaul of Phase 2 background thumbnail generator on network shares (NAS / SMB).
  - Single-request 256 KB header-slice parser for TIFF-based RAWs (Canon CR2, Sony ARW, Nikon NEF, Adobe DNG, Pentax PEF, Olympus ORF), Canon CR3 (ISOBMFF `thmb` box), and standard JPEGs.
  - Eliminates full 25–45 MB file downloads over SMB. If the thumbnail lies within the 256 KB header buffer, extraction happens in memory with zero additional network requests.
  - Avoids remote SMB seeks and full-sensor demosaic: bypasses ImageIO URL calls for RAWs and performs in-memory downscaling via `extract_thumbnail_from_data`.
  - Zero-cost EXIF orientation injection (`inject_orientation_into_jpeg`) in 0.001 ms, eliminating pure-Rust software re-encoding.
  - Optimized worker pool with 4 concurrent network threads and $O(1)$ batch queue popping, eliminating mutex lock contention and boosting NAS indexing throughput from 1–2 images/sec to 15+ images/sec.
- [x] **Speculative RAM Viewport Caching & Live Visual Buffer Badges (`v0.4.5` / Build `0106`):**
  - Proactive background preloading of neighboring thumbnails in Grid (+3 rows ahead / -1 row behind) and Loupe views (+1 to +5 flip direction) directly in the Rust threadpool (`spawn_blocking`).
  - Prewarms both Scale 2 (720px preview) and Full-Res Previews (scale 100) concurrently.
  - Floating dark-glassmorphism count badges (`▲ top / ▼ bottom` in Grid view; `◀ left / ▶ right` in Loupe view) displaying the number of in-memory cached frames.
  - Atomic cancellation tokens (`WARMUP_TOKEN`) instantly abort running preloads on user scroll or navigation to preserve 100% UI responsiveness.
- [x] **High-Speed Archive Scan Throttling & Ingest Event-Loop Protection (`v0.4.5` / Build `0106`):**
  - Batched chunk ingestion during active scans: buffers high-frequency chunk events from Rust and throttles store updates (max once every 200ms or 500 images) to eliminate event-loop starvation and UI freezing on fast NVMe SSDs and APFS volumes.
  - Decoupled floating scan banner counter (`files_found` / live throughput) counting continuously and smoothly without stuttering.
  - Enforced strict state guards ensuring speculative cache preloading never runs during active archive scanning (`scanning` / `connecting`).
  - Restored 100% deterministic alphabetical path sorting in `LibraryCenter.tsx`.
- [x] **Comprehensive Technical EXIF & Camera Metadata Hub (`v0.4.5` / Build `0106`):**
  - Formatted exposure parameters: clean shutter speed (`1/250s`, `2.5s`) and aperture (`f/2.8`) with decimal rounding limits.
  - Exposure Program (Manual, Aperture Priority, Shutter Priority, Program, Scene modes).
  - Metering Mode (Matrix/Evaluative, Center-Weighted, Spot, Partial).
  - Flash State (fired vs. did not fire, fill flash, red-eye reduction).
  - White Balance mode (Auto vs. Manual/Preset) & Color Temperature in Kelvin.
  - 35mm Equivalent Focal Length (`FocalLengthIn35mmFilm`) and Subject / Focus Distance in meters.
  - Color Space (sRGB, Adobe RGB, Display P3, Uncalibrated) and Exposure Bias / Compensation (`+0.7 EV`).
  - Unified camera make, model, and lens model specification in `LibraryInspector.tsx`.
- [x] **Library-Scoped Virtual Collections (Weg B) & Lifecycle Protection Dialog (`v0.4.5` / Build `0106`):**
  - Collections are now scoped to the active library root (`libraryRoot`), ensuring sidebar album lists strictly match the active library and eliminating empty collection views when switching between locations.
  - Seamless 100% RapidRAW interoperability: maintains central AppData `albums.json` storage and atomic Last-Write-Wins synchronization.
  - `TempLocationCollectionsModal`: Protection dialog when navigating away from temporary locations that contain curated collections (*"Save as permanent library location"* vs. *"Discard temporary collections"* vs. *"Cancel"*).
- [x] **Collection Export Engine Hardening: HDR Gain Map Compatibility (`v0.4.5` / Build `0106`):**
  - Resolved export issues with photos containing embedded HDR gain maps (Apple, Adobe, and Ultra HDR / ISO 21496-1 gain map metadata) in JPEG and RAW companion exports.
  - Refined layout and control alignment in `ExportCollectionModal.tsx`.
- [x] **GUI Ergonomics & Splitter Handles (`v0.4.5` / Build `0106`):**
  - Wider grip hit-targets on panel dividers (splitters) and scroll handles, preventing cursor slipping and avoiding scrollbar overlapping.

### Released in `v0.4.0` (Build `00F0`)
- [x] **Hardware-Accelerated Focus Peaking & Sharpness Inspection (`v0.4.0` / Build `00F0`):**
  - Dual-view Focus Peaking toggle (`F` key) available in 1:1 Loupe Viewer and Inspector preview panel.
  - darktable-inspired Difference-of-Gradients bandpass filter in WebGL shader (spatial scales $\Delta = 1\text{px}$ and $\Delta = 2\text{px}$ with $3\times3$ noise-floor threshold).
  - 4 peaking colors (Neon Green, Vivid Red, Electric Cyan, Bright Yellow) and 3 calibrated sensitivity presets (High, Normal, Low).
- [x] **Virtual Collections (Albums) & Custom Sequencing (`v0.4.0` / Build `00F0`):**
  - Hierarchical album tree view in the sidebar without duplicating physical media on disk.
  - Custom drag-and-drop sequencing in Collection view.
  - Direct collection assignment during Import Step 2.
- [x] **Sequential Collection Export with EXIF Injection (`v0.4.0` / Build `00F0`):**
  - Export collection photos with sequential numbering (`001_Project.jpg`, `002_Project.jpg`) and automatic EXIF capture date / orientation injection.
- [x] **Interactive Onboarding Tour & Revamped Help System (`v0.4.0` / Build `00F0`):**
  - Guided interactive tour (`TourWelcomePrompt.tsx`, `TourOverlay.tsx`) introducing key workflows and shortcuts.
  - Overhauled in-app help modal and shortcut reference.
- [x] **Automatic Filesystem Reconciliation (`v0.4.0` / Build `00F0`):**
  - Real-time detection and synchronization of folder/metadata changes performed by external tools (e.g. RapidRAW).
- [x] **"Entire Archive" Flat Overview (`v0.4.0` / Build `00F0`):**
  - One-click toggle in the folder sidebar displaying all photos across all archive folders in a unified flat grid.

### Released in `v0.3.8-beta-RC2` (Build `00DC`)
- [x] **Import Step 1 – Native Source Scan Cancellation & Clean Reset (`v0.3.8-beta-RC2` / Build `00DC`):**
  - Added dedicated `[ ✕ Abbrechen ]` button in the active source card header next to media badges (`SD-Karte` / `Ordner`).
  - Implemented true background task cancellation in Rust (`scan_directory` in `rapidready-core` and Tauri command `cancel_source_scan`): immediately halts the disk-reading worker thread via atomic cancellation token (`Arc<AtomicBool>`).
  - Clears `scan_progress` event listeners cleanly, preventing zombie scans and ghost progress leaps.
- [x] **Import Step 2 – Bulk RAW & JPG Companion Selection Pills (`v0.3.8-beta-RC2` / Build `00DA`):**
  - Conditional Tri-State format pills (`RAW` amber, `JPG` cyan) in pre-import culling info bar, automatically rendered when mixed media is detected on source storage.
  - Interactive multi-state feedback (`✓` full format inclusion, `–` partial selection with counter `12/245`, `○` deselected format).
  - Cleaned up obsolete `"Click ✗ to exclude"` culling notice.
- [x] **Library Splitter & Hit-Target Ergonomics (`v0.3.8-beta-RC2` / Build `00D9`):**
  - Expanded 7px invisible interactive grab area on tree and inspector dividers (`-left-[3px] -right-[3px]`).
  - RapidRAW dual-line parity: translucent hover track highlighting the crisp 1px central border line, with calm monochrome drag states.
- [x] **Grid View Jitter & Layout Thrashing Resolution (`v0.3.8-beta-RC2` / Build `00D7`):**
  - Eliminated thumbnail grid feedback loop between scrollbar visibility and dynamic column calculation via stable scrollbar gutters and 5% column hysteresis deadbands.

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
- [x] **Focus Peaking & Sharpness Inspection (Grid & Loupe View) (`v0.4.0` / Build `00F0`):**
  - **Context & Goal:** Fast culling requires instantly evaluating whether focus hit the subject's eyes or focal point without continuously zooming in to 100%.
  - **Color Overlay & Zebra Patterns:** Highlight in-focus high-frequency contrast edges with configurable signal colors (e.g. Red, Blue, Green) or zebra hatching.
  - **Dual-View Availability:** Real-time edge detection overlay in Loupe view (Fit & 1:1) and optional sharpness indicators / badges in Grid view thumbnails.
  - **High-Performance Implementation:** Hardware-accelerated WebGL / Canvas shader (< 2 ms overhead) or native Rust edge filter with adjustable threshold levels (Fine / Normal / Coarse).

- [x] **Import Step 2 – Format Filter Quick Selection (Batch Toggle RAWs / JPGs) (`v0.3.8-beta-RC2` / Build `00DA`):**
  - **Context & Goal:** When shooting dual-slot or single-slot RAW + JPG, photographers frequently want to ingest only one format (e.g. only RAWs to save disk space and offload time, or only JPGs for fast client delivery).
  - **Batch Format Toggles:** Dedicated 1-click action buttons / format pills in the Step 2 source preview toolbar (`[ Select only RAWs ]`, `[ Deselect all JPGs ]`, `[ Videos ]`).
  - **Dynamic Volume Feedback:** Instantly recalculates transfer file count, total bytes, and destination disk headroom without requiring manual folder-by-folder unchecking.

- [ ] **Umschaltbares RAW + JPEG Stacking (Kombi-Kacheln mit A/B-Toggle in Loupe & Inspector):**
  - **Context & Goal:**
    Beim simultanen Fotografieren in RAW + JPG (oder RAW + HIF) entstehen Bildpaare mit identischem Basisnamen (z. B. `_DSC1234.ARW` und `_DSC1234.JPG`). Im Grid verdoppeln diese Paare die Kachelanzahl und verlangsamen die visuelle Sichtung. Das RAW+JPEG Stacking fasst Bildpaare im Grid optional zu einer einzigen virtuellen Kachel zusammen, während in der Loupe-Ansicht ein blitzschneller A/B-Vergleich zwischen neutralem RAW und kamerainternem JPEG-Bildstil ermöglicht wird.
  - **Grid-Ansicht & Kombi-Badges:**
    - **Umschalt-Option:** Schnellwahlschalter in der Filter-/Toolbar sowie Tastenkürzel (`Alt+S`): *„RAW + JPG stapeln“* / *„Stack RAW+JPEG“*.
    - **Pairing-Logik:** Dateien im selben Ordner mit identischem Stamm/Basisnamen (`stem`) werden im UI-Selector zu einer gemeinsamen Kachel verschmolzen (unterstützt alle gängigen RAW-Formate gepaart mit `.jpg`, `.jpeg`, `.hif`, `.heic`).
    - **Kombi-Badge oben links:** Kachel zeigt `[RAW] [JPG]` (oder `[RAW+JPG]`), wobei das aktuell für die Anzeige ausgewählte Master-Format farblich hervorgehoben ist (z. B. `RAW` in Bernstein/Orange, `JPG` in dezentem Cyan/Grau).
  - **Loupe View & Zero-Latency A/B-Vergleich:**
    - **Konfigurierbarer Master:** Einstellbarer Standard in den Settings: *RAW-Master* (Standard, eingebettetes hochauflösendes Sensor-Preview) vs. *JPEG-Master* (kamerainterne Bearbeitung/Farben).
    - **1-Key A/B-Umschaltung:** Taste `J` (oder Halten von `\` / `J` für temporären Hold-to-Compare) schaltet nahtlos zwischen RAW-Vorschau und Kamera-JPEG um – ohne Verlust von Zoomstufe oder Pan-Position (ideal für Schärfe- und Farbabgleiche bei 1:1 Sensor-Zoom).
    - **GUI-Umschalter:** Schwebende Pill-Buttons in der Loupe-Toolbar: `[ • RAW | JPG ]`.
  - **Inspector-Integration:**
    - Header zeigt den einheitlichen Basisnamen mit Format-Chips und Dateigrößen: z. B. `_DSC1234` mit `[RAW (42.8 MB)]` und `[JPG (8.1 MB)]`.
    - Belichtungs- und Aufnahmedaten (Zeit, Blende, ISO, Brennweite, GPS) bleiben synchron; formatspezifische Metadaten (Dateigröße, Farbraum) passen sich dem gewählten Format an.
  - **Synchrones Culling & Selektives Löschen:**
    - **Synchrones Culling (Shared State):** Bewertungen (Picks `P`, Rejects `X`, Sterne `1`–`5`, Farblabels `6`–`9`, Tags) werden simultan in beide Sidecars geschrieben (`.ARW.rrdata` und `.JPG.rrdata`). Das Motiv wird einheitlich bewertet, wodurch keine Desynchronisation zwischen RAW und JPEG entsteht.
    - **Differenzierter Lösch-Dialog:** Beim endgültigen Löschen eines gestapelten Paars bietet der Sicherheitsdialog drei Optionen:
      1. `[ Beide Dateien löschen ]` (Standard)
      2. `[ Nur RAW löschen ]` (z. B. Speicherplatz freigeben)
      3. `[ Nur JPEG löschen ]` (Kamera-JPEGs nach initialer Sichtung verwerfen).
  - **Performante Virtuelle Store-Architektur:**
    - Der physische `images`-Array in `libraryStore` bleibt unberührt; die Gruppierung erfolgt rein virtuell über einen performanten `useMemo`-Selector in `LibraryCenter.tsx` ($< 5\,\text{ms}$ Overhead). Das Ein- und Ausschalten des Stapelmodus erfordert keinen Neuscan und erfolgt ohne Verzögerung.

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
- [x] **Non-Destructive Virtual Collections & Automated RapidRAW Album Bridge (`v0.4.0` / Build `00F0` & `v0.4.5` / Build `0106`):**
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

- [x] **Sequential Photobook & Web Export with Custom Sizing & Linear EXIF Timestamp Synthesis (`v0.4.0` / Build `00F0` & `v0.4.5` / Build `0106`):**
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
- [x] **Persistent Local Disk Cache for Previews & Thumbnails (Lightroom & Picasa Model) (Sprint 2 - Phase 2.1 & 2.2):**
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

- [x] **Speculative RAM Viewport Caching (`v0.4.5` / Build `0106`):**
  - Prefetching neighboring thumbnails in RAM (`visible_index ± 20`) during idle pauses (> 150 ms).
  - Strict priority queuing and cancellation to prevent saturating the browser 6-socket connection limit.

- [x] **Network-Aware In-Process Thumbnail Pipeline & Zero-Download 256 KB Header Slice (`v0.4.5` / Build `0129`):**
  - **Context & Goal:** Indexing large photo archives on NAS network shares (SMB) previously crawled at 1–2 images/sec due to external library (`kamadak-exif`) `read_to_end` invocations downloading full 25–45 MB RAW files over network mounts, ImageIO URL seeks triggering full sensor demosaic, and worker thread contention.
  - **Single-Request Header-Slice Engine:** Custom Rust in-memory header parser requesting exactly one 256 KB slice. TIFF IFD0, IFD1, and SubIFD structures (Canon CR2, Sony ARW, Nikon NEF, Adobe DNG, Pentax PEF, Olympus ORF) as well as Canon CR3 (`thmb` box) and standard JPEGs extract embedded thumbnails directly from the initial 256 KB buffer with **zero additional network I/O**.
  - **Zero-Cost EXIF Orientation:** Replaced pure-Rust software re-encoding with in-memory `inject_orientation_into_jpeg` (0.001 ms).
  - **Tuned Concurrency & Batch Queue:** Set optimal 4-thread pool for SMB mounts with $O(1)$ batch queue popping, boosting live archive thumbnail generation throughput to 15+ images/s on physical NAS storage.

- [ ] **Lazy EXIF Metadata Background Enrichment (Idle Worker):**
  - **Context & Goal:** Phase 1 intentionally leaves camera and exposure parameters empty (`None`) to stream file discovery in seconds. Currently, detailed technical EXIF metadata (camera make, model, lens, focal length, aperture, shutter speed, ISO, GPS) is loaded on demand via `get_image_metadata` only when an image is selected in the Inspector or opened in the Loupe.
  - **Background Idle Enrichment:** When neither an active archive scan nor user scrolling/culling is taking place (true system idle), a low-priority background worker incrementally fetches and enriches the SQLite catalog database with technical EXIF metadata in small batches.
- [ ] **SIMD-Accelerated IDCT Scaled Decoding for Windows & Linux (TurboJPEG / Zune-JPEG):**
  - **Context & Motivation:**
    - On macOS, in-process Apple ImageIO performs hardware-accelerated DCT scaled decoding (`extract_thumbnail_from_data`) directly from in-memory JPEG buffers in ~20 ms for large full-sensor previews (e.g. Canon CR2 5472x3648, 20–30 MP), downscaling them to crisp ~80–120 KB 720px thumbnails with minimal CPU footprint.
    - On Windows (Intel/AMD) and Linux, Apple ImageIO is unavailable. Using the default pure-Rust `image` crate to perform full decompression, bicubic downscaling, and re-encoding of 24–50 MP sensor JPEGs requires ~140–180 ms of CPU time per image.
  - **Target Optimization:**
    - Integrate SIMD-accelerated IDCT 1/8 downscaling (via `turbojpeg` with libjpeg-turbo C bindings or pure-Rust SIMD `zune-jpeg`).
    - Standard JPEG decompression allows directly decoding only the low-frequency DCT coefficients without reconstructing the full 24–50 MP pixel matrix in memory.
    - This reduces CPU time per 24 MP image on Windows/Linux from ~150 ms down to **~3–6 ms**, achieving full performance parity with macOS Apple Silicon across all platforms.

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
  - **No FFmpeg required for this phase:** the player plays whatever the platform WebView can decode natively (WKWebView: mp4/mov/m4v with H.264/HEVC/ProRes; WebView2: H.264/VP9/AV1, HEVC only with system codec; WebKitGTK: depends on installed GStreamer plugins). Use a dedicated `rr-video://` scheme so the verified `rr-image://` fast-path stays untouched.
  - **Graceful fallback for undecodable formats:** on `<video>` `onError`, show the existing "no preview available" placeholder plus an **"Open in system player"** button (`open::that`), so unsupported containers (`.mkv`, `.avi`, `.wmv`, `.flv`, AVCHD `.mts/.m2ts`) are never a dead end.

- [ ] **Phase 4 (Optional, decision pending): FFmpeg Compatibility Layer for Exotic Containers/Codecs:**
  - **Trigger:** Only pursue if real users need in-app playback or poster frames for formats the OS/WebView cannot decode (MKV, WebM on macOS, AVI/WMV/FLV, AVCHD `.mts/.m2ts`, HEVC on Windows without codec extension, most formats on Linux without GStreamer plugins).
  - **One tool, two benefits:** `ffmpeg` can serve both **poster-frame extraction** (generalizing the Linux-only `video_linux.rs` into a cross-platform fallback that runs **only after** `thumb_rs` fails, never on the cached fast path) and **on-demand remux/transcode proxy** for the Phase 3 player.
  - **Distribution options (decide later):** (a) *Optional detection* of a user-installed `ffmpeg` (PATH plus `/opt/homebrew/bin`, `/usr/local/bin`; zero download size, poor UX on macOS/Windows); (b) *Bundled Tauri sidecar* (`externalBin`, LGPL build, +30–80 MB per platform, macOS notarization and per-platform binaries required).
  - **Mandatory guardrails:** hard timeout and kill, global concurrency cap, binary probe once, negative cache for failures (see `docs/LINUX_THUMBNAILS_TASK.md` §4); never touch the L1/L2 thumbnail fast path.


- [x] **Fujifilm RAW (`.raf`) Header Parser & Grid Thumbnail Extraction (`v0.5.1` / Build `013A`):**
  - **Problem & Diagnosis:**
    - Fujifilm `.raf` files currently render correctly in the Inspector and Loupe View (since Loupe View requests `scale=100`, triggering `extract_largest_embedded_jpeg` which performs a 40 MB buffer scan and locates the high-resolution JPEG preview).
    - However, in Grid View (`scale=1`), thumbnails currently fail to render because `extract_embedded_thumbnail` expects a standard TIFF header (`II` or `MM` at byte 0).
    - Fujifilm RAF files do not begin with a standard TIFF header; they start with a proprietary 16-byte magic (`FUJIFILMCCD-RAW `) and store the offset to their embedded preview JPEG / embedded EXIF header within the RAF header structure (typically at offset 84/120 or in a directory table).
  - **Resolution Plan:**
    - Add a dedicated RAF header parser in `thumbnail.rs` (checking `&buf[0..16] == b"FUJIFILMCCD-RAW "`).
    - Read the embedded preview JPEG offset and length directly from the RAF header table and extract the preview without requiring a 40 MB deep scan.
    - Feed the resulting JPEG to the standard in-memory caching pipeline, ensuring instant Grid View thumbnails for all Fujifilm cameras (X-T, X-Pro, X100, GFX series).

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
- [ ] **Vollbild-Präsentationsmodus & Integrierte Diashow ("Presentation & Slideshow Mode"):**
  - **Context & Goal:**
    Neben der schnellen Kachel-Übersicht (`Grid`) und der detaillierten Einzelbild-Inspektion (`Loupe`) benötigen Fotografen einen ablenkungsfreien **Vollbild- & Diashow-Modus** (für die finale Auswahlkontrolle, Kundenpräsentationen oder das entspannte Durchblättern auf großen Monitoren). Der Modus kombiniert ein zweistufiges Vollbild-Konzept (App-Fenster-Vollbild vs. echtes OS-Vollbild) mit einer sich automatisch ausblendenden HUD-Steuerleiste und verzögerungsfreiem L1-RAM-Preloading.
  - **1. Zweistufiges Vollbild-Konzept (Window-Fill vs. OS-Fullscreen):**
    - **Stufe 1 – App-Vollbild (Standard beim Eintritt in `viewMode = 'fullscreen'`):**
      - Blendet Top-Header/Navigation, linke Ordner-/Sammlungs-Sidebar (`LibraryLeftSidebar`), `CullingToolbar`, `FilmstripBar` und den rechten `LibraryInspector` komplett aus (`App.tsx` / `LibraryView.tsx` / `LibraryCenter.tsx`).
      - Das aktive Foto füllt auf tiefschwarzem Hintergrund (`#09090b` bzw. `#000000`) 100 % des RapidReady-Anwendungsfensters (`w-full h-full object-contain select-none`).
      - **Architektur-Vorgabe:** Als vollwertiger dritter `viewMode: 'grid' | 'loupe' | 'fullscreen'` in `libraryUIStore.ts` implementieren (zusätzlich `previousViewMode: 'grid' | 'loupe'` merken). **WICHTIG:** Kein `.fixed.inset-0`-Modal verwenden, da `useLibraryShortcuts.ts` (Zeile 43: `document.querySelector('.fixed.inset-0, [data-context-menu]')`) sonst sämtliche Tastatur-Shortcuts blockiert!
    - **Stufe 2 – Echtes OS-Vollbild (optional zuschaltbar):**
      - Über den Fullscreen-Button in der unteren HUD-Steuerleiste (via Tauri Window API `getCurrentWindow().setFullscreen(true / false)`) oder den nativen grünen macOS-Fensterbutton / `F11` (Windows) wird das echte Betriebssystem-Vollbild umgeschaltet.
    - **Einheitlicher Ausstieg (`ESC` oder `[ X ]`-Button oben rechts):**
      - Befindet sich das Anwendungsfenster im echten OS-Fullscreen, setzt `ESC` (bzw. Klick auf `X`) zuerst `setFullscreen(false)` zurück und wechselt gleichzeitig in den gespeicherten `previousViewMode` (`'grid'` oder `'loupe'`) zurück.
      - Eine laufende Diashow (`isPlaying`) wird beim Verlassen automatisch gestoppt.
  - **2. Einstieg, View-Switcher & Tastatur-Shortcuts (`CullingToolbar.tsx`, `useLibraryShortcuts.ts`):**
    - **3er View-Switcher in `CullingToolbar.tsx`:**
      - Erweiterung des bisherigen 2er-Umschalters (`Grid` | `Loupe`) um einen dritten Button **`Vollbild` / `Fullscreen`** (Icon: `Maximize2` oder `Play`, Tooltip inkl. Shortcut `F`).
    - **Tastatur-Shortcuts (`useLibraryShortcuts.ts` & `HelpModal.tsx`):**
      - **`F`:** Schaltet den Vollbild-Modus (`viewMode === 'fullscreen'`) ein bzw. aus (kehrt zu `previousViewMode` zurück).
      - **`Shift + F`:** Übernimmt das Umschalten von *Focus Peaking* (`toggleFocusPeaking()`), das bisher auf `F` lag (`Cmd/Ctrl + Shift + F` bleibt weiterhin *"Show in Finder / Explorer"*).
      - **`ESC`:** Verlässt den Vollbild-Modus (und beendet ggf. ein aktives OS-Fullscreen) zurück zu `previousViewMode`.
      - **`ArrowLeft` (`←`) / `ArrowRight` (`→`) (sowie `k` / `j`):** Springt im gecachten RAM sofort zum vorherigen / nächsten Bild. Falls die Diashow gerade läuft (`isPlaying === true`), wird der Intervall-Timer ab dem manuell gewählten Bild sauber neu gestartet (Reset des Countdown-Timers ohne Stopp der Diashow).
      - **`Space` (Leertaste):** Schaltet im Vollbild-Modus (`viewMode === 'fullscreen'`) **Play / Pause der Diashow** um (während `Space` in `Grid` und `Loupe` wie bisher ein Bild vorrückt).
      - **Culling im Vollbild:** Alle Bewertungs-Shortcuts (`P` Pick, `X` Reject, `U` Unflagged, `0–5` Sterne, `6–9` Farblabels) bleiben auch im Vollbild voll funktionsfähig; bei Änderung blitzt für 1,2 s ein dezentes Bestätigungs-Badge (z. B. `★★★` oder `✓ Pick`) am unteren Bildrand auf.
  - **3. Schwebendes HUD-Control-Deck & Auto-Hide-Ergonomie (`FullscreenViewer.tsx`):**
    - **Schließen-Button oben rechts (`[ X ]`):**
      - Dezenter runder Glassmorphism-Button (`top-5 right-5`, `bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/15 rounded-full p-2.5 text-white/80 hover:text-white`).
    - **Schwebendes Control-Deck unten mittig:**
      - Zentrierte Glassmorphism-Pill (`bottom-6 left-1/2 -translate-x-1/2`, `bg-black/70 backdrop-blur-md border border-white/15 rounded-full px-5 py-2.5 shadow-2xl flex items-center gap-3`) mit folgenden Elementen von links nach rechts:
        1. **Positions-Zähler:** Aktueller Index & Gesamtanzahl in Monospace-Typografie (z. B. `42 / 380`).
        2. **`|◀` (Bild zurück):** Button (`SkipBack` / `ChevronLeft`) zum vorherigen Bild.
        3. **`▶ / ⏸` (Kombinierter Play/Pause-Toggle):** Startet bzw. pausiert die Diashow (`Play`-Icon wenn pausiert, `Pause`-Icon mit Akzent-Highlight wenn aktiv).
        4. **`▶|` (Bild vor):** Button (`SkipForward` / `ChevronRight`) zum nächsten Bild.
        5. **Intervall-Auswahl (Zeitverzögerung Diashow):** Kompaktes Pulldown / Popover-Menü direkt in der Leiste mit den Stufen **`2s` | `3s` (Default) | `5s` | `10s`** (persistiert in `libraryUIStore`, z. B. `slideshowIntervalSec: 3`).
        6. **Loop-Toggle (`Repeat`-Icon):** Optionaler Schalter, ob die Diashow nach dem letzten Bild wieder bei Bild 1 beginnt (Default: aktiv).
        7. **OS-Fullscreen-Toggle (`Maximize` / `Minimize`-Icon):** Schaltet das native Betriebssystem-Vollbild (`getCurrentWindow().setFullscreen(...)`) ein/aus und synchronisiert seinen Status über Window-Resize/Fullscreen-Events.
    - **Auto-Hide & Mauszeiger-Ausblendung:**
      - Nach **2,5 Sekunden ohne Mausaktivität** (`mousemove`, `mousedown`, `wheel`) blenden sich sowohl das Control-Deck unten als auch das `[ X ]` oben rechts sanft aus (`opacity-0 pointer-events-none transition-opacity duration-300`).
      - Gleichzeitig erhält der Vollbild-Container `cursor-none`, sodass auch der OS-Mauszeiger komplett aus dem Bild verschwindet.
      - Solange sich der Mauszeiger direkt *auf* dem Control-Deck befindet (`onMouseEnter` / `isHoveringControls`) oder das Zeit-Pulldown geöffnet ist, bleibt die Leiste dauerhaft sichtbar.
      - Jede Mausbewegung oder Maustaste (`onMouseMove` / `onMouseDown`) blendet Mauszeiger, Control-Deck und `[ X ]` sofort (`0 ms`) wieder ein.
  - **4. Übergänge & Intelligentes L1-RAM-Preloading:**
    - **Differenzierte Bildübergänge:**
      - **Manuelles Blättern (`←` / `→` oder Buttons):** Harter, verzögerungsfreier Schnitt (`0 ms` Transition) für maximale Reaktionsgeschwindigkeit beim schnellen Durchsteppen.
      - **Automatischer Diashow-Wechsel (`isPlaying === true`):** Sanfte Crossfade-Überblendung (`200 ms` `opacity` Transition zwischen vorherigem und neuem Frame) für eine ruhige, hochwertige Präsentationswirkung.
    - **Zweistufiges Rendering & RAM-Lookahead:**
      - Nutzt das zweistufige Progressive-Loading (sofortige Anzeige des gecachten Scale-1/Scale-2-Previews aus L1/L2 in `< 0,1 ms`, nahtloses Nachziehen von `fullres=true`).
      - Während des Vollbild-/Diashow-Modus wärmt der Hintergrund-Preloader (`warm_thumbnail_cache`) in Vorwärtsrichtung die nächsten 3–5 Bilder (inkl. Full-Res-Preview bei aktivem Diashow-Timer) proaktiv in den L1-RAM-Cache vor, sodass jeder Diashow-Wechsel selbst auf NAS-Archiven zu 100 % aus dem RAM erfolgt.

- [x] **Configurable Keyboard Shortcut Presets (Lightroom vs. darktable Muscle Memory):**
  - **Context & Goal:**
    Photographers migrating from or working with **darktable** are accustomed to `R` for *Reject* (and `F1`–`F5` for color labels), whereas RapidReady's default follows the **Adobe Lightroom / Photo Mechanic** convention (`P` = Pick, `X` = Reject, `U` = Unflag, `6`–`9` = Colors, `R` = Open in RAW Developer).
  - **Requirements & Architecture:**
    - Add a **Shortcut Scheme** selector in `SettingsView.tsx` (`settingsStore.ts`): `Lightroom Standard (P / X / U)` (default) vs. `darktable Compatible (R = Reject)`.
    - In `darktable` mode:
      - `R` toggles **Reject** (`flag = -1`, alongside `X`).
      - Opening the external RAW developer moves to `Ctrl/Cmd + R` or `Shift + R`.
      - Optional support for `F1`–`F5` color label shortcuts alongside `6`–`9`.
    - Dynamically reflect the active shortcut bindings in tooltips (`CullingToolbar.tsx`, `InspectorCullingCard.tsx`) and in `HelpShortcuts.tsx`.
  - **CTSP Guardrail:** Pure UI keybinding dispatch in `useLibraryShortcuts.ts` (0% CTSP impact).

- [ ] **Switchable Proportional / Masonry Grid Layout (Justified Rows vs. Waterfall Columns):**
  - **Context & Goal:**
    Currently, the Library Grid (`LibraryGrid.tsx`) displays photos in a uniform square tile matrix (`object-cover`). While this provides a structured, predictable layout for rapid culling, photographers shooting mixed landscape (3:2, 16:9), portrait (2:3, 4:5), and panorama compositions experience cropped thumbnail previews. A switchable **Proportional / Masonry Grid** displays every photo in its natural aspect ratio with zero wasted space.
  - **Architectural Evaluation of the Two Masonry Variants:**
    1. **Variant A — Justified Aspect-Ratio Rows (Horizontal Row Bin-Packing — *Recommended Primary Mode*):**
       - *Mechanism:* Packs images strictly chronologically from left to right into rows, scaling each row's height so that all tiles fit flush against both the left and right viewport edges (the industry standard in *Adobe Lightroom "Justified Grid"*, *Google Photos*, and *Flickr*).
       - *Why Primary for Culling:* Preserves 100% chronological left-to-right reading order (burst sequences stay side-by-side in the same row), guarantees intuitive `←`/`→`/`↑`/`↓` keyboard navigation, and makes `Shift+Click` range selections visually contiguous.
    2. **Variant B — Waterfall Columns (Vertical Shortest-Column Placement — *Optional Secondary Mode*):**
       - *Mechanism:* Fixed number of equal-width columns where each next photo is appended to the currently shortest column (*Pinterest* / *Unsplash* / *Eagle* style).
       - *Trade-off:* Visually appealing for moodboards, but breaks strict horizontal chronological order, making `Shift+Click` range selection and arrow-key culling across mixed portrait/landscape shoots harder to follow.
  - **Requirements & Technical Architecture:**
    - **Interactive Toggle Control (Harmonized with the 3-Segment `[ Grid ▾ | Loupe | Fullscreen ]` Switcher):**
      - In `CullingToolbar.tsx`, the primary view mode switcher forms a unified 3-segment control block: **`[ ⊞ Grid ▾ | ⬚ Loupe | ⛶ Fullscreen ]`**.
      - The **Grid segment** acts as a split button (`[ ⊞ Grid | ▾ ]`, analogous to the `[ Focus | ▾ ]` button):
        - Clicking the main `Grid` button always activates `viewMode = 'grid'` (using the user's currently selected grid layout mode).
        - Clicking the small `▾` chevron on the right side of the `Grid` segment opens a compact popover menu to choose between **`Square (Gleichmäßige Kacheln)`**, **`Justified Rows (Proportionale Zeilen)`**, and **`Waterfall Columns (Spalten-Masonry)`**, displaying `Shift+G` as the keyboard shortcut badge.
        - The leading icon of the `Grid` button dynamically reflects the active layout mode (`LayoutGrid` for Square, `Rows3` for Justified, `Columns3` for Waterfall).
      - **Keyboard Shortcuts (`G` vs. `Shift+G`):**
        - **`G`:** Always switches reliably to Grid view (`viewMode = 'grid'`) from Loupe or Fullscreen without altering the chosen grid layout.
        - **`Shift+G`:** Cycles through the grid layout variants (`square` $\rightarrow$ `justified` $\rightarrow$ `waterfall` $\rightarrow$ `square`) and persists `gridLayoutMode: 'square' | 'justified' | 'waterfall'` in `libraryUIStore` / `localStorage`.
    - **High-Performance Virtualized Layout & CTSP Guardrails:**
      - **Zero Backend Cache Changes:** L2 chunk cache (`thumbcache_0001.bin`) already stores `720px` thumbnails in their native aspect ratio (with EXIF orientation applied). Switching grid modes requires zero re-indexing or cache regeneration.
      - **Pre-Computed Row Prefix Sums ($O(\log N)$ Binary Search):** Maintain smooth 60 FPS virtual scrolling across 50,000+ photos by pre-computing row heights and cumulative Y-offsets in a flat `Float64Array`, finding visible rows via binary search on `scrollTop`.
      - **Zero Layout-Shift Aspect Ratio Resolution:** Persist `(width, height)` during Phase 2 thumbnailing (`parse_jpeg_dimensions` in `< 0.001 ms`) into `archive_catalog.db` so aspect ratios are available in RAM within `< 20 ms` on startup; fall back to `3:2` (or `2:3` for portrait orientation `6`/`8`) when dimensions are not yet known.
      - **Spatial Up/Down Keyboard Navigation:** In `useLibraryShortcuts.ts`, `ArrowUp` and `ArrowDown` step to the tile in the adjacent row whose horizontal X-center is closest to the active tile's X-center.
    - **Culling & Selection Parity:**
      - 100% feature parity: range selection (`Shift+Click`), individual toggling (`Cmd/Ctrl+Click`), rating/color/flag badges, drag-and-drop, and context menus.

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

- [x] **Harmonized Two-Stage Folder Tree Deletion & Guarded Settings Switches:**
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
- [x] **Interactive Guided Onboarding Tour with Dynamic Spotlight Callouts ("Wandernde Erklär-Blasen") (`v0.4.0` / Build `00F0`):**
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

---

### Milestone: Comprehensive EXIF & Technical Metadata Hub (Advanced Backlog)
- [x] **Extended Technical EXIF & Media Metadata Inspection (`v0.4.5` / Build `0106`):**
  - **Context & Goal:**
    Professional photographers, retouchers, and photo archivists rely on in-depth camera and capture metadata beyond core exposure parameters to verify shooting configurations, gear performance, color pipeline consistency, and attribution.
  - **Backlog Scope & Catalog of Metadata Fields:**
    1. **Shooting Parameters & Camera Configuration:**
       - **Exposure Program (`ExposureProgram`):** Manual (M), Aperture Priority (Av/A), Shutter Priority (Tv/S), Program (P), Creative / Scene modes.
       - **Metering Mode (`MeteringMode`):** Multi-segment / Evaluative Matrix, Center-Weighted Average, Spot, Partial.
       - **Flash State (`Flash`):** Fired / Did not fire, TTL, fill flash, red-eye reduction, bounce flash.
       - **White Balance (`WhiteBalance`):** Auto vs. Manual / Preset (Daylight, Shade, Tungsten, Custom Kelvin `ColorTemperature`).
       - **35mm Equivalent Focal Length (`FocalLengthIn35mmFilm`):** Sensor crop-factor conversion (e.g. `16 mm (24 mm equiv.)` on APS-C / Micro Four Thirds / Smartphones).
       - **Subject / Focus Distance (`SubjectDistance`):** Distance to focal plane in meters.
    2. **Hardware, Optics & Camera Identity:**
       - **Camera Make & Clean Model (`Make` + `Model`):** Unified camera identity (e.g. `Sony ILCE-7RM5`, `Canon EOS R5`).
       - **Lens Specification (`LensSpecification`):** Optical range and maximum aperture specification.
       - **Serial Numbers (`BodySerialNumber`, `LensSerialNumber`):** Hardware inventory tracking and rental/theft verification.
       - **Shutter Actuation Count (`ImageNumber` / MakerNotes):** Total lifetime shutter activations recorded at capture time.
       - **Firmware & Creation Software (`Software`):** Camera firmware version or raw processing converter signature.
    3. **Color, Sensor & Bit Depth Pipeline:**
       - **Color Space (`ColorSpace`):** sRGB, Adobe RGB, ProPhoto RGB, Display P3, Uncalibrated.
       - **Bit Depth (`BitsPerSample`):** 14-bit RAW, 12-bit RAW, 10-bit HEIF, 8-bit JPEG.
       - **Compression Profile (`Compression`):** Lossless compressed, uncompressed, lossy compressed.
    4. **IPTC, Rights & Editorial Metadata:**
       - **Creator / Artist (`Artist` / `Creator`):** Photographer byline.
       - **Copyright Notice (`Copyright`):** Copyright ownership notice.
       - **Image Description & Headline (`ImageDescription` / `Title`):** Caption and title metadata.
    5. **Advanced Spatial & Motion Geodata:**
       - **Compass Heading (`GPSImgDirection`):** Direction the camera was pointed at exposure (degrees + cardinal direction).
       - **Capture Speed (`GPSSpeed`):** Vehicle/aircraft speed at capture time.
       - **GPS Atomic Clock (`GPSDateStamp` + `GPSTimeStamp`):** UTC satellite time verification.
    6. **Video Clip Technical Metadata:**
       - **Duration:** Formatted playback duration (`mm:ss`).
       - **Framerate:** Exact capture rate (`23.976 fps`, `24 fps`, `25 fps`, `50 fps`, `59.94 fps`, `120 fps`).
       - **Video Codec & Bitrate:** Apple ProRes, H.265 (HEVC), H.264 (AVC), AV1.
       - **Audio Format:** Sample rate (48 kHz) and bit depth (24-bit LPCM, AAC).
  - **Ergonomic Inspector UI Architecture:**
    - [x] Dedicated collapsible section: *"Erweiterte EXIF-Daten & Technische Details"* in `InspectorCameraCard.tsx` (`v0.5.3` / Build `0167`), keeping the main exposure and file info cards clean while offering instant drill-down on demand.
- [x] **Inspector Live-Histogram & Preview Viewport Switcher:**
  - **Context & Goal:**
    Photographers require rapid luminance and RGB exposure evaluation directly within the Inspector sidebar without needing to open the full Loupe view or switch to an external RAW developer.
  - **UI Placement & Toggle Architecture:**
    - In the header of the *Vorschau / Preview* card (`LibraryInspector.tsx`), place a dedicated **Histogramm-Umschalter** (`BarChart2` / `Activity` Icon) immediately to the right of the Focus-Peaking-Button (`ScanEye`).
    - Tooltip: *"Histogramm anzeigen (H)"* / *"Toggle Histogram"* with active toggle state (`bg-accent/20 text-accent ring-1 ring-accent/40`).
  - **Display Modes in the Preview Box:**
    - **Mode 1 (HUD Overlay):** Halbtransparentes RGB/Luminanz-Histogramm eingeblendet über der bestehenden Bildvorschau.
    - **Mode 2 (Vollbild-Ersatz / Swap):** Vollflächige Umschaltung des Vorschaukastens auf ein detailliertes 256-Kanal-RGB- und Helligkeits-Histogramm inklusive Beschneidungswarnungen (Clipping-Indikatoren für abgesoffene Tiefen und ausgefressene Lichter).
  - **Performance:**
    - Client-seitige Berechnung via Canvas/WebGL oder Rust Thumbnail-Sampler in unter 5 ms direkt aus dem gecachten Vorschau-JPEG.

- [ ] **Redaktionelle Metadaten: Vorbelegung (Settings/Import), Inspector-Editing & Sidecar-Overrides:**
  - **Problemstellung & Kontext:**
    Professionelle Bildarchive, Kundenübergaben und Presse-Workflows erfordern verlässliche Urheber- und Bildrechte-Angaben (Fotograf, Copyright, Nutzungsrechte, Titel, Bildbeschreibung) sowie die Möglichkeit, fehlerhafte Aufnahmezeiten (z. B. asynchrone Kamerauhren bei Multi-Cam-Shootings oder vergessene Zeitzonen-Umstellungen) zu korrigieren.
  - **Strikte Non-Destructive Data Safety Policy (Zero-Write auf Originale):**
    - **Absolutes Schreibverbot auf Originaldateien:** Weder RAW-Dateien (`.ARW`, `.CR2`, `.CR3`, `.NEF`, `.DNG` etc.) noch Kamera-JPEGs oder Videos werden jemals bitweise modifiziert. Originale bleiben physisch unberührt und schreibgeschützt.
    - **100% Sidecar-basierte Persistenz:** Sämtliche Vorbelegungen, manuellen Anpassungen, redaktionellen Felder und Zeitkorrekturen werden ausschließlich in den herstelleroffenen Sidecars (`<original_path>.rrdata` und optional synchronisiert in Adobe-Standard `.xmp`) gespeichert.
    - **Atomare Schreibvorgänge:** Speicherung erfolgt stets über temporäre Dateien (`.{stem}.tmp.{thread}.{pid}`) mit anschließendem atomarem OS-Rename (`fs::rename`), um Datenkorruption bei Stromausfall oder Netzwerkunterbrechungen auszuschließen.
  - **Klassifizierung: Read-Only Sensordaten vs. Editierbare Redaktionsdaten:**
    1. *Kategorie A: Physische Kamera- & Sensordaten (Streng Read-Only):*
       - Belichtungszeit, Blende, ISO, Brennweite, Belichtungskorrektur, Belichtungsprogramm, Messmethode, Blitzstatus, Weißabgleich, Sensor-Dimensionen, Bittiefe, Farbraum, Kameramodell, Objektiv, Seriennummern (Body/Lens), Shutter Actuation Count.
       - Diese Parameter spiegeln die physische Aufnahme-Realität wider und werden ausschließlich rein lesend aus dem Original-EXIF dargestellt.
    2. *Kategorie B: Redaktionelle IPTC- & Metadaten (Editierbar & Vorbelegbar via Sidecar):*
       - **Fotograf / Urheber (`artist` / `creator`):** Name des Fotografen / Byline.
       - **Copyright-Hinweis (`copyright`):** Urheberrechtshinweis mit dynamischem `{year}` Token (z. B. `© {year} Name. Alle Rechte vorbehalten.`).
       - **Nutzungsbedingungen / Lizenz (`usageTerms` / `rights`):** z. B. Redaktionelle Nutzung, Creative Commons, Exklusivlizenz.
       - **Bildtitel / Headline (`title`):** Kurzer prägnanter Motivtitel.
       - **Beschreibung / Bildtext (`description` / `caption`):** Ausführliche Inhaltsbeschreibung für Agenturen/Presse.
       - **Aufnahmezeit-Korrektur (`timeShiftSeconds`):** Relativer Zeit-Offset in Sekunden zur Non-Destructive-Harmonisierung asynchroner Kamerauhren.
  - **Sprint 1: Globale Settings-Vorbelegung & Shoot-spezifische Import-Profile (Ingest-Ebene):**
    - *Globale Konfiguration in `SettingsView.tsx` (`settingsStore.ts`):*
      - **Dass & Wo:** Eigene, strukturierte Einstellungskarte *„Standard-Metadaten & Copyright“* (mit Icon `UserCheck` oder `Copyright`) in `SettingsView.tsx`, platziert zwischen den Workflow-Voreinstellungen und den GPS-Optionen.
      - **Welche Datenfelder:**
        1. **Urheber / Fotograf (`defaultArtist`):**
           - *UI:* Text-Input mit Label *„Standard-Urheber / Fotograf“*.
           - *Placeholder:* z. B. `Max Mustermann` oder `Fotostudio Mustermann`.
           - *Hilfetext:* *„Wird als IPTC Creator / Artist bei neuen Importen und als Vorbelegung im Inspector genutzt.“*
        2. **Copyright-Hinweis (`defaultCopyright`):**
           - *UI:* Text-Input mit Label *„Standard-Copyright-Hinweis“*.
           - *Placeholder:* z. B. `© {year} Max Mustermann. Alle Rechte vorbehalten.`.
           - *Token-Syntax & Token-Chips:* Unterstützt `{year}` als dynamischen Platzhalter. Unter dem Feld wird ein klickbarer Chip `[ + {year} ]` angezeigt, der das Token per Klick an der Cursor-Position einfügt.
           - *Dynamische Live-Vorschau:* Unmittelbar unter dem Eingabefeld rendert eine responsive Live-Vorschau in dezenter Textfarbe:  
             `↳ Vorschau: © 2026 Max Mustermann. Alle Rechte vorbehalten.` (aufgelöst mit aktuellem Jahr bzw. beim Import mit dem EXIF-Aufnahmejahr des Bildes).
        3. **Nutzungsbedingungen / Lizenz (`defaultUsageTerms`):**
           - *UI:* Text-Input oder mehrzeiliges Eingabefeld mit Label *„Nutzungsrechte / Lizenzbedingungen“*.
           - *Placeholder:* z. B. `Alle Rechte vorbehalten` oder `Redaktionelle Nutzung honorarpflichtig`.
        4. **Import-Standard-Toggle (`autoApplyEditorialOnImport`):**
           - *UI:* Standard-Umschalter (Toggle-Track): *„Metadaten beim Import automatisch per Sidecar zuweisen“*.
           - *Funktion:* Steuert, ob die Checkbox im Import-Wizard standardmäßig aktiv vorselektiert ist (Default: `false` / Opt-In).
      - **Wie die Speicherung erfolgt:**
        - Persistierung im `settingsStore` (`localStorage` / Tauri-Settings).
        - Abwärtskompatibel mit Fallbacks (`""` bzw. `false`), sodass bestehende Installationen sauber starten.
    - *Import-Wizard Integration (`ImportPreviewStep.tsx` / `ImportExecuteStep.tsx`):*
      - Checkbox in den Import-Optionen: *☑ „Redaktionelle Metadaten & Copyright beim Import zuweisen“*.
      - Shoot-spezifische Übersteuerung: Werte werden aus den Settings vorinitialisiert, können jedoch pro Import-Auftrag überschrieben werden (z. B. für Gast-Fotografen oder spezielle Kunden-Shootings).
      - Generiert während des Importvorgangs parallel zu den Bilddateien automatisch schlanke `.rrdata`-Sidecars (keine Modifikation der importierten Mediendateien).
  - **Sprint 2: Inspector Inline- & Batch-Editing UI (Library-Ebene):**
    - *UI-Komponente in `LibraryInspector.tsx`:*
      - Neuer einklappbarer Bereich: *„Redaktionelle Metadaten & Rechte“* (`collapsedSections.editorial`).
      - Design folgt 100% dem bewährten **GPS-Editor-Pattern**:
        - Stift-Icon (`Pencil`) schaltet den Inline-Bearbeitungsmodus frei.
        - Fallback-Kaskade: Zeigt vorrangig den Sidecar-Wert an; falls nicht vorhanden, dezent den aus dem Kamera-EXIF gelesenen Wert oder `—`.
        - Editierbare Input-Felder für *Fotograf*, *Copyright*, *Titel* und mehrzeilige Textarea für *Beschreibung*.
    - *Multi-Selection Batch-Bearbeitung (`selectedPaths.size > 1`):*
      - Prominenter Hinweis-Banner: *„Wird auf {N} ausgewählte Bilder angewendet“*.
      - Mixed-State-Handling: Besitzen die markierten Fotos unterschiedliche Werte, zeigt das Feld den Platzhalter `<verschiedene Werte>`. Wird ein Feld editiert und gespeichert, wird der neue Wert einheitlich auf alle ausgewählten Bilder angewendet.
    - *Revert / Reset auf Kamera-Original:*
      - Zurücksetzen-Button (`Undo` / `Trash2` / *„Auf Original zurücksetzen“*): Löscht den entsprechenden Override-Eintrag aus dem `.rrdata`-Sidecar. Das UI fällt augenblicklich wieder auf den unveränderten Kamera-Originalwert zurück.
  - **Sprint 3: Sidecar-Persistenz, Schema-Erweiterung & DateTimeOriginal Time-Shift:**
    - *Backend-Schema (`culling.rs` / `rapidready-core`):*
      - Erweiterung des `.rrdata`-JSON-Objekts um einen `editorial`-Block:
        ```json
        {
          "version": 1,
          "editorial": {
            "artist": "Max Mustermann",
            "copyright": "© 2026 Max Mustermann",
            "usageTerms": "Redaktionelle Nutzung honorarpflichtig",
            "title": "Alpenglühen am Matterhorn",
            "description": "Sonnenaufgang mit dramatischen Wolkenformationen"
          },
          "timeShiftSeconds": 3600
        }
        ```
      - Rust Tauri Commands: `write_editorial_sidecar(paths, editorial_data)` und `clear_editorial_override(paths, field_key)`.
    - *DateTimeOriginal Non-Destructive Time-Shift:*
      - Speichert einen vorzeichenbehafteten Offset `timeShiftSeconds: i64` im Sidecar.
      - `metadata_resolver.rs` und `date_resolver.rs` addieren den Offset dynamisch zur Anzeige und Sortierung (`effective_date = original_date + timeShiftSeconds`).
      - Inspector UI: Kleiner Time-Shift-Button (`Clock` / `History`) neben dem Aufnahmedatum mit Dialog zur relativen Zeitverschiebung (`[ + / - ] [ HH : MM : SS ]`).
      - Export-Integration: Beim Sammlungs-Export (Photobook / Web Export) wird der korrigierte Zeitstempel in das neu erzeugte Ziel-Duplikat geschrieben; die Originaldatei bleibt unberührt.
    - *Adobe XMP Synchronisation (`.xmp`):*
      - Bei aktiviertem XMP-Export / Dual-Write werden die redaktionellen Werte standardkonform in Dublin Core und Photoshop Schemas übertragen (`dc:creator`, `dc:rights`, `photoshop:Credit`, `dc:title`, `dc:description`, `exif:DateTimeOriginal`).

---

### Milestone: Library-Scoped Collections & Native RapidRAW Parity (Weg B)
- [x] **Library-Scoped Collections mit 100% RapidRAW-Synchronisation & Lifecycle-Schutzdialog (Weg B):**
  - **Problemstellung & Kontext:**
    - Sammlungen (`albums.json`) werden zentral und global in `<app_data_dir>/albums/albums.json` abgelegt und bidirektional mit RapidRAW synchronisiert.
    - Da `libraryStore` jedoch immer nur Bilder der aktuell geöffneten Library (`rootPath`) im Speicher hält, führte dies beim Wechsel der Library zu massiver Verwirrung: Sammlungen aus anderen Bibliotheken blieben in der Sidebar sichtbar (z. B. mit Zähler `(45)`), zeigten im Grid jedoch 0 Fotos (leere Ansicht).
    - Bei temporären Locations (*„Beliebigen Ordner öffnen / Durchsuchen“*) droht beim Wechsel entweder Datenmüll (verwaiste tote Sammlungen) oder unbemerkter Datenverlust investierter Kurationsarbeit.
  - **Säule 1: Volle RapidRAW-Parität & Zentraler Master-Storage:**
    - Das zentrale Dateiformat und die Datei `<app_data_dir>/albums/albums.json` bleiben erhalten.
    - Die bewährte, atomare LWW-Synchronisation mit RapidRAWs `io.github.CyberTimon.RapidRAW/albums/albums.json` bleibt unverändert und stabil: keine komplexen Multi-File-Merges, keine Formatbrüche, kein Risiko für die Interoperabilität mit RapidRAW.
  - **Säule 2: Intelligenter UI-Scope in RapidReady (Sidebar-Filterung):**
    - **Bibliotheks-Zugehörigkeit:**
      - Beim Erstellen einer Sammlung in RapidReady wird ihr optional ein `libraryRoot`-Attribut zugeordnet (abwärtskompatibel im `AlbumItem`-Schema, von RapidRAW ignoriert).
      - Alternativ/ergänzend wird die Zugehörigkeit dynamisch über die enthaltenen Bildpfade ermittelt (`path.startsWith(currentRoot)`).
    - **Strikte Filterung in der Sidebar:**
      - In der linken Sidebar werden *ausschließlich die Sammlungen angezeigt, die zur aktuell aktiven Library gehören* (oder die in der aktuellen Session leer in dieser Library erstellt wurden).
      - Sammlungen anderer Bibliotheken werden ausgeblendet.
      - **Ergebnis:** Das Problem „Zähler sagt 45, Grid zeigt 0“ ist vollständig behoben! Man klickt nie mehr auf eine leere Collection; jede sichtbare Collection zeigt verlässlich ihre Bilder im Grid.
  - **Säule 3: Schutzdialog beim Verlassen temporärer Locations (Konzept 2):**
    - Wurde ein Ordner ad-hoc als temporäre Location geöffnet (`browseTemp`) und hat die Anwenderin darin Sammlungen angelegt, erkennt RapidReady beim Verlassen (Bibliothekswechsel, Hinzufügen einer neuen Library oder Schließen): *Temporäre Location enthält kuratierte Sammlungen*.
    - Ein verbindlicher, modaler Bestätigungsdialog verhindert versehentlichen Datenverlust:
      - **Titel:** *„Sammlungen in temporärem Ordner behalten?“*
      - **Beschreibung:** *„Du hast im temporären Ordner ‚{Ordnername}‘ {N} Sammlungen angelegt. Möchtest du diesen Ordner als feste Bibliothek speichern, damit deine Sammlungen dauerhaft erhalten bleiben?“*
      - **Option 1 (`[ Als Bibliothek speichern ]`):** Befördert den temporären Ordner automatisch in die festen `locations` (`settingsStore.locations`). Die Sammlungen bleiben mit diesem Bibliotheks-Scope verknüpft und sind jederzeit über das Bibliotheks-Dropdown wieder erreichbar.
      - **Option 2 (`[ Sammlungen verwerfen ]`):** Bereinigt die angelegten Sammlungen dieses temporären Ordners aus `albums.json` (z. B. wenn sie nur für einen schnellen Einweg-Export dienten) und führt den Bibliothekswechsel durch.
      - **Option 3 (`[ Abbrechen ]`):** Bricht den Bibliothekswechsel ab und bleibt im aktuellen Arbeitszustand.

---

### Milestone: Self-Hosted Cloud & Immich Integration (RapidRAW v1.6.7 Parity)
- [ ] **Native Immich Server Integration (Remote Browsing, Culling, Direct Ingest & RapidRAW Metadata Sync):**
  - **Context & Goal:**
    Starting with **RapidRAW v1.6.7**, CyberTimon introduced native integration with self-hosted **Immich** servers (v2.5+), storing non-destructive `.rrdata` payload directly in Immich's custom asset metadata API under the key `rapidraw`. By supporting Immich in RapidReady, photographers can browse, cull, rate, and tag their self-hosted Immich libraries at 60 FPS, offload SD cards directly to Immich, and hand over selected assets to RapidRAW with 100% consistent metadata across all workstations.
  - **Core Functional Pillars:**
    1. **Secure Server Connection & Credential Sharing:**
       - Configure Immich Server URL and API Key (stored securely in the OS Keychain / Credential Manager, optionally auto-detecting existing RapidRAW Immich credentials).
       - Dedicated **Immich** section in the left library sidebar (Timeline by Year/Month, Immich Albums, Favorites, Camera/Location filters).
    2. **Zero-Download Preview Streaming & Local L1/L2 Cache Bridging:**
       - Instead of downloading multi-gigabyte RAWs over HTTP, RapidReady fetches Immich's pre-generated server thumbnails (`size=thumbnail` for Grid, `size=preview` for Loupe) via a dedicated `rr-immich://` protocol or directly feeds them into the local L1 RAM / L2 SSD `ChunkCache` keyed by `immich://<server_id>/<asset_id>`.
       - Original RAW files are only streamed/downloaded on demand when requesting 1:1 sensor pixel peeping (`Z`) or handing over to RapidRAW (`R`).
    3. **100% RapidRAW v1.6.7 Metadata & Sidecar Parity:**
       - Read and write RapidReady culling state (ratings `0–5`, picks/rejects, color labels, tags, GPS overrides) directly into Immich's asset metadata endpoint (`PUT /api/assets/{id}/metadata` under the `rapidraw` JSON key) alongside native Immich states (`rating`, `isFavorite`, `isArchived`).
       - Changes made in RapidReady are immediately visible in RapidRAW v1.6.7 and the Immich web/mobile apps without local `.rrdata` files.
    4. **Direct SD-Card-to-Immich Ingest & Collection Upload:**
       - Optional Import Step 2 destination: Upload selected photos/RAWs from SD card directly to an Immich server (and assign to an Immich album) or simultaneously to local NAS + Immich backup.
       - Collection Export destination: Export curated collections directly into an Immich Album.
  - **CTSP Guardrail:**
    - Strictly isolate remote REST/HTTP calls from the local filesystem scanner and `rr-image://` fast-path. Once an Immich thumbnail is fetched once, serve it in `< 0.5 ms` from local L1 RAM / L2 SSD `ChunkCache`.




