<div align="center">
  <img src="RapidReady-icon2r1-apple-1024.png" alt="RapidReady Logo" width="220" />
  
  <h1>RapidReady</h1>
  <p><strong>The blazingly fast companion app for RapidRaw.</strong></p>
</div>

<br/>

## ⚡ What is RapidReady?

**RapidReady** is a lightning-fast, native desktop application designed to bridge the gap between camera media and your photo editing workflow. Built specifically as the ultimate companion tool for **RapidRaw**, it handles the heavy lifting of importing, organizing, and culling massive amounts of high-resolution RAW files with zero lag.

Photographers often shoot thousands of photos on a single job. RapidReady is built to ensure you never wait for a progress bar or a rendering thumbnail when you need to review your shots.

## 🚀 Key Features (Current & Planned)

- **Blazing Fast RAW Engine:** Powered by a custom Rust backend, RapidReady extracts embedded JPEGs from CR2, CR3, ARW, and other proprietary RAW formats instantly without slow decodes.
- **Zero-Latency Culling & Viewing:** Navigate through massive folders of high-resolution RAW files in real-time. Responsive filmstrip, split folder navigation, and instant sidecar synchronization.
- **Smart Import Workflows:** Define custom *Import Presets* and *Archive Locations*. Automatically rename files, create date-based subfolders, and verify copies from SD cards to SSDs.
- **Seamless RapidRaw Integration:** Deeply integrated with [RapidRaw](https://www.getrapidraw.com/). Double-click or automatically launch imported photos directly in RapidRaw with zero friction.
- **Multilingual (i18n):** Full native support for English and German interfaces.
- **Cross-Platform Foundation:** Built on [Tauri v2](https://v2.tauri.app/), [React](https://react.dev/), and [Rust](https://www.rust-lang.org/) for native OS performance with a beautiful, modern UI.

## 🛠️ Technology Stack

- **Backend:** Rust (Tauri v2)
- **Frontend:** React 19, TypeScript, Tailwind CSS, Zustand, i18next
- **Media Decoding:** Custom Rust image & thumbnail decoders (`thumb_rs`, `exif`, `kamadak-exif`)
- **Database (Planned):** SQLite for lightning-fast Collections and Metadata querying

## 📥 Download & Installation

### Windows (x64)
1. Download the latest installer (`RapidReady_0.1.1-beta_x64-setup.exe`) from the **[Releases](https://github.com/on370/rapidready/releases)** page.
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

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes and releases.

## 📝 License
MIT License. Created by Ole N
