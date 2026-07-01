#!/usr/bin/env bash
# start.sh — Start FinKoll backend + frontend in development mode
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check for .env
if [[ ! -f "$ROOT/backend/.env" ]]; then
  echo "ERROR: backend/.env not found."
  echo "Copy backend/.env.example to backend/.env and fill in your secrets."
  exit 1
fi

echo "╔══════════════════════════════════╗"
echo "║      FinKoll — Starting…         ║"
echo "╚══════════════════════════════════╝"

# Install dependencies if node_modules is missing
if [[ ! -d "$ROOT/backend/node_modules" ]]; then
  echo "[install] Backend dependencies…"
  npm install --prefix "$ROOT/backend"
fi
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "[install] Frontend dependencies…"
  npm install --prefix "$ROOT/frontend"
fi

# Start backend in background
echo "[backend]  Starting on http://localhost:3001"
npm run dev --prefix "$ROOT/backend" &
BACKEND_PID=$!

# Start frontend in foreground (Vite outputs the URL)
echo "[frontend] Starting on http://localhost:5173"
npm run dev --prefix "$ROOT/frontend" &
FRONTEND_PID=$!

# Trap Ctrl-C → kill both
trap "echo; echo 'Stopping…'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

echo
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo
echo "Press Ctrl-C to stop."
wait
