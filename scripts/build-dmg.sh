#!/usr/bin/env bash
# ==============================================================================
# RapidReady - macOS DMG Release Builder
#
# Purpose:
#   Compiles release binaries and bundles the production macOS disk image (.dmg).
#
# Explanation:
#   1. Runs 'npm run build' which automatically increments the hexadecimal build
#      number (via bump-build.js), compiles TypeScript (tsc), and bundles assets (Vite).
#   2. Invokes 'npm run tauri build' to compile native Rust crates in release mode.
#   3. Generates the standalone macOS .app bundle and packages it into:
#      src-tauri/target/release/bundle/dmg/RapidReady_<version>_<arch>.dmg
#
# Usage:
#   From terminal:
#     ./scripts/build-dmg.sh
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

if [[ "$*" == *"--no-bump"* ]]; then
  export NO_BUMP=1
fi

echo "🔨 [RapidReady] Building production release and macOS DMG..."

command -v node >/dev/null 2>&1 || {
  echo "❌ [ERROR] Node.js is required to build RapidReady."
  exit 1
}

command -v cargo >/dev/null 2>&1 || {
  echo "❌ [ERROR] Rust (cargo) is required to compile RapidReady."
  exit 1
}

npm run tauri build

echo ""
echo "🎉 [SUCCESS] macOS DMG successfully built!"
echo "Check in: src-tauri/target/release/bundle/dmg/"
