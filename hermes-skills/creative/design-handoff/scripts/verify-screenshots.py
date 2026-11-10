#!/usr/bin/env python3
"""verify-screenshots.py — detect blank/solid-frame screenshot captures.

A capture pipeline can silently emit solid-color frames at the right filename
and viewport size (seen: 10 of 12 section shots blank after a CDP capture run).
This probe resizes each image to 50x50 and counts unique colors: 1-2 unique
colors means the frame is blank/solid and must be re-captured.

Usage:
    python verify-screenshots.py 'screenshots/**/*.png'
    python verify-screenshots.py desktop/*.png mobile/*.png

Exit code 0 = all OK, 1 = blanks found, 2 = usage/no-files error.

Also flags suspicious patterns:
  - tiny byte size (< 8 KB) for a full-page capture
  - identical byte sizes across 3+ files (repeated blank frames)
"""
import glob
import sys
from collections import Counter

try:
    from PIL import Image
except ImportError:
    print("Pillow required: pip install pillow")
    sys.exit(2)


def analyze(path):
    try:
        im = Image.open(path).convert("RGB")
        small = im.resize((50, 50))
        colors = set(small.getdata())
        return len(colors)
    except Exception as exc:  # unreadable/corrupt file
        return f"ERROR: {exc}"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    paths = []
    for pattern in sys.argv[1:]:
        paths.extend(sorted(glob.glob(pattern, recursive=True)))
    if not paths:
        print("No files matched the given glob(s).")
        return 2

    import os

    sizes = {p: os.path.getsize(p) for p in paths}
    size_counter = Counter(sizes.values())
    dup_sizes = {s for s, n in size_counter.items() if n >= 3}

    bad = 0
    print(f"{'STATUS':8s} {'UNIQ':>5s} {'SIZE':>9s}  FILE")
    for p in paths:
        uniq = analyze(p)
        if isinstance(uniq, str):
            print(f"{'ERROR':8s} {'-':>5s} {sizes[p]:>9d}  {p}  ({uniq})")
            bad += 1
            continue
        flags = []
        if uniq <= 2:
            flags.append("BLANK")
        if sizes[p] < 8192:
            flags.append("SUSPICIOUSLY SMALL")
        if sizes[p] in dup_sizes:
            flags.append("SAME SIZE AS 3+ OTHERS")
        status = "BLANK" if uniq <= 2 else ("WARN" if flags else "OK")
        if status != "OK":
            bad += 1
        print(f"{status:8s} {uniq:>5d} {sizes[p]:>9d}  {p}  {' '.join(flags)}")

    print(f"\n{len(paths) - bad}/{len(paths)} captures verified"
          + ("" if bad == 0 else f" — {bad} need re-capture"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
