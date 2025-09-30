#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/dev_restart.sh [PORT]
# Kills anything on the port (default 8000) and starts the API with reload,
# binding to 0.0.0.0 to allow external network access.

PORT="${1:-8000}"
# HOST is explicitly set to 0.0.0.0 to allow access from other devices (e.g., 10.x.x.x).
HOST="0.0.0.0" 
TEST_SEC="${DEV_RESTART_TEST_SECONDS:-}"
OVERRIDE_CMD="${DEV_RESTART_CMD:-}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$DIR"

# 1. Kill any existing process on the port
bash "${DIR}/scripts/kill_port.sh" "$PORT" || true

# 2. Wait briefly for the port to be fully released
echo "Waiting for port ${PORT} to fully release..."
if command -v lsof >/dev/null 2>&1; then
  for i in {1..30}; do
    if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
      # Port is still active, wait 100ms
      sleep 0.1
    else
      # Port released
      break
    fi
  done
fi

echo "Starting dev server on http://${HOST}:${PORT} (reload enabled)..."

# 3. Choose the command to run (with --host 0.0.0.0 added)
if [ -n "$OVERRIDE_CMD" ]; then
  CMD="$OVERRIDE_CMD $PORT"
else
  # Base Uvicorn arguments including host and port
  UVICORN_ARGS="main:app --reload --host $HOST --port $PORT"

  if command -v uv >/dev/null 2>&1; then
    CMD="uv run python -m uvicorn $UVICORN_ARGS"
  elif command -v python >/dev/null 2>&1 && python - <<'PY' >/dev/null 2>&1
import importlib, sys
sys.exit(0 if importlib.util.find_spec('uvicorn') else 1)
PY
  then
    CMD="python -m uvicorn $UVICORN_ARGS"
  elif command -v python3 >/dev/null 2>&1 && python3 - <<'PY' >/dev/null 2>&1
import importlib, sys
sys.exit(0 if importlib.util.find_spec('uvicorn') else 1)
PY
  then
    CMD="python3 -m uvicorn $UVICORN_ARGS"
  else
    echo "No suitable runner found (uv or uvicorn missing)." >&2
    exit 127
  fi
fi

# 4. Handle test mode (if TEST_SEC is set)
if [ -n "$TEST_SEC" ]; then
  # Run in background for testing, then stop after TEST_SEC seconds
  bash -lc "$CMD" &
  S_PID=$!
  # Wait until port is open or timeout
  opened=0
  for i in {1..50}; do
    if command -v lsof >/dev/null 2>&1 && lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
      opened=1
      break
    fi
    sleep 0.1
  done
  if [ "$opened" -eq 1 ]; then
    echo "Server started and listening (pid=$S_PID); will stop after ${TEST_SEC}s..."
  else
    echo "Server spawned (pid=$S_PID) but did not bind to :$PORT within time; will stop after ${TEST_SEC}s..."
  fi
  sleep "$TEST_SEC" || true
  kill -9 "$S_PID" 2>/dev/null || true
  bash "${DIR}/scripts/kill_port.sh" "$PORT" || true
  echo "Server stopped."
  exit 0
fi

# 5. Execute the final command (replaces the current shell process)
exec bash -lc "$CMD"
