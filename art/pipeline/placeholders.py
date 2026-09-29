"""Procedural placeholder art for CONSTRICTOR (DECISIONS D-020).

Draws every image asset listed in art/HIGGSFIELD_PROMPTS.md in the style-bible palette, so the game is
complete and readable before the photoreal finals arrive. Files go to art/placeholder/images/ with the
same filenames as the finals (drop a final into art/final/ and it wins).

Usage: math/env/bin/python art/pipeline/placeholders.py
"""

from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "placeholder", "images")
S = 4  # supersampling factor
rng = np.random.default_rng(12)

VOID = (7, 8, 10)
BRASS = (156, 122, 69)
BRASS_HI = (217, 178, 111)
IVORY = (237, 230, 214)
VENOM = (61, 255, 138)
LIGHT = np.array([-0.62, -0.62, 0.48])  # from upper-left, towards viewer
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def canvas(w, h, bg=(0, 0, 0, 0)):
    return Image.new("RGBA", (w * S, h * S), bg)


def finish(im, w, h):
    return im.resize((w, h), Image.LANCZOS)


def save(im, name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    if name.endswith(".jpg"):
        im.convert("RGB").save(path, quality=88)
    else:
        im.save(path)


def shade(color, k):
    """k in [-1, 1]: darken or lighten."""
    c = np.array(color, dtype=float)
    if k >= 0:
        c = c + (255 - c) * k
    else:
        c = c * (1 + k)
    return tuple(int(max(0, min(255, v))) for v in c)


def drop_shadow(im, offset=(10, 14), blur=18, alpha=150):
    a = im.split()[-1]
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sh.putalpha(a.point(lambda v: v * alpha // 255))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    base = Image.new("RGBA", im.size, (0, 0, 0, 0))
    base.alpha_composite(sh, (offset[0], offset[1]))
    base.alpha_composite(im)
    return base


def facet_gem(outline, center, color, table_scale=0.45, name="gem", star=False):
    """Faceted gem: triangles from centre to outline, shaded by a fake normal vs the upper-left light."""
    W = 512
    im = canvas(W, W)
    d = ImageDraw.Draw(im)
    cx, cy = center
    pts = [(x * S, y * S) for x, y in outline]
    n = len(pts)
    # crown facets
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        mx, my = (a[0] + b[0]) / 2 - cx * S, (a[1] + b[1]) / 2 - cy * S
        L = math.hypot(mx, my) or 1
        nrm = np.array([mx / L * 0.8, my / L * 0.8, 0.6])
        k = float(np.dot(nrm / np.linalg.norm(nrm), LIGHT))
        k = k * 0.9 + (0.25 if i % 2 else -0.1)
        d.polygon([(cx * S, cy * S), a, b], fill=shade(color, max(-0.75, min(0.65, k))) + (255,))
    # table
    tpts = [((x - cx) * table_scale + cx, (y - cy) * table_scale + cy) for x, y in outline]
    tp = [(x * S, y * S) for x, y in tpts]
    d.polygon(tp, fill=shade(color, 0.12) + (255,))
    # table-to-girdle lines
    for i in range(0, n, max(1, n // 16)):
        d.line([tp[i], pts[i]], fill=shade(color, -0.35) + (180,), width=S)
    if star:
        for i in range(0, n, max(1, n // 8)):
            d.line([(cx * S, cy * S), tp[i]], fill=shade(color, 0.35) + (160,), width=S)
    d.polygon(pts, outline=shade(color, -0.6) + (255,), width=3 * S)
    # specular highlight upper-left of the table
    hl = canvas(W, W)
    hd = ImageDraw.Draw(hl)
    hx, hy = cx - 0.22 * (cx - min(p[0] for p in outline)), cy - 0.3 * (cy - min(p[1] for p in outline))
    hd.ellipse([(hx - 28) * S, (hy - 16) * S, (hx + 28) * S, (hy + 16) * S], fill=(255, 255, 255, 150))
    hl = hl.filter(ImageFilter.GaussianBlur(10 * S))
    im.alpha_composite(hl)
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    im.putalpha(Image.fromarray(np.minimum(np.array(im.split()[-1]), np.array(mask))))
    return drop_shadow(finish(im, W, W))


def pear(cx=256, cy=270, r=150):
    pts = []
    for i in range(48):
        a = 2 * math.pi * i / 48
        x = math.sin(a)
        y = -math.cos(a)
        taper = 1 - 0.55 * max(0, -y) ** 1.3
        pts.append((cx + r * 0.78 * x * taper, cy + r * y * (1.05 if y < 0 else 0.8)))
    return pts


def cushion(cx=256, cy=256, r=165, p=4.5):
    pts = []
    for i in range(48):
        a = 2 * math.pi * i / 48
        c, s = math.cos(a), math.sin(a)
        x = abs(c) ** (2 / p) * (1 if c >= 0 else -1)
        y = abs(s) ** (2 / p) * (1 if s >= 0 else -1)
        pts.append((cx + r * x, cy + r * y))
    return pts


def emerald_cut(cx=256, cy=256, w=135, h=185, cut=48):
    return [
        (cx - w + cut, cy - h), (cx + w - cut, cy - h), (cx + w, cy - h + cut), (cx + w, cy + h - cut),
        (cx + w - cut, cy + h), (cx - w + cut, cy + h), (cx - w, cy + h - cut), (cx - w, cy - h + cut),
    ]


def round_brilliant(cx=256, cy=256, r=170):
    return [(cx + r * math.cos(2 * math.pi * i / 32), cy + r * math.sin(2 * math.pi * i / 32)) for i in range(32)]


def emerald_steps(img_outline, color):
    """Draw concentric step-cut rings for the citrine."""
    W = 512
    im = canvas(W, W)
    d = ImageDraw.Draw(im)
    cx, cy = 256, 256
    for k, sc in enumerate([1.0, 0.86, 0.72, 0.58]):
        pts = [((x - cx) * sc + cx, (y - cy) * sc + cy) for x, y in img_outline]
        k2 = [-0.25, 0.05, -0.15, 0.25][k]
        d.polygon([(x * S, y * S) for x, y in pts], fill=shade(color, k2) + (255,), outline=shade(color, -0.55) + (255,), width=2 * S)
    hl = canvas(W, W)
    ImageDraw.Draw(hl).rectangle([175 * S, 110 * S, 250 * S, 135 * S], fill=(255, 255, 255, 120))
    im.alpha_composite(hl.filter(ImageFilter.GaussianBlur(8 * S)))
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).polygon([(x * S, y * S) for x, y in img_outline], fill=255)
    im.putalpha(Image.fromarray(np.minimum(np.array(im.split()[-1]), np.array(mask))))
    return drop_shadow(finish(im, W, W))


def sphere(color, size=512, r=150, sheen=None, glow=None, inner=None):
    """Lit sphere (pearls)."""
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    cx = cy = size / 2
    dx, dy = (xx - cx) / r, (yy - cy) / r
    rr = dx * dx + dy * dy
    inside = rr <= 1
    dz = np.sqrt(np.clip(1 - rr, 0, 1))
    n = np.stack([dx, dy, dz], -1)
    lam = np.clip((n @ LIGHT), 0, 1)
    spec = np.clip((n @ (LIGHT + np.array([0, 0, 1])) / np.linalg.norm(LIGHT + np.array([0, 0, 1]))), 0, 1) ** 40
    rim = (1 - dz) ** 3
    base = np.array(color, dtype=float)
    col = base * (0.25 + 0.85 * lam[..., None]) + 255 * spec[..., None] * 0.85
    if sheen is not None:
        col = col + np.array(sheen) * rim[..., None] * 0.9
    if inner is not None:
        col = col + np.array(inner) * (dz ** 2)[..., None] * 0.35
    rgba = np.zeros((size, size, 4))
    rgba[..., :3] = np.clip(col, 0, 255)
    edge = np.clip((1 - np.sqrt(rr)) * r / 1.5, 0, 1)
    rgba[..., 3] = 255 * edge * inside
    im = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    if glow is not None:
        g = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse([cx - r * 1.35, cy - r * 1.35, cx + r * 1.35, cy + r * 1.35], fill=tuple(glow) + (140,))
        g = g.filter(ImageFilter.GaussianBlur(28))
        g.alpha_composite(im)
        im = g
        return im
    return drop_shadow(im, (8, 12), 14, 130)


def opal():
    W = 512
    size = W * S
    im = canvas(W, W)
    d = ImageDraw.Draw(im)
    cx, cy, rx, ry = 256 * S, 256 * S, 150 * S, 190 * S
    # bezel
    d.ellipse([cx - rx - 22 * S, cy - ry - 22 * S, cx + rx + 22 * S, cy + ry + 22 * S], fill=shade(BRASS, -0.2) + (255,))
    d.ellipse([cx - rx - 12 * S, cy - ry - 12 * S, cx + rx + 12 * S, cy + ry + 12 * S], fill=BRASS_HI + (255,))
    d.ellipse([cx - rx - 6 * S, cy - ry - 6 * S, cx + rx + 6 * S, cy + ry + 6 * S], fill=shade(BRASS, -0.35) + (255,))
    # black dome
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    dx, dy = (xx - cx) / rx, (yy - cy) / ry
    rr = dx * dx + dy * dy
    inside = rr <= 1
    dz = np.sqrt(np.clip(1 - rr, 0, 1))
    lam = np.clip(-0.6 * dx - 0.6 * dy + 0.5 * dz, 0, 1)
    body = np.stack([12 + 30 * lam, 13 + 30 * lam, 18 + 36 * lam], -1)
    # fire slit: vertical band with hue changing along y
    band = np.exp(-(dx / 0.13) ** 2) * inside * (1 - np.abs(dy) ** 3)
    hue = (dy + 1) / 2
    fire = np.stack([230 * (1 - hue) + 60 * hue, 90 + 150 * hue * (1 - hue) * 2, 40 * (1 - hue) + 110 * hue], -1)
    col = body * (1 - band[..., None]) + fire * band[..., None]
    spec = np.exp(-(((dx + 0.35) / 0.2) ** 2 + ((dy + 0.45) / 0.12) ** 2)) * inside
    col = col + 255 * spec[..., None] * 0.8
    dome = np.zeros((size, size, 4))
    dome[..., :3] = np.clip(col, 0, 255)
    dome[..., 3] = 255 * inside
    im.alpha_composite(Image.fromarray(dome.astype(np.uint8), "RGBA"))
    return drop_shadow(finish(im, W, W))


def ring():
    W = 512
    im = canvas(W, W)
    d = ImageDraw.Draw(im)
    gold, gold_d = (205, 160, 70), (120, 86, 34)
    cx, cy = 256 * S, 280 * S
    d.ellipse([cx - 175 * S, cy - 120 * S, cx + 175 * S, cy + 150 * S], fill=gold_d + (255,))
    d.ellipse([cx - 160 * S, cy - 105 * S, cx + 160 * S, cy + 132 * S], fill=gold + (255,))
    d.ellipse([cx - 118 * S, cy - 70 * S, cx + 118 * S, cy + 98 * S], fill=(0, 0, 0, 0))
    # coils (scale ticks)
    for k in range(26):
        a = 2 * math.pi * k / 26
        x, y = cx + 139 * S * math.cos(a), cy + 13 * S + 118 * S * math.sin(a)
        d.ellipse([x - 9 * S, y - 7 * S, x + 9 * S, y + 7 * S], outline=gold_d + (255,), width=2 * S)
    # snake head bezel on top
    d.ellipse([cx - 72 * S, cy - 190 * S, cx + 72 * S, cy - 70 * S], fill=gold_d + (255,))
    d.ellipse([cx - 64 * S, cy - 182 * S, cx + 64 * S, cy - 78 * S], fill=(222, 182, 92, 255))
    d.polygon([(cx - 40 * S, cy - 175 * S), (cx + 40 * S, cy - 175 * S), (cx, cy - 212 * S)], fill=(222, 182, 92, 255))
    for ex in (-26, 26):
        d.ellipse([cx + (ex - 11) * S, cy - 150 * S, cx + (ex + 11) * S, cy - 128 * S], fill=(20, 150, 80, 255), outline=(10, 60, 30, 255), width=2 * S)
    hl = canvas(W, W)
    ImageDraw.Draw(hl).arc([cx - 155 * S, cy - 100 * S, cx + 155 * S, cy + 128 * S], 190, 250, fill=(255, 245, 210, 200), width=10 * S)
    im.alpha_composite(hl.filter(ImageFilter.GaussianBlur(3 * S)))
    return drop_shadow(finish(im, W, W))


def vial():
    W = 512
    im = canvas(W, W)
    d = ImageDraw.Draw(im)
    s = S
    glass = (190, 210, 205, 110)
    d.rounded_rectangle([170 * s, 190 * s, 342 * s, 440 * s], radius=46 * s, fill=glass, outline=(220, 235, 230, 200), width=4 * s)
    d.rectangle([222 * s, 120 * s, 290 * s, 200 * s], fill=glass, outline=(220, 235, 230, 200), width=4 * s)
    liquid = canvas(W, W)
    ImageDraw.Draw(liquid).rounded_rectangle([180 * s, 270 * s, 332 * s, 430 * s], radius=38 * s, fill=VENOM + (190,))
    glow = liquid.filter(ImageFilter.GaussianBlur(18 * s))
    im.alpha_composite(glow)
    im.alpha_composite(liquid)
    d = ImageDraw.Draw(im)
    d.line([(190 * s, 272 * s), (322 * s, 272 * s)], fill=(200, 255, 220, 230), width=3 * s)
    # stopper (faceted glass)
    d.polygon([(214 * s, 70 * s), (298 * s, 70 * s), (316 * s, 105 * s), (298 * s, 128 * s), (214 * s, 128 * s), (196 * s, 105 * s)], fill=(200, 220, 215, 170), outline=(235, 245, 240, 230), width=3 * s)
    d.line([(200 * s, 210 * s), (200 * s, 400 * s)], fill=(255, 255, 255, 150), width=8 * s)
    return drop_shadow(finish(im, W, W))


def watch():
    W = 512
    im = canvas(W, W)
    d = ImageDraw.Draw(im)
    s = S
    gold, gold_d = (205, 160, 70), (110, 80, 32)
    # open lid to the left (ellipse seen edge-on)
    d.ellipse([34 * s, 150 * s, 150 * s, 420 * s], fill=gold_d + (255,))
    d.ellipse([46 * s, 162 * s, 140 * s, 408 * s], fill=gold + (255,))
    # crown + loop
    d.rectangle([300 * s, 56 * s, 336 * s, 96 * s], fill=gold + (255,), outline=gold_d + (255,), width=3 * s)
    d.ellipse([290 * s, 16 * s, 346 * s, 66 * s], outline=gold + (255,), width=9 * s)
    # case and dial
    d.ellipse([140 * s, 90 * s, 496 * s, 446 * s], fill=gold_d + (255,))
    d.ellipse([152 * s, 102 * s, 484 * s, 434 * s], fill=gold + (255,))
    d.ellipse([178 * s, 128 * s, 458 * s, 408 * s], fill=(236, 226, 200, 255), outline=(150, 120, 60, 255), width=3 * s)
    cx, cy = 318 * s, 268 * s
    for k in range(12):
        a = 2 * math.pi * k / 12
        r0, r1 = 118 * s, (132 if k % 3 else 128) * s
        d.line([(cx + r0 * math.sin(a), cy - r0 * math.cos(a)), (cx + r1 * math.sin(a), cy - r1 * math.cos(a))], fill=(40, 34, 28, 255), width=(5 if k % 3 == 0 else 3) * s)
    d.line([(cx, cy), (cx + 60 * s, cy - 55 * s)], fill=(30, 26, 22, 255), width=7 * s)
    d.line([(cx, cy), (cx - 20 * s, cy - 100 * s)], fill=(30, 26, 22, 255), width=5 * s)
    d.ellipse([cx - 9 * s, cy - 9 * s, cx + 9 * s, cy + 9 * s], fill=(30, 26, 22, 255))
    hl = canvas(W, W)
    ImageDraw.Draw(hl).arc([160 * s, 110 * s, 476 * s, 426 * s], 200, 250, fill=(255, 245, 210, 210), width=12 * s)
    im.alpha_composite(hl.filter(ImageFilter.GaussianBlur(3 * s)))
    return drop_shadow(finish(im, W, W))


def egg():
    W = 512
    size = W * S
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    cx, cy = size / 2, size / 2 + 10 * S
    rx, ry = 130 * S, 175 * S
    dy = (yy - cy) / ry
    dx = (xx - cx) / (rx * (1 - 0.12 * dy))
    rr = dx * dx + dy * dy
    inside = rr <= 1
    dz = np.sqrt(np.clip(1 - rr, 0, 1))
    lam = np.clip(-0.6 * dx - 0.6 * dy + 0.55 * dz, 0, 1)
    base = np.array([226, 218, 196], float)
    col = base * (0.35 + 0.75 * lam[..., None])
    veins = (np.sin(dx * 9 + np.sin(dy * 7) * 2) * np.sin(dy * 13 + dx * 3)) > 0.93
    col[veins] = col[veins] * 0.85 + np.array([90, 150, 170]) * 0.15
    rgba = np.zeros((size, size, 4))
    rgba[..., :3] = np.clip(col, 0, 255)
    rgba[..., 3] = 255 * inside
    im = Image.fromarray(rgba.astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(S * 0.6))
    return drop_shadow(finish(im, W, W))


def key():
    W = 512
    im = canvas(W, W)
    d = ImageDraw.Draw(im)
    s = S
    brass, dark, hi = (176, 136, 70), (96, 70, 34), (232, 196, 128)
    # diagonal: bow lower-left, bit upper-right
    def P(x, y):
        return (x * s, y * s)
    d.line([P(170, 350), P(420, 100)], fill=dark, width=34 * s)
    d.line([P(170, 350), P(420, 100)], fill=brass, width=24 * s)
    d.line([P(176, 336), P(414, 98)], fill=hi, width=5 * s)
    # bit teeth
    d.polygon([P(372, 148), P(412, 188), P(392, 208), P(352, 168)], fill=brass, outline=dark)
    d.polygon([P(338, 182), P(372, 216), P(356, 232), P(322, 198)], fill=brass, outline=dark)
    # snake-head bow
    d.ellipse([P(70, 300), P(220, 450)], fill=dark)
    d.ellipse([P(80, 310), P(210, 440)], fill=brass)
    d.ellipse([P(112, 342), P(178, 408)], fill=(0, 0, 0, 0))
    d.polygon([P(70, 380), P(28, 360), P(40, 420)], fill=brass, outline=dark)
    d.ellipse([P(92, 330), P(108, 346)], fill=(20, 18, 14, 255))
    return drop_shadow(finish(im, W, W))


def snake_head(open_mouth=False):
    """Top-down snake head pointing up: spade outline, glossy black, iridescent grazing rim, head plates."""
    W = 512
    size = W * S
    cx = size / 2
    # outline as a polygon (spade): wide jaw at the back, rounded snout at the top, neck at the bottom
    pts = []
    for i in range(0, 181):
        a = math.radians(i)  # 0..180 across the top half from right to left
        # superellipse-ish snout
        rx, ry = 118 * S, 205 * S
        x = rx * math.cos(a)
        y = -ry * math.sin(a) ** 0.85
        # widen the back of the jaw
        k = 1 + 0.18 * math.exp(-((math.sin(a) - 0.35) / 0.25) ** 2)
        pts.append((cx + x * k, 300 * S + y))
    pts += [(cx - 86 * S, 470 * S), (cx - 70 * S, size), (cx + 70 * S, size), (cx + 86 * S, 470 * S)]
    pts = pts[:181] + [(cx - 118 * S, 300 * S), (cx - 96 * S, 410 * S), (cx - 70 * S, size), (cx + 70 * S, size), (cx + 96 * S, 410 * S), (cx + 118 * S, 300 * S)]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    if open_mouth:
        md = ImageDraw.Draw(mask)
        md.polygon([(cx - 10 * S, 250 * S), (cx + 10 * S, 250 * S), (cx + 70 * S, 85 * S), (cx - 70 * S, 85 * S)], fill=0)
    m = np.array(mask.filter(ImageFilter.GaussianBlur(1.5 * S)), float) / 255
    # fake height field from distance-to-edge for shading
    dist = np.array(mask.filter(ImageFilter.GaussianBlur(40 * S)), float) / 255
    gy, gx = np.gradient(dist)
    nz = np.ones_like(dist) * 0.004
    nrm = np.stack([-gx, -gy, nz], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    lam = np.clip(nrm @ LIGHT, 0, 1)
    half = LIGHT + np.array([0, 0, 1.0])
    half /= np.linalg.norm(half)
    spec = np.clip(nrm @ half, 0, 1) ** 30
    col = np.stack([6 + 22 * lam, 7 + 23 * lam, 9 + 27 * lam], -1)
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    hue = (yy / size) * 5 + (xx / size) * 2
    irid = np.stack([np.sin(hue) * 0.5 + 0.5, np.sin(hue + 2.1) * 0.5 + 0.5, np.sin(hue + 4.2) * 0.5 + 0.5], -1)
    graze = np.clip(1 - nrm[..., 2], 0, 1) ** 1.5
    col = col + irid * 120 * (graze * lam)[..., None] * 0.6 + 255 * spec[..., None] * 0.6
    rgba = np.zeros((size, size, 4))
    rgba[..., :3] = np.clip(col, 0, 255)
    rgba[..., 3] = 255 * m
    im = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(im)
    # head plates (subtle lines)
    for off in (-34, 34):
        d.line([(cx + off * S, 150 * S), (cx + off * 1.6 * S, 300 * S)], fill=(40, 42, 48, 140), width=2 * S)
    d.line([(cx - 60 * S, 190 * S), (cx + 60 * S, 190 * S)], fill=(40, 42, 48, 110), width=2 * S)
    # eyes on the sides, glassy
    for ex in (-1, 1):
        x, y = cx + ex * 84 * S, 205 * S
        d.ellipse([x - 17 * S, y - 13 * S, x + 17 * S, y + 13 * S], fill=(3, 3, 5, 255), outline=(70, 72, 80, 255), width=2 * S)
        d.ellipse([x - 9 * S, y - 8 * S, x - 2 * S, y - 2 * S], fill=(235, 225, 200, 230))
    # nostrils
    for ex in (-1, 1):
        d.ellipse([cx + ex * 18 * S - 4 * S, 110 * S, cx + ex * 18 * S + 4 * S, 118 * S], fill=(2, 2, 3, 255))
    if open_mouth:
        inner = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(inner).polygon([(cx - 8 * S, 245 * S), (cx + 8 * S, 245 * S), (cx + 60 * S, 95 * S), (cx - 60 * S, 95 * S)], fill=(120, 44, 56, 255))
        inner.alpha_composite(im)
        im = inner
    return drop_shadow(finish(im, W, W), (6, 10), 12, 150)


def tongue():
    W = 256
    im = canvas(W, W)
    d = ImageDraw.Draw(im)
    c = (120, 24, 34, 255)
    d.line([(128 * S, 250 * S), (128 * S, 90 * S)], fill=c, width=7 * S)
    d.line([(128 * S, 92 * S), (104 * S, 18 * S)], fill=c, width=6 * S)
    d.line([(128 * S, 92 * S), (152 * S, 18 * S)], fill=c, width=6 * S)
    return finish(im, W, W)


def tail():
    W = 512
    size = W * S
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    cx = size / 2
    t = yy / size
    halfw = 95 * S * t ** 0.8
    inside = np.abs(xx - cx) <= halfw
    nx = np.clip((xx - cx) / (halfw + 1e-6), -1, 1)
    nz = np.sqrt(np.clip(1 - nx ** 2, 0, 1))
    lam = np.clip(-0.55 * nx + 0.6 * nz, 0, 1)
    col = np.stack([8 + 40 * lam, 9 + 42 * lam, 12 + 48 * lam], -1)
    rgba = np.zeros((size, size, 4))
    rgba[..., :3] = col
    rgba[..., 3] = 255 * inside
    return finish(Image.fromarray(rgba.astype(np.uint8), "RGBA"), W, W)


def scale_strip(w=1024, h=128):
    """Tileable dorsal scale strip (horizontal, seamless in x). Imbricated black scales; the iridescence
    is a smooth sheen across the upper flank (the in-engine shader adds the moving highlights)."""
    out = np.zeros((h, w, 3))
    across = np.abs(np.mgrid[0:h, 0:w][0] / (h - 1) - 0.5) * 2
    out[:] = (10, 11, 14)
    per = w / 32.0  # 32 scales per strip length: integer -> seamless
    rows = 7
    rh = h / rows
    img = Image.fromarray(out.astype(np.uint8))
    d = ImageDraw.Draw(img)
    for r in range(rows + 1):
        y0 = r * rh - rh * 0.2
        shift = (per / 2) * (r % 2)
        for k in range(-1, 34):
            x0 = k * per + shift
            flank = abs((y0 + rh / 2) / h - 0.5) * 2
            lum = int(20 + 38 * (1 - flank ** 2))
            poly = [(x0 + per * 0.5, y0 - rh * 0.1), (x0 + per * 1.05, y0 + rh * 0.55), (x0 + per * 0.5, y0 + rh * 1.15), (x0 - per * 0.05, y0 + rh * 0.55)]
            d.polygon(poly, fill=(lum, lum + 2, lum + 6), outline=(4, 4, 6))
            d.line([poly[0], poly[1]], fill=(lum + 26, lum + 28, lum + 34), width=2)
    arr = np.array(img.filter(ImageFilter.GaussianBlur(0.7)), float)
    xx = np.mgrid[0:h, 0:w][1]
    hue = xx / w * 2 * np.pi * 2
    irid = np.stack([np.sin(hue) * 0.5 + 0.5, np.sin(hue + 2.1) * 0.5 + 0.5, np.sin(hue + 4.2) * 0.5 + 0.5], -1)
    band = np.exp(-((np.mgrid[0:h, 0:w][0] / h - 0.33) / 0.14) ** 2)
    arr = arr + irid * 34 * band[..., None] * (arr.mean(-1, keepdims=True) / 60)
    arr = arr * (1 - 0.45 * across[..., None] ** 3)
    rgba = np.zeros((h, w, 4))
    rgba[..., :3] = np.clip(arr, 0, 255)
    rgba[..., 3] = 255
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def shed():
    W = 512
    im = canvas(W, W)
    d = ImageDraw.Draw(im)
    for k in range(3):
        d.ellipse([(90 + 10 * k) * S, (100 + 8 * k) * S, (420 - 8 * k) * S, (410 - 10 * k) * S], outline=(210, 214, 220, 90 - 20 * k), width=(26 - 6 * k) * S)
    return finish(im.filter(ImageFilter.GaussianBlur(2 * S)), W, W)


def room(w, h, portrait=False):
    """Dark strongroom plate: gradient, vault door, blinds slats, vignette, dust."""
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    u, v = xx / w, yy / h
    base = np.stack([14 + 10 * (1 - v), 15 + 10 * (1 - v), 18 + 12 * (1 - v)], -1)
    # warm key glow upper-left
    glow = np.exp(-(((u - 0.12) / 0.45) ** 2 + ((v - 0.1) / 0.5) ** 2))
    base = base + np.array([70, 48, 22]) * glow[..., None] * 0.55
    # vault door (ring) in the background
    dcx, dcy, dr = (0.78, 0.3, 0.2) if not portrait else (0.5, 0.1, 0.3)
    dd = np.sqrt(((u - dcx) * w) ** 2 + ((v - dcy) * h) ** 2) / (dr * min(w, h) * 1.1)
    ringm = np.exp(-((dd - 1) / 0.05) ** 2) + 0.5 * np.exp(-((dd - 0.7) / 0.03) ** 2)
    base = base + np.array([60, 48, 30]) * ringm[..., None] * 0.6
    # blinds: diagonal slats of warm light (~30 degrees)
    ang = math.radians(30)
    p = (xx * math.cos(ang) + yy * math.sin(ang)) / (min(w, h) * 0.06)
    slats = (np.sin(p * math.pi) > 0.35).astype(float) * np.exp(-(((u - 0.35) / 0.55) ** 2)) * np.clip(1.2 - v, 0, 1)
    base = base + np.array([95, 70, 38]) * slats[..., None] * 0.35
    # vignette
    vig = np.clip(1 - 0.85 * (((u - 0.5) / 0.75) ** 2 + ((v - 0.5) / 0.75) ** 2), 0.15, 1)
    base = base * vig[..., None]
    # dust
    dust = rng.random((h, w)) > 0.9994
    base[dust] += 40
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(1.2))


def velvet(n=1024):
    noise = rng.normal(0, 1, (n, n))
    im = Image.fromarray(np.clip(18 + noise * 6, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.1))
    arr = np.array(im, float)
    rgb = np.stack([arr * 0.95, arr * 0.92, arr * 1.05], -1)
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def frame(n=2048, inner=0.86):
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = int(n * (1 - inner) / 2)
    d.rectangle([0, 0, n - 1, n - 1], fill=(22, 24, 27, 255))
    # brushed steel noise
    arr = np.array(im, float)
    noise = rng.normal(0, 4, (n, n))
    arr[..., :3] += noise[..., None]
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(im)
    d.rectangle([m - 14, m - 14, n - m + 13, n - m + 13], fill=BRASS + (255,))
    d.rectangle([m - 6, m - 6, n - m + 5, n - m + 5], fill=shade(BRASS, -0.45) + (255,))
    d.rectangle([m, m, n - m - 1, n - m - 1], fill=(0, 0, 0, 0))
    for k in range(14):
        for (x, y) in [(m / 2 + k * (n - m) / 13, m / 2), (m / 2 + k * (n - m) / 13, n - m / 2), (m / 2, m / 2 + k * (n - m) / 13), (n - m / 2, m / 2 + k * (n - m) / 13)]:
            d.ellipse([x - 13, y - 13, x + 13, y + 13], fill=(46, 48, 52, 255), outline=(10, 10, 12, 255), width=3)
            d.ellipse([x - 7, y - 9, x - 1, y - 3], fill=(120, 122, 128, 255))
    return im


def guardian_eye():
    W = 512
    size = W * S
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    cx = cy = size / 2
    rx, ry = 200 * S, 120 * S
    dx, dy = (xx - cx) / rx, (yy - cy) / ry
    rr = dx * dx + dy * dy
    inside = rr <= 1
    ir = np.sqrt(((xx - cx) / (110 * S)) ** 2 + ((yy - cy) / (110 * S)) ** 2)
    iris = np.stack([200 - 90 * ir, 140 - 70 * ir, 40 - 20 * ir], -1)
    pupil = (np.abs(xx - cx) < 16 * S * np.sqrt(np.clip(1 - ((yy - cy) / (110 * S)) ** 2, 0, 1)))
    col = np.where((ir <= 1)[..., None], iris, np.array([20, 18, 16]))
    col[pupil & (ir <= 1)] = [5, 5, 6]
    spec = np.exp(-(((xx - cx + 50 * S) / (18 * S)) ** 2 + ((yy - cy + 40 * S) / (12 * S)) ** 2))
    col = col + 255 * spec[..., None] * 0.9
    rgba = np.zeros((size, size, 4))
    rgba[..., :3] = np.clip(col, 0, 255)
    rgba[..., 3] = 255 * inside
    return finish(Image.fromarray(rgba.astype(np.uint8), "RGBA"), W, W)


def tile_background(n=1200):
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    u, v = xx / n, yy / n
    base = np.stack([232 - 40 * v, 196 - 50 * v, 132 - 50 * v], -1)
    ang = math.radians(30)
    p = (xx * math.cos(ang) + yy * math.sin(ang)) / (n * 0.07)
    slats = (np.sin(p * math.pi) > 0.3).astype(float)
    base = base + np.array([25, 22, 15]) * slats[..., None]
    center = np.exp(-(((u - 0.5) / 0.45) ** 2 + ((v - 0.45) / 0.45) ** 2))
    base = base + np.array([20, 18, 12]) * center[..., None]
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(3))


def main():
    os.makedirs(OUT, exist_ok=True)
    save(opal(), "sym_H1.png")
    save(ring(), "sym_H2.png")
    save(vial(), "sym_H3.png")
    save(watch(), "sym_H4.png")
    save(facet_gem(pear(), (256, 250), (176, 18, 46)), "sym_L1.png")
    save(facet_gem(cushion(), (256, 256), (40, 86, 196)), "sym_L2.png")
    save(emerald_steps(emerald_cut(), (222, 160, 36)), "sym_L3.png")
    save(facet_gem(round_brilliant(), (256, 256), (140, 78, 196), 0.5, star=True), "sym_L4.png")
    save(egg(), "sym_EGG.png")
    save(key(), "sym_KEY.png")
    save(sphere((236, 232, 226), sheen=(60, 40, 60)), "pearl_white.png")
    save(sphere((214, 168, 70), sheen=(70, 50, 10)), "pearl_gold.png")
    save(sphere((232, 170, 180), sheen=(60, 30, 40)), "pearl_rose.png")
    save(sphere((42, 44, 50), sheen=(40, 120, 90), inner=(60, 30, 90)), "pearl_black.png")
    save(sphere((40, 220, 120), glow=VENOM, inner=(120, 255, 170)), "pearl_venom.png")
    save(sphere((30, 240, 110), r=170, glow=VENOM, inner=(180, 255, 200)), "pearl_venom_grand.png")
    save(snake_head(False), "snake_head.png")
    save(snake_head(True), "snake_head_open.png")
    save(tongue(), "snake_tongue.png")
    save(tail(), "snake_tail.png")
    save(scale_strip(), "snake_scales_strip.png")
    save(shed(), "snake_shed.png")
    save(room(2560, 1440), "bg_landscape.jpg")
    save(room(1440, 2560, True), "bg_portrait.jpg")
    save(velvet(), "board_velvet.jpg")
    save(frame(), "board_frame.png")
    save(guardian_eye(), "guardian_eye.png")
    save(tile_background(), "tile_background.png")
    fg = canvas(1024, 1024)
    head = snake_head(False).resize((720, 720), Image.LANCZOS)
    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    fg.alpha_composite(head, (150, 40))
    fg.alpha_composite(opal().resize((420, 420), Image.LANCZOS), (300, 560))
    save(fg, "tile_foreground.png")
    print("placeholders written to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
