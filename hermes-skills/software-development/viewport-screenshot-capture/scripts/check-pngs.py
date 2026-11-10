#!/usr/bin/env python3
"""check-pngs.py — pixel-stat blank detector for screenshot directories.

A 'successful' CDP capture can be a solid blank (e.g. the clip-on-scrolled-page bug).
File size is a weak signal; this checks actual pixels: downscale each PNG to a 64x40
grid, count distinct colors, and flag near-solid images (distinct < 20).

Usage: python check-pngs.py <dir> [<dir> ...]
Exit code 1 if any capture looks blank.
"""
import os
import sys
from PIL import Image

THRESHOLD = 20  # distinct colors at 64x40 — real content is 300+; blanks are 1

def check(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    small = im.resize((64, 40))
    px = list(small.getdata())
    n = len(px)
    mean = tuple(round(sum(c[i] for c in px) / n) for i in range(3))
    distinct = len(set(px))
    return w, h, mean, distinct

def main():
    bad = 0
    for d in sys.argv[1:]:
        if os.path.isfile(d):
            files = [d]
        else:
            files = [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith(".png")]
        for f in files:
            try:
                w, h, mean, distinct = check(f)
            except Exception as e:
                print(f"ERROR {f}: {e}")
                bad += 1
                continue
            flag = "  <-- BLANK?" if distinct < THRESHOLD else ""
            print(f"{os.path.basename(f):36s} {w}x{h} mean={mean} distinct={distinct}{flag}")
            if distinct < THRESHOLD:
                bad += 1
    print(f"\n{'FAIL: blank captures found' if bad else 'OK: all captures have content'} ({bad} flagged)")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
