# RapidReady — Linux Platform & Build Guide

> **Target Platform:** Linux x86_64 / arm64 (Debian/Ubuntu, Fedora, Arch)  
> **Packaging:** Debian package (`.deb`), Universal AppImage (`.AppImage`), RPM package (`.rpm`)

---

## 1. Prerequisites & System Libraries

On Debian/Ubuntu-based distributions, install the required system libraries for Tauri v2 and WebKitGTK:

**Debian / Ubuntu**
```bash
sudo apt update
sudo apt install -y \
  build-essential curl wget file \
  libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev
```

**Fedora**
```bash
sudo dnf install -y \
  webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel
sudo dnf group install -y "c-development"
```

**Arch / Manjaro / CachyOS**
```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg
```

Then install Node.js and Rust (either via your distribution, `rustup`, or `mise install` using the repository's `mise.toml`):
```bash
node -v && npm -v
rustc --version && cargo --version
```

---

## 2. Quick Start & Development

```bash
./scripts/dev.sh
```

Or manually:
```bash
npm install
npm run tauri dev
```

Running the Rust unit tests:
```bash
cd src-tauri
cargo test -p rapidready-core
```

---

## 3. Building Production Linux Packages

```bash
./scripts/build-linux.sh                     # AppImage + .deb + .rpm
./scripts/build-linux.sh --no-bump           # keep the current build number
./scripts/build-linux.sh --bundles appimage  # only selected package types
```

Generated packages:
- **AppImage:** `src-tauri/target/release/bundle/appimage/RapidReady_<version>_amd64.AppImage`
- **Debian/Ubuntu:** `src-tauri/target/release/bundle/deb/RapidReady_<version>_amd64.deb`
- **Fedora/openSUSE:** `src-tauri/target/release/bundle/rpm/RapidReady-<version>-1.x86_64.rpm`

### `NO_STRIP` and the AppImage bundler
The AppImage is produced by `linuxdeploy`, which ships an old `strip` binary. On distributions whose libraries use newer ELF features (Arch, CachyOS, Fedora 40+, ...), it fails with
`unknown type [0x13] section '.relr.dyn'` and bundling aborts.
`build-linux.sh` therefore exports `NO_STRIP=true` by default (override with `NO_STRIP=false`). If you call `npm run tauri build` directly, set it yourself:
```bash
NO_STRIP=true npm run tauri build -- --bundles appimage
```

For maximum compatibility of the AppImage across distributions, build it on the **oldest** distribution you want to support (e.g. Ubuntu 22.04), since it bundles the build host's libraries.

---

## 4. Linux Behaviour & Known Limitations

1. **Reveal in file manager:** "Show in Explorer/Finder" uses the freedesktop `org.freedesktop.FileManager1.ShowItems` D-Bus call (Nautilus, Dolphin, Nemo, Caja, Thunar, ...). If no file manager provides it, the parent folder is opened with `xdg-open` instead.
2. **SD card detection:** A mount is offered as a quick-select card if it has a `DCIM` folder and is either flagged removable by the kernel or mounted under `/run/media`, `/media` or `/mnt` (many USB card readers do not report themselves as removable).
3. **Case-sensitive paths:** Unlike macOS/Windows, path comparisons are case-sensitive on Linux.
4. **Thumbnails:** RAW (embedded previews), JPEG, PNG, WebP and TIFF thumbnails are produced in pure Rust. Linux has no OS thumbnail service equivalent to macOS QuickLook / Windows Shell, so HEIC/HEIF/HIF/AVIF stills and video poster frames use **optional external tools** (see [`thumbnail/external_decoder.rs`](../src-tauri/crates/rapidready-core/src/thumbnail/external_decoder.rs)):
   - **HEIC/HEIF/HIF/AVIF:** `heif-dec` (or `heif-convert` on libheif < 1.17), falling back to `ffmpeg`. `--auto-correct` is used when supported to fix washed-out Sony HIF colours.
   - **Video (MP4, MOV, MTS, MKV, ...):** `ffmpeg`, frame at 1 s (first frame for shorter clips).

   Install them with your package manager, e.g. `sudo apt install libheif-examples ffmpeg`, `sudo dnf install libheif-tools ffmpeg-free`, or `sudo pacman -S libheif ffmpeg`. Without them these files simply show the placeholder tile. Decoding runs with a hard timeout (10 s stills / 15 s video), at most 2 processes in parallel, and failed files are not retried until they change. Results are stored in the normal thumbnail cache, so each file is decoded once.

   Downscaling large embedded previews uses the `image` crate (~150 ms per 24 MP preview, same as Windows; see ROADMAP).
5. **WebKitGTK rendering:** On some NVIDIA / Wayland setups the window can stay blank. Start with
   `WEBKIT_DISABLE_DMABUF_RENDERER=1` (or `WEBKIT_DISABLE_COMPOSITING_MODE=1`) as a workaround.
6. **Network share (NAS) detection:** Remote mounts are recognised from `/proc/self/mountinfo` (see [`metadata_resolver/linux_mounts.rs`](../src-tauri/crates/rapidready-core/src/metadata_resolver/linux_mounts.rs)): kernel network filesystems (`cifs`/SMB2/3, `nfs`/`nfs4`, `ceph`, ...) and FUSE network mounts such as GNOME's gvfs (`/run/user/<uid>/gvfs/...`), KDE's kio-fuse, `sshfs` and `rclone`. Local FUSE filesystems (e.g. ntfs-3g external drives) stay local. Symlinks into a share are resolved first. Remote paths get the permanent-deletion warning (a share has no usable desktop trash), fewer parallel thumbnail workers and header-only date discovery. If `/proc` is unavailable, `statfs` magic numbers are used as a fallback. To see how a path is classified, run `findmnt -T /path/to/folder`.
7. **App data location:** `~/.local/share/io.github.on370.rapidready/` (catalog, collections) and `~/.cache/io.github.on370.rapidready/` (thumbnail chunk cache), following `$XDG_DATA_HOME` / `$XDG_CACHE_HOME`.
