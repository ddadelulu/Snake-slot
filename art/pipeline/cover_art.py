"""Cover art for the Stake game tile (owner requests, D-055, D-056): a background and a foreground layer at 3:4 and at
16:9. The vault is composed for the 3:4 frame; the 16:9 cover is the same picture with more of the strongroom either
side (the room is rendered once, wide, and the 3:4 is its centre), so the two always match. The foreground is the
angry white serpent (angry_snake.py) reared up out of its coils on the counter, jaws wide, fangs dripping venom,
inside the 3:4 frame; at 16:9 it sits in the same place with clear air either side. No text in either layer; the
title is a separate transparent PNG (frontend/apps/constrictor/scripts/cover_title.mjs), and previews show the layers
assembled with it.

Usage (from repo root): math/env/bin/python art/pipeline/cover_art.py
Writes art/cover/{background,foreground,preview}_{3x4,16x9}.png.
"""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import angry_snake  # noqa: E402
import placeholders as P  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "art", "cover")

SAFE_W, H = 1620, 2160  # the 3:4 frame
WIDE_W = 3840  # 16:9 at the same height
PAD = (WIDE_W - SAFE_W) // 2


def vignette(img):
    arr = np.asarray(img, np.float32)
    h, w = arr.shape[:2]
    v, u = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = u / w, v / h
    vig = np.clip(1 - 0.75 * (((u - 0.5) / 0.75) ** 2 + ((v - 0.5) / 0.75) ** 2), 0.18, 1)
    return Image.fromarray(np.clip(arr * vig[..., None], 0, 255).astype(np.uint8), "RGB")


def backgrounds():
    """The strongroom, wide: the door high in the middle of the 3:4 frame behind the serpent's head, a fan sconce on
    the pilaster either side of it, more panelled wall and another pair of sconces out in the 16:9 margins, and a deep
    polished counter top for the coils to rest on."""
    wide = P.room(SAFE_W, H, True, door=(0.5, 0.3, 0.3), lamps=[(0.08, 0.6), (0.92, 0.6), (-0.45, 0.48), (1.45, 0.48)],
                  counter=0.7, counter_depth=0.26, hero_glow=0.5, xpad=PAD, vignette=False)
    return vignette(wide.crop((PAD, 0, PAD + SAFE_W, H))), vignette(wide)


def foregrounds():
    snake, *_ = angry_snake.render(SAFE_W, H, 2)
    wide = Image.new("RGBA", (WIDE_W, H), (0, 0, 0, 0))
    wide.paste(snake, (PAD, 0))  # an exact copy: the 3:4 layer is the 16:9 layer's centre
    return snake, wide


def preview(bg, fg, title, frame_w):
    """bg + fg + a dark gradient at the bottom + the title, sized to the 3:4 frame in both."""
    im = bg.convert("RGBA")
    im.alpha_composite(fg)
    w, h = im.size
    v = np.linspace(0, 1, h, dtype=np.float32)
    g = np.clip(np.interp(v, [0, 0.62, 0.86, 1.0], [0, 0, 0.8, 0.95]), 0, 1)
    grad = np.zeros((h, w, 4), np.uint8)
    grad[..., :3] = (7, 8, 10)
    grad[..., 3] = (g[:, None] * 255).astype(np.uint8)
    im.alpha_composite(Image.fromarray(grad, "RGBA"))
    tw = int(frame_w * 0.86)
    t = title.resize((tw, int(title.height * tw / title.width)), Image.LANCZOS)
    im.alpha_composite(t, ((w - t.width) // 2, int(h * 0.875 - t.height / 2)))
    return im.convert("RGB")


def main():
    os.makedirs(OUT, exist_ok=True)
    bg34, bg169 = backgrounds()
    fg34, fg169 = foregrounds()
    bg34.save(os.path.join(OUT, "background_3x4.png"), optimize=True)
    bg169.save(os.path.join(OUT, "background_16x9.png"), optimize=True)
    fg34.save(os.path.join(OUT, "foreground_3x4.png"), optimize=True)
    fg169.save(os.path.join(OUT, "foreground_16x9.png"), optimize=True)
    title = Image.open(os.path.join(OUT, "title.png")).convert("RGBA")
    preview(bg34, fg34, title, SAFE_W).save(os.path.join(OUT, "preview_3x4.png"), optimize=True)
    preview(bg169, fg169, title, SAFE_W).save(os.path.join(OUT, "preview_16x9.png"), optimize=True)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
