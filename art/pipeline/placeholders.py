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
    """Top-down viper head pointing up. Analytic height field (smooth float shading, no banding), broad jaw,
    brow ridges, diamond scales continuous with the body strip, amber slit-pupil eyes, oil-slick rim."""
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
    base = np.array([15.0, 16.0, 20.0])
    col = base[None, None, :] * (0.55 + 0.9 * lam[..., None]) + 34 * lam[..., None] * dome[..., None]
    col += irid * (70 * graze * (0.35 + 0.65 * lam))[..., None] * (0.6 + 0.4 * dome[..., None])
    col += 255 * (spec * (0.35 + 0.65 * dome))[..., None] * 0.55
    col *= (1 - 0.65 * seam)[..., None]
    # rim light from the moon side (upper left)
    rim = np.clip(-ux, 0, 1) ** 6 * inside
    col += np.array([90, 96, 110])[None, None, :] * rim[..., None] * 0.5
    alpha = inside.astype(float) * (1 - smooth(0.66, 0.97, v))  # the neck fades into the body mesh
    # soften the silhouette
    am = Image.fromarray((alpha * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.2 * SS))
    rgba = np.zeros((n, n, 4))
    rgba[..., :3] = np.clip(col, 0, 255)
    rgba[..., 3] = np.array(am, float)
    im = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(im)
    cx = n / 2
    # eyes: amber iris, vertical slit, glossy highlight, dark socket ring
    for sgn in (-1, 1):
        ex, ey = cx + sgn * eye_u * n, eye_v * n
        R = 0.038 * n
        d.ellipse([ex - R * 1.25, ey - R * 1.15, ex + R * 1.25, ey + R * 1.15], fill=(4, 4, 6, 255))
        iris = Image.new("RGBA", (int(R * 2 + 4), int(R * 2 + 4)), (0, 0, 0, 0))
        iy, ix = np.mgrid[0 : iris.height, 0 : iris.width].astype(float)
        rr = np.hypot(ix - iris.width / 2, iy - iris.height / 2) / R
        ring = np.clip(1 - rr, 0, 1)
        icol = np.stack([217 * (0.55 + 0.45 * ring), 150 * (0.45 + 0.55 * ring), 50 * (0.4 + 0.6 * ring)], -1)
        ia = (rr < 1).astype(float) * 255
        iris_px = np.dstack([icol, ia]).astype(np.uint8)
        iris = Image.fromarray(iris_px, "RGBA")
        im.alpha_composite(iris, (int(ex - iris.width / 2), int(ey - iris.height / 2)))
        d = ImageDraw.Draw(im)
        d.ellipse([ex - R * 0.22, ey - R * 0.95, ex + R * 0.22, ey + R * 0.95], fill=(2, 2, 3, 255))
        d.ellipse([ex - R * 0.62, ey - R * 0.7, ex - R * 0.18, ey - R * 0.3], fill=(255, 246, 225, 210))
    # nostrils
    for sgn in (-1, 1):
        nx_, ny_ = cx + sgn * 0.045 * n, 0.115 * n
        d.ellipse([nx_ - 0.009 * n, ny_ - 0.006 * n, nx_ + 0.009 * n, ny_ + 0.006 * n], fill=(2, 2, 3, 255))
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
    lam = np.clip(0.35 + 0.65 * (nz * 0.8 - across * 0.45 * np.sign(ey + 1e-9) * -1), 0.15, 1.2)
    spec = np.clip(nz, 0, 1) ** 24 * np.clip(-ey, 0, 1) * 0.0 + np.exp(-((across + 0.35) / 0.12) ** 2) * 0.35
    col = tex * lam[..., None] * 1.25 + 255 * spec[..., None] * 0.35
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
    # raised head rising from the front-right of the coil, looking up-left
    head = snake_head(False).resize((int(n * 0.56), int(n * 0.56)), Image.LANCZOS).rotate(24, resample=Image.BICUBIC, expand=True)
    fg.alpha_composite(head, (int(cx + rx * 0.58 - head.width * 0.55), int(cy + ry * 0.35 - head.height * 0.93)))
    return drop_shadow(fg, (10, 16), 22, 140)


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
    fg = tile_foreground()
    save(fg, "tile_foreground.png")
    print("placeholders written to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
