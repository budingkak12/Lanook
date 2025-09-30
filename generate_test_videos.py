"""
Generate a set of browser-friendly MP4 test videos (H.264/AAC).

Outputs go to ./sample_media/ . Respects common portrait/landscape sizes.

Requires ffmpeg (and ffprobe optional). On macOS, install via Homebrew:
  brew install ffmpeg

Run with uv (recommended):
  uv run python generate_test_videos.py

Or plain Python:
  python3 generate_test_videos.py
"""
import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "sample_media"


def check_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found. Please install ffmpeg and ensure it is on PATH.")


def run(cmd: list[str]) -> None:
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True)


def generate_video(width: int, height: int, seconds: int, name: str) -> Path:
    """
    Synthesize a test video using ffmpeg's lavfi sources:
    - Video: testsrc2 pattern @ 30fps
    - Audio: 440Hz sine tone @ 48kHz
    - Encoded as H.264/AAC in MP4 with faststart for streaming
    """
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{name}_{width}x{height}.mp4"

    # Build filter inputs
    video_src = f"testsrc2=size={width}x{height}:rate=30"
    audio_src = f"sine=frequency=440:sample_rate=48000:duration={seconds}"

    cmd = [
        "ffmpeg",
        "-y",
        # synthetic sources
        "-f",
        "lavfi",
        "-i",
        video_src,
        "-f",
        "lavfi",
        "-i",
        audio_src,
        # map streams explicitly
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        # codecs (browser-friendly)
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        # optimize for streaming
        "-movflags",
        "+faststart",
        # total duration
        "-shortest",
        str(out),
    ]
    run(cmd)
    print(f"Generated: {out}")
    return out


def main() -> None:
    check_ffmpeg()
    print("Generating test videos (H.264/AAC MP4)...")

    # Portrait (vertical)
    generate_video(540, 960, 8, "portrait_video")
    generate_video(720, 1280, 8, "portrait_hd")

    # Landscape (horizontal)
    generate_video(1280, 720, 8, "landscape_hd")
    generate_video(1920, 1080, 8, "landscape_fhd")

    # Square (useful for grid testing)
    generate_video(720, 720, 8, "square")

    print("Done. Files saved under:", OUT_DIR)


if __name__ == "__main__":
    main()