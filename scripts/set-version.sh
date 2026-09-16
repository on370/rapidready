#!/usr/bin/env bash
# ==============================================================================
# RapidReady - Multi-File Version Bumper Launcher
#
# Usage:
#   ./scripts/set-version.sh <version>
#   Example:
#     ./scripts/set-version.sh 0.3.7-beta
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

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
  eval "$("$MISE_BIN" env -s bash 2>/dev/null || true)"
fi

command -v node >/dev/null 2>&1 || {
  echo "❌ [ERROR] Node.js is required to set version."
  exit 1
}

node scripts/set-version.js "$@"
