#!/usr/bin/env bash
# ==============================================================================
# RapidReady - macOS & Linux Workspace Cleaner
#
# Purpose:
#   Cleans build artifacts, compiler caches, and temporary files to reclaim
#   disk space (typically frees 15–25+ GB from src-tauri/target).
#
# Explanation:
#   1. Deletes Cargo target directory (src-tauri/target) containing intermediate
#      compilation objects (.o, .rlib, .rmeta) and test executables.
#   2. Deletes Vite dev cache (node_modules/.vite) and compiled frontend (dist/).
#   3. Cleans OS metadata (.DS_Store, Thumbs.db) and stale temporary files.
#   4. With --deep or --all: additionally removes node_modules for a fresh install.
#
# Usage:
#   Standard clean:
#     ./scripts/clean.sh
#   Deep clean (including node_modules):
#     ./scripts/clean.sh --deep
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

DEEP_CLEAN=0
for arg in "$@"; do
  case "$arg" in
    --deep|--all|-d|-a)
      DEEP_CLEAN=1
      ;;
    --help|-h)
      echo "Usage: ./scripts/clean.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --deep, --all   Also remove node_modules for a full fresh install"
      echo "  --help, -h      Show this help message"
      exit 0
      ;;
  esac
done

echo "🧹 [RapidReady] Cleaning workspace..."

# Measure target size before cleanup if it exists
TARGET_DIR="src-tauri/target"
if [ -d "$TARGET_DIR" ]; then
  PRE_SIZE="$(du -sh "$TARGET_DIR" 2>/dev/null | cut -f1)"
  echo "📦 Found Cargo target cache: ${PRE_SIZE} in ${TARGET_DIR}"
  echo "   Deleting ${TARGET_DIR}..."
  rm -rf "$TARGET_DIR"
fi

# Clean frontend build artifacts
if [ -d "dist" ]; then
  echo "   Deleting dist/..."
  rm -rf "dist"
fi

# Clean Vite cache
if [ -d "node_modules/.vite" ]; then
  echo "   Deleting node_modules/.vite/..."
  rm -rf "node_modules/.vite"
fi

if [ -d "node_modules/.vite-temp" ]; then
  echo "   Deleting node_modules/.vite-temp/..."
  rm -rf "node_modules/.vite-temp"
fi

# Deep clean: remove node_modules
if [ "$DEEP_CLEAN" -eq 1 ]; then
  if [ -d "node_modules" ]; then
    echo "📦 [DEEP] Deleting node_modules/..."
    rm -rf "node_modules"
  fi
fi

# Clean OS and temporary clutter in project tree
echo "   Cleaning temporary files and OS metadata (.DS_Store, Thumbs.db)..."
find . -maxdepth 3 -type f \( -name ".DS_Store" -o -name "Thumbs.db" -o -name "*.tmp" \) -delete 2>/dev/null || true

echo ""
if [ -n "$PRE_SIZE" ]; then
  echo "🎉 [SUCCESS] Workspace cleaned! Reclaimed ~${PRE_SIZE} of disk space."
else
  echo "🎉 [SUCCESS] Workspace cleaned!"
fi

if [ "$DEEP_CLEAN" -eq 1 ]; then
  echo "👉 Next step: Run 'npm install' or './scripts/dev.sh' to re-initialize dependencies."
else
  echo "👉 Next step: Run './scripts/dev.sh' to start development or './scripts/build-dmg.sh' to build."
fi
