"""
Resize lanook launcher foreground icons.
Usage:
    uv run python icon_resize.py --scale 0.70
Defaults:
    scale=0.70, source favicon_io/android-chrome-512x512.png
Outputs:
    Overwrites app/src/main/res/mipmap-*/ic_launcher_lanook_foreground.png
"""
import argparse
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
SRC_DEFAULT = ROOT / "favicon_io/android-chrome-512x512.png"
RES_DIR = ROOT / "androidclient/app/src/main/res"
SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=0.70, help="0-1, fraction of safe area")
    parser.add_argument("--src", type=Path, default=SRC_DEFAULT, help="path to source 512x512 icon")
    args = parser.parse_args()
    scale = args.scale
    src = args.src

    if not src.exists():
        raise SystemExit(f"Source not found: {src}")
    if not 0 < scale <= 1.0:
        raise SystemExit("scale must be in (0,1]")

    base = Image.open(src).convert("RGBA")
    base = base.crop(base.getbbox())  # trim transparent border

    for folder, size in SIZES.items():
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        target = int(size * scale)
        scaled = base.resize((target, target), Image.LANCZOS)
        x = (size - target) // 2
        y = (size - target) // 2
        canvas.paste(scaled, (x, y), scaled)
        out = RES_DIR / folder / "ic_launcher_lanook_foreground.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(out)
        print(f"wrote {out} scaled {scaled.size}")


if __name__ == "__main__":
    main()
