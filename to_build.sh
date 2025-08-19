#!/usr/bin/env bash
set -euo pipefail

# Build helper for BrightPal desktop app (Tauri)
# Usage:
#   ./to_build.sh mac         # build macOS Universal DMG (on macOS)
#   ./to_build.sh mac-arm     # build macOS ARM64 DMG only (on macOS/Apple Silicon)
#   ./to_build.sh win-x64     # build Windows x64 NSIS installer (on Windows)
#   ./to_build.sh win-arm64   # build Windows ARM64 NSIS installer (on Windows)
#   ./to_build.sh all         # build for current OS and print instructions for the other

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
APP_DIR="$ROOT_DIR/apps/brightpal-app"

command_exists() { command -v "$1" >/dev/null 2>&1; }

print_step() { printf "\n=== %s ===\n" "$1"; }

ensure_prereqs_common() {
  if ! command_exists node; then echo "Node.js is required" >&2; exit 1; fi
  if ! command_exists pnpm; then
    echo "pnpm not found. You can enable via: corepack enable && corepack prepare pnpm@latest --activate" >&2
    exit 1
  fi
  if ! command_exists rustup; then echo "rustup (Rust toolchain) is required: https://rustup.rs" >&2; exit 1; fi
}

ensure_prereqs_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then echo "This target must run on macOS" >&2; exit 1; fi
  if ! xcode-select -p >/dev/null 2>&1; then echo "Install Xcode Command Line Tools: xcode-select --install" >&2; exit 1; fi
}

ensure_prereqs_windows() {
  case "${OS:-}" in *Windows*|*MINGW*|*MSYS*|*CYGWIN*) ;; *) echo "This target must run on Windows" >&2; exit 1;; esac
  if ! command_exists cargo; then echo "Rust (cargo) is required on Windows (MSVC toolchain)" >&2; exit 1; fi
}

prep_workspace() {
  print_step "Installing workspace dependencies"
  cd "$ROOT_DIR"
  pnpm install
}

build_macos() {
  ensure_prereqs_common
  ensure_prereqs_macos
  prep_workspace
  print_step "Building macOS Universal DMG"
  # Increase Node.js memory for Next.js build phase
  export NODE_OPTIONS="--max-old-space-size=6144"
  export NEXT_TELEMETRY_DISABLED=1
  echo "Using NODE_OPTIONS=$NODE_OPTIONS"
  pnpm -C "$APP_DIR" run setup-pdfjs || true
  pnpm -C "$APP_DIR" run build-macos-universial
  OUT1="$ROOT_DIR/target/universal-apple-darwin/release/bundle/"
  OUT2="$APP_DIR/src-tauri/target/universal-apple-darwin/release/bundle/"
  echo "\nOutput (DMG/App) likely under:"
  [[ -d "$OUT1" ]] && echo "  $OUT1"
  [[ -d "$OUT2" ]] && echo "  $OUT2"
}

build_macos_arm() {
  ensure_prereqs_common
  ensure_prereqs_macos
  prep_workspace
  print_step "Building macOS ARM64 DMG (aarch64-apple-darwin)"
  export NODE_OPTIONS="--max-old-space-size=6144"
  export NEXT_TELEMETRY_DISABLED=1
  echo "Using NODE_OPTIONS=$NODE_OPTIONS"
  pnpm -C "$APP_DIR" run setup-pdfjs || true
  pnpm -C "$APP_DIR" exec dotenv -e .env.tauri.local -e .env.apple-nonstore.local -- tauri build --target aarch64-apple-darwin --bundles dmg
  printf "\nOutput (DMG/App) will be under:\n  %s\n" "$APP_DIR/src-tauri/target/aarch64-apple-darwin/release/bundle/"
}

build_win_x64() {
  ensure_prereqs_common
  ensure_prereqs_windows
  prep_workspace
  print_step "Building Windows x64 NSIS installer"
  export NODE_OPTIONS="--max-old-space-size=6144"
  export NEXT_TELEMETRY_DISABLED=1
  echo "Using NODE_OPTIONS=$NODE_OPTIONS"
  pnpm -C "$APP_DIR" run setup-pdfjs || true
  pnpm -C "$APP_DIR" run build-win-x64
  OUT1="$ROOT_DIR/target/i686-pc-windows-msvc/release/bundle/"
  OUT2="$APP_DIR/src-tauri/target/i686-pc-windows-msvc/release/bundle/"
  echo "\nOutput (NSIS .exe) likely under:"
  [[ -d "$OUT1" ]] && echo "  $OUT1"
  [[ -d "$OUT2" ]] && echo "  $OUT2"
}

build_win_arm64() {
  ensure_prereqs_common
  ensure_prereqs_windows
  prep_workspace
  print_step "Building Windows ARM64 NSIS installer"
  export NODE_OPTIONS="--max-old-space-size=6144"
  export NEXT_TELEMETRY_DISABLED=1
  echo "Using NODE_OPTIONS=$NODE_OPTIONS"
  pnpm -C "$APP_DIR" run setup-pdfjs || true
  pnpm -C "$APP_DIR" run build-win-arm64
  OUT1="$ROOT_DIR/target/aarch64-pc-windows-msvc/release/bundle/"
  OUT2="$APP_DIR/src-tauri/target/aarch64-pc-windows-msvc/release/bundle/"
  echo "\nOutput (NSIS .exe) likely under:"
  [[ -d "$OUT1" ]] && echo "  $OUT1"
  [[ -d "$OUT2" ]] && echo "  $OUT2"
}

print_windows_notes() {
  cat <<'EOF'

Notes for Windows builds:
- Prereqs: Visual Studio Build Tools (with C++ workload), Rust MSVC toolchain, Node.js, pnpm.
- WebView2 Evergreen runtime must be installed on target machines (usually preinstalled on Windows 10/11).
- Run the Windows build on a Windows machine or CI runner. Cross-compiling from macOS is not supported.
EOF
}

case "${1:-}" in
  mac)
    build_macos
    ;;
  mac-arm)
    build_macos_arm
    ;;
  win-x64)
    build_win_x64
    ;;
  win-arm64)
    build_win_arm64
    ;;
  all)
    if [[ "$(uname -s)" == "Darwin" ]]; then
      build_macos
      print_windows_notes
    else
      case "${OS:-}" in *Windows*|*MINGW*|*MSYS*|*CYGWIN*) build_win_x64; build_win_arm64 ;; *) echo "Unsupported OS for 'all'" >&2; exit 1 ;; esac
    fi
    ;;
  *)
    cat <<EOF
Usage:
  $0 mac         # build macOS Universal DMG (on macOS)
  $0 mac-arm     # build macOS ARM64 DMG only (on macOS/Apple Silicon)
  $0 win-x64     # build Windows x64 NSIS installer (on Windows)
  $0 win-arm64   # build Windows ARM64 NSIS installer (on Windows)
  $0 all         # build for current OS and print instructions for the other
EOF
    exit 1
    ;;
esac


