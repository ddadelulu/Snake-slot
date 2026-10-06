"""Cover art for the Stake game tile (owner request, D-055): separate background and foreground layers at 3:4 and at
16:9, so each ratio gets its own composition instead of a crop. The background is the game's strongroom recomposed
for a cover: the vault door centred behind the hero with gold light round its rim, a warm pool of light in the
middle, a fan sconce either side. The foreground (transparent) is the white serpent coiled round the black opal
(one piece, as in the game) with the owner's own gems and pearls (art/final, D-035) spilling at its base, inside the
game's ink line. No text in either layer; the title is a separate transparent PNG (cover_title.py renders it with the
game's Limelight lettering), and previews show the layers assembled.

Usage (from repo root): math/env/bin/python art/pipeline/cover_art.py
Writes art/cover/{background,foreground}_{3x4,16x9}.png.
"""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
import placeholders as P  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "art", "cover")
FINAL = os.path.join(ROOT, "art", "final")

SIZES = {"3x4": (1500, 2000), "16x9": (1920, 1080)}


def background(w, h):
    if h > w:  # 3:4: the door high and large behind the hero, sconces low on the pilasters either side
        return P.room(w, h, True, door=(0.5, 0.35, 0.36), lamps=[(0.08, 0.6), (0.92, 0.6)], counter=0.84, hero_glow=0.55)
    return P.room(w, h, False, door=(0.5, 0.44, 0.46), lamps=[(0.1, 0.42), (0.9, 0.42)], counter=0.83, hero_glow=0.55)


def gem(name, size, angle=0.0):
    im = Image.open(os.path.join(FINAL, f"{name}.png")).convert("RGBA")
    im = im.crop(im.getbbox())
    k = size / max(im.size)
    im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    return im.rotate(angle, resample=Image.BICUBIC, expand=True) if angle else im


def paste_shadowed(canvas, im, cx, cy):
    """Drop a gem with a soft contact shadow (light from the upper left, as everywhere)."""
    a = im.split()[-1]
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sh.putalpha(a.point(lambda q: q * 150 // 255))
    sh = sh.filter(ImageFilter.GaussianBlur(max(2, im.width // 28)))
    x, y = int(cx - im.width / 2), int(cy - im.height / 2)
    canvas.alpha_composite(sh, (x + im.width // 18, y + im.width // 12))
    canvas.alpha_composite(im, (x, y))


# gems spilling at the hero's base: (file, x, y as fractions of the hero box, size as a fraction of its width, angle)
SPILL = [
    ("sym_L2", 0.2, 0.9, 0.17, -12),
    ("pearl_gold", 0.33, 0.96, 0.09, 0),
    ("sym_L1", 0.43, 0.93, 0.13, 8),
    ("pearl_white", 0.56, 0.98, 0.08, 0),
    ("sym_L4", 0.68, 0.94, 0.15, -6),
    ("sym_L3", 0.84, 0.88, 0.14, 14),
    ("pearl_rose", 0.92, 0.97, 0.07, 0),
    ("pearl_black", 0.09, 0.97, 0.07, 0),
]
# extra treasure for the wide layout, out to the sides
SPILL_WIDE = [
    ("sym_H2", -0.22, 0.86, 0.2, -10),
    ("pearl_gold", -0.08, 0.97, 0.08, 0),
    ("sym_H4", 1.2, 0.85, 0.2, 9),
    ("pearl_white", 1.06, 0.98, 0.08, 0),
]


def foreground(w, h, hero_img):
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if h > w:
        side = int(w * 0.96)
        cx, cy = w * 0.5, h * 0.44
        spill = SPILL
    else:
        side = int(h * 0.84)  # leaves the bottom fifth clear for the title
        cx, cy = w * 0.5, h * 0.4
        spill = SPILL + SPILL_WIDE
    hero = hero_img.resize((side, side), Image.LANCZOS)
    x0, y0 = int(cx - side / 2), int(cy - side / 2)
    # treasure behind the coil's back edge first (none here), then the hero, then the spill in front of it
    canvas.alpha_composite(hero, (x0, y0))
    for name, fx, fy, fs, ang in spill:
        paste_shadowed(canvas, gem(name, side * fs, ang), x0 + fx * side, y0 + fy * side * 0.93)
    return canvas


def main():
    os.makedirs(OUT, exist_ok=True)
    hero = P.tile_foreground(1600)
    for tag, (w, h) in SIZES.items():
        background(w, h).convert("RGB").save(os.path.join(OUT, f"background_{tag}.png"), optimize=True)
        foreground(w, h, hero).save(os.path.join(OUT, f"foreground_{tag}.png"), optimize=True)
        print("wrote", tag, w, h)


if __name__ == "__main__":
    main()
