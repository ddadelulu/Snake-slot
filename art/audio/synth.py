"""CONSTRICTOR placeholder audio: original, synthesized from scratch (numpy). DECISIONS D-021.

Usage (from repo root):  math/env/bin/python art/audio/synth.py
Writes MP3 (mono, 44.1 kHz) into art/placeholder/audio/. Nothing is sampled from any source.
The final-audio brief is in art/AUDIO_SPEC.md; files dropped into art/final/audio/ with the same names win.
"""

from __future__ import annotations

import os

import lameenc
import numpy as np
from scipy.signal import butter, lfilter, sosfilt

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "placeholder", "audio")
rng = np.random.default_rng(1212)


# ----------------------------------------------------------------------------------------------------
# DSP helpers
# ----------------------------------------------------------------------------------------------------
def t(sec):
    return np.arange(int(sec * SR)) / SR


def env_exp(n, attack=0.002, decay=0.2):
    x = np.arange(n) / SR
    a = np.clip(x / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(x - attack, 0) / decay)


def lp(x, f, order=2):
    sos = butter(order, f / (SR / 2), btype="low", output="sos")
    return sosfilt(sos, x)


def hp(x, f, order=2):
    sos = butter(order, f / (SR / 2), btype="high", output="sos")
    return sosfilt(sos, x)


def bp(x, lo, hi, order=2):
    sos = butter(order, [lo / (SR / 2), hi / (SR / 2)], btype="band", output="sos")
    return sosfilt(sos, x)


def noise(sec):
    return rng.standard_normal(int(sec * SR))


def pink(sec):
    w = rng.standard_normal(int(sec * SR))
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return lfilter(b, a, w) * 8


def sine(f, sec, phase=0.0):
    return np.sin(2 * np.pi * f * t(sec) + phase)


def glide(f0, f1, sec, curve=3.0):
    x = t(sec)
    f = f1 + (f0 - f1) * np.exp(-curve * x / sec)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def fm_bell(f, sec, ratio=3.5, index=2.5, decay=0.6):
    x = t(sec)
    mod = index * np.exp(-x / (decay * 0.5)) * np.sin(2 * np.pi * f * ratio * x)
    return np.sin(2 * np.pi * f * x + mod) * env_exp(len(x), 0.001, decay)


def pluck(f, sec, damp=0.996, bright=0.5):
    """Karplus-Strong string."""
    n = int(sec * SR)
    p = max(2, int(SR / f))
    buf = lp(rng.uniform(-1, 1, p), max(200, f * (2 + 8 * bright)), 1)
    out = np.zeros(n)
    b = buf.copy()
    for i in range(n):
        j = i % p
        v = b[j]
        out[i] = v
        b[j] = damp * 0.5 * (v + b[(j + 1) % p])
    return out


def piano(f, sec, vel=0.6):
    x = t(sec)
    out = np.zeros_like(x)
    for k, amp in enumerate([1, 0.55, 0.3, 0.18, 0.1, 0.06], start=1):
        fk = f * k * np.sqrt(1 + 0.0004 * k * k)
        out += amp * np.sin(2 * np.pi * fk * x) * np.exp(-x * (0.8 + 0.6 * k))
    hammer = lp(noise(0.02), 3000) * env_exp(int(0.02 * SR), 0.0005, 0.005)
    out[: len(hammer)] += hammer * 0.2
    return out * vel * env_exp(len(x), 0.003, sec)


def reverb(x, mix=0.25, room=0.82):
    """Small Schroeder reverb (4 combs + 2 allpasses)."""
    y = np.zeros(len(x) + int(1.5 * SR))
    xp = np.concatenate([x, np.zeros(int(1.5 * SR))])
    for d, g in [(1557, room), (1617, room - 0.01), (1491, room - 0.02), (1422, room - 0.03)]:
        a = np.zeros(d + 1)
        a[0], a[d] = 1, -g
        y += lfilter([1], a, xp) * 0.25
    for d, g in [(225, 0.5), (556, 0.5)]:
        b = np.zeros(d + 1)
        b[0], b[d] = -g, 1
        a = np.zeros(d + 1)
        a[0], a[d] = 1, -g
        y = lfilter(b, a, y)
    y = lp(y, 5000)
    return (1 - mix) * xp + mix * y


def fade(x, fin=0.005, fout=0.02):
    x = x.copy()
    a, b = int(fin * SR), int(fout * SR)
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def norm(x, peak=0.89):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def loopify(x, xfade=0.25):
    """Crossfade the tail into the head so the file loops seamlessly."""
    n = int(xfade * SR)
    head, body, tail = x[:n], x[n:-n], x[-n:]
    w = np.linspace(0, 1, n)
    return np.concatenate([tail * (1 - w) + head * w, body])


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def place(buf, x, at):
    i = int(at * SR)
    end = min(len(buf), i + len(x))
    buf[i:end] += x[: end - i]


def save(name, x, kbps=96):
    os.makedirs(OUT, exist_ok=True)
    x = np.clip(norm(x), -1, 1)
    pcm = (x * 32767).astype(np.int16).tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    data = enc.encode(pcm) + enc.flush()
    with open(os.path.join(OUT, f"{name}.mp3"), "wb") as f:
        f.write(data)
    return len(data)


# ----------------------------------------------------------------------------------------------------
# SFX
# ----------------------------------------------------------------------------------------------------
def sfx():
    out = {}
    for i, f0 in enumerate([92, 104, 84]):  # symbol landing on velvet
        body = glide(f0 * 1.6, f0, 0.16, 6) * env_exp(int(0.16 * SR), 0.001, 0.05)
        fuzz = lp(noise(0.12), 900) * env_exp(int(0.12 * SR), 0.001, 0.02) * 0.25
        out[f"land_{i+1}"] = fade(mix(body, fuzz), 0.001, 0.03)
    out["gem_tick"] = fade(mix(fm_bell(2640, 0.25, 2.01, 1.2, 0.08) * 0.6, hp(noise(0.02), 4000) * 0.1), 0.0005)
    knock = lambda f: glide(f * 1.3, f, 0.12, 8) * env_exp(int(0.12 * SR), 0.001, 0.035)  # noqa: E731
    wob = np.zeros(int(0.5 * SR))
    place(wob, knock(210), 0.0)
    place(wob, knock(185) * 0.8, 0.16)
    place(wob, knock(200) * 0.6, 0.3)
    out["egg_wobble"] = wob
    crack = np.zeros(int(0.45 * SR))
    for k in range(26):
        g = bp(noise(0.01), 1800, 6000) * env_exp(int(0.01 * SR), 0.0002, 0.003)
        place(crack, g * rng.uniform(0.3, 1), rng.uniform(0, 0.38) ** 1.4)
    place(crack, knock(160) * 0.7, 0.0)
    out["egg_crack"] = crack
    hiss = bp(noise(1.3), 2500, 9000) * env_exp(int(1.3 * SR), 0.18, 0.45)
    out["hatch_hiss"] = fade(reverb(hiss, 0.2), 0.01, 0.2)
    sl = lp(pink(2.2), 1400) * (0.6 + 0.4 * np.sin(2 * np.pi * 2.3 * t(2.2)))
    out["slither_loop"] = loopify(sl, 0.3)
    fl = np.zeros(int(0.12 * SR))
    for at in (0.0, 0.035, 0.07):
        place(fl, hp(noise(0.006), 5000) * env_exp(int(0.006 * SR), 0.0002, 0.0015), at)
    out["tongue_flick"] = fl
    gulp = glide(420, 110, 0.26, 5) * env_exp(int(0.26 * SR), 0.004, 0.09)
    pop = lp(noise(0.03), 700) * env_exp(int(0.03 * SR), 0.001, 0.008) * 0.6
    out["gulp"] = fade(mix(pop, gulp), 0.001, 0.03)
    out["mult_tick"] = fade(fm_bell(1760, 0.18, 1.41, 3, 0.05), 0.0005)
    boom = glide(110, 42, 0.9, 4) * env_exp(int(0.9 * SR), 0.002, 0.35)
    clang = sum(np.sin(2 * np.pi * f * t(0.9)) * a for f, a in [(523, 0.5), (1321, 0.3), (2211, 0.2)]) * env_exp(int(0.9 * SR), 0.001, 0.18)
    out["mult_slam"] = fade(reverb(mix(boom, clang * 0.35, lp(noise(0.05), 2500) * 0.4), 0.25), 0.0005, 0.3)
    ch = np.zeros(int(1.4 * SR))
    for i, f in enumerate([880, 1047, 1319]):  # A5 C6 E6
        place(ch, fm_bell(f, 1.0, 3.01, 1.6, 0.35) * (0.8 - 0.15 * i), 0.07 * i)
    out["cluster_win"] = reverb(ch, 0.3)
    brass = sum(np.sin(2 * np.pi * 1180 * r * t(0.8)) * a for r, a in [(1, 0.6), (2.76, 0.3), (5.4, 0.15)])
    out["key_land"] = fade(reverb(brass * env_exp(int(0.8 * SR), 0.0008, 0.16), 0.2), 0.0005)
    hb = np.zeros(int(0.857 * SR))
    th = lambda: lp(glide(70, 42, 0.18, 5) * env_exp(int(0.18 * SR), 0.004, 0.06), 200)  # noqa: E731
    place(hb, th(), 0.0)
    place(hb, th() * 0.7, 0.24)
    out["heartbeat_loop"] = hb
    door = mix(
        lp(pink(2.8), 180) * env_exp(int(2.8 * SR), 0.4, 1.4) * 1.5,
        glide(95, 70, 2.4, 1) * 0.35 * env_exp(int(2.4 * SR), 0.6, 1.2),
    )
    clunk = mix(lp(noise(0.12), 600) * env_exp(int(0.12 * SR), 0.001, 0.04), glide(90, 50, 0.4, 6) * env_exp(int(0.4 * SR), 0.001, 0.12))
    place(door, clunk * 1.4, 2.35)
    out["vault_door"] = fade(reverb(door, 0.3), 0.02, 0.4)
    bite = mix(bp(noise(0.05), 1500, 7000) * env_exp(int(0.05 * SR), 0.0003, 0.012), glide(240, 90, 0.3, 7) * env_exp(int(0.3 * SR), 0.001, 0.08))
    out["ouro_bite"] = fade(bite, 0.0005, 0.05)
    cr = np.zeros(int(0.9 * SR))
    for k in range(90):
        g = bp(noise(0.02), rng.uniform(250, 900), rng.uniform(1200, 3000)) * env_exp(int(0.02 * SR), 0.0005, 0.006)
        place(cr, g * rng.uniform(0.2, 1), (k / 90) ** 0.7 * 0.8)
    out["constrict_crunch"] = reverb(cr, 0.2)
    bm = glide(90, 32, 2.6, 2.5) * env_exp(int(2.6 * SR), 0.005, 1.1)
    out["deep_boom"] = fade(reverb(mix(bm, lp(noise(0.4), 300) * env_exp(int(0.4 * SR), 0.002, 0.15)), 0.35, 0.88), 0.001, 0.8)
    tk = np.zeros(int(1.0 * SR))
    for k in range(16):
        place(tk, fm_bell(2093 + 70 * (k % 3), 0.06, 2.0, 1, 0.02) * 0.5, k / 16)
    out["countup_loop"] = tk
    out["ui_click"] = fade(mix(hp(noise(0.01), 2500) * env_exp(int(0.01 * SR), 0.0002, 0.002), fm_bell(1400, 0.05, 1.0, 0.5, 0.015) * 0.3), 0.0002)
    out["ui_toggle"] = fade(mix(fm_bell(990, 0.08, 1.5, 0.8, 0.02), fm_bell(1320, 0.08, 1.5, 0.8, 0.02) * 0.6), 0.0002)
    # Win tier stingers (A minor), escalating
    def stinger(notes, dur, bass, slam=False):
        s = np.zeros(int((dur + 1.5) * SR))
        place(s, pluck(bass, dur + 0.8, 0.997, 0.4) * 0.9, 0.0)
        for i, (f, at) in enumerate(notes):
            place(s, mix(piano(f, dur, 0.5), fm_bell(f * 2, dur * 0.8, 3.01, 1.2, dur * 0.3) * 0.25), at)
        if slam:
            place(s, glide(100, 40, 1.2, 4) * env_exp(int(1.2 * SR), 0.002, 0.5) * 0.9, 0.0)
        return reverb(s, 0.3)
    out["stinger_strike"] = stinger([(440, 0), (523, 0.09), (659, 0.18)], 0.9, 110)
    out["stinger_constrict"] = stinger([(440, 0), (523, 0.08), (659, 0.16), (880, 0.24)], 1.2, 110, True)
    out["stinger_devour"] = stinger([(392, 0), (466, 0.08), (587, 0.16), (784, 0.24), (932, 0.32)], 1.6, 98, True)
    out["stinger_apex"] = stinger([(440, 0), (523, 0.1), (622, 0.2), (784, 0.3), (1047, 0.42), (1245, 0.54)], 2.2, 55, True)
    out["stinger_vault_empty"] = stinger([(220, 0), (330, 0.15), (440, 0.3), (523, 0.45), (659, 0.6), (880, 0.8), (1047, 1.0)], 3.2, 55, True)
    out["hunt_intro_sting"] = stinger([(330, 0), (311, 0.35), (294, 0.7)], 1.6, 82, True)
    out["ouroboros_sting"] = stinger([(466, 0), (440, 0.12), (523, 0.24), (740, 0.36)], 2.0, 58, True)
    return out


# ----------------------------------------------------------------------------------------------------
# Music and ambience
# ----------------------------------------------------------------------------------------------------
def brush(sec):
    return bp(noise(sec), 2500, 9000) * env_exp(int(sec * SR), 0.01, sec * 0.5) * 0.35


def music_base():
    bpm = 84
    beat = 60 / bpm
    bars = 12
    dur = bars * 4 * beat
    m = np.zeros(int((dur + 2) * SR))
    # walking upright bass, A minor: Am | Dm | E7 | Am  (x3)
    prog = [
        [110, 131, 147, 165],
        [147, 131, 117, 110],
        [82, 104, 123, 147],
        [110, 98, 92, 104],
    ]
    for bar in range(bars):
        for b, f in enumerate(prog[bar % 4]):
            place(m, pluck(f, beat * 1.4, 0.9955, 0.25) * 0.8, (bar * 4 + b) * beat)
    # brushed drums: swish on 2 and 4, soft ride taps
    for bb in range(bars * 4):
        if bb % 2 == 1:
            place(m, brush(beat * 0.9) * 1.1, bb * beat)
        place(m, fm_bell(3500, 0.12, 2.3, 0.6, 0.05) * 0.06, bb * beat)
        place(m, fm_bell(3500, 0.1, 2.3, 0.6, 0.04) * 0.04, (bb + 0.66) * beat)
    # sparse piano voicings every other bar
    chords = [[220, 262, 330, 494], [294, 349, 440, 523], [330, 415, 494, 587], [220, 262, 330, 392]]
    for bar in range(0, bars, 2):
        for i, f in enumerate(chords[(bar // 2) % 4]):
            place(m, piano(f, beat * 6, 0.22), bar * 4 * beat + i * 0.03 + beat * 0.5)
    m = reverb(m[: int(dur * SR) + int(0.5 * SR)], 0.22)
    return loopify(m[: int(dur * SR) + int(0.3 * SR)], 0.3)


def music_hunt(layer=False):
    bpm = 96
    beat = 60 / bpm
    bars = 8
    dur = bars * 4 * beat
    m = np.zeros(int((dur + 2) * SR))
    roots = [55, 55, 58.27, 55, 55, 55, 51.91, 49]
    for bar in range(bars):
        for e in range(8):
            f = roots[bar] * (2 if e % 4 == 2 else 1)
            place(m, pluck(f, beat * 0.6, 0.994, 0.3) * (0.9 if e % 2 == 0 else 0.6), (bar * 4 + e / 2) * beat)
        for q in range(4):
            place(m, hp(noise(0.03), 7000) * env_exp(int(0.03 * SR), 0.001, 0.008) * 0.25, (bar * 4 + q + 0.5) * beat)
    if not layer:
        pad = (sine(220, dur) + sine(233.08, dur) * 0.7) * 0.05 * (0.5 + 0.5 * np.sin(2 * np.pi * t(dur) / (beat * 8)))
        m[: len(pad)] += lp(pad, 1500)
    else:
        m *= 0.0
        for bar in range(bars):
            for q in (0, 1.5, 2, 3.5):
                tom = glide(160, 90, 0.35, 6) * env_exp(int(0.35 * SR), 0.002, 0.12)
                place(m, tom * 0.7, (bar * 4 + q) * beat)
        x = t(dur)
        saw = sum(np.sin(2 * np.pi * 110 * k * x + k) / k for k in range(1, 12)) * 0.08
        m[: len(saw)] += lp(saw * (0.4 + 0.6 * (x / dur)), 2200)
    m = reverb(m[: int(dur * SR) + int(0.5 * SR)], 0.2)
    return loopify(m[: int(dur * SR) + int(0.3 * SR)], 0.3)


def ambience():
    dur = 24
    hum = sum(sine(f, dur) * a for f, a in [(50, 0.5), (100, 0.25), (150, 0.1)]) * 0.35
    rain = lp(hp(pink(dur), 400), 5000) * 0.25
    drops = np.zeros(int(dur * SR))
    for k in range(260):
        place(drops, fm_bell(rng.uniform(1800, 4200), 0.04, 1.5, 0.5, 0.01) * rng.uniform(0.02, 0.07), rng.uniform(0, dur - 0.1))
    return loopify(mix(hum, rain, drops), 1.0)


def main():
    sizes = {}
    for name, x in sfx().items():
        sizes[name] = save(name, x, 96)
    sizes["music_base"] = save("music_base", music_base(), 96)
    sizes["music_hunt"] = save("music_hunt", music_hunt(False), 96)
    sizes["music_hunt_layer"] = save("music_hunt_layer", music_hunt(True), 96)
    sizes["amb_vault"] = save("amb_vault", ambience(), 64)
    total = sum(sizes.values())
    for k, v in sorted(sizes.items()):
        print(f"{k:22s} {v/1024:7.1f} KB")
    print(f"TOTAL {total/1024/1024:.2f} MB, {len(sizes)} files")


if __name__ == "__main__":
    main()
