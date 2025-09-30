#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8000}"

echo "Killing processes on TCP port ${PORT} (if any)..."

if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti tcp:${PORT} || true)
  if [ -n "${PIDS}" ]; then
    echo "Found PIDs: ${PIDS}"
    kill -9 ${PIDS} || true
  else
    echo "No process is listening on ${PORT}."
  fi
elif command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" || true
else
  echo "Neither lsof nor fuser is available. Install one to enable port killing." >&2
  exit 1
fi

exit 0

