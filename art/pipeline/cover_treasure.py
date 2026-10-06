"""The 16:9 cover's treasure (owner request, D-057): the vault's hoard heaped on the counter either side of the angry
serpent. Each heap is a mound of gold coins (drawn here) with the owner's own jewels (art/final, D-035) resting on
it, a strand of pearls spilling down its side, and loose coins, pearls and gems scattered towards the snake.
Everything is placed on the counter in the snake's own camera (angry_snake.py: the same ground plane, pitch and frame
units) and drawn back to front, with a soft shadow under each heap, a contact shadow under every piece, cast shadows
from the same key light as the snake, faint reflections in the polished counter, less light further back, the
snake's shadow where it falls on a piece, and a few glints.

Usage (from repo root, after cover_art.py has made foreground_3x4.png):
    math/env/bin/python art/pipeline/cover_treasure.py
rewrites art/cover/foreground_16x9.png and preview_16x9.png.
"""

from __future__ import annotations

import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
import angry_snake as A  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
FINAL = os.path.join(ROOT, "art", "final")
K = 1620.0  # pixels per frame width (the 3:4 frame) at the cover's size
Y0 = 1.12  # the snake render's screen y of camera y = 0 (frame units)
FLAT = A.SP  # a disc lying on the counter is foreshortened to this

# the two heaps: centre (X, Z) on the counter (the coil's centre is 0, 0), radii, height
HEAPS = [(-0.8, 0.02, 0.34, 0.24, 0.1), (0.82, 0.0, 0.33, 0.24, 0.1)]
# the jewels: (file, X, Z, size, squash, angle, lift); they rest on the heap's surface where they are (lift adds to it)
JEWELS = [
    # left heap: the opal brooch crowning it
    ("sym_L2", -0.98, -0.08, 0.15, 0.86, -12, 0.0),
    ("sym_L4", -0.66, -0.1, 0.14, 0.86, 9, 0.0),
    ("sym_H1", -0.81, -0.03, 0.22, 0.95, 6, 0.0),
    ("sym_L3", -0.58, 0.07, 0.115, 0.84, 18, 0.0),
    ("sym_L1", -0.76, 0.14, 0.125, 0.84, -28, 0.0),
    ("pearl_black", -1.04, 0.1, 0.058, 1.0, 0, 0.0),
    ("pearl_venom", -1.1, -0.22, 0.06, 1.0, 0, 0.0),
    ("sym_KEY", -0.95, 0.27, 0.24, 0.62, -36, 0.0),
    ("pearl_gold", -0.52, 0.27, 0.064, 1.0, 0, 0.0),
    ("sym_L2", -0.46, 0.36, 0.085, 0.84, 20, 0.0),
    # right heap: the pocket watch crowning it, the venom vial standing behind
    ("sym_H3", 1.03, -0.16, 0.21, 1.0, 0, 0.0),
    ("sym_EGG", 0.56, -0.24, 0.13, 1.0, -8, 0.0),
    ("sym_L1", 0.72, -0.15, 0.11, 0.86, 22, 0.0),
    ("sym_H4", 0.85, -0.04, 0.23, 0.95, -6, 0.0),
    ("pearl_gold", 1.1, 0.04, 0.062, 1.0, 0, 0.0),
    ("sym_H2", 0.63, 0.07, 0.15, 1.0, 5, 0.0),
    ("sym_L4", 0.99, 0.13, 0.13, 0.86, -15, 0.0),
    ("sym_L3", 0.86, 0.2, 0.12, 0.82, 24, 0.0),
    ("sym_L2", 1.12, 0.27, 0.12, 0.86, 10, 0.0),
    ("pearl_rose", 0.6, 0.3, 0.056, 1.0, 0, 0.0),
    ("pearl_black", 0.48, 0.37, 0.05, 1.0, 0, 0.0),
]
GLINT_ON = {"sym_L2", "sym_H1", "sym_L4", "sym_L3", "sym_H4"}

_cache: dict = {}


def jewel(name, size_px, squash, angle):
    key = (name, size_px, squash, angle)
    if key not in _cache:
        im = Image.open(os.path.join(FINAL, f"{name}.png")).convert("RGBA")
        im = im.crop(im.split()[-1].point(lambda a: 255 if a > 40 else 0).getbbox())
        k = size_px / max(im.size)
        im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k * squash))), Image.LANCZOS)
        _cache[key] = im.rotate(angle, resample=Image.BICUBIC, expand=True) if angle else im
    return _cache[key]


def coin(d_px, squash, angle, tone):
    """A gold coin seen at a tilt: reeded edge below, a raised rim, a little gem embossed in the field, light from
    the upper left."""
    key = ("coin", d_px, round(squash, 2), angle, round(tone, 2))
    if key in _cache:
        return _cache[key]
    S = 3
    R = d_px * S / 2
    th = R * 0.16 * math.sqrt(max(0.0, 1 - squash * squash)) + R * 0.03  # visible edge thickness
    w, h = int(2 * R + 4), int(2 * R * squash + th + 4)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, R * squash + 2
    u = (xx - cx) / R
    v_face = (yy - cy) / (R * squash)
    v_edge = (yy - cy - th) / (R * squash)
    face = u * u + v_face * v_face
    edge_in = (u * u + v_edge * v_edge <= 1) | ((np.abs(u) <= 1) & (yy >= cy) & (yy <= cy + th))
    gold = np.array([240, 184, 66], np.float32) * tone
    col = np.zeros((h, w, 3), np.float32)
    a = np.zeros((h, w), np.float32)
    # edge: darker, reeded
    reed = 0.85 + 0.15 * np.sin(u * 40)
    ecol = gold * 0.42 * (0.7 + 0.45 * (-u * 0.5 + 0.5))[..., None] * reed[..., None]
    col[edge_in] = ecol[edge_in]
    a[edge_in] = 1
    # face: lit from the upper left, a raised rim, a groove inside it, an embossed lozenge
    rr = np.sqrt(face)
    lit = 0.7 + 0.6 * np.clip(-u * 0.55 - v_face * 0.55 + 0.3, -0.7, 1)
    rim = np.exp(-((rr - 0.9) / 0.05) ** 2)
    groove = np.exp(-((rr - 0.8) / 0.025) ** 2)
    loz = np.abs(u) + np.abs(v_face) * 1.25
    emb = np.exp(-((loz - 0.32) / 0.04) ** 2) * np.sign(-u - v_face)
    fcol = gold[None, None, :] * (lit * (1 + 0.25 * rim - 0.3 * groove + 0.22 * emb))[..., None]
    sheen = np.exp(-(((u + 0.3) * 0.7 + (v_face + 0.35)) / 0.18) ** 2) * (rr < 1)
    fcol += np.array([255, 240, 190], np.float32) * (0.6 * sheen)[..., None]
    fcol *= (1 - 0.45 * np.exp(-((rr - 1.0) / 0.035) ** 2))[..., None]  # a dark line round the face
    inface = face <= 1
    col[inface] = fcol[inface]
    a[inface] = 1
    rgba = np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, "RGBA").resize((max(1, w // S), max(1, h // S)), Image.LANCZOS)
    if angle:
        im = im.rotate(angle, resample=Image.BICUBIC, expand=True)
    _cache[key] = im
    return im


def screen(X, Z, Y, pad):
    yc = Y * A.CP - Z * A.SP
    return (0.5 + X) * K + pad, (Y0 - yc) * K


def heap_height(X, Z):
    hgt = 0.0
    for cx, cz, rx, rz, H in HEAPS:
        q = ((X - cx) / rx) ** 2 + ((Z - cz) / rz) ** 2
        hgt = max(hgt, H * max(0.0, 1 - q) ** 0.85)
    return hgt


def build_items():
    """Coins, jewels and pearl strands as (kind, X, Z, Y, args) on the counter and the heaps."""
    rng = np.random.default_rng(56)
    items = []
    for cx, cz, rx, rz, H in HEAPS:
        for _ in range(250):  # the mound of coins
            r, t = math.sqrt(rng.random()) * 1.05, rng.uniform(0, 2 * math.pi)
            X, Z = cx + r * math.cos(t) * rx, cz + r * math.sin(t) * rz
            Y = heap_height(X, Z)
            slope = min(1.0, Y / H)
            squash = FLAT + (0.85 - FLAT) * rng.random() * (0.25 + 0.75 * slope)
            items.append(("coin", X, Z, Y, (rng.uniform(0.042, 0.052), squash, int(rng.uniform(-25, 25) * slope), rng.uniform(0.86, 1.08))))
        # a strand of pearls from the top of the heap down its front and onto the counter, curling towards the snake
        side = -1 if cx < 0 else 1
        pts = []
        for k in range(36):
            s = k / 35
            X = cx + side * (-0.12 + 0.36 * s) + 0.03 * math.sin(s * 7)
            Z = cz - 0.06 + 0.3 * s - 0.08 * s * s
            pts.append((X, Z))
        acc, last = 0.0, None
        for X, Z in pts:
            if last is not None:
                acc += math.hypot(X - last[0], Z - last[1])
                if acc < 0.024:
                    continue
                acc = 0.0
            last = (X, Z)
            items.append(("strand", X, Z, heap_height(X, Z) + 0.008, (0.027,)))
    for X, Z, n in ((-0.5, 0.18, 4), (-1.12, -0.12, 6), (0.52, 0.17, 5), (1.15, -0.06, 3), (-0.62, 0.32, 2), (0.98, 0.33, 3)):
        for j in range(n):  # short stacks of coins
            items.append(("coin", X + rng.uniform(-0.003, 0.003), Z, j * 0.0075, (0.046, FLAT, 0, rng.uniform(0.92, 1.04))))
    for _ in range(30):  # loose coins on the counter round the heaps and towards the coil
        side = rng.choice([-1, 1])
        X = side * rng.uniform(0.42, 1.16)
        Z = rng.uniform(-0.38, 0.38)
        if heap_height(X, Z) > 0.004 or (Z < 0.08 and abs(X) < 0.53):  # nothing that would sit behind the coil
            continue
        items.append(("coin", X, Z, 0.0, (rng.uniform(0.04, 0.05), FLAT + 0.08 * rng.random(), 0, rng.uniform(0.86, 1.05))))
    for name, X, Z, size, squash, angle, lift in JEWELS:
        Y = max(0.0, heap_height(X, Z) - 0.25 * size * squash) + lift
        items.append(("jewel", X, Z, Y, (name, size, squash, angle)))
    return items


def light_dir():
    """The key light's shift on the counter per unit of height, in screen x."""
    lw = A.c2w(A.nrm([-0.55, 0.62, 0.56]))
    return -lw[0] / lw[1]


def soft_ellipse(w, h, alpha, blur):
    pad = int(blur * 3) + 2
    im = Image.new("RGBA", (int(w) + 2 * pad, int(h) + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse([pad, pad, pad + w, pad + h], fill=(3, 4, 6, int(alpha)))
    return im.filter(ImageFilter.GaussianBlur(blur)), pad


def add_treasure(snake34, wide_w=3840):
    """The 16:9 foreground: the 3:4 snake layer in the middle and the hoard round it."""
    h = snake34.height
    pad = (wide_w - snake34.width) // 2
    snake = Image.new("RGBA", (wide_w, h), (0, 0, 0, 0))
    snake.paste(snake34, (pad, 0))
    sa = np.asarray(snake, np.float32)
    snake_shade = sa[..., 3] / 255 * (1 - sa[..., :3].mean(-1) / 255)
    gx = light_dir()
    out = Image.new("RGBA", (wide_w, h), (0, 0, 0, 0))
    # under each heap: a broad soft shadow, and its cast shadow thrown to the right
    for cx, cz, rx, rz, H in HEAPS:
        bx, by = screen(cx, cz, 0, pad)
        for dx, scale, alpha in ((0.0, 1.08, 150), (gx * H * 0.9 * K, 1.0, 80)):
            sw, sh = 2 * rx * K * scale, 2 * rz * FLAT * K * scale
            e, p = soft_ellipse(sw, sh, alpha, 0.03 * K)
            out.alpha_composite(e, (int(bx + dx - sw / 2 - p), int(by - sh / 2 - p)))
    rng = np.random.default_rng(7)
    mass = Image.new("RGBA", (wide_w, h), (0, 0, 0, 0))
    md = ImageDraw.Draw(mass)
    for cx, cz, rx, rz, H in HEAPS:
        for _ in range(900):
            r, t = math.sqrt(rng.random()) * 0.95, rng.uniform(0, 2 * math.pi)
            X, Z = cx + r * math.cos(t) * rx, cz + r * math.sin(t) * rz
            bx, by = screen(X, Z, heap_height(X, Z), pad)
            cr = 0.022 * K
            tone = rng.uniform(0.25, 0.5)
            md.ellipse([bx - cr, by - cr * 0.55, bx + cr, by + cr * 0.55], fill=(int(200 * tone), int(150 * tone), int(60 * tone), 255))
    out.alpha_composite(mass.filter(ImageFilter.GaussianBlur(2)))
    out.alpha_composite(snake)  # nothing of the hoard sits behind the snake
    items = sorted(build_items(), key=lambda t: t[3] * A.SP + t[2] * A.CP)  # back to front
    glints = []
    for kind, X, Z, Y, args in items:
        if kind == "coin":
            d, squash, angle, tone = args
            im = coin(int(d * K), squash, angle, tone)
        elif kind == "strand":
            im = jewel("pearl_white", int(args[0] * K), 1.0, 0)
        else:
            name, size, squash, angle = args
            im = jewel(name, int(size * K), squash, angle)
        bx, by = screen(X, Z, Y, pad)
        sh = float(snake_shade[int(np.clip(by - 4, 0, h - 1)), int(np.clip(bx, 0, wide_w - 1))])
        k = (0.78 + 0.22 * np.clip((Z + 0.35) / 0.7, 0, 1)) * (1 - 0.6 * sh)
        arr = np.asarray(im, np.float32).copy()
        arr[..., :3] *= k
        lit = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
        sink = 0.5 if kind == "coin" else 0.12  # coins lie in the heap, jewels sit on it
        x0, y0 = int(bx - im.width / 2), int(by - im.height * (1 - sink))
        big = kind == "jewel"
        if big and Y < 0.004:
            # reflection in the polished counter
            refl = lit.transpose(Image.FLIP_TOP_BOTTOM)
            ra = np.asarray(refl, np.float32).copy()
            fade = np.clip(1 - np.linspace(0, 1, refl.height) / 0.45, 0, 1) ** 1.5
            ra[..., 3] *= 0.2 * fade[:, None]
            ra[..., :3] *= 0.7
            out.alpha_composite(Image.fromarray(ra.astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(2)), (x0, y0 + im.height - 2))
        if big:
            # cast shadow: the silhouette flattened and thrown away from the key light
            ht = im.height / K
            flat = im.split()[-1].resize((im.width, max(1, int(im.height * 0.28))))
            shift, fh = gx * ht * K, flat.height
            flat = flat.transform((int(flat.width + abs(shift)) + 4, fh), Image.AFFINE, (1, shift / fh, -shift, 0, 1, 0), resample=Image.BILINEAR)
            cs = Image.new("RGBA", flat.size, (4, 5, 8, 0))
            cs.putalpha(flat.point(lambda q: int(q * 0.4)))
            out.alpha_composite(cs.filter(ImageFilter.GaussianBlur(max(2, im.width // 22))), (x0, int(y0 + im.height - fh)))
        # contact shadow right under it
        cw = im.width * (0.86 if big or kind == "strand" else 0.95)
        e, p = soft_ellipse(cw, max(4, cw * (0.24 if big else 0.32)), 175 if big else 120, max(2, cw * 0.06))
        out.alpha_composite(e, (int(bx - cw / 2 - p), int(y0 + im.height - cw * 0.16 - p)))
        out.alpha_composite(lit, (x0, y0))
        if big and args[0] in GLINT_ON:
            glints.append((x0 + im.width * 0.35, y0 + im.height * 0.3, im.width))
    # glints: four-point stars on the brightest jewels
    gl = Image.new("RGBA", (wide_w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(gl)
    for cx, cy, w in glints:
        r = w * 0.16
        for ang, ln in ((0, 1.0), (90, 1.0), (45, 0.45), (135, 0.45)):
            dx, dy = math.cos(math.radians(ang)) * r * ln, math.sin(math.radians(ang)) * r * ln
            d.line([(cx - dx, cy - dy), (cx + dx, cy + dy)], fill=(255, 246, 220, 200), width=max(2, int(w * 0.012)))
        d.ellipse([cx - r * 0.12, cy - r * 0.12, cx + r * 0.12, cy + r * 0.12], fill=(255, 250, 235, 255))
    out.alpha_composite(Image.alpha_composite(gl.filter(ImageFilter.GaussianBlur(6)), gl.filter(ImageFilter.GaussianBlur(1))))
    return out


def main():
    import cover_art as C

    snake34 = Image.open(os.path.join(C.OUT, "foreground_3x4.png")).convert("RGBA")
    fg = add_treasure(snake34, C.WIDE_W)
    fg.save(os.path.join(C.OUT, "foreground_16x9.png"), optimize=True)
    title = Image.open(os.path.join(C.OUT, "title.png")).convert("RGBA")
    for tag, f in (("3x4", snake34), ("16x9", fg)):
        bg = Image.open(os.path.join(C.OUT, f"background_{tag}.png")).convert("RGB")
        C.preview(bg, f, title, C.SAFE_W).save(os.path.join(C.OUT, f"preview_{tag}.png"), optimize=True)
    print("wrote foreground_16x9.png and the previews")


if __name__ == "__main__":
    main()
