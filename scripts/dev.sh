#!/usr/bin/env bash
# ==============================================================================
# RapidReady - macOS & Linux Development Launcher
#
# Purpose:
#   Launches RapidReady in local development mode on macOS or Linux.
#
# Explanation:
#   1. Validates presence of Node.js (node/npm) and Rust (cargo).
#   2. Installs dependencies (npm install) if node_modules is missing.
#   3. Starts the Vite dev server and native Tauri desktop window with HMR.
#
# Usage:
#   From terminal:
#     ./scripts/dev.sh
#   Or from anywhere within repository:
#     bash scripts/dev.sh
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
elif [ -x "/opt/homebrew/bin/mise" ]; then
  MISE_BIN="/opt/homebrew/bin/mise"
elif [ -x "$HOME/.cargo/bin/mise" ]; then
  MISE_BIN="$HOME/.cargo/bin/mise"
fi

if [ -n "$MISE_BIN" ]; then
  # Load environment for this directory (activates Node & Rust from mise.toml)
  eval "$("$MISE_BIN" env -s bash 2>/dev/null || true)"
fi

echo "⚡ [RapidReady] Checking development environment..."

command -v node >/dev/null 2>&1 || {
  echo "❌ [ERROR] Node.js is not installed or not in PATH."
  if [ -n "$MISE_BIN" ]; then
    echo "    (mise was found at $MISE_BIN, but 'node' is not active. Run: mise install)"
  else
    echo "    Please install Node.js LTS from https://nodejs.org/ or mise from https://mise.jdx.dev/"
  fi
  exit 1
}

command -v cargo >/dev/null 2>&1 || {
  echo "❌ [ERROR] Rust (cargo) is not installed or not in PATH."
  if [ -n "$MISE_BIN" ]; then
    echo "    (mise was found at $MISE_BIN, but 'cargo' is not active. Run: mise install)"
  else
    echo "    Please install Rust from https://rustup.rs/ or mise from https://mise.jdx.dev/"
  fi
  exit 1
}

if [ ! -d "node_modules" ]; then
  echo "📦 [RapidReady] Installing npm dependencies..."
  npm install
fi

echo "🚀 [RapidReady] Starting Vite dev server and Tauri application..."
npm run tauri dev
