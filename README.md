<div align="center">
  <img src="RapidReady-icon2r1-apple-1024.png" alt="RapidReady Logo" width="220" />
  
  <h1>RapidReady</h1>
  <p><strong>The blazingly fast companion app for RapidRAW and other RAW developers.</strong></p>
</div>

<br/>

## ⚡ What is RapidReady?

**RapidReady** is a lightning-fast, native desktop application designed to bridge the gap between camera media and your photo editing workflow. Built as the ultimate ingest and culling companion for **RapidRAW** (and designed to integrate seamlessly with other RAW developers via universal sidecars), it handles the heavy lifting of importing, organizing, and rating massive amounts of high-resolution RAW files with zero lag.

Even if you aren't heading into full RAW development right away, RapidReady is a complete, standalone high-speed tool in its own right: whether you're backing up memory cards, performing a lightning-fast cull across thousands of shots, or simply browsing massive photo archives without ever waiting for a rendering progress bar.

## 🚀 Key Features (Current & Planned)

- **Blazing Fast RAW Engine:** Powered by a custom Rust backend, RapidReady extracts embedded JPEGs from CR2, CR3, ARW, and other proprietary RAW formats instantly without slow decodes.
- **Zero-Latency Culling & Viewing:** Navigate through massive folders of high-resolution RAW files in real-time. Responsive filmstrip, split folder navigation, and instant sidecar synchronization.
- **Advanced Culling & Organization:** One-touch flags (`Pick`, `Reject`, `Unflag`), star ratings (`1`-`5`), 5 color labels (`6`-`9`), and tag management with live autocomplete.
- **GPS Geotagging & Location Inspection:** Fault-tolerant coordinate and map link parser (Google Maps, Apple Maps, OpenStreetMap, Geo URIs, photographic DMS, DMM, and European comma notation), live validation preview, non-destructive `.rrdata` sidecar overrides, batch assignment across multiple photos, altitude display, and 1-click external map navigation.
- **Multi-Level Orthogonal Filtering:** Modular filter dropdowns to slice archives by picks, minimum rating, color labels, and tags in real-time.
- **Smart Import Workflows:** Define custom *Import Presets* and *Archive Locations*. Automatically rename files, create date-based subfolders, and verify copies from SD cards to SSDs.
- **Seamless RapidRaw Integration:** Deeply integrated with [RapidRaw](https://www.getrapidraw.com/). Open images directly in RapidRaw (`R`) or reveal them in the system file manager (`Cmd+Shift+F` / `Ctrl+Shift+F`).
- **Multilingual (i18n):** Full native support for English and German interfaces.
- **Cross-Platform Foundation:** Built on [Tauri v2](https://v2.tauri.app/), [React](https://react.dev/), and [Rust](https://www.rust-lang.org/) for native OS performance with a beautiful, modern UI.

## 📸 Supported Formats & Media

RapidReady is engineered for professional camera workflows, high-speed SD card ingestion, and massive photo archives:

### Currently Supported Formats
- **RAW Camera Formats:** Canon (`.cr2`, `.cr3`), Sony (`.arw`), Nikon (`.nef`, `.nrw`), Adobe/Leica/Ricoh (`.dng`), Fujifilm (`.raf`), Olympus/OM System (`.orf`), Panasonic Lumix (`.rw2`), Pentax (`.pef`), Hasselblad (`.3fr`), Sigma (`.x3f`).
- **Raster & Next-Gen Formats:** JPEG (`.jpg`, `.jpeg`), HEIF/HEIC (`.heic`, `.heif`, `.hif` with RAW+HIF pairing support), WebP (`.webp`), AVIF (`.avif`), PNG (`.png`), TIFF (`.tif`, `.tiff`).
- **Video Import (Basic Ingestion):** `.mp4`, `.mov`, `.m4v`, `.avi`.

> [!TIP]
> **Roadmap & Upcoming Media Support:**  
> A dedicated **native video pipeline** (embedded playback with scrubber, AVCHD `.mts`/`.m2ts`, Canon Cinema RAW `.crm`, Nikon N-RAW `.nev`, runtime badges, and streaming via HTTP range requests) as well as **vintage and specialized RAW formats** (Leica `.rwl`, Hasselblad Studio `.fff`, Phase One `.iiq`, Canon `.crw`) and JPEG XL (`.jxl`) are actively planned on our [Technical Roadmap](docs/ROADMAP.md). 

### 🍏 Working with Apple Photos Libraries (macOS)

RapidReady operates directly on open filesystem directories, external SSDs, SD cards, and NAS shares with zero proprietary database lock-in. Because macOS Photos libraries (`.photoslibrary`) are sealed system packages (and often store full-resolution RAWs in iCloud rather than on local disk), direct in-place browsing is intentionally bypassed to safeguard library integrity.

To cull and organize images managed by Apple Photos:
1. In the macOS **Photos** app, select the desired photos or RAW files.
2. Choose **File → Export → Export Unmodified Original...** (`Shift + Cmd + E`) and select a destination folder.
3. Open or import that folder in **RapidReady** for instant, zero-latency culling, rating, and sidecar synchronization.

## 🛠️ Technology Stack

- **Backend:** Rust (Tauri v2)
- **Frontend:** React 19, TypeScript, Tailwind CSS, Zustand, i18next
- **Media Decoding:** Custom Rust image & thumbnail decoders (`thumb_rs`, `exif`, `kamadak-exif`)
- **Database (Planned):** SQLite for lightning-fast Collections and Metadata querying

## 📥 Download & Installation

### Windows (x64)
1. Download the latest installer (`RapidReady_0.3.0-beta_x64-setup.exe`) from the **[Releases](https://github.com/on370/rapidready/releases)** page.
2. Run the setup file to install RapidReady for your current user (no admin privileges required).
3. Launch **RapidReady** from your Start Menu or Desktop shortcut.

> [!NOTE]
> **Windows SmartScreen Note:**  
> As RapidReady is an open-source project without an expensive commercial code-signing certificate, Windows SmartScreen may show a prompt (*"Windows protected your PC"*). Click **More info** and then **Run anyway** to proceed with installation.

### macOS
1. Download the latest `.dmg` installer from the **[Releases](https://github.com/on370/rapidready/releases)** page.
2. Open the `.dmg` file and drag **RapidReady** into your **Applications** folder.

> [!NOTE]
> **macOS Gatekeeper Note:**  
> Since RapidReady is an open-source project without a paid Apple Developer certificate, macOS may show a warning when opening the app for the first time (*"RapidReady cannot be opened because it is from an unidentified developer"*).
>
> To resolve this, simply run this command once in your Terminal to remove the quarantine flag:
> ```bash
> xattr -cr /Applications/RapidReady.app
> ```
> *Alternatively: Right-click (or Control-click) `RapidReady.app` in your Applications folder, select **Open**, and click **Open** in the dialog.*

## 💻 Development & Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ or v20+)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- **Windows additional requirement:**
  - [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (e.g. Visual Studio 2022 Community with "Desktop development with C++")
  - [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (pre-installed on Windows 10/11)

### Development

1. Clone the repository:
   ```bash
   git clone https://github.com/on370/rapidready.git
   cd rapidready
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server (starts Vite dev server and native Tauri window):
   ```bash
   npm run tauri dev
   ```

### Building Release Installers

To build the production binary and release installer for your current platform:
```bash
npm run tauri build
```
- **On Windows:** Produces an NSIS installer: `src-tauri/target/release/bundle/nsis/RapidReady_<version>_x64-setup.exe`
- **On macOS:** Produces a `.dmg` disk image: `src-tauri/target/release/bundle/dmg/RapidReady_<version>_<arch>.dmg`

## 🤝 Contributing

Contributions, feature requests, and bug reports are warmly welcome! Please check out our [Contributing Guide](CONTRIBUTING.md) and [Architecture Documentation](docs/ARCHITECTURE.md) to get started with setup and development guidelines.

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes and releases.

## 📬 Contact

- **Website:** [https://rapidready.de/](https://rapidready.de/)

## 📝 License
MIT License. Created by Ole N
