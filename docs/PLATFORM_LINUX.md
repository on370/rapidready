# RapidReady — Linux Platform & Build Guide

> **Target Platform:** Linux x86_64 / arm64 (Debian/Ubuntu, Fedora, Arch)  
> **Packaging:** Debian package (`.deb`), Universal AppImage (`.AppImage`), RPM package (`.rpm`)

---

## 1. Prerequisites & System Libraries

On Debian/Ubuntu-based distributions, install the required system libraries for Tauri v2 and WebKitGTK:

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

Ensure Node.js and Rust are installed:
```bash
# Node.js (via NodeSource or nvm)
node -v && npm -v

# Rust (via rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustc --version && cargo --version
```

---

## 2. Quick Start & Development

We provide a convenient 1-click script in the [`scripts/`](../scripts/) folder:

```bash
./scripts/dev.sh
```

Or manually:
```bash
npm install
npm run tauri dev
```

---

## 3. Building Production Linux Packages

To build production binaries and generate packages (`.deb`, `.AppImage`):

```bash
npm run tauri build
```

Generated packages are located at:
- **Debian/Ubuntu:** `src-tauri/target/release/bundle/deb/rapid-ready_<version>_amd64.deb`
- **Universal AppImage:** `src-tauri/target/release/bundle/appimage/RapidReady_<version>_amd64.AppImage`

To install or test the AppImage:
```bash
chmod +x src-tauri/target/release/bundle/appimage/RapidReady_*_amd64.AppImage
./src-tauri/target/release/bundle/appimage/RapidReady_*_amd64.AppImage
```
