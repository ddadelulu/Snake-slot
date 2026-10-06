"""The angry serpent for the cover art (owner request, D-056): the white snake reared up out of its coils, jaws
wide, fangs bared and dripping venom, slit pupils glowing venom green under a scowling brow.

A small 3D renderer in numpy (orthographic camera, units of the 3:4 frame's width):
  * the body is a swept tube along a spline (tail tip -> coils on the ground -> S-curved neck), drawn as a dense
    chain of spheres into a z-buffer (the visible envelope of the chain is the tube, and each sphere's normal is the
    tube's normal there);
  * the head is a signed distance field (skull, snout, scowling brow ridges, eyes, open jaws with a carved mouth,
    fangs, teeth, a forked tongue, venom) ray-marched in its own box and merged with the body by depth;
  * shading: warm key from the upper left with a shadow map, cool fill from the right, gold rim from the vault
    behind, teal rim from the right, ambient occlusion, glossy scales with a faint pearl sheen; emissive eyes and
    venom with a bloom.
Output: an RGBA image of the snake (transparent background) plus its soft shadow on the ground.

Usage: math/env/bin/python art/pipeline/angry_snake.py [scale]   (writes art/cover/snake_test.png)
"""

from __future__ import annotations

import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

F = np.float32
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))


def nrm(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------------------------------- camera
PITCH = math.radians(24.0)  # looking down at the coils
CP, SP = math.cos(PITCH), math.sin(PITCH)
UP_C = np.array([0.0, CP, SP])  # world up in camera space (x right, y up, z toward the viewer)


def w2c(P):
    P = np.asarray(P, float)
    return np.stack([P[..., 0], P[..., 1] * CP - P[..., 2] * SP, P[..., 1] * SP + P[..., 2] * CP], -1)


# ---------------------------------------------------------------------------------------------------- the pose
RB = 0.062  # body radius at its thickest (frame widths)
LH = 0.4  # head length, hinge to snout tip
H_C = np.array([0.14, 0.86, 0.14])  # jaw hinge (camera space)
F_C = nrm([-0.72, -0.25, 0.65])  # the head's neutral axis (towards the snout): striking down at the viewer, a little to the left
U_C = nrm(np.array([0.0, 1.0, 0.1]) - np.dot([0.0, 1.0, 0.1], F_C) * F_C)  # top of the head
R_C = np.cross(F_C, U_C)  # the head's left side as seen by it -> the viewer's ... (just a third axis)
EYE = (0.55, 0.228, 0.105, 0.074)  # eye centre (a, |b|, c) and radius, head units
GAPE_UP, GAPE_DOWN = math.radians(26), math.radians(31)


def catmull(points, n_per=24):
    P = np.asarray(points, float)
    P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    t = np.linspace(0, 1, n_per, endpoint=False)[:, None]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2][None])
    return np.vstack(out)


def resample(P, ds):
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    s = np.arange(0, cum[-1], ds)
    s = np.append(s, cum[-1]) if cum[-1] - s[-1] > ds * 0.25 else s
    return np.stack([np.interp(s, cum, P[:, k]) for k in range(3)], -1), s


def spine(ds=0.002):
    """Tail tip -> coils (world space, converted) -> neck (camera space) -> jaw hinge. Returns camera-space points,
    arc length, radius, tangent, dorsal direction."""
    pts = []
    th0, th1 = 3.5, -2.5 * math.pi
    for th in np.linspace(th0, th1, 30):
        t = (th0 - th) / (th0 - th1)
        R = 0.38 - 0.16 * t
        h = RB * (1.0 + 1.55 * ss(0.42, 0.86, t))
        pts.append(w2c((R * math.cos(th), h, R * math.sin(th))))
    neck = [
        (-0.17, 0.36, -0.10),
        (-0.15, 0.52, -0.06),
        (0.03, 0.62, -0.04),
        (0.19, 0.72, -0.04),
        (0.25, 0.84, 0.0),
        tuple(H_C - F_C * 0.12),
        tuple(H_C - F_C * 0.02),
    ]
    pts += [np.array(p) for p in neck]
    P = catmull(pts, 24)
    P, s = resample(P, ds)
    n = len(P)
    T = np.gradient(P, axis=0)
    T = nrm(T)
    total = s[-1]
    s_coil = None
    # radius: needle tail, thick coils, a slimmer neck, a little swell behind the head
    r = RB * np.clip(ss(0.0, 0.8, s) ** 0.6, 0.06, 1)
    neck_k = ss(total - 0.95, total - 0.3, s)
    r = r * (1 - 0.22 * neck_k) * (1 + 0.1 * np.exp(-((s - (total - 0.06)) / 0.08) ** 2))
    # dorsal direction: up on the ground, away from the viewer as the neck rises (belly to the viewer), the head's
    # top at the head
    w_neck = ss(total - 1.25, total - 0.85, s)[:, None]
    w_head = ss(total - 0.35, total - 0.02, s)[:, None]
    D = UP_C[None] * (1 - w_neck) + np.array([0.0, 0.25, -1.0])[None] * w_neck
    D = D * (1 - w_head) + U_C[None] * w_head
    for _ in range(3):
        D = D - np.sum(D * T, -1, keepdims=True) * T
        D = nrm(D)
        D = ndimage.gaussian_filter1d(D, 12, axis=0, mode="nearest")
    D = D - np.sum(D * T, -1, keepdims=True) * T
    D = nrm(D)
    return P, s, r, T, D


# ---------------------------------------------------------------------------------------------------- SDF bits
def sd_ellipsoid(x, y, z, rx, ry, rz):
    k0 = np.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2)
    k1 = np.sqrt((x / rx ** 2) ** 2 + (y / ry ** 2) ** 2 + (z / rz ** 2) ** 2)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def sd_round_cone(x, y, z, a, b, r1, r2):
    """iq's round cone between points a (radius r1) and b (radius r2)."""
    ba = np.asarray(b, float) - np.asarray(a, float)
    l2 = float(ba @ ba)
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pax, pay, paz = x - a[0], y - a[1], z - a[2]
    yv = pax * ba[0] + pay * ba[1] + paz * ba[2]
    zv = yv - l2
    qx, qy, qz = pax * l2 - ba[0] * yv, pay * l2 - ba[1] * yv, paz * l2 - ba[2] * yv
    x2 = qx * qx + qy * qy + qz * qz
    y2 = yv * yv * l2
    z2 = zv * zv * l2
    k = math.copysign(1.0, rr) * rr * rr * x2
    d1 = np.sqrt(x2 + z2) * il2 - r2
    d2 = np.sqrt(x2 + y2) * il2 - r1
    d3 = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + yv * rr) * il2 - r1
    return np.where(np.sign(zv) * a2 * z2 > k, d1, np.where(np.sign(yv) * a2 * y2 < k, d2, d3))


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def frame_rot(Fv, Uv, ang):
    """Rotate the head frame about its side axis: positive opens upwards."""
    f = math.cos(ang) * Fv + math.sin(ang) * Uv
    u = -math.sin(ang) * Fv + math.cos(ang) * Uv
    return f, u


class Head:
    """The head as a distance field in camera space (units: frame widths)."""

    def __init__(self, neck_pts, neck_r):
        self.O = H_C
        self.Fu, self.Uu = frame_rot(F_C, U_C, GAPE_UP)
        self.Fl, self.Ul = frame_rot(F_C, U_C, -GAPE_DOWN)
        self.Rs = np.cross(self.Fu, self.Uu)  # side axis (same for both jaws)
        self.neck = [(neck_pts[i], neck_pts[i + 1], neck_r[i], neck_r[i + 1]) for i in range(len(neck_pts) - 1)]
        # forked tongue (camera space): out between the jaws, flicking to the viewer's left and down
        def hp(a, b, c, Fv=F_C, Uv=U_C):  # a head-frame point -> camera
            return self.O + LH * (a * Fv + b * self.Rs + c * Uv)

        base = hp(0.45, 0.0, -0.14)
        dirn = nrm(F_C + np.array([-0.55, -0.45, -0.1]))
        side = nrm(np.cross(dirn, [0.0, 0.0, 1.0]))
        mid = base + dirn * LH * 0.3 + np.array([0, 0.018, 0])
        self.tongue_base, self.tongue_dir = base, dirn
        fork = mid + dirn * LH * 0.2 - np.array([0, 0.012, 0])
        self.tongue = [(base, mid, 0.026 * LH, 0.019 * LH), (mid, fork, 0.019 * LH, 0.014 * LH)]
        for sgn in (-1, 1):
            t1 = fork + (dirn * 0.08 + side * sgn * 0.045) * LH
            t2 = t1 + (dirn * 0.07 + side * sgn * 0.06) * LH
            self.tongue += [(fork, t1, 0.014 * LH, 0.009 * LH), (t1, t2, 0.009 * LH, 0.0015 * LH)]
        # venom: a bead on each fang tip, one strand hanging straight down (world down) from the viewer-left fang
        down = -UP_C
        self.drips = []
        for sgn in (-1, 1):
            tip = hp(0.8, 0.1 * sgn, -0.36, self.Fu, self.Uu)
            self.drips.append((tip + down * 0.004, tip + down * 0.012, 0.0075, 0.0055))
        tips = [hp(0.8, 0.1 * sgn, -0.36, self.Fu, self.Uu) for sgn in (-1, 1)]
        tip = min(tips, key=lambda p: p[0])
        self.drips.append((tip + down * 0.012, tip + down * 0.03, 0.0052, 0.0012))  # the bead stretching
        self.drips.append((tip + down * 0.06, tip + down * 0.07, 0.0028, 0.0062))  # a falling drop

    def local(self, x, y, z, Fv, Uv):
        dx, dy, dz = x - self.O[0], y - self.O[1], z - self.O[2]
        a = (dx * Fv[0] + dy * Fv[1] + dz * Fv[2]) / LH
        b = (dx * self.Rs[0] + dy * self.Rs[1] + dz * self.Rs[2]) / LH
        c = (dx * Uv[0] + dy * Uv[1] + dz * Uv[2]) / LH
        return a, b, c

    # every part returns a distance in head units (x LH = frame widths)
    def upper_solid(self, a, b, c):
        bb = np.abs(b)
        d = sd_ellipsoid(a - 0.30, b, c - 0.07, 0.47, 0.33, 0.21)
        d = smin(d, sd_ellipsoid(a - 0.74, b, c - 0.05, 0.28, 0.19, 0.145), 0.1)
        d = smin(d, sd_ellipsoid(a - 0.08, bb - 0.21, c + 0.0, 0.26, 0.15, 0.15), 0.08)  # jaw muscles
        # scowling brow ridges: high at the back and outside, low at the front and inside, overhanging the eyes
        d = smin(d, sd_round_cone(a, bb, c, (0.34, 0.3, 0.2), (0.69, 0.2, 0.125), 0.072, 0.05), 0.03)
        # and a hard cheek ridge under the eye, so it narrows to a squint
        d = smin(d, sd_round_cone(a, bb, c, (0.42, 0.265, 0.02), (0.68, 0.2, 0.045), 0.042, 0.034), 0.03)
        # a furrow between them
        d = smax(d, -sd_round_cone(a, b, c, (0.46, 0.0, 0.245), (0.8, 0.0, 0.17), 0.022, 0.012), 0.02)
        d = smax(d, -0.04 - c, 0.03)  # flat underside (the mouth's roof line)
        # lids: a skin shell over the eye's top (slanting down to the snout) and bottom, leaving an angry slit
        ea, eb, ec = a - EYE[0], bb - EYE[1], c - EYE[2]
        shell = np.sqrt(ea * ea + eb * eb + ec * ec) - (EYE[3] + 0.012)
        upper_lid = smax(shell, -(ec + 0.55 * ea - 0.012), 0.008)
        lower_lid = smax(shell, ec + 0.2 * ea + 0.038, 0.008)
        d = smin(d, np.minimum(upper_lid, lower_lid), 0.012)
        return d

    def cavity_upper(self, a, b, c):
        return smax(sd_ellipsoid(a - 0.38, b, c + 0.06, 0.54, 0.17, 0.1), -a - 0.02, 0.03)

    def eyes(self, a, b, c):
        return np.sqrt((a - EYE[0]) ** 2 + (np.abs(b) - EYE[1]) ** 2 + (c - EYE[2]) ** 2) - EYE[3]

    def nostrils(self, a, b, c):
        return np.sqrt((a - 0.95) ** 2 + (np.abs(b) - 0.08) ** 2 + (c - 0.11) ** 2) - 0.026

    def fangs(self, a, b, c):
        bb = np.abs(b)
        d = sd_round_cone(a, bb, c, (0.86, 0.09, 0.0), (0.87, 0.094, -0.18), 0.034, 0.021)
        return np.minimum(d, sd_round_cone(a, bb, c, (0.87, 0.094, -0.18), (0.8, 0.1, -0.36), 0.021, 0.003))

    def teeth_upper(self, a, b, c):
        bb = np.abs(b)
        d = np.full_like(a, 9.0)
        for ta in (0.24, 0.34, 0.44, 0.54, 0.63, 0.71):
            half = 0.17 * math.sqrt(max(0.0, 1 - ((ta - 0.36) / 0.56) ** 2)) + 0.012
            d = np.minimum(d, sd_round_cone(a, bb, c, (ta, half, -0.035), (ta - 0.03, half - 0.004, -0.1), 0.014, 0.002))
        return d

    def lower_solid(self, a, b, c):
        bb = np.abs(b)
        d = sd_round_cone(a, bb, c, (0.02, 0.22, -0.02), (0.8, 0.06, -0.04), 0.062, 0.05)
        d = smin(d, sd_ellipsoid(a - 0.8, b, c + 0.045, 0.1, 0.1, 0.065), 0.05)  # chin
        d = smin(d, sd_ellipsoid(a - 0.4, b, c + 0.075, 0.44, 0.2, 0.05), 0.06)  # throat skin
        return d

    def throat(self, a, b, c):
        return sd_ellipsoid(a - 0.08, b, c + 0.07, 0.12, 0.14, 0.1)

    def tongue_d(self, x, y, z):
        d = np.full_like(x, 9.0)
        for p, q, r1, r2 in self.tongue:
            d = np.minimum(d, sd_round_cone(x, y, z, p, q, r1, r2))
        return d

    def venom(self, x, y, z):
        d = np.full_like(x, 9.0)
        for p, q, r1, r2 in self.drips:
            d = np.minimum(d, sd_round_cone(x, y, z, p, q, r1, r2))
        return d

    def neck_d(self, x, y, z):
        d = np.full_like(x, 9.0)
        for p, q, r1, r2 in self.neck:
            d = np.minimum(d, sd_round_cone(x, y, z, p, q, r1, r2))
        return d

    def parts(self, x, y, z):
        au, bu, cu = self.local(x, y, z, self.Fu, self.Uu)
        al, bl, cl = self.local(x, y, z, self.Fl, self.Ul)
        P = {}
        P["upper"] = self.upper_solid(au, bu, cu) * LH
        P["cav"] = self.cavity_upper(au, bu, cu) * LH
        P["neck"] = self.neck_d(x, y, z)
        P["lower"] = self.lower_solid(al, bl, cl) * LH
        P["eyes"] = self.eyes(au, bu, cu) * LH
        P["nost"] = self.nostrils(au, bu, cu) * LH
        P["fangs"] = self.fangs(au, bu, cu) * LH
        P["teeth"] = self.teeth_upper(au, bu, cu) * LH
        P["throat"] = self.throat(au, bu, cu) * LH
        P["tongue"] = np.full_like(x, 9.0)
        P["venom"] = self.venom(x, y, z)
        return P, (au, bu, cu), (al, bl, cl)

    def combine(self, P):
        skin = smin(P["upper"], P["neck"], 0.045)
        skin = smin(skin, P["lower"], 0.03)
        skin = smax(skin, -P["cav"], 0.02)
        skin = smax(skin, -P["nost"], 0.004)
        d = skin
        for k in ("eyes", "fangs", "teeth", "venom"):
            d = np.minimum(d, P[k])
        return d, skin

    def sdf(self, x, y, z):
        P, _, _ = self.parts(x, y, z)
        return self.combine(P)[0]

    def bounds(self):
        """A box round everything, from a coarse sample."""
        if getattr(self, "_bounds", None) is not None:
            return self._bounds
        g = np.linspace(-0.5, 0.5, 70)
        X, Y, Z = np.meshgrid(g, g, g, indexing="ij")
        x, y, z = (X.ravel() + self.O[0]), (Y.ravel() + self.O[1]), (Z.ravel() + self.O[2])
        d = self.sdf(x, y, z)
        m = d < 0.02
        self._bounds = (x[m].min() - 0.02, x[m].max() + 0.02, y[m].min() - 0.02, y[m].max() + 0.02, z[m].max() + 0.03, z[m].min() - 0.03)
        return self._bounds


# ---------------------------------------------------------------------------------------------------- rendering
class Render:
    def __init__(self, Wf=1620, Hf=2160, ss_=2, y0=1.12):
        self.K = Wf * ss_  # pixels per frame width
        self.W, self.H = Wf * ss_, Hf * ss_
        self.y0 = y0  # frame-unit screen y of camera y = 0
        self.zb = np.full((self.H, self.W), -1e9, F)
        self.nx = np.zeros((self.H, self.W), F)
        self.ny = np.zeros((self.H, self.W), F)
        self.nz = np.zeros((self.H, self.W), F)
        self.idx = np.full((self.H, self.W), -1, np.int32)  # body sphere index, or -2 for the head

    def to_px(self, P):
        return (0.5 + P[..., 0]) * self.K, (self.y0 - P[..., 1]) * self.K, P[..., 2] * self.K

    def px_to_cam(self, px, py):
        return px / self.K - 0.5, self.y0 - py / self.K

    def sweep(self, P, r, upto=None):
        X, Y, Z = self.to_px(P)
        R = r * self.K
        n = len(P) if upto is None else upto
        for i in range(n):
            cx, cy, cz, rr = X[i], Y[i], Z[i], R[i]
            x0, x1 = max(0, int(cx - rr - 1)), min(self.W, int(cx + rr + 2))
            y0, y1 = max(0, int(cy - rr - 1)), min(self.H, int(cy + rr + 2))
            if x0 >= x1 or y0 >= y1:
                continue
            xs = (np.arange(x0, x1, dtype=F) + 0.5 - cx) / rr
            ys = (np.arange(y0, y1, dtype=F) + 0.5 - cy) / rr
            d2 = xs[None, :] ** 2 + ys[:, None] ** 2
            m = d2 < 1.0
            h = np.sqrt(np.clip(1.0 - d2, 0, 1))
            zs = cz + h * rr
            sub = self.zb[y0:y1, x0:x1]
            upd = m & (zs > sub)
            if not upd.any():
                continue
            sub[upd] = zs[upd]
            self.nx[y0:y1, x0:x1][upd] = np.broadcast_to(xs[None, :], d2.shape)[upd]
            self.ny[y0:y1, x0:x1][upd] = -np.broadcast_to(ys[:, None], d2.shape)[upd]
            self.nz[y0:y1, x0:x1][upd] = h[upd]
            self.idx[y0:y1, x0:x1][upd] = i

    def march(self, head):
        x0c, x1c, y0c, y1c, zf, zbk = head.bounds()
        px0, px1 = int((0.5 + x0c) * self.K), int((0.5 + x1c) * self.K) + 1
        py0, py1 = int((self.y0 - y1c) * self.K), int((self.y0 - y0c) * self.K) + 1
        px0, py0 = max(px0, 0), max(py0, 0)
        px1, py1 = min(px1, self.W), min(py1, self.H)
        # coarse pass (cone-ish: a hit is anything within a coarse pixel), then the fine rays near coarse hits only
        cs = 8
        gx = np.arange(px0, px1, cs, dtype=F) + cs / 2
        gy = np.arange(py0, py1, cs, dtype=F) + cs / 2
        GX, GY = np.meshgrid(gx, gy)
        hit_c, z_c = self._march(head, GX.ravel(), GY.ravel(), zf, zbk, tol=cs * 1.5 / self.K)
        cov = hit_c.reshape(GX.shape)
        zc = np.where(hit_c, z_c, -1e9).reshape(GX.shape)
        cov = ndimage.binary_dilation(cov, iterations=2)
        zc = ndimage.maximum_filter(zc, size=5)
        fy, fx = np.mgrid[py0:py1, px0:px1]
        cy_i = np.clip((fy - py0) // cs, 0, cov.shape[0] - 1)
        cx_i = np.clip((fx - px0) // cs, 0, cov.shape[1] - 1)
        want = cov[cy_i, cx_i]
        fxs, fys = fx[want].astype(F) + 0.5, fy[want].astype(F) + 0.5
        zstart = np.minimum(zc[cy_i, cx_i][want] + 0.04, zf)
        hit, zh = self._march(head, fxs, fys, zstart, zbk, tol=0.25 / self.K)
        fxs, fys, zh = fxs[hit], fys[hit], zh[hit]
        x, y = self.px_to_cam(fxs, fys)
        z = zh
        # normals from the field
        e = 0.6 / self.K
        gxn = head.sdf(x + e, y, z) - head.sdf(x - e, y, z)
        gyn = head.sdf(x, y + e, z) - head.sdf(x, y - e, z)
        gzn = head.sdf(x, y, z + e) - head.sdf(x, y, z - e)
        n = nrm(np.stack([gxn, gyn, gzn], -1))
        ix, iy = fxs.astype(int), fys.astype(int)
        zpx = z * self.K
        closer = zpx > self.zb[iy, ix]
        ix, iy = ix[closer], iy[closer]
        self.zb[iy, ix] = zpx[closer]
        self.nx[iy, ix], self.ny[iy, ix], self.nz[iy, ix] = n[closer, 0], n[closer, 1], n[closer, 2]
        self.idx[iy, ix] = -2
        self.head_pts = (iy, ix, x[closer], y[closer], z[closer])

    def _march(self, head, pxs, pys, zstart, zend, tol, steps=160):
        x, y = self.px_to_cam(pxs.astype(float), pys.astype(float))
        z = np.broadcast_to(np.asarray(zstart, float), x.shape).copy()
        hit = np.zeros(x.shape, bool)
        act = np.arange(len(x))
        for _ in range(steps):
            if len(act) == 0:
                break
            d = head.sdf(x[act], y[act], z[act])
            h = d < tol
            hit[act[h]] = True
            z[act] -= np.maximum(d, tol * 0.5) * 0.85
            keep = (~h) & (z[act] > zend)
            act = act[keep]
        return hit, z


def scales_body(s, th, rad):
    """Imbricated dorsal scales (diamond lattice in arc length x circumference) and wide belly plates."""
    Ls = 0.0175
    a = s / Ls
    b = th * rad / Ls
    p, q = (a + b) * 0.7071, (a - b) * 0.7071
    fp, fq = p - np.floor(p), q - np.floor(q)
    cell = (np.floor(p) * 7.13 + np.floor(q) * 3.71)
    hsh = (np.sin(cell * 12.9898) * 43758.5453) % 1.0
    edge = np.minimum(np.minimum(fp, 1 - fp), np.minimum(fq, 1 - fq))
    # each scale's free edge points back down the body: darker crease behind it, a bulge in front of it
    along = (fp + fq) * 0.5  # 0 at the back corner .. 1 at the front corner
    seam = 1 - ss(0.0, 0.1, edge)
    bulge = ss(0.0, 0.35, edge) * (0.55 + 0.45 * along)
    belly = ss(math.pi * 0.66, math.pi * 0.78, np.abs(th))
    plate = (s / 0.03) % 1.0
    pseam = 1 - ss(0.0, 0.14, np.minimum(plate, 1 - plate) * 2)
    seam = seam * (1 - belly) + pseam * belly
    bulge = bulge * (1 - belly) + (ss(0.0, 0.5, plate)) * belly
    return seam, bulge, hsh, belly


def scales_head(a, b, c):
    """Head shields: a Voronoi of plates, large on the crown, small on the sides and lips."""
    size = 0.036 + 0.04 * np.exp(-((b / 0.13) ** 2)) * ss(-0.02, 0.1, c)
    pts = np.stack([a / size, b / size, c / size], -1)
    base = np.floor(pts)
    best = np.full(a.shape, 9.0)
    second = np.full(a.shape, 9.0)
    for ox in (-1, 0, 1):
        for oy in (-1, 0, 1):
            for oz in (-1, 0, 1):
                cc = base + np.array([ox, oy, oz])
                hsh = np.sin(cc @ np.array([127.1, 311.7, 74.7])) * 43758.5453
                jit = np.stack([hsh % 1.0, (hsh * 1.37) % 1.0, (hsh * 1.71) % 1.0], -1) * 0.8 + 0.1
                d = np.linalg.norm(cc + jit - pts, axis=-1)
                second = np.where(d < best, best, np.minimum(second, d))
                best = np.minimum(best, d)
    edge = second - best
    seam = (1 - ss(0.0, 0.07, edge)) * 0.5
    bulge = ss(0.0, 0.55, edge) ** 0.6
    return seam, bulge


def srgb_to_lin(c):
    return (np.asarray(c, float) / 255.0) ** 2.2


def render(Wf=1620, Hf=2160, ss_=2, y0=1.12, out=None):
    rd = Render(Wf, Hf, ss_, y0)
    P, s, r, T, D = spine(ds=0.003)
    total = s[-1]
    head_from = np.searchsorted(s, total - 0.42)
    zbuf_upto = np.searchsorted(s, total - 0.14)
    nk = np.linspace(head_from, len(P) - 1, 14).astype(int)
    head = Head(P[nk], r[nk])
    rd.sweep(P, r, upto=zbuf_upto)
    rd.march(head)
    mask = rd.zb > -1e8
    H_, W_ = mask.shape
    yy, xx = np.nonzero(mask)
    n = np.stack([rd.nx[mask], rd.ny[mask], rd.nz[mask]], -1)
    n = nrm(n)
    zpx = rd.zb[mask]
    cx, cy = rd.px_to_cam(xx + 0.5, yy + 0.5)
    pos = np.stack([cx, cy, zpx / rd.K], -1)
    idx = rd.idx[mask]
    is_head = idx == -2
    N = len(idx)
    # ---------------------------------------------------------------- materials
    alb = np.zeros((N, 3))
    gloss = np.zeros(N)
    shin = np.full(N, 40.0)
    emis = np.zeros((N, 3))
    seam = np.zeros(N)
    bulge = np.zeros(N)
    irid_k = np.zeros(N)
    white = srgb_to_lin((240, 238, 232))
    ivory = srgb_to_lin((236, 226, 204))
    # body (z-buffer part)
    bi = ~is_head
    ib = idx[bi]
    Tb, Db, rb = T[ib], D[ib], r[ib]
    nb = n[bi]
    sb = s[ib] + rb * np.sum(nb * Tb, -1)
    Sd = np.cross(Tb, Db)
    npp = nb - np.sum(nb * Tb, -1, keepdims=True) * Tb
    thb = np.arctan2(np.sum(npp * Sd, -1), np.sum(npp * Db, -1))
    sm, bu, hs, bel = scales_body(sb, thb, rb)
    alb[bi] = white * (1 - bel[:, None]) + ivory * bel[:, None]
    seam[bi], bulge[bi], irid_k[bi] = sm, bu, 0.6 + 0.4 * hs
    gloss[bi] = 0.32
    # head (SDF part): pick the part each hit belongs to
    hp_iy, hp_ix, hx, hy, hz = rd.head_pts
    hsel = np.zeros((H_, W_), bool)
    hsel[hp_iy, hp_ix] = True
    hm = hsel[mask]
    # map head points into the masked order
    order = np.full((H_, W_), -1, np.int64)
    order[hp_iy, hp_ix] = np.arange(len(hp_iy))
    hk = order[mask][hm]
    hx, hy, hz = hx[hk], hy[hk], hz[hk]
    Pp, (au, bu_, cu), (al, bl, cl) = head.parts(hx, hy, hz)
    d_all, skin = head.combine(Pp)
    hn = n[hm]
    keys = ["skin", "throat", "eyes", "fangs", "teeth", "tongue", "venom"]
    ds_ = np.stack([skin, np.full_like(skin, 9.0), Pp["eyes"], Pp["fangs"], Pp["teeth"], Pp["tongue"], Pp["venom"]], -1)
    which = np.argmin(ds_, -1)
    h_alb = np.zeros((len(hk), 3))
    h_gloss = np.full(len(hk), 0.3)
    h_shin = np.full(len(hk), 40.0)
    h_emis = np.zeros((len(hk), 3))
    h_seam = np.zeros(len(hk))
    h_bulge = np.zeros(len(hk))
    h_irid = np.zeros(len(hk))
    # skin: neck scales where the neck is nearest, head shields elsewhere, pink inside the mouth
    sk = which == 0
    neck_near = Pp["neck"] < np.minimum(Pp["upper"], Pp["lower"]) - 0.004
    # neck param
    nkP = P[nk]
    seg_s = s[nk]
    best = np.full(len(hk), 9.0)
    s_h = np.zeros(len(hk))
    th_h = np.zeros(len(hk))
    rr_h = np.zeros(len(hk))
    pts = np.stack([hx, hy, hz], -1)
    for i in range(len(nk) - 1):
        a_, b_ = nkP[i], nkP[i + 1]
        ab = b_ - a_
        t = np.clip(((pts - a_) @ ab) / (ab @ ab), 0, 1)
        q = a_ + t[:, None] * ab
        dd = np.linalg.norm(pts - q, axis=-1)
        bt = dd < best
        best = np.where(bt, dd, best)
        s_h = np.where(bt, seg_s[i] + t * (seg_s[i + 1] - seg_s[i]), s_h)
        Ti = nrm(ab)
        j = nk[i]
        Di = D[j]
        Si = np.cross(Ti, Di)
        v = pts - q
        th_h = np.where(bt, np.arctan2(v @ Si, v @ Di), th_h)
        rr_h = np.where(bt, r[j], rr_h)
    sm_n, bu_n, hs_n, bel_n = scales_body(s_h, th_h, rr_h)
    sm_h, bu_h = scales_head(au, bu_, cu)
    sm_l, bu_l = scales_head(al + 3.1, bl, cl)
    use_l = Pp["lower"] < Pp["upper"]
    sm_hd = np.where(use_l, sm_l, sm_h)
    bu_hd = np.where(use_l, bu_l, bu_h)
    wn = neck_near.astype(float)
    h_seam = sm_n * wn + sm_hd * (1 - wn)
    h_bulge = bu_n * wn + bu_hd * (1 - wn)
    h_alb[:] = white * (1 - (bel_n * wn)[:, None]) + ivory * (bel_n * wn)[:, None]
    h_irid[:] = 0.6 + 0.4 * hs_n * wn
    # inside the mouth: the carved roof, the lower jaw's upper face, the throat
    roof = ss(-0.006, 0.006, -Pp["cav"] - np.minimum(Pp["upper"], Pp["neck"]))
    inner_w = 0.22 + (0.06 - 0.22) * np.clip(al / 0.8, 0, 1) - 0.035
    lowin = (np.sum(hn * head.Ul, -1) > 0.1) & (np.abs(bl) < inner_w) & (cl > -0.075) & (al < 0.74) & use_l
    lowin &= (Pp["lower"] < 0.004) & ~neck_near
    pink = np.clip(roof + lowin, 0, 1) * sk
    depth_k = np.clip((np.maximum(au, al) - 0.0) / 0.75, 0, 1) ** 0.9  # darker towards the throat
    mouth_col = srgb_to_lin((184, 64, 80)) * (0.12 + 0.88 * depth_k[:, None])
    h_alb = h_alb * (1 - pink[:, None]) + mouth_col * pink[:, None]
    h_seam *= 1 - pink
    h_bulge = h_bulge * (1 - pink) + 0.6 * pink
    h_gloss = h_gloss * (1 - pink) + 0.7 * pink
    h_shin = h_shin * (1 - pink) + 90 * pink
    h_irid *= 1 - pink
    # throat
    m = which == 1
    h_alb[m] = srgb_to_lin((38, 8, 14))
    h_gloss[m], h_shin[m] = 0.5, 80
    # eyes: venom green, a slit pupil, a darker ring, glowing
    m = which == 2
    if m.any():
        # the pupils stare at the viewer: slit pupils, iris lit from within, a dark limbal ring at the edge
        P3 = np.stack([hx[m], hy[m], hz[m]], -1)
        sg = np.sign(bu_[m])[:, None]
        cen = head.O + LH * (EYE[0] * head.Fu + sg * EYE[1] * head.Rs + EYE[2] * head.Uu)
        ev = (P3 - cen) / (EYE[3] * LH)
        outw = nrm(0.55 * head.Fu + sg * 0.83 * head.Rs)
        look = nrm(outw * 0.55 + np.array([0.0, 0.05, 1.0]))
        upv = nrm(head.Uu - (look @ head.Uu)[:, None] * look)
        side = np.cross(look, upv)
        pu = np.sum(ev * side, -1)
        pv = np.sum(ev * upv, -1)
        facing = np.sum(ev * look, -1)
        rr_ = np.hypot(pu, pv)
        slit = np.exp(-((pu / (0.075 * np.sqrt(np.clip(1 - (pv / 0.8) ** 2, 0.02, 1)))) ** 2)) * (np.abs(pv) < 0.82) * ss(0.0, 0.3, facing)
        ring = ss(0.55, 0.9, rr_) + ss(0.3, -0.1, facing)
        streak = 0.85 + 0.15 * np.sin(np.arctan2(pv, pu) * 28)
        iris = np.array([0.55, 1.0, 0.25])[None] * ss(0.75, 0.0, rr_)[:, None] + np.array([0.12, 0.85, 0.35])[None] * (1 - ss(0.75, 0.0, rr_))[:, None]
        e_col = iris * streak[:, None] * np.clip(1 - 0.85 * ring, 0.05, 1)[:, None]
        e_col = e_col * (1 - 0.97 * slit[:, None])
        h_alb[m] = 0.02
        h_emis[m] = e_col * 1.45
        h_gloss[m], h_shin[m] = 1.2, 220
    # fangs and teeth: ivory, glossy
    for k_ in (3, 4):
        m = which == k_
        h_alb[m] = srgb_to_lin((240, 234, 214))
        h_gloss[m], h_shin[m] = 0.8, 120
    # tongue: deep crimson, black at the tips
    m = which == 5
    if m.any():
        tl = (np.stack([hx[m], hy[m], hz[m]], -1) - head.tongue_base) @ head.tongue_dir / LH
        tip = ss(0.55, 0.95, tl)
        h_alb[m] = srgb_to_lin((120, 14, 32)) * (1 - tip[:, None]) + srgb_to_lin((26, 6, 12)) * tip[:, None]
        h_gloss[m], h_shin[m] = 0.9, 100
    # venom: glowing green, glassy
    m = which == 6
    h_alb[m] = srgb_to_lin((40, 120, 60))
    h_emis[m] = np.array([0.08, 0.5, 0.2])
    h_gloss[m], h_shin[m] = 1.4, 200
    alb[is_head], gloss[is_head], shin[is_head], emis[is_head] = h_alb, h_gloss, h_shin, h_emis
    seam[is_head], bulge[is_head], irid_k[is_head] = h_seam, h_bulge, h_irid
    # ---------------------------------------------------------------- lighting
    Lk = nrm([-0.55, 0.62, 0.56])
    # bump the normal a little per scale (bulges catch the light)
    shade_n = n
    # shadow map from the key light
    shadow = shadow_map(rd, P[: zbuf_upto], r[: zbuf_upto], head, pos, Lk)
    ndl = np.clip(n @ Lk, 0, 1)
    wrap = np.clip((n @ Lk + 0.3) / 1.3, 0, 1)
    key_c = np.array([1.0, 0.93, 0.82]) * 2.3
    fill_d = nrm([0.75, 0.05, 0.66])
    fill_c = np.array([0.32, 0.45, 0.7]) * 0.55
    sky = np.array([0.1, 0.13, 0.2])
    gnd = np.array([0.08, 0.06, 0.04])
    hemi = sky * (0.5 + 0.5 * n[:, 1:2]) + gnd * (0.5 - 0.5 * n[:, 1:2])
    ao = ambient_occlusion(rd, mask)
    bump = 0.78 + 0.32 * bulge
    dark_seam = 1 - 0.45 * seam
    diff = key_c * (ndl * shadow)[:, None] + key_c * 0.08 * wrap[:, None] + fill_c * np.clip(n @ fill_d, 0, 1)[:, None] + hemi * 2.0
    col = alb * diff * (bump * dark_seam * ao)[:, None]
    hv = nrm(Lk + np.array([0, 0, 1.0]))
    spec = np.clip(n @ hv, 0, 1) ** shin * gloss * shadow * (0.4 + 0.6 * bulge) * (1 - 0.6 * seam)
    col += key_c * spec[:, None] * 0.9
    graze = (1 - np.clip(n[:, 2], 0, 1))
    rim_gold = np.array([1.0, 0.7, 0.32]) * (graze ** 3 * np.clip(0.4 + 0.6 * n[:, 1], 0, 1) * 0.9)[:, None]
    rim_teal = np.array([0.25, 0.75, 0.85]) * (graze ** 3 * np.clip(n[:, 0], 0, 1) * 0.7)[:, None]
    col += (rim_gold + rim_teal) * (0.4 + 0.6 * ao)[:, None] * (1 - 0.6 * (alb.mean(-1) < 0.2))[:, None]
    hue = 5.0 * graze + 9.0 * irid_k
    irid = np.stack([np.sin(hue), np.sin(hue + 2.1), np.sin(hue + 4.2)], -1) * 0.5 + 0.5
    col += irid * (0.06 * graze * irid_k * (0.3 + 0.7 * ndl))[:, None] * (1 - seam)[:, None]
    col += emis
    # tone map (soft shoulder) and back to sRGB
    col = col / (1 + 0.35 * col)
    col = np.clip(col * 1.12, 0, 1) ** (1 / 2.2)
    img = np.zeros((H_, W_, 4), F)
    img[mask, :3] = col * 255
    img[mask, 3] = 255
    # glow: eyes and venom bloom onto the surroundings
    em = np.zeros((H_, W_, 3), F)
    em[mask] = np.clip(emis, 0, 3)
    gk = rd.K / 3240.0
    glow = np.stack([ndimage.gaussian_filter(em[..., k], 10 * gk) for k in range(3)], -1) * 0.8
    glow += np.stack([ndimage.gaussian_filter(em[..., k], 34 * gk) for k in range(3)], -1) * 0.6
    out_img = composite_glow(img, glow)
    im = Image.fromarray(np.clip(out_img, 0, 255).astype(np.uint8), "RGBA")
    im = im.resize((Wf, Hf), Image.LANCZOS)
    shadow = ground_shadow(rd, P, r, Lk, Wf, Hf)
    shadow.alpha_composite(im)
    return shadow, rd, P, r


def c2w(P):
    P = np.asarray(P, float)
    return np.stack([P[..., 0], P[..., 1] * CP + P[..., 2] * SP, -P[..., 1] * SP + P[..., 2] * CP], -1)


def ground_shadow(rd, P, r, Lk, Wf, Hf):
    """The coils' shadow on the counter top: a tight dark contact under every sphere near the ground, and a soft cast
    shadow along the key light. Black with alpha, under the snake."""
    k = Wf / 1.0  # final pixels per frame width
    acc = np.zeros((Hf, Wf), F)
    Pw = c2w(P)
    Lw = c2w(Lk)
    yy, xx = np.mgrid[0:Hf, 0:Wf].astype(F)
    for i in range(0, len(P), 3):
        X, Y, Z = Pw[i]
        lift = max(0.0, Y - r[i])
        for (gx, gz), rad, strength in (((X, Z), r[i] * 1.05, 0.75 * math.exp(-lift / 0.03)),
                                         ((X - Lw[0] * Y / Lw[1], Z - Lw[2] * Y / Lw[1]), r[i] * 1.25, 0.32 * math.exp(-lift / 0.25))):
            if strength < 0.02:
                continue
            G = w2c((gx, 0.0, gz))
            cx, cy = (0.5 + G[0]) * k, (rd.y0 - G[1]) * k
            ax, ay = rad * k, rad * SP * k
            x0, x1 = max(0, int(cx - ax - 2)), min(Wf, int(cx + ax + 3))
            y0, y1 = max(0, int(cy - ay - 2)), min(Hf, int(cy + ay + 3))
            if x0 >= x1 or y0 >= y1:
                continue
            e = ((xx[y0:y1, x0:x1] - cx) / ax) ** 2 + ((yy[y0:y1, x0:x1] - cy) / ay) ** 2
            acc[y0:y1, x0:x1] = np.maximum(acc[y0:y1, x0:x1], strength * np.clip(1 - e, 0, 1) ** 0.5)
    acc = ndimage.gaussian_filter(acc, 0.012 * k) * 0.6 + ndimage.gaussian_filter(acc, 0.004 * k) * 0.4
    rgba = np.zeros((Hf, Wf, 4), np.uint8)
    rgba[..., :3] = (4, 5, 8)
    rgba[..., 3] = np.clip(acc * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def composite_glow(img, glow):
    """Add the glow as light: over the snake add it to the colour, outside it make a green haze with alpha."""
    out = img.copy()
    a = out[..., 3:4] / 255.0
    g = np.clip(glow, 0, 1.5)
    gl = np.clip(g.max(-1, keepdims=True), 0, 1)
    gcol = np.clip(g / np.maximum(gl, 1e-4), 0, 1) * 255
    rgb = out[..., :3] + g * 255 * a
    # outside: the glow alone, as a coloured layer with its own alpha
    alpha_out = a + gl * 0.85 * (1 - a)
    rgb = (rgb * a + gcol * gl * 0.85 * (1 - a)) / np.maximum(alpha_out, 1e-4)
    out[..., :3] = np.clip(rgb, 0, 255)
    out[..., 3:4] = np.clip(alpha_out * 255, 0, 255)
    return out


def ambient_occlusion(rd, mask):
    """Screen-space: darken where the surface sits below its neighbours (crevices between coils, under the jaw)."""
    z = np.where(mask, rd.zb, np.nan)
    zf = np.where(mask, rd.zb, 0).astype(F)
    w = mask.astype(F)
    occ = np.zeros(mask.shape, F)
    for sig, k in ((0.01, 0.6), (0.03, 0.4)):
        sp = sig * rd.K
        num = ndimage.gaussian_filter(zf, sp)
        den = ndimage.gaussian_filter(w, sp)
        avg = num / np.maximum(den, 1e-4)
        occ += k * np.clip((avg - zf) / (0.035 * rd.K), 0, 1)
    ao = np.clip(1 - occ * 1.1, 0.25, 1)
    return ao[mask]


def shadow_map(rd, P, r, head, pos, L, res=1400):
    """Orthographic depth map from the key light: body spheres splatted, the head sampled on a grid."""
    zL = nrm(L)
    xL = nrm(np.cross([0.0, 1.0, 0.0], zL))
    yL = np.cross(zL, xL)
    B = np.stack([xL, yL, zL])
    Pl = P @ B.T
    # head occupancy points
    bx0, bx1, by0, by1, bz1, bz0 = head.bounds()
    st = 0.0035
    X, Y, Z = np.meshgrid(np.arange(bx0, bx1, st), np.arange(by0, by1, st), np.arange(bz0, bz1, st), indexing="ij")
    hx, hy, hz = X.ravel(), Y.ravel(), Z.ravel()
    occ_pts = []
    for k in range(0, len(hx), 2_000_000):
        sl = slice(k, k + 2_000_000)
        d = head.sdf(hx[sl], hy[sl], hz[sl])
        m = d < 0
        occ_pts.append(np.stack([hx[sl][m], hy[sl][m], hz[sl][m]], -1))
    occ = np.vstack(occ_pts) @ B.T
    lo = np.minimum(Pl[:, :2].min(0) - 0.15, occ[:, :2].min(0) - 0.02)
    hi = np.maximum(Pl[:, :2].max(0) + 0.15, occ[:, :2].max(0) + 0.02)
    sc = res / (hi - lo).max()
    sm = np.full((res, res), -1e9, F)
    for i in range(len(Pl)):
        cx, cy = (Pl[i, 0] - lo[0]) * sc, (Pl[i, 1] - lo[1]) * sc
        rr = r[i] * sc
        x0, x1 = max(0, int(cx - rr - 1)), min(res, int(cx + rr + 2))
        y0, y1 = max(0, int(cy - rr - 1)), min(res, int(cy + rr + 2))
        xs = (np.arange(x0, x1) + 0.5 - cx) / rr
        ys = (np.arange(y0, y1) + 0.5 - cy) / rr
        d2 = xs[None, :] ** 2 + ys[:, None] ** 2
        zz = np.where(d2 < 1, Pl[i, 2] + np.sqrt(np.clip(1 - d2, 0, 1)) * r[i], -1e9)
        sm[y0:y1, x0:x1] = np.maximum(sm[y0:y1, x0:x1], zz)
    ox = np.clip(((occ[:, 0] - lo[0]) * sc).astype(int), 0, res - 1)
    oy = np.clip(((occ[:, 1] - lo[1]) * sc).astype(int), 0, res - 1)
    hm_ = np.full((res, res), -1e9, F)
    np.maximum.at(hm_, (oy, ox), occ[:, 2].astype(F))
    sm = np.maximum(sm, ndimage.grey_dilation(hm_, size=4))
    q = pos @ B.T
    qx = (q[:, 0] - lo[0]) * sc
    qy = (q[:, 1] - lo[1]) * sc
    # percentage-closer: several taps
    lit = np.zeros(len(q))
    taps = [(0, 0), (1.5, 0), (-1.5, 0), (0, 1.5), (0, -1.5), (1, 1), (-1, -1), (1, -1), (-1, 1)]
    for ddx, ddy in taps:
        sx = np.clip((qx + ddx * 1.6).astype(int), 0, res - 1)
        sy = np.clip((qy + ddy * 1.6).astype(int), 0, res - 1)
        lit += (sm[sy, sx] <= q[:, 2] + 0.012)
    return lit / len(taps)


if __name__ == "__main__":
    sc = float(sys.argv[1]) if len(sys.argv) > 1 else 0.25
    import time

    t0 = time.time()
    im, *_ = render(int(1620 * sc), int(2160 * sc), 2)
    os.makedirs(os.path.join(ROOT, "art", "cover"), exist_ok=True)
    im.save(os.path.join(ROOT, "art", "cover", "snake_test.png"))
    print("done", round(time.time() - t0, 1), "s")
