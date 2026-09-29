"""Contact sheet of every in-game image asset (as built into the game, final or placeholder).

Usage (from repo root): math/env/bin/python art/pipeline/contact_sheet.py  ->  art/contact_sheet.png
"""

from __future__ import annotations

import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(ROOT, "frontend", "apps", "constrictor", "static", "assets")
FONT = os.path.join(ROOT, "frontend", "apps", "constrictor", "node_modules", "@fontsource", "archivo", "files")
OUT = os.path.join(ROOT, "art", "contact_sheet.png")


def font(size):
    for cand in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",):
        if os.path.exists(cand):
            return ImageFont.truetype(cand, size)
    return ImageFont.load_default()


def main():
    with open(os.path.join(ASSETS, "manifest.json"), encoding="UTF-8") as f:
        man = json.load(f)
    items = list(man["images"].items())
    cell, cols, pad = 220, 6, 16
    rows = (len(items) + cols - 1) // cols
    W = cols * cell + pad * 2
    H = rows * (cell + 34) + pad * 2 + 60
    sheet = Image.new("RGB", (W, H), (21, 23, 26))
    d = ImageDraw.Draw(sheet)
    d.text((pad, pad), "CONSTRICTOR: in-game image assets (source: final / placeholder)", fill=(217, 178, 111), font=font(22))
    for k, (aid, e) in enumerate(items):
        im = Image.open(os.path.join(ASSETS, e["file"])).convert("RGBA")
        im.thumbnail((cell - 20, cell - 20), Image.LANCZOS)
        x = pad + (k % cols) * cell
        y = pad + 60 + (k // cols) * (cell + 34)
        # checker so transparency reads
        bg = Image.new("RGBA", (cell - 8, cell - 8), (42, 46, 51, 255))
        cd = ImageDraw.Draw(bg)
        for yy in range(0, cell, 16):
            for xx in range(0, cell, 16):
                if (xx // 16 + yy // 16) % 2:
                    cd.rectangle([xx, yy, xx + 15, yy + 15], fill=(36, 39, 44, 255))
        bg.alpha_composite(im, ((bg.width - im.width) // 2, (bg.height - im.height) // 2))
        sheet.paste(bg.convert("RGB"), (x + 4, y))
        d.text((x + 6, y + cell - 4), f"{aid}  [{e['source']}]", fill=(237, 230, 214), font=font(12))
    sheet.save(OUT, optimize=True)
    print("wrote", OUT, sheet.size)


if __name__ == "__main__":
    main()
