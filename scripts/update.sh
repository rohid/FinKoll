#!/usr/bin/env bash
# update.sh — Pull latest changes, reinstall dependencies, restart.
#
# Usage:
#   ./scripts/update.sh           # pull + install only (you restart manually)
#   ./scripts/update.sh --restart # pull + install + restart via start.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RESTART=false

for arg in "$@"; do
  [[ "$arg" == "--restart" ]] && RESTART=true
done

echo "╔══════════════════════════════════╗"
echo "║      FinKoll — Updating…         ║"
echo "╚══════════════════════════════════╝"

# Pull latest from git
echo "[git] Pulling latest changes…"
git -C "$ROOT" pull --rebase

# Install / update backend dependencies
echo "[npm] Installing backend dependencies…"
npm install --prefix "$ROOT/backend"

# Install / update frontend dependencies
echo "[npm] Installing frontend dependencies…"
npm install --prefix "$ROOT/frontend"

# Show new version
BACKEND_VER=$(node -p "require('$ROOT/backend/package.json').version" 2>/dev/null || echo "?")
FRONTEND_VER=$(node -p "require('$ROOT/frontend/package.json').version" 2>/dev/null || echo "?")
echo
echo "✓ Update complete — backend v${BACKEND_VER} / frontend v${FRONTEND_VER}"
echo

if $RESTART; then
  echo "[restart] Starting FinKoll…"
  exec "$SCRIPT_DIR/start.sh"
fi

echo "Run './scripts/start.sh' to start the app."
