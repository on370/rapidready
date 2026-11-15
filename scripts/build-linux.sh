#!/usr/bin/env bash
# ==============================================================================
# RapidReady - Linux Release Builder
#
# Purpose:
#   Compiles release binaries and bundles the production Linux packages
#   (.AppImage, .deb, .rpm).
#
# Explanation:
#   1. Runs 'npm run build' which automatically increments the hexadecimal build
#      number (via bump-build.js), compiles TypeScript (tsc), and bundles assets (Vite).
#   2. Invokes 'npm run tauri build' to compile native Rust crates in release mode.
#   3. Packages the release binary into:
#      src-tauri/target/release/bundle/appimage/RapidReady_<version>_<arch>.AppImage
#      src-tauri/target/release/bundle/deb/RapidReady_<version>_<arch>.deb
#      src-tauri/target/release/bundle/rpm/RapidReady-<version>-1.<arch>.rpm
#
# Usage:
#   From terminal:
#     ./scripts/build-linux.sh                    # all Linux packages
#     ./scripts/build-linux.sh --no-bump          # keep current build number
#     ./scripts/build-linux.sh --bundles appimage # only selected package types
#                                                 # (comma-separated: appimage,deb,rpm)
#
# Notes:
#   NO_STRIP=true is exported by default: linuxdeploy ships an old 'strip' that
#   fails on libraries built by current toolchains (".relr.dyn" sections, e.g.
#   Arch, CachyOS, Fedora 40+), which aborts AppImage bundling. Override with
#   NO_STRIP=false if your distribution's libraries are compatible.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

# ------------------------------------------------------------------------------
# Toolchain Auto-Detection (mise / local / global)
# ------------------------------------------------------------------------------
MISE_BIN=""
if command -v mise >/dev/null 2>&1; then
  MISE_BIN="$(command -v mise)"
elif [ -x "$HOME/.local/bin/mise" ]; then
  MISE_BIN="$HOME/.local/bin/mise"
elif [ -x "$HOME/.cargo/bin/mise" ]; then
  MISE_BIN="$HOME/.cargo/bin/mise"
fi

if [ -n "$MISE_BIN" ]; then
  # Load environment for this directory (activates Node & Rust from mise.toml)
  eval "$("$MISE_BIN" env -s bash 2>/dev/null || true)"
fi

# ------------------------------------------------------------------------------
# Arguments
# ------------------------------------------------------------------------------
BUNDLES="appimage,deb,rpm"
while [ $# -gt 0 ]; do
  case "$1" in
    --no-bump)
      export NO_BUMP=1
      ;;
    --bundles)
      shift
      BUNDLES="$1"
      ;;
    --bundles=*)
      BUNDLES="${1#--bundles=}"
      ;;
    --help|-h)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "❌ [ERROR] Unknown option: $1 (see --help)"
      exit 1
      ;;
  esac
  shift
done

export NO_STRIP="${NO_STRIP:-true}"

echo "🔨 [RapidReady] Building production release and Linux packages (${BUNDLES})..."

command -v node >/dev/null 2>&1 || {
  echo "❌ [ERROR] Node.js is required to build RapidReady."
  if [ -n "$MISE_BIN" ]; then
    echo "    (mise was found at $MISE_BIN, but 'node' is not active. Run: mise install)"
  else
    echo "    Please install Node.js (https://nodejs.org/) or mise (https://mise.jdx.dev/)."
  fi
  exit 1
}

command -v cargo >/dev/null 2>&1 || {
  echo "❌ [ERROR] Rust (cargo) is required to compile RapidReady."
  if [ -n "$MISE_BIN" ]; then
    echo "    (mise was found at $MISE_BIN, but 'cargo' is not active. Run: mise install)"
  else
    echo "    Please install Rust (https://rustup.rs/) or mise (https://mise.jdx.dev/)."
  fi
  exit 1
}

if command -v pkg-config >/dev/null 2>&1; then
  if ! pkg-config --exists webkit2gtk-4.1 gtk+-3.0; then
    echo "❌ [ERROR] WebKitGTK 4.1 / GTK 3 development files not found."
    echo "    See docs/PLATFORM_LINUX.md for the packages to install on your distribution."
    exit 1
  fi
fi

if [ ! -d "node_modules" ]; then
  echo "📦 [RapidReady] Installing npm dependencies..."
  npm install
fi

npm run tauri build -- --bundles "${BUNDLES}"

echo ""
echo "🎉 [SUCCESS] Linux packages successfully built!"
echo "Check in: src-tauri/target/release/bundle/"
