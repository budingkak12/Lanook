#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/dev_restart.sh [PORT]
# Kills anything on the port (default 8000) and starts the API with reload.

PORT="${1:-8000}"
TEST_SEC="${DEV_RESTART_TEST_SECONDS:-}"
OVERRIDE_CMD="${DEV_RESTART_CMD:-}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$DIR"

bash "${DIR}/scripts/kill_port.sh" "$PORT" || true

# Wait briefly for the port to be released
if command -v lsof >/dev/null 2>&1; then
  for i in {1..30}; do
    if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
      sleep 0.1
    else
      break
    fi
  done
fi

echo "Starting dev server on :${PORT} (reload enabled)..."

# Choose command to run
if [ -n "$OVERRIDE_CMD" ]; then
  CMD="$OVERRIDE_CMD $PORT"
else
  if command -v uv >/dev/null 2>&1; then
    CMD="uv run python -m uvicorn main:app --reload --port $PORT"
  elif command -v python >/dev/null 2>&1 && python - <<'PY' >/dev/null 2>&1
import importlib, sys
sys.exit(0 if importlib.util.find_spec('uvicorn') else 1)
PY
  then
    CMD="python -m uvicorn main:app --reload --port $PORT"
  elif command -v python3 >/dev/null 2>&1 && python3 - <<'PY' >/dev/null 2>&1
import importlib, sys
sys.exit(0 if importlib.util.find_spec('uvicorn') else 1)
PY
  then
    CMD="python3 -m uvicorn main:app --reload --port $PORT"
  else
    echo "No suitable runner found (uv or uvicorn missing)." >&2
    exit 127
  fi
fi

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

exec bash -lc "$CMD"
