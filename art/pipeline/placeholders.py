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
SNAKE_WHITE = np.array([242.0, 241.0, 237.0])  # the serpent's scales (owner's call: a white snake)
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


def brass_shade(mask: Image.Image, relief=26.0, base=(176, 136, 70)) -> Image.Image:
    """Shade a mask as polished brass lit from the upper left (height from a blurred mask, dithered)."""
    n = mask.width
    m = np.array(mask, float) / 255
    hgt = np.array(mask.filter(ImageFilter.GaussianBlur(n / 90)), float) / 255
    hgt = hgt + rng.normal(0, 0.004, hgt.shape)  # dither: no banding
    gy, gx = np.gradient(hgt * relief)
    nrm = np.stack([-gx, -gy, np.ones_like(hgt)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    lam = np.clip(nrm @ LIGHT, 0, 1)
    half = LIGHT + np.array([0, 0, 1.0])
    half /= np.linalg.norm(half)
    spec = np.clip(nrm @ half, 0, 1) ** 40
    b = np.array(base, float)
    col = b * (0.35 + 0.85 * lam[..., None]) + np.array([255, 236, 190]) * spec[..., None] * 0.7
    rgba = np.dstack([np.clip(col, 0, 255), m * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def key():
    """Antique brass vault key; the bow is a serpent head with a ring hole (STYLE_BIBLE §5)."""
    W = 512
    n = W * S
    P = lambda x, y: (x * S, y * S)
    mask = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(mask)
    # shaft (diagonal: bow lower-left, bit upper-right) with two collar rings
    d.line([P(205, 312), P(420, 97)], fill=255, width=26 * S)
    for t in (0.1, 0.18):
        cx, cy = 205 + (420 - 205) * t, 312 + (97 - 312) * t
        d.line([P(cx - 17, cy - 17), P(cx + 17, cy + 17)], fill=255, width=11 * S)
    # stepped bit
    d.polygon([P(376, 140), P(418, 182), P(398, 202), P(356, 160)], fill=255)
    d.polygon([P(344, 172), P(380, 208), P(364, 224), P(328, 188)], fill=255)
    d.polygon([P(318, 198), P(342, 222), P(330, 234), P(306, 210)], fill=255)
    # serpent-head bow (viper seen from above): snout down-left, wide jaw, neck flowing into the shaft
    import math as _m
    ang = _m.radians(135)  # snout direction: down-left, continuing the shaft (image y points down)
    K = 1.15
    cxh, cyh = 205 + 62 * K * _m.cos(ang), 312 + 62 * K * _m.sin(ang)
    def L(x, y):  # local head coords (x toward the snout) -> canvas
        return P(cxh + K * (x * _m.cos(ang) - y * _m.sin(ang)), cyh + K * (x * _m.sin(ang) + y * _m.cos(ang)))
    half = [(98, 0), (90, 10), (72, 22), (48, 34), (22, 44), (0, 48), (-22, 44), (-42, 30), (-56, 18), (-64, 12)]
    outline = [L(x, y) for x, y in half] + [L(x, -y) for x, y in reversed(half)]
    d.polygon(outline, fill=255)
    hole = Image.new("L", (n, n), 0)
    hx, hy = L(-6, 0)
    ImageDraw.Draw(hole).ellipse([hx - 20 * K * S, hy - 20 * K * S, hx + 20 * K * S, hy + 20 * K * S], fill=255)
    mask = Image.fromarray(np.clip(np.array(mask, int) - np.array(hole, int), 0, 255).astype(np.uint8), "L")
    im = brass_shade(mask)
    dd = ImageDraw.Draw(im)
    # engraved centre ridge along the snout and brow ridges over small recessed eyes
    dd.line([L(92, 0), L(26, 0)], fill=(110, 80, 38, 200), width=2 * S)
    for sgn in (-1, 1):
        dd.line([L(62, 18 * sgn), L(40, 30 * sgn)], fill=(236, 204, 140, 220), width=3 * S)  # brow catch-light
        ex, ey = L(50, 22 * sgn)
        r = 4.5 * K * S
        dd.ellipse([ex - r, ey - r, ex + r, ey + r], fill=(18, 13, 8, 255))
    return drop_shadow(finish(im, W, W))


def snake_head(open_mouth=False):
    """Top-down viper head pointing up. Analytic height field (smooth float shading, no banding), broad jaw,
    brow ridges, white diamond scales continuous with the body strip (same light as the in-game body shader:
    cool fill, warm tungsten key), small black glassy eyes, faint pearl sheen at the grazing edges."""
    W = 512
    SS = 2
    n = W * SS
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    u = (xx - n / 2) / n  # -0.5..0.5 across
    v = yy / n  # 0 top (snout) .. 1 bottom (neck)

    def smooth(a, b, x):
        t = np.clip((x - a) / (b - a), 0, 1)
        return t * t * (3 - 2 * t)

    # half-width profile: rounded snout, broad jaw, taper into a neck as wide as the body
    tip, snout_end, jaw, neck = 0.07, 0.20, 0.50, 0.72
    w_snout = 0.14 * np.sqrt(np.clip(1 - ((snout_end - v) / (snout_end - tip)) ** 2, 0, 1))
    w_mid = 0.14 + (0.25 - 0.14) * smooth(snout_end, jaw, v)
    w_back = 0.25 + (0.165 - 0.25) * smooth(jaw, neck, v)
    w = np.where(v < snout_end, w_snout, np.where(v < jaw, w_mid, w_back))
    w = np.maximum(w, 1e-4)
    inside = (np.abs(u) < w) & (v > tip)
    ux = np.clip(u / w, -1, 1)
    # height: rounded cross-section, flattened crown, low snout, brow ridges over the eyes
    h = np.sqrt(np.clip(1 - ux ** 2, 0, 1)) ** 0.8 * (0.55 + 0.45 * smooth(tip, 0.34, v))
    eye_v, eye_u = 0.31, 0.135
    for sgn in (-1, 1):
        h += 0.22 * np.exp(-(((u - sgn * (eye_u - 0.02)) / 0.05) ** 2 + ((v - (eye_v - 0.035)) / 0.045) ** 2))
    h *= inside
    hz = h * 0.09 * n  # height in pixels
    gy, gx = np.gradient(hz)
    nrm = np.stack([-gx, -gy, np.ones_like(hz)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    # scales: diamond lattice in head space (small on the sides, larger plates on the crown)
    crown_k = np.exp(-((u / 0.07) ** 2)) * np.exp(-(((v - 0.27) / 0.12) ** 2))
    cell = (0.042 + 0.05 * crown_k + 0.012 * (np.abs(ux) < 0.55)) * (0.8 + 0.4 * smooth(tip, neck, v))
    a = (u + v) / cell
    b = (v - u) / cell
    fa, fb = a - np.floor(a), b - np.floor(b)
    edge = np.minimum(np.minimum(fa, 1 - fa), np.minimum(fb, 1 - fb))  # 0 at the seams
    seam = 1 - smooth(0.0, 0.12, edge)
    dome = smooth(0.0, 0.5, edge)  # each scale bulges a little
    # a central seam down the crown (paired head shields)
    seam = np.maximum(seam, np.exp(-((u / 0.0035) ** 2)) * (v > 0.12) * (v < 0.46) * 0.8)
    lam = np.clip(nrm @ LIGHT, 0, 1)
    half = LIGHT + np.array([0, 0, 1.0])
    half /= np.linalg.norm(half)
    spec = np.clip(nrm @ half, 0, 1) ** 60
    graze = np.clip(1 - nrm[..., 2], 0, 1) ** 0.9
    hue = 6.0 * v + 3.0 * ux + 2.0 * graze
    irid = np.stack([np.sin(hue) * 0.5 + 0.5, np.sin(hue + 2.1) * 0.5 + 0.5, np.sin(hue + 4.2) * 0.5 + 0.5], -1)
    albedo = SNAKE_WHITE[None, None, :] * (0.93 + 0.07 * dome[..., None]) * (1 - 0.14 * seam)[..., None]
    fill, key_ = np.array([0.42, 0.44, 0.5]), np.array([1.0, 0.94, 0.84])
    col = albedo * (fill[None, None, :] + key_[None, None, :] * lam[..., None])
    col += irid * (26 * graze * (0.35 + 0.65 * lam))[..., None] * (0.6 + 0.4 * dome[..., None])
    col += 255 * (spec * (0.35 + 0.65 * dome))[..., None] * 0.3
    # rim light from the moon side (upper left)
    rim = np.clip(-ux, 0, 1) ** 6 * inside
    col += np.array([90, 96, 110])[None, None, :] * rim[..., None] * 0.25
    alpha = inside.astype(float) * (1 - smooth(0.66, 0.97, v))  # the neck fades into the body mesh
    # soften the silhouette
    am = Image.fromarray((alpha * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.2 * SS))
    rgba = np.zeros((n, n, 4))
    rgba[..., :3] = np.clip(col, 0, 255)
    rgba[..., 3] = np.array(am, float)
    im = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(im)
    cx = n / 2
    # eyes: big glossy cartoon eyes (D-042): ink socket ring, black glassy iris with a thin warm rim, a large
    # catchlight and a small second one
    for sgn in (-1, 1):
        ex, ey = cx + sgn * eye_u * n, eye_v * n
        R = 0.052 * n
        d.ellipse([ex - R * 1.2, ey - R * 1.14, ex + R * 1.2, ey + R * 1.14], fill=(4, 4, 6, 255))
        iris = Image.new("RGBA", (int(R * 2 + 4), int(R * 2 + 4)), (0, 0, 0, 0))
        iy, ix = np.mgrid[0 : iris.height, 0 : iris.width].astype(float)
        rr = np.hypot(ix - iris.width / 2, iy - iris.height / 2) / R
        # small, black, glassy (sunbeam snake, STYLE_BIBLE 4) with a thin warm iris rim so it reads at game size
        rimk = np.exp(-((rr - 0.86) / 0.09) ** 2)
        icol = np.stack([8 + 120 * rimk, 7 + 82 * rimk, 6 + 34 * rimk], -1)
        ia = (rr < 1).astype(float) * 255
        iris_px = np.dstack([icol, ia]).astype(np.uint8)
        iris = Image.fromarray(iris_px, "RGBA")
        im.alpha_composite(iris, (int(ex - iris.width / 2), int(ey - iris.height / 2)))
        d = ImageDraw.Draw(im)
        d.ellipse([ex - R * 0.16, ey - R * 0.8, ex + R * 0.16, ey + R * 0.8], fill=(0, 0, 0, 255))
        d.ellipse([ex - R * 0.66, ey - R * 0.74, ex - R * 0.06, ey - R * 0.16], fill=(255, 250, 238, 235))
        d.ellipse([ex + R * 0.22, ey + R * 0.3, ex + R * 0.46, ey + R * 0.54], fill=(255, 250, 238, 170))
    # nostrils
    for sgn in (-1, 1):
        nx_, ny_ = cx + sgn * 0.045 * n, 0.115 * n
        d.ellipse([nx_ - 0.009 * n, ny_ - 0.006 * n, nx_ + 0.009 * n, ny_ + 0.006 * n], fill=(58, 54, 52, 255))
    if open_mouth:
        # jaws parting at the snout: dark red gape inside the silhouette, two pale fangs
        mouth = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        md = ImageDraw.Draw(mouth)
        md.polygon([(cx - 0.085 * n, 0.085 * n), (cx + 0.085 * n, 0.085 * n), (cx + 0.035 * n, 0.2 * n), (cx - 0.035 * n, 0.2 * n)], fill=(88, 18, 30, 255))
        md.polygon([(cx - 0.05 * n, 0.1 * n), (cx + 0.05 * n, 0.1 * n), (cx + 0.02 * n, 0.17 * n), (cx - 0.02 * n, 0.17 * n)], fill=(140, 40, 56, 255))
        for sgn in (-1, 1):
            md.polygon([(cx + sgn * 0.07 * n, 0.09 * n), (cx + sgn * 0.052 * n, 0.09 * n), (cx + sgn * 0.058 * n, 0.15 * n)], fill=(236, 228, 210, 255))
        m_a = np.array(mouth.split()[-1], float) * (np.array(am, float) / 255)
        mouth.putalpha(Image.fromarray(m_a.astype(np.uint8), "L"))
        im.alpha_composite(mouth)
    return drop_shadow(im.resize((W, W), Image.LANCZOS), (6, 10), 12, 150)


def tongue():
    """Thin forked tongue, base at the bottom centre (the game anchors it there). A tapered round stem splits into
    two tines that curve outwards to fine points; dark charcoal with a red tint, lit from the upper left, with a
    wet specular line (HIGGSFIELD_PROMPTS SNAKE_TONGUE)."""
    W = 256
    size = W * S
    yy, xx = np.mgrid[0:size, 0:size].astype(float) / S
    fork = 100.0
    # centre lines as (x, y, radius) samples, in 256-px units
    t = np.linspace(0, 1, 48)
    stem = np.stack([128 + 0 * t, 254 - (254 - fork) * t, 7.5 - 2.0 * t], -1)
    tines = []
    for side in (-1, 1):
        tines.append(np.stack([128 + side * (4 + 30 * t ** 1.5), fork - 88 * t, 5.2 * (1 - t) ** 0.7 + 0.6], -1))
    field = np.full((size, size), 1e9)
    lat = np.zeros((size, size))  # signed lateral offset / radius at the nearest segment (for the tube normal)
    along = np.zeros((size, size))  # 0 at the base, 1 at the tips
    for li, line in enumerate([stem] + tines):
        for i in range(len(line) - 1):
            (x0, y0, r0), (x1, y1, r1) = line[i], line[i + 1]
            pad = max(r0, r1) + 2
            bx0, bx1 = int(max(0, (min(x0, x1) - pad) * S)), int(min(size, (max(x0, x1) + pad) * S) + 1)
            by0, by1 = int(max(0, (min(y0, y1) - pad) * S)), int(min(size, (max(y0, y1) + pad) * S) + 1)
            px, py = xx[by0:by1, bx0:bx1], yy[by0:by1, bx0:bx1]
            dx, dy = x1 - x0, y1 - y0
            ll = dx * dx + dy * dy
            u = np.clip(((px - x0) * dx + (py - y0) * dy) / ll, 0, 1)
            qx, qy = px - (x0 + u * dx), py - (y0 + u * dy)
            dist = np.hypot(qx, qy)
            r = r0 + (r1 - r0) * u
            f = dist - r
            sub = field[by0:by1, bx0:bx1]
            better = f < sub
            sub[better] = f[better]
            ln = math.sqrt(ll)
            side_off = (qx * -dy + qy * dx) / ln / np.maximum(r, 0.3)  # cross product sign: which side of the line
            lat[by0:by1, bx0:bx1][better] = np.clip(side_off, -1, 1)[better]
            a = (i + u) / (len(line) - 1)
            along[by0:by1, bx0:bx1][better] = (0.55 * a if li == 0 else 0.55 + 0.45 * a)[better]
    inside = np.clip(0.5 - field * S / 2, 0, 1)
    nx = -lat  # +x of the tube normal points left, towards the light
    nz = np.sqrt(np.clip(1 - nx ** 2, 0, 1))
    lam = np.clip(0.62 * nx + 0.25 + 0.6 * nz, 0, 1)  # light from the upper left (tube normal in x only)
    base = np.array([138.0, 38.0, 52.0])
    tip = np.array([74.0, 28.0, 38.0])
    col = base[None, None] * (1 - along[..., None]) + tip[None, None] * along[..., None]
    col = col * (0.45 + 0.75 * lam[..., None])
    spec = np.clip(1 - np.abs(nx - 0.45) / 0.22, 0, 1) ** 2 * (1 - 0.6 * along)
    col = col + spec[..., None] * np.array([150.0, 118.0, 110.0])
    rgba = np.zeros((size, size, 4))
    rgba[..., :3] = np.clip(col, 0, 255)
    rgba[..., 3] = 255 * inside
    return finish(Image.fromarray(rgba.astype(np.uint8), "RGBA"), W, W)


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
    col = SNAKE_WHITE[None, None, :] * (np.array([0.42, 0.44, 0.5]) + np.array([1.0, 0.94, 0.84]) * lam[..., None])
    rgba = np.zeros((size, size, 4))
    rgba[..., :3] = col
    rgba[..., 3] = 255 * inside
    return finish(Image.fromarray(rgba.astype(np.uint8), "RGBA"), W, W)


def scale_strip(w=1024, h=128):
    """Tileable dorsal scale strip (horizontal, seamless in x). Imbricated white scales with soft grey seams, a
    faint pearl sheen across the upper flank; mostly albedo, since the in-engine shader does the lighting."""
    out = np.zeros((h, w, 3))
    across = np.abs(np.mgrid[0:h, 0:w][0] / (h - 1) - 0.5) * 2
    out[:] = (192, 191, 188)
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
            lum = int(218 + 22 * (1 - flank ** 2))
            poly = [(x0 + per * 0.5, y0 - rh * 0.1), (x0 + per * 1.05, y0 + rh * 0.55), (x0 + per * 0.5, y0 + rh * 1.15), (x0 - per * 0.05, y0 + rh * 0.55)]
            d.polygon(poly, fill=(lum, lum - 1, lum - 4), outline=(176, 174, 171))
            d.line([poly[0], poly[1]], fill=(min(255, lum + 12), min(255, lum + 12), min(255, lum + 10)), width=2)
    arr = np.array(img.filter(ImageFilter.GaussianBlur(0.7)), float)
    xx = np.mgrid[0:h, 0:w][1]
    hue = xx / w * 2 * np.pi * 2
    irid = np.stack([np.sin(hue) * 0.5 + 0.5, np.sin(hue + 2.1) * 0.5 + 0.5, np.sin(hue + 4.2) * 0.5 + 0.5], -1)
    band = np.exp(-((np.mgrid[0:h, 0:w][0] / h - 0.33) / 0.14) ** 2)
    arr = arr + (irid - 0.5) * 16 * band[..., None]
    arr = arr * (1 - 0.18 * across[..., None] ** 3)
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


def _ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def room(w, h, portrait=False):
    """1940s strongroom plate after midnight (STYLE_BIBLE §2, D-043, D-047): an art-deco panelled wall in deep
    blue lacquer (fluted pilasters, inset panels with brass pinstripes and stepped corners, a dentil frieze), soft
    moonlight shafts through the blinds from the upper left, fan sconces casting warm pools, a heavy round vault
    door ajar with warm gold light leaking round its rim, and a polished black counter with a brass edge that
    mirrors the room and catches a few gold glints. The centre stays calm and darker for the board; the brass
    stays warm against the cool room."""
    r = np.random.default_rng(47)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xx / w, yy / h
    S0 = min(w, h)
    px = S0 / 1440.0  # one design pixel at the 1440 reference size
    ctop = 0.8 if not portrait else 0.86  # counter top
    ftop = 0.075 if not portrait else 0.045  # frieze bottom
    # ---------------------------------------------------------------- albedo and relief
    alb = np.zeros((h, w, 3), np.float32)
    lac = np.array([30, 44, 62], np.float32)  # deep blue lacquer
    alb[:] = lac
    relief = np.zeros((h, w), np.float32)  # >0 catches light (faces up/left), <0 in shade
    brass = np.zeros((h, w), np.float32)  # brass inlay coverage (0..1)
    # pilasters and panels
    Pw = (0.155 if not portrait else 0.27) * w
    off = (0.5 * w) % Pw - Pw / 2  # a pilaster sits on the centre line (hidden by the board) so both sides match
    pil_w = 0.19 * Pw
    k = np.floor((xx - off) / Pw)
    lx = (xx - off) - k * Pw  # 0..Pw, the pilaster centred on 0
    dpil = np.minimum(lx, Pw - lx)  # distance to the nearest pilaster centre line
    on_pil = dpil < pil_w / 2
    wall_zone = (v > ftop) & (v < ctop)
    # fluting: five grooves across the pilaster
    fl = np.cos((dpil / (pil_w / 2)) * math.pi * 2.5 * 2)
    relief += np.where(on_pil & wall_zone, 0.35 * fl, 0)
    alb[on_pil & wall_zone] *= 0.82
    # pilaster edges: thin brass line
    pe = np.exp(-((dpil - pil_w / 2) / (1.3 * px)) ** 2)
    brass += pe * wall_zone
    # inset panel frame (double pinstripe with stepped corners)
    m = pil_w / 2 + 0.11 * Pw  # margin from the pilaster centre to the frame
    x0 = m
    x1 = Pw - m
    ty0, ty1 = (ftop + 0.05) * h, (ctop - 0.06) * h
    qx = np.minimum(lx - x0, x1 - lx)  # >0 inside horizontally
    qy = np.minimum(yy - ty0, ty1 - yy)
    st = 0.07 * Pw  # stepped corner size
    # signed distance to the panel outline: the rectangle with a square step cut into each corner
    sd = np.maximum(-np.minimum(qx, qy), np.minimum(st - qx, st - qy))
    for g, wgt in ((0.0, 0.9), (0.028 * Pw, 0.6)):
        brass += wgt * np.exp(-((sd + g) / (1.1 * px)) ** 2)
    inside_panel = sd < 0
    # a raised panel face: lit along its top and left, a soft shade along its bottom and right
    relief += np.where(inside_panel, 0.1 * (1 - v), 0)
    relief += 0.25 * np.exp(-np.clip(-sd, 0, None) / (5 * px)) * inside_panel * np.where((yy - ty0 < ty1 - yy), 1, -1)
    # frieze: dark band, a row of dentils and two brass lines
    fz = v <= ftop
    alb[fz] = lac * 0.62
    dent_w = 0.012 * w
    dent = ((xx % (dent_w * 2)) < dent_w) & (v > ftop * 0.35) & (v < ftop * 0.8)
    relief += np.where(dent, 0.35, 0)
    relief += np.where(dent & ((xx % (dent_w * 2)) < 2 * px), 0.4, 0)
    for lv, wgt in ((ftop, 1.0), (ftop * 0.3, 0.7), (ftop + 0.012, 0.6)):
        brass += wgt * np.exp(-((yy - lv * h) / (1.4 * px)) ** 2)
    # dado: brass rail above the counter's back panel
    brass += 0.8 * np.exp(-((yy - (ctop - 0.025) * h) / (1.6 * px)) ** 2)
    # ---------------------------------------------------------------- lighting
    # moonlight key from the upper left, through the blinds as soft volumetric shafts
    key = np.exp(-(((u - 0.0) / 0.55) ** 2 + ((v - 0.0) / 0.7) ** 2))
    a30 = math.radians(30)
    pp = (yy * math.cos(a30) - xx * math.sin(a30)) / (S0 * 0.11)
    slat = 0.5 + 0.5 * np.sin(pp * math.pi * 2)
    slat = _ss(0.3, 0.8, slat)
    beam = slat * np.exp(-(((u - 0.06) / 0.34) ** 2 + ((v - 0.1) / 0.5) ** 2))
    centre = np.exp(-(((u - 0.5) / 0.25) ** 2 + ((v - 0.47) / 0.33) ** 2))
    beam = beam * (1 - 0.75 * centre)
    moon = np.array([0.55, 0.72, 1.0], np.float32)
    warm = np.array([1.0, 0.72, 0.4], np.float32)
    light = np.full((h, w, 3), 0.42, np.float32) * np.array([0.8, 0.88, 1.0], np.float32)
    light += moon * (0.55 * key + 0.5 * beam)[..., None]
    # teal moon rim from the right edge
    light += np.array([0.1, 0.35, 0.4], np.float32) * (np.exp(-(((u - 1.02) / 0.12) ** 2)) * (0.5 + 0.5 * (1 - v)))[..., None]
    # sconces: fan-shaped deco wall lamps with warm pools up and down the wall
    # fan sconces mounted on pilasters (snapped to the nearest pilaster centre)
    want = [(0.1, 0.36)] if not portrait else [(0.1, 0.8), (0.9, 0.8)]
    sconces = [(((round((tx * w - off) / Pw) * Pw) + off) / w, ty) for tx, ty in want]
    for sx, sy in sconces:
        dx, dy = (u - sx) * w / S0, (v - sy) * h / S0
        pool = np.exp(-((dx / 0.09) ** 2 + (dy / 0.24) ** 2)) + 0.8 * np.exp(-((dx / 0.045) ** 2 + ((dy + 0.1) / 0.1) ** 2))
        light += warm * (1.6 * pool)[..., None]
    # the vault interior glows gold round the door's rim
    dcx, dcy, R = (0.83 * w, 0.4 * h, 0.3 * h) if not portrait else (0.5 * w, 0.13 * h, 0.3 * w)
    gx, gy = dcx - R * 0.045, dcy  # the door sits a little off its frame (ajar towards the hinge side)
    dd_frame = np.hypot(xx - dcx, yy - dcy) / R
    leak = np.exp(-((dd_frame - 1.2) / 0.22) ** 2) * (0.5 + 0.5 * np.clip((xx - (dcx - R)) / (2 * R), 0, 1))
    light += warm * (0.7 * leak)[..., None]
    light = light * (1 - 0.32 * centre)[..., None]
    # ---------------------------------------------------------------- compose the wall
    shade_k = 1 + relief * 0.9
    col = alb * shade_k[..., None] * light
    bcol = np.array([206, 164, 92], np.float32)
    bl = np.clip(brass, 0, 1)[..., None]
    col = col * (1 - bl) + bcol * bl * (0.45 + 0.55 * np.clip(light / 1.2, 0, 1.4))
    # ---------------------------------------------------------------- counter: polished black with a brass edge
    cz = v >= ctop
    top_h = 0.035
    ref_zone = (v >= ctop) & (v < ctop + top_h)
    # reflection of the wall above (mirrored, blurred, dim)
    src_rows = np.clip((2 * ctop * h - yy).astype(int), 0, h - 1)
    refl = col[src_rows, xx.astype(int)]
    refl_img = Image.fromarray(np.clip(refl, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6 * px))
    refl = np.asarray(refl_img, np.float32)
    marble = np.array([10, 12, 16], np.float32)
    fade = np.exp(-((v - ctop) / 0.05))[..., None]
    col = np.where(cz[..., None], marble + refl * 0.5 * fade, col)
    # front face (below the top): vertical fluting, darker
    face = v >= ctop + top_h
    fl2 = np.cos(xx / (0.006 * w) * math.pi)
    col = np.where(face[..., None], (np.array([8, 10, 14], np.float32) * (1 + 0.25 * fl2[..., None])) + refl * 0.06, col)
    edge = np.exp(-((yy - ctop * h) / (2.0 * px)) ** 2) + 0.5 * np.exp(-((yy - (ctop + top_h) * h) / (1.5 * px)) ** 2)
    col += np.array([200, 158, 88], np.float32) * (edge * (0.5 + 0.5 * np.clip(1.2 - u * 0.6, 0, 1)))[..., None]
    img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    # ---------------------------------------------------------------- sconce fixtures
    d = ImageDraw.Draw(img)
    for sx, sy in sconces:
        cx, cy = sx * w, sy * h
        rr = 0.042 * S0
        for kf in range(7):  # fan of glass blades
            a0 = math.radians(200 + kf * 20)
            d.polygon([(cx, cy), (cx + math.cos(a0) * rr, cy + math.sin(a0) * rr), (cx + math.cos(a0 + math.radians(17)) * rr, cy + math.sin(a0 + math.radians(17)) * rr)], fill=(255, 214, 150, 235))
        d.rectangle([cx - rr * 0.55, cy - 2 * px, cx + rr * 0.55, cy + 4 * px], fill=(196, 152, 84, 255))
        d.polygon([(cx - rr * 0.18, cy + 4 * px), (cx + rr * 0.18, cy + 4 * px), (cx, cy + rr * 0.6)], fill=(170, 130, 70, 255))
    # ---------------------------------------------------------------- vault door
    door = _vault_door(w, h, dcx, dcy, R, gx, gy, key, px, r)
    img.alpha_composite(door)
    arr = np.asarray(img, np.float32)[..., :3].copy()
    # ---------------------------------------------------------------- air: haze in the shafts, dust
    haze = beam * (0.6 + 0.4 * (1 - v))
    arr += np.array([28, 44, 70], np.float32) * haze[..., None]
    for sx, sy in sconces:
        dx, dy = (u - sx) * w / S0, (v - sy) * h / S0
        arr += np.array([90, 58, 22], np.float32) * np.exp(-((dx / 0.045) ** 2 + ((dy + 0.012) / 0.04) ** 2))[..., None]
        # warm wash on the lacquer round the lamp (light up and down the wall from the fan)
        arr += np.array([40, 26, 10], np.float32) * (np.exp(-((dx / 0.08) ** 2 + (dy / 0.22) ** 2)) * (v < ctop))[..., None]
    dust = (r.random((h, w)) > 0.9994) & (beam > 0.25)
    arr[dust] += 50
    # a few gold glints along the counter's brass edge (jewels catching the light), clear of the board
    gl = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(gl)
    for _ in range(10):
        gx = r.uniform(0.02, 0.98) * w
        if abs(gx / w - 0.5) < 0.26 and not portrait:
            continue
        gy = (ctop + r.uniform(0.004, 0.02)) * h
        gr = S0 * r.uniform(0.002, 0.004)
        gd.line([(gx - gr * 3.5, gy), (gx + gr * 3.5, gy)], fill=(150, 120, 74), width=1)
        gd.line([(gx, gy - gr * 2.5), (gx, gy + gr * 2.5)], fill=(150, 120, 74), width=1)
        gd.ellipse([gx - gr * 0.7, gy - gr * 0.7, gx + gr * 0.7, gy + gr * 0.7], fill=(230, 200, 150))
    arr += np.asarray(gl.filter(ImageFilter.GaussianBlur(0.8 * px)), np.float32)
    # ---------------------------------------------------------------- vignette + fine grain (no banding)
    vig = np.clip(1 - 0.75 * (((u - 0.5) / 0.75) ** 2 + ((v - 0.5) / 0.75) ** 2), 0.18, 1)
    arr *= vig[..., None]
    arr += r.normal(0, 1.6, (h, w, 1)).astype(np.float32)
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(0.6 * px))
    return out


def _vault_door(w, h, dcx, dcy, R, gx, gy, key, px, r):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    rgba = np.zeros((h, w, 4), np.float32)
    # frame ring set into the wall (steel, bolted), then the dark gap, then the door (offset towards the hinge)
    df = np.hypot(xx - dcx, yy - dcy) / R
    ring = (df > 1.06) & (df < 1.22)
    ang = np.arctan2(yy - dcy, xx - dcx)
    litk = np.cos(ang - math.radians(-135))
    rc = 34 + 16 * litk * np.sign(1.14 - df)
    rgba[ring, :3] = np.stack([rc * 0.92, rc * 0.98, rc * 1.08], -1)[ring]
    rgba[ring, 3] = 255
    gap = df <= 1.06
    # inside the vault: gold light, brightest where the gap is widest (away from the hinge)
    dd0 = np.hypot(xx - gx, yy - gy) / R
    glow = np.exp(-np.clip(dd0 - 1.0, 0, None) / 0.025) * (0.35 + 0.65 * np.clip((xx - gx) / R * 0.5 + 0.5, 0, 1))
    gcol = np.array([24, 14, 6], np.float32) + np.array([255, 196, 110], np.float32) * glow[..., None]
    rgba[gap, :3] = gcol[gap]
    rgba[gap, 3] = 255
    dd = np.hypot(xx - gx, yy - gy) / R
    ang2 = np.arctan2(yy - gy, xx - gx)
    lit2 = np.cos(ang2 - math.radians(-135))
    inside = dd <= 1.0
    col = np.zeros((h, w, 3), np.float32)
    # thick rim (the door's edge) and the face: machined steel with concentric rings and a soft sunburst
    rim = (dd > 0.9) & inside
    face = dd <= 0.9
    base = 36 + 10 * lit2
    mach = 3 * np.sin(dd * 220)
    rays = 4 * np.cos(ang2 * 24) * _ss(0.42, 0.6, dd) * (1 - _ss(0.8, 0.9, dd))
    fcol = base + mach + rays
    col[face] = np.stack([fcol * 0.93, fcol * 0.98, fcol * 1.1], -1)[face]
    rcol = 44 + 26 * lit2
    col[rim] = np.stack([rcol * 0.93, rcol * 0.98, rcol * 1.08], -1)[rim]
    # brass lips
    for rad, wgt in ((0.9, 1.0), (0.97, 0.6), (0.4, 0.8), (0.42, 0.5)):
        lip = np.exp(-((dd - rad) / 0.008) ** 2)
        col += np.array([170, 128, 64], np.float32) * (lip * wgt * (0.55 + 0.45 * lit2))[..., None]
    col = col * (0.75 + 0.6 * key[..., None])
    rgba[inside, :3] = col[inside]
    rgba[inside, 3] = 255
    img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(img)
    # bolts on the frame ring
    for kb in range(28):
        a = kb * 2 * math.pi / 28
        bx, by = dcx + math.cos(a) * R * 1.14, dcy + math.sin(a) * R * 1.14
        br = R * 0.022
        sk = 0.6 + 0.4 * math.cos(a - math.radians(-135))
        d.ellipse([bx - br, by - br, bx + br, by + br], fill=(int(70 * sk + 20), int(72 * sk + 20), int(78 * sk + 22), 255), outline=(10, 10, 12, 255), width=max(1, int(1.5 * px)))
    # locking bolts round the door's face
    for kb in range(16):
        a = kb * 2 * math.pi / 16
        bx, by = gx + math.cos(a) * R * 0.94, gy + math.sin(a) * R * 0.94
        br = R * 0.03
        sk = 0.6 + 0.4 * math.cos(a - math.radians(-135))
        d.ellipse([bx - br, by - br, bx + br, by + br], fill=(int(150 * sk), int(116 * sk), int(62 * sk), 255), outline=(12, 10, 8, 255), width=max(1, int(1.5 * px)))
        d.ellipse([bx - br * 0.5, by - br * 0.7, bx - br * 0.05, by - br * 0.2], fill=(int(230 * sk), int(196 * sk), int(130 * sk), 255))
    # spoked handle wheel and hub
    for kb in range(6):
        a = kb * math.pi / 3 + 0.3
        d.line([(gx + math.cos(a) * R * 0.07, gy + math.sin(a) * R * 0.07), (gx + math.cos(a) * R * 0.3, gy + math.sin(a) * R * 0.3)], fill=(150, 114, 60, 255), width=max(3, int(R * 0.032)))
        ex, ey = gx + math.cos(a) * R * 0.33, gy + math.sin(a) * R * 0.33
        rr = R * 0.035
        d.ellipse([ex - rr, ey - rr, ex + rr, ey + rr], fill=(176, 136, 72, 255))
    d.ellipse([gx - R * 0.3, gy - R * 0.3, gx + R * 0.3, gy + R * 0.3], outline=(160, 122, 64, 255), width=max(3, int(R * 0.028)))
    d.ellipse([gx - R * 0.08, gy - R * 0.08, gx + R * 0.08, gy + R * 0.08], fill=(128, 96, 50, 255), outline=(200, 160, 90, 255), width=max(1, int(2 * px)))
    # combination dial, upper right of the wheel
    cx, cy, cr = gx + R * 0.58, gy - R * 0.5, R * 0.1
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=(40, 42, 46, 255), outline=(176, 136, 72, 255), width=max(2, int(2.5 * px)))
    for kt in range(20):
        a = kt * 2 * math.pi / 20
        d.line([(cx + math.cos(a) * cr * 0.7, cy + math.sin(a) * cr * 0.7), (cx + math.cos(a) * cr * 0.9, cy + math.sin(a) * cr * 0.9)], fill=(200, 170, 110, 255), width=1)
    # soft contact shadow of the door on the gap's lower right
    return img


def velvet(n=1024):
    noise = rng.normal(0, 1, (n, n))
    im = Image.fromarray(np.clip(18 + noise * 6, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.1))
    arr = np.array(im, float)
    rgb = np.stack([arr * 0.95, arr * 0.92, arr * 1.05], -1)
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def frame(n=2048, inner=0.86):
    """Riveted black steel frame with a brass lip lit from the upper left and stepped Deco corner plates."""
    m = int(n * (1 - inner) / 2)
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    # steel: brushed, with an outer bevel (catch-light top/left, shadow bottom/right)
    brushed = rng.normal(0, 1, (n, n // 16))
    brushed = np.array(Image.fromarray(((brushed * 30) + 128).clip(0, 255).astype(np.uint8)).resize((n, n), Image.BILINEAR), float) / 128 - 1
    steel = 24 + 4 * brushed
    edge = np.minimum(np.minimum(xx, yy), np.minimum(n - 1 - xx, n - 1 - yy))
    bevel = np.exp(-(edge / 10) ** 2)
    tl = ((xx < yy) & (xx + yy < n)) | ((yy <= xx) & (xx + yy < n))  # top/left half of the rim
    steel = steel + np.where(xx + yy < n, 22, -10) * bevel
    # inner shadow onto the velvet opening
    inner_d = np.maximum(np.maximum(m - xx, m - yy), np.maximum(xx - (n - 1 - m), yy - (n - 1 - m)))
    rgb = np.stack([steel * 0.98, steel, steel * 1.07], -1)
    a = np.full((n, n), 255.0)
    a[inner_d < 0] = 0  # opening
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a]).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(im)
    # brass lip: 3 nested rectangles, brighter on the upper/left sides
    for k, (wid, shadek) in enumerate([(16, 0.0), (8, -0.35), (3, -0.7)]):
        o = m - wid
        col_tl = shade(BRASS_HI if k == 0 else BRASS, shadek + 0.05)
        col_br = shade(BRASS, shadek - 0.3)
        d.line([(o, o), (n - 1 - o, o)], fill=col_tl + (255,), width=wid if k else 6)
        d.line([(o, o), (o, n - 1 - o)], fill=col_tl + (255,), width=wid if k else 6)
        d.line([(o, n - 1 - o), (n - 1 - o, n - 1 - o)], fill=col_br + (255,), width=wid if k else 6)
        d.line([(n - 1 - o, o), (n - 1 - o, n - 1 - o)], fill=col_br + (255,), width=wid if k else 6)
    # stepped Deco corner plates (brass)
    L = int(n * 0.07)
    for cx, cy, sx, sy in [(m - 22, m - 22, 1, 1), (n - m + 21, m - 22, -1, 1), (m - 22, n - m + 21, 1, -1), (n - m + 21, n - m + 21, -1, -1)]:
        lit = 0.1 if (sx > 0 and sy > 0) else (-0.25 if (sx < 0 and sy < 0) else -0.08)
        for step, t in enumerate([10, 6, 3]):
            ll = L - step * int(L * 0.28)
            c = shade(BRASS_HI if step == 0 else BRASS, lit - step * 0.12) + (255,)
            d.rectangle(sorted_rect(cx, cy, cx + sx * ll, cy + sy * t), fill=c)
            d.rectangle(sorted_rect(cx, cy, cx + sx * t, cy + sy * ll), fill=c)
            cx += sx * (t + 2)
            cy += sy * (t + 2)
    # rivets along the rim
    for k in range(14):
        for (x, y) in [(m / 2 + k * (n - m) / 13, m / 2), (m / 2 + k * (n - m) / 13, n - m / 2), (m / 2, m / 2 + k * (n - m) / 13), (n - m / 2, m / 2 + k * (n - m) / 13)]:
            d.ellipse([x - 13, y - 13, x + 13, y + 13], fill=(40, 42, 46, 255), outline=(8, 8, 10, 255), width=3)
            d.ellipse([x - 7, y - 9, x - 1, y - 3], fill=(128, 130, 136, 255))
    return im


def sorted_rect(x0, y0, x1, y1):
    return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]


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


def tile_foreground(n=1024):
    """Key image for the dashboard tile: the serpent coiled around the black opal, head raised."""
    strip = np.array(scale_strip(), float)[..., :3]
    sh, sw = strip.shape[:2]
    cx, cy, rx, ry, hw = n * 0.5, n * 0.64, n * 0.33, n * 0.2, 0.2
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    ex, ey = (xx - cx) / rx, (yy - cy) / ry
    r = np.hypot(ex, ey)
    th = np.arctan2(ey, ex)
    band = np.abs(r - 1) < hw
    across = np.clip((r - 1) / hw, -1, 1)
    u = ((th / (2 * np.pi)) % 1.0) * sw * 3
    v = (across * 0.5 + 0.5) * (sh - 1)
    tex = strip[v.astype(int).clip(0, sh - 1), u.astype(int) % sw]
    nz = np.sqrt(np.clip(1 - across ** 2, 0, 1))
    lam = np.clip(0.35 + 0.65 * (nz * 0.8 - across * 0.45 * np.tanh(ey * 3) * -1), 0.15, 1.2)
    spec = np.clip(nz, 0, 1) ** 24 * np.clip(-ey, 0, 1) * 0.0 + np.exp(-((across + 0.35) / 0.12) ** 2) * 0.35
    col = tex * lam[..., None] * 0.95 + 255 * spec[..., None] * 0.25
    rgba = np.zeros((n, n, 4))
    rgba[..., :3] = np.clip(col, 0, 255)
    rgba[..., 3] = 255 * band
    ring = Image.fromarray(rgba.astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(0.8))
    back = np.array(ring)
    back[..., 3] = (back[..., 3] * (ey < 0)).astype(np.uint8)
    front = np.array(ring)
    front[..., 3] = (front[..., 3] * (ey >= 0)).astype(np.uint8)
    fg = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    fg.alpha_composite(Image.fromarray(back, "RGBA"))
    gem = opal().resize((int(n * 0.43), int(n * 0.43)), Image.LANCZOS)
    fg.alpha_composite(gem, (int(cx - gem.width / 2), int(cy - gem.height * 0.62)))
    fg.alpha_composite(Image.fromarray(front, "RGBA"))
    # the raised neck and head, one piece with the coil (D-045): a tube rising from the coil's front right
    fg.alpha_composite(_hero_neck_head(n, strip, (cx + rx * math.cos(0.7), cy + ry * math.sin(0.7)), (n * 0.62, n * 0.27), -112))
    # the in-game cartoon ink line round the whole silhouette (D-042)
    a = fg.split()[-1]
    ink = a.point(lambda q: 255 if q > 110 else 0).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(1.2))
    out = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    out.alpha_composite(Image.merge("RGBA", (*Image.new("RGB", (n, n), (20, 13, 5)).split(), ink)))
    out.alpha_composite(fg)
    return drop_shadow(out, (10, 16), 22, 140)


def _hero_neck_head(n, strip, base, pivot, heading_deg):
    """The key art's raised neck and head as one tube with the coil's scales and light: a Bezier spine from the
    coil up to the head, then the head's width profile (rounded snout, broad jaw, taper into the neck) as in the
    game's renderer, with the game's glossy cartoon eyes and nostrils on top."""
    sh, sw = strip.shape[:2]
    hd = np.array([math.cos(math.radians(heading_deg)), math.sin(math.radians(heading_deg))])
    body_half = n * 0.05
    grid = body_half * 2 * 3.6  # the head grid in body widths: a little bigger than in-game (3.2), for the hero shot
    P0, P3 = np.array(base, float), np.array(pivot, float)
    P1 = P0 + np.array([n * 0.12, -n * 0.18])  # out to the right, then back over to the head: a gentle S
    P2 = P3 - hd * n * 0.22
    # spine from the snout tip (s = 0) back to the coil
    tip = P3 + hd * (0.34 - 0.07) * grid
    ts = np.linspace(0, 1, 120)
    bez = ((1 - ts) ** 3)[:, None] * P0 + (3 * (1 - ts) ** 2 * ts)[:, None] * P1 + (3 * (1 - ts) * ts ** 2)[:, None] * P2 + (ts ** 3)[:, None] * P3
    pts = np.vstack([tip[None, :], bez[::-1]])
    seg = np.diff(pts, axis=0)
    cum = np.concatenate([[0], np.cumsum(np.hypot(seg[:, 0], seg[:, 1]))])
    total = cum[-1]

    def half(sv):
        v = 0.07 + sv / grid
        hh = np.where(v < 0.2, 0.14 * np.sqrt(np.clip(1 - ((0.2 - v) / 0.13) ** 2, 0, 1)),
                      np.where(v < 0.5, 0.14 + 0.11 * _ss(0.2, 0.5, v), 0.25 - 0.085 * _ss(0.5, 0.72, v))) * grid
        k = _ss(0.6, 0.85, v)
        return hh * (1 - k) + body_half * k

    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    best = np.full((n, n), 1e9)
    s_at = np.zeros((n, n))
    side = np.zeros((n, n))
    nrm_x = np.zeros((n, n))
    nrm_y = np.zeros((n, n))
    pad = grid * 0.3
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        bx0, bx1 = int(max(0, min(x0, x1) - pad)), int(min(n, max(x0, x1) + pad + 1))
        by0, by1 = int(max(0, min(y0, y1) - pad)), int(min(n, max(y0, y1) + pad + 1))
        px, py = xx[by0:by1, bx0:bx1], yy[by0:by1, bx0:bx1]
        dx, dy = x1 - x0, y1 - y0
        ll = dx * dx + dy * dy or 1e-9
        t = np.clip(((px - x0) * dx + (py - y0) * dy) / ll, 0, 1)
        qx, qy = px - (x0 + t * dx), py - (y0 + t * dy)
        dist = np.hypot(qx, qy)
        sv = cum[i] + t * (cum[i + 1] - cum[i])
        f = dist / np.maximum(half(sv), 1e-6)  # normalised distance: < 1 inside the tube
        sub = best[by0:by1, bx0:bx1]
        better = f < sub
        sub[better] = f[better]
        ln = math.sqrt(ll)
        s_at[by0:by1, bx0:bx1][better] = sv[better]
        side[by0:by1, bx0:bx1][better] = np.sign(qx * -dy + qy * dx)[better]
        nrm_x[by0:by1, bx0:bx1][better] = -dy / ln
        nrm_y[by0:by1, bx0:bx1][better] = dx / ln
    inside = best < 1.0
    across = np.clip(best * side, -1, 1)
    nz = np.sqrt(np.clip(1 - across ** 2, 0, 1))
    # light from the upper left, as everywhere: the surface normal leans along the spine's normal by `across`
    lx, ly, lz = -0.62, -0.62, 0.48
    ln_ = math.sqrt(lx * lx + ly * ly + lz * lz)
    lam = np.clip(((nrm_x * across) * lx + (nrm_y * across) * ly + nz * lz) / ln_, 0, 1)
    u = ((s_at / (n * 0.56)) * sw).astype(int) % sw  # the coil's scale size (three strip repeats round it)
    v = ((across * 0.5 + 0.5) * (sh - 1)).astype(int).clip(0, sh - 1)
    tex = strip[v, u]
    col = tex * (0.6 + 0.62 * lam)[..., None] + 255 * (np.exp(-((across + 0.35) / 0.14) ** 2) * 0.2)[..., None]
    rgba = np.zeros((n, n, 4))
    rgba[..., :3] = np.clip(col, 0, 255)
    edge = np.clip((1 - best) / 0.06, 0, 1)  # soft silhouette
    fade = np.clip((total - s_at) / (total * 0.12), 0, 1)  # the neck melts into the coil
    rgba[..., 3] = 255 * inside * edge * fade
    img = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(img)
    # face on the head grid (256 units = grid), as in SnakeView: eyes beside the pivot, nostrils near the snout
    unit = grid / 256.0
    side_v = np.array([-hd[1], hd[0]])  # the head's right
    for sx in (-1, 1):
        e = P3 + side_v * sx * 34.6 * unit + hd * 7.7 * unit
        R = 13.3 * unit * 1.15
        ex, ey = e
        d.ellipse([ex - R * 1.2, ey - R * 1.2, ex + R * 1.2, ey + R * 1.2], fill=(4, 4, 6, 255))
        d.ellipse([ex - R, ey - R, ex + R, ey + R], fill=(10, 8, 7, 255))
        d.ellipse([ex - R * 0.86, ey - R * 0.86, ex + R * 0.86, ey + R * 0.86], outline=(128, 89, 40, 230), width=max(1, int(R * 0.16)))
        d.ellipse([ex - R * 0.66, ey - R * 0.74, ex - R * 0.06, ey - R * 0.16], fill=(255, 250, 238, 235))
        d.ellipse([ex + R * 0.22, ey + R * 0.3, ex + R * 0.46, ey + R * 0.54], fill=(255, 250, 238, 170))
        nst = P3 + side_v * sx * 11.5 * unit + hd * 57.6 * unit
        d.ellipse([nst[0] - 2.4 * unit, nst[1] - 2.4 * unit, nst[0] + 2.4 * unit, nst[1] + 2.4 * unit], fill=(58, 54, 52, 255))
    return img


def keyart(w=1920, h=1080):
    """Loading-screen key art (no text): the strongroom with the serpent coiled around the black opal."""
    bg = room(w, h).convert("RGBA")
    fg = tile_foreground(1024)
    # the hero sits in the middle band of a centred poster: title above it, call to action below (D-050)
    k = h * 0.66 / fg.height
    fg = fg.resize((int(fg.width * k), int(fg.height * k)), Image.LANCZOS)
    bg.alpha_composite(fg, (int(w * 0.5 - fg.width * 0.5), int(h * 0.52 - fg.height * 0.5)))
    return bg.convert("RGB")


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
    save(keyart(), "keyart_16x9.jpg")
    fg = tile_foreground()
    save(fg, "tile_foreground.png")
    print("placeholders written to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
