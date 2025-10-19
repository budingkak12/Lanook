#!/usr/bin/env python3
"""
Minimal notifier for Codex "notify" hook.
Plays a short sound when an agent turn completes.

Usage: Codex runs this script with a single JSON argument.
"""

import json
import os
import subprocess
import sys


def main() -> int:
    if len(sys.argv) != 2:
        return 0

    try:
        event = json.loads(sys.argv[1])
    except Exception:
        event = {}

    if event.get("type") != "agent-turn-complete":
        return 0

    # Prefer a built-in macOS sound if available; fall back to TTS.
    sound_path = "/System/Library/Sounds/Glass.aiff"
    try:
        if os.path.exists(sound_path):
            subprocess.Popen(["afplay", sound_path])
        else:
            subprocess.Popen(["say", "Codex turn complete"])  # best-effort fallback
    except Exception:
        pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())