# RapidReady Metadata, Rights & Date Management Guide

## 1. Core Philosophy: Non-Destructive Sidecar Integrity

RapidReady is built on a strict non-destructive rule: **original camera files (RAW, JPEG, HEIC, TIFF, and video) are never modified in place.**

All ratings, flags, color labels, tags, GPS coordinates, editorial metadata, and capture date adjustments are stored exclusively in companion sidecar files alongside your media. This design provides three decisive advantages:

1. **Zero Risk of File Corruption:** Proprietary camera RAW containers and MakerNotes are never rewritten, eliminating the risk of corrupting original sensor data.
2. **Instantaneous Backup Parity:** Incremental backups (via rsync, Time Machine, Borg, or NAS snapshots) only need to transfer tiny text sidecars (a few kilobytes) when you rate, tag, or update metadata across thousands of multi-megabyte RAW files.
3. **100% Reversibility ("Date & Metadata Honesty"):** Original embedded camera EXIF values remain permanently intact inside the image file. Any manual override applied in RapidReady can be inspected alongside the original camera value and reset to the hardware original with a single click.

---

## 2. Sidecar Architecture & Interoperability (`.rrdata` and `.xmp`)

RapidReady supports three configurable sidecar operation modes in **Settings > Sidecar & RAW Developer**:

- **RapidRAW Native (`.rrdata`):** JSON-based companion sidecar (`<filename>.<ext>.rrdata`) shared natively with RapidRAW. Preserves all RapidRAW development parameters (`adjustments`, `aiPatches`, `curves`) untouched when updating metadata or culling states.
- **Standard XMP (`.xmp`):** Industry-standard Adobe XMP XML sidecar (`<stem>.xmp` or darktable's `<filename>.<ext>.xmp`). Fully interoperable with Adobe Lightroom Classic, Adobe Bridge, darktable, Capture One, ON1, and DigiKam. Preserves all third-party namespaces (`crs:*`, `darktable:*`, `lr:*`) intact.
- **Dual-Sync (`.rrdata` + `.xmp`):** Reads the newer sidecar automatically based on file modification timestamp (`mtime`) and writes changes synchronously to both `.rrdata` and `.xmp`.

### Field Mapping Reference

| Metadata Field | `.rrdata` JSON Key | Adobe XMP / IPTC Tag | Embedded EXIF Fallback (Read-Only) |
| :--- | :--- | :--- | :--- |
| **Title / Event** | `title` | `dc:title` (`rdf:Alt`) | — |
| **Description / Caption** | `description` | `dc:description` (`rdf:Alt`) | `ImageDescription` / `UserComment` |
| **Creator / Photographer** | `artist` | `dc:creator` (`rdf:Seq`) | `Artist` |
| **Copyright Notice** | `copyright` | `dc:rights` (`rdf:Alt`) | `Copyright` |
| **Usage Rights / License** | `usageTerms` | `xmpRights:UsageTerms` (`rdf:Alt`) | — |
| **Capture Date Override** | `dateOverride` | `xmp:CreateDate` / `photoshop:DateCreated` | `DateTimeOriginal` / `CreateDate` |
| **Relative Time Shift** | `timeShiftSeconds` | `rr:TimeShiftSeconds` (and adjusted `xmp:CreateDate`) | — |

---

## 3. Resolution Cascade & Visual Provenance Badges

Whenever RapidReady displays or sorts an image, it resolves metadata through a deterministic priority cascade:

1. **Sidecar Override (`.rrdata` / `.xmp`):** Highest priority. If a field is explicitly defined in the sidecar, it takes precedence.
2. **Embedded Camera EXIF / IPTC:** If no sidecar override exists for a field, RapidReady falls back to the embedded EXIF metadata inside the image file (`Artist`, `Copyright`, `ImageDescription`, `DateTimeOriginal`, `GPSLatitude`/`GPSLongitude`).
3. **Filename & Filesystem Fallback (Dates only):** If neither sidecar nor EXIF provides a capture timestamp, RapidReady attempts to extract a date pattern from the filename (e.g., `IMG_20250814_143022.jpg` or `1985-07_Scan_01.tif`) before falling back to the filesystem modification time (`mtime`).

### Inspector Provenance Indicators

In the Library Inspector (`I`), RapidReady makes the origin of every metadata value transparent:

- **`Sidecar` / `Overridden` Badge:** Indicates that the displayed value comes from a non-destructive sidecar override.
- **`EXIF` Badge:** Indicates that the value was read directly from the immutable camera file.
- **Original Camera Value Reference:** Whenever a capture date is overridden or shifted, the Inspector continues to display the immutable hardware timestamp (`Original: YYYY-MM-DD HH:MM:SS`) directly beneath the effective date.

---

## 4. Global Master Data (Settings Pre-fill)

To avoid repetitive typing on every shoot, you can configure permanent master data in **Settings > Standard Metadata & Copyright**:

- **Default Photographer / Creator (`defaultArtist`)**
- **Default Copyright Notice (`defaultCopyright`)**
- **Default Usage Terms / License (`defaultUsageTerms`)**
- **Auto-Apply on Import Toggle:** When enabled, RapidReady automatically writes your configured master data into the sidecars of newly imported files.

### Dynamic `{year}` Macro

In both **Settings** and the **Library Inspector**, the Copyright field supports the `{year}` placeholder macro (e.g., `© {year} Jane Doe Photography. All rights reserved.`).

- When applied, `{year}` resolves automatically to the **4-digit capture year** of the respective photo (taking any active Capture Date Override into account).
- If you batch-select photos from 1985, 2018, and 2026 in the Inspector and apply `© {year} Studio Name`, RapidReady groups the batch by capture year and writes `© 1985 Studio Name`, `© 2018 Studio Name`, and `© 2026 Studio Name` to the respective sidecars.

---

## 5. Safe Import Overrides (Import Step 2)

When importing scanned analog films, historical slides, or event shoots without embedded camera clocks, **Import Step 2 (Preview & Configuration)** provides a collapsible panel titled **Metadata & Capture Date for this Import**:

### 5.1 Capture Date Override for Scans & Analog Media

Enabling **Override capture date for all imported files** allows you to specify a date in flexible notation:

- **Full Date (`YYYY-MM-DD` or `YYYY-MM-DD HH:MM:SS`):** e.g., `1985-07-14`
- **Year and Month (`YYYY-MM`):** e.g., `1985-07` (automatically normalized to `1985-07-01T00:00:00`)
- **Year Only (`YYYY`):** e.g., `1985` (automatically normalized to `1985-01-01T00:00:00`)

**Immediate Directory Routing:**  
When a date-based import folder structure is active (such as `YYYY / YYYY-MM-DD`), RapidReady immediately updates the **Planned Import Structure** tree preview in Step 2 and routes the copied files directly into the target historical folder (e.g., `1985/1985-07-01/`) during import, while recording `dateOverride` in each file's sidecar.

### 5.2 Shoot-Specific Editorial Metadata

Enabling **Set shoot title / description for this import** lets you assign an event title, caption, or client-specific creator/copyright notice to all files in the current import batch. Any field left blank automatically falls back to your global Settings master data (if enabled).

### 5.3 Three-Stage Safety Architecture against Accidental Carry-Over

Assigning a manual date (such as `1985-07`) when importing a batch of scans is convenient—but forgetting to turn it off before inserting a modern camera SD card would misroute new photos into a 1985 folder. RapidReady prevents this human error through three safeguards:

1. **Automatic Reset on Source Change & App Restart:** Session-specific import overrides are never persisted across application restarts and automatically reset to **OFF** whenever you select a new source directory or memory card, and immediately after an import completes.
2. **One-Click Session Reuse ("Apply Values from Last Import"):** When digitizing multiple batches or film rolls in a single session, you do not need to retype your previous override. A quick-action button in the Step 2 metadata bar lets you re-enable the exact date and editorial values from the preceding import with a single click.
3. **High-Visibility Amber Warning Banner:** Whenever a manual date or editorial override is active in Step 2, an unmistakable amber warning banner appears directly above the **Start Import** action bar summarizing the active overrides alongside a one-click **Disable Override** button.

---

## 6. Library Inspector Editing: Single, Batch & Stacked Media

All editorial and date metadata can be edited at any time in the Library view via the right-hand **Inspector (`I`)**.

### 6.1 Editorial & Rights Card

Click the **Edit (Pencil)** icon on the **Editorial & Rights** card to edit Title, Description, Photographer, Copyright (with `[+ {year}]` macro button), and Usage Terms:

- **Multi-Selection Batch Protection:** When multiple images are selected (`Cmd/Ctrl + Click`, `Shift + Click`, or `Cmd/Ctrl + A`), RapidReady compares existing values across the selection. Fields with differing values display a `<multiple values>` placeholder with an amber border.
- **Dirty-Field Tracking:** Only fields that you actively modify during a batch edit are written to disk. Untouched fields retain their individual per-photo values across the selection.
- **Automatic `1:N` Stack Propagation:** When `RAW + JPG Stacking` (`Alt+S`) is active, edits made to a collapsed stack automatically apply to all member files (RAW and companion JPEGs) in the stack so sidecars remain in sync.

### 6.2 Capture Date Editor: Set Date vs. Time Shift (`±`)

Click the **Edit (Pencil)** icon next to **Captured** in the **File Info** card to open the dual-mode date editor:

1. **Set Date (`dateOverride`):** Assigns an explicit capture date (`YYYY-MM-DD`, `YYYY-MM`, or `YYYY`)—ideal for scanned prints, slides, WhatsApp/signal downloads, or files stripped of EXIF headers.
2. **Time Shift (`timeShiftSeconds`):** Applies a relative offset (`+` or `-` Hours, Minutes, Seconds) to each selected photo's individual capture timestamp.
   - *Use Case:* Synchronizing multiple camera bodies after a wedding or event shoot where one camera's internal clock was off by e.g. `-1h 04m 12s`, or correcting a forgotten timezone / daylight saving time change across a series of shots while preserving the exact intervals between frames.
3. **Reset to Camera Original:** Clicking **Reset** removes `dateOverride` and `timeShiftSeconds` from the sidecar, immediately restoring the original embedded camera timestamp.

---

## 7. One-Click Date Folder Relocation

If you change or reset the capture date of photos that already reside inside a date-structured archive (e.g., `YYYY/YYYY-MM-DD` or `YYYY/YYYY-MM`), RapidReady automatically detects when a photo's effective capture year/month (`YYYY-MM`) no longer matches its parent directory name.

When a mismatch is detected, the Inspector displays a **Move to matching date folder** action button:

- **Automatic Structure Detection:** RapidReady inspects your archive root to determine whether your archive uses `YYYY/YYYY-MM-DD` or `YYYY/YYYY-MM` subdirectories.
- **Atomic File & Sidecar Relocation:** Clicking the button moves the selected image files (including all stacked RAW/JPEG companions and their `.rrdata` / `.xmp` sidecars) into the target date directory, creating missing folders automatically.
- **Collision Protection:** If a file with the same name already exists in the target directory, RapidReady appends a numeric suffix (`_1`, `_2`) rather than overwriting existing media.
- **Live Catalog & Tree Synchronization:** The SQLite archive catalog (`archive_catalog.db`), virtual collections, and the left-hand Folder Tree update in place without requiring a full archive rescan.
