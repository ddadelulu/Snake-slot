"""Build the frontend's static assets + manifest (DECISIONS D-020).

For every asset id: take art/final/<file> if it exists, else art/placeholder/<kind>/<file>; process it
(trim, centre, resize, WebP/JPG) and write it to frontend/apps/constrictor/static/assets/, then write
static/assets/manifest.json. Dropping a final into art/final/ with the listed filename is all it takes.

Usage (from repo root): math/env/bin/python art/pipeline/build_assets.py
"""

from __future__ import annotations

import json
import os
import shutil

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
FINAL = os.path.join(ROOT, "art", "final")
PH_IMG = os.path.join(ROOT, "art", "placeholder", "images")
PH_AUD = os.path.join(ROOT, "art", "placeholder", "audio")
OUT = os.path.join(ROOT, "frontend", "apps", "constrictor", "static", "assets")

# id: (source filename, kind, target size (w,h) or None, fit)
IMAGES = {
    **{f"sym_{s}": (f"sym_{s}.png", "symbol", (256, 256), "contain") for s in ["H1", "H2", "H3", "H4", "L1", "L2", "L3", "L4", "EGG", "KEY"]},
    "pearl_white": ("pearl_white.png", "symbol", (256, 256), "contain"),
    "pearl_gold": ("pearl_gold.png", "symbol", (256, 256), "contain"),
    "pearl_rose": ("pearl_rose.png", "symbol", (256, 256), "contain"),
    "pearl_black": ("pearl_black.png", "symbol", (256, 256), "contain"),
    "pearl_venom": ("pearl_venom.png", "symbol", (256, 256), "contain"),
    "pearl_venom_grand": ("pearl_venom_grand.png", "symbol", (256, 256), "contain"),
    "snake_head": ("snake_head.png", "sprite", (256, 256), "contain"),
    "snake_head_open": ("snake_head_open.png", "sprite", (256, 256), "contain"),
    "snake_tongue": ("snake_tongue.png", "sprite", (128, 128), "contain"),
    "snake_tail": ("snake_tail.png", "sprite", (256, 256), "contain"),
    "snake_scales_strip": ("snake_scales_strip.png", "texture", (1024, 128), "stretch"),
    "snake_shed": ("snake_shed.png", "sprite", (256, 256), "contain"),
    "bg_landscape": ("bg_landscape.jpg", "plate", (1920, 1080), "cover"),
    "bg_portrait": ("bg_portrait.jpg", "plate", (1080, 1920), "cover"),
    "board_velvet": ("board_velvet.jpg", "plate", (512, 512), "cover"),
    "board_frame": ("board_frame.png", "sprite", (1024, 1024), "stretch"),
    "tile_background": ("tile_background.png", "tile", None, None),
    "tile_foreground": ("tile_foreground.png", "tile", None, None),
    "keyart": ("keyart_16x9.jpg", "plate", (1920, 1080), "cover"),
}
AUDIO = [os.path.splitext(f)[0] for f in sorted(os.listdir(PH_AUD))] if os.path.isdir(PH_AUD) else []
VIDEO = {
    "vid_intro_16x9": "vid_intro_16x9.mp4",
    "vid_intro_9x16": "vid_intro_9x16.mp4",
    "vid_hunt_16x9": "vid_hunt_16x9.mp4",
    "vid_hunt_9x16": "vid_hunt_9x16.mp4",
    "vid_ouroboros_loop": "vid_ouroboros_loop.mp4",
    "vid_maxwin_16x9": "vid_maxwin_16x9.mp4",
    "vid_maxwin_9x16": "vid_maxwin_9x16.mp4",
}


def trim(im: Image.Image) -> Image.Image:
    if im.mode != "RGBA":
        return im
    bbox = im.split()[-1].point(lambda a: 255 if a > 8 else 0).getbbox()
    return im.crop(bbox) if bbox else im


def fit(im: Image.Image, size, mode):
    w, h = size
    if mode == "stretch":
        return im.resize((w, h), Image.LANCZOS)
    if mode == "cover":
        s = max(w / im.width, h / im.height)
        im2 = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        x, y = (im2.width - w) // 2, (im2.height - h) // 2
        return im2.crop((x, y, x + w, y + h))
    # contain on a transparent square canvas, visually centred, 88 % fill
    im = trim(im.convert("RGBA"))
    s = min(w * 0.88 / im.width, h * 0.88 / im.height)
    im2 = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(im2, ((w - im2.width) // 2, (h - im2.height) // 2))
    return canvas


def main():
    os.makedirs(OUT, exist_ok=True)
    for sub in ("img", "audio", "video"):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    manifest = {"version": 1, "images": {}, "audio": {}, "video": {}}
    for aid, (fname, kind, size, mode) in IMAGES.items():
        src = os.path.join(FINAL, fname)
        origin = "final"
        if not os.path.exists(src):
            src = os.path.join(PH_IMG, fname)
            origin = "placeholder"
        if not os.path.exists(src):
            continue
        im = Image.open(src)
        if kind == "tile":  # tile layers are delivered for the dashboard, not used in-game
            continue
        im = fit(im.convert("RGBA") if im.mode in ("P", "LA") else im, size, mode)
        if kind == "plate" and im.mode != "RGBA":
            out = f"img/{aid}.jpg"
            im.convert("RGB").save(os.path.join(OUT, out), quality=86, optimize=True, progressive=True)
        else:
            out = f"img/{aid}.webp"
            im.save(os.path.join(OUT, out), "WEBP", quality=90, method=6)
        manifest["images"][aid] = {"file": out, "source": origin, "w": im.width, "h": im.height}
    for aid in AUDIO:
        src = os.path.join(FINAL, "audio", f"{aid}.mp3")
        origin = "final"
        if not os.path.exists(src):
            src, origin = os.path.join(PH_AUD, f"{aid}.mp3"), "placeholder"
        out = f"audio/{aid}.mp3"
        shutil.copyfile(src, os.path.join(OUT, out))
        manifest["audio"][aid] = {"file": out, "source": origin}
    for aid, fname in VIDEO.items():
        src = os.path.join(FINAL, fname)
        if os.path.exists(src):
            out = f"video/{fname}"
            shutil.copyfile(src, os.path.join(OUT, out))
            manifest["video"][aid] = {"file": out, "source": "final"}
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="UTF-8") as f:
        json.dump(manifest, f, indent=1)
    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(OUT) for fn in fns)
    print(f"assets: {len(manifest['images'])} images, {len(manifest['audio'])} audio, {len(manifest['video'])} video; {total/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
