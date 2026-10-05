"""CONSTRICTOR placeholder music, synthesized from scratch (numpy). DECISIONS D-021, D-051.

1940s noir jazz in a strongroom, with a snake charmer in it: swung upright bass, brushes and ride, Rhodes comping,
and a sinuous clarinet line in A Phrygian dominant (the "snake charmer" mode) over A minor changes that lean on
the Phrygian bII7 (Bb7). The Hunt is a big-band jungle-tom stomp in the same key; its layer adds a hot muted
trumpet lead and brass hits and is sample-for-sample the same length, so the game can fade it in as the multiplier
grows. Everything is in A minor, like the win stingers. Stereo, 44.1 kHz. Nothing is sampled from any source.

Usage (from repo root):  math/env/bin/python art/audio/music.py
"""

from __future__ import annotations

import math
import os

import lameenc
import numpy as np
from scipy.signal import butter, lfilter, sosfilt

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "placeholder", "audio")
R = np.random.default_rng(1940)  # music has its own generator, so it never shifts the SFX/ambience noise


# ----------------------------------------------------------------------------------------------------- basics
def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(sec):
    return np.arange(int(sec * SR)) / SR


def lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR * 0.45) / (SR / 2), btype="low", output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f / (SR / 2), btype="high", output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], btype="band", output="sos"), x)


def env(n, a=0.003, d=0.3):
    x = np.arange(n) / SR
    return np.clip(x / max(a, 1e-4), 0, 1) * np.exp(-np.maximum(x - a, 0) / d)


def noise(sec):
    return R.standard_normal(int(sec * SR))


class Track:
    """A stereo buffer you place panned mono parts into."""

    def __init__(self, sec):
        self.b = np.zeros((2, int(sec * SR) + 2 * SR))

    def put(self, x, at, pan=0.0, gain=1.0):
        i = max(0, int(at * SR))
        e = min(self.b.shape[1], i + len(x))
        if e <= i:
            return
        th = (pan + 1) * math.pi / 4
        self.b[0, i:e] += x[: e - i] * math.cos(th) * gain
        self.b[1, i:e] += x[: e - i] * math.sin(th) * gain


def reverb_st(x, mix=0.22, room=0.82):
    """Stereo Schroeder reverb: different comb sets per side, so the room is wide."""
    pad = int(1.6 * SR)
    xp = np.concatenate([x, np.zeros(pad)])
    out = []
    for combs in ([1557, 1617, 1491, 1422], [1631, 1523, 1453, 1381]):
        y = np.zeros(len(xp))
        for k, d in enumerate(combs):
            a = np.zeros(d + 1)
            a[0], a[d] = 1, -(room - 0.01 * k)
            y += lfilter([1], a, xp) * 0.25
        for d, g in ((225, 0.5), (556, 0.5)):
            b = np.zeros(d + 1)
            b[0], b[d] = -g, 1
            a = np.zeros(d + 1)
            a[0], a[d] = 1, -g
            y = lfilter(b, a, y)
        out.append(lp(y, 5200))
    return out  # wet L, wet R (dry is added by the caller)


# ----------------------------------------------------------------------------------------------------- voices
def upright(f, sec, vel=0.8):
    """Upright bass: Karplus-Strong string (lfilter) + a sine body + a finger thump."""
    n = int(sec * SR)
    p = max(2, int(round(SR / f)))
    burst = np.zeros(n)
    burst[:p] = lp(R.uniform(-1, 1, p), f * 3.5, 1)
    a = np.zeros(p + 2)
    a[0], a[p], a[p + 1] = 1, -0.4985, -0.4985
    s = lfilter([1], a, burst)
    x = tt(sec)
    body = np.sin(2 * np.pi * f * x) * np.exp(-x / 0.55) * 0.6
    thump = lp(noise(0.03), 500) * env(int(0.03 * SR), 0.001, 0.008) * 0.6
    out = s * 0.9 + body
    out[: len(thump)] += thump
    return lp(out, 1400) * vel * env(n, 0.004, sec * 0.9) * np.clip((sec - x) / 0.05, 0, 1)


def rhodes(f, sec, vel=0.5):
    """FM electric piano: tine (ratio 1) with a decaying index and a faint high bark."""
    x = tt(sec)
    idx = 1.6 * np.exp(-x / 0.25) + 0.25
    car = np.sin(2 * np.pi * f * x + idx * np.sin(2 * np.pi * f * x))
    bark = np.sin(2 * np.pi * f * 7.02 * x) * np.exp(-x / 0.04) * 0.15
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.6 * x)
    return (car + bark) * trem * env(len(x), 0.004, 1.1) * vel * np.clip((sec - x) / 0.08, 0, 1)


def vibes(f, sec, vel=0.5):
    """Vibraphone: FM bar (ratio 4) with motor tremolo."""
    x = tt(sec)
    idx = 1.2 * np.exp(-x / 0.12)
    bar = np.sin(2 * np.pi * f * x + idx * np.sin(2 * np.pi * f * 4.0 * x))
    trem = 1 - 0.35 * (0.5 + 0.5 * np.sin(2 * np.pi * 5.2 * x))
    return bar * trem * env(len(x), 0.001, 1.4) * vel


def line(notes, beat, sec, voice="clarinet", glide=0.05):
    """A legato melodic line with one continuous phase: glides between tied notes, delayed vibrato, breath.
    notes: (start_beat, dur_beats, midi, vel)."""
    n = int(sec * SR)
    f = np.zeros(n)
    amp = np.zeros(n)
    vib = np.zeros(n)
    for s, d, m, v in notes:
        i0, i1 = int(s * beat * SR), min(n, int((s + d) * beat * SR))
        if i1 <= i0:
            continue
        f[i0:i1] = hz(m)
        k = np.arange(i1 - i0) / SR
        a = np.clip(k / 0.035, 0, 1) * np.clip(((i1 - i0) / SR - k) / 0.07, 0, 1)
        amp[i0:i1] = np.maximum(amp[i0:i1], a * v)
        vib[i0:i1] = np.clip((k - 0.18) / 0.35, 0, 1)  # vibrato blooms on held notes
    # hold the last pitch through rests (no zero-frequency phase jumps), then smooth: glides between notes
    if not np.any(f):
        return np.zeros(n)
    idx = np.where(f > 0, np.arange(n), 0)
    np.maximum.accumulate(idx, out=idx)
    f = f[idx]
    f[f == 0] = f[np.nonzero(f)[0][0]]
    f = lfilter([1 - math.exp(-1 / (glide * SR))], [1, -math.exp(-1 / (glide * SR))], f, zi=[f[0] * math.exp(-1 / (glide * SR))])[0]
    x = np.arange(n) / SR
    f = f * (1 + 0.006 * vib * np.sin(2 * np.pi * 5.6 * x))
    ph = 2 * np.pi * np.cumsum(f) / SR
    if voice == "clarinet":  # woody: odd harmonics strong, a little breath
        parts = [(1, 1.0), (2, 0.06), (3, 0.42), (5, 0.2), (7, 0.1), (9, 0.05)]
        tone = sum(a * np.sin(k * ph) for k, a in parts)
        tone = lp(tone, 3200) + bp(R.standard_normal(n), 1200, 4500) * 0.035
    else:  # muted trumpet (harmon): all harmonics, nasal band
        tone = sum(np.sin(k * ph) / k ** 0.65 for k in range(1, 14))
        tone = bp(tone, 650, 3400) * 1.6 + lp(tone, 900) * 0.25
    return tone * amp


def ride(sec=1.6, vel=0.5):
    x = tt(sec)
    partials = [(3140, 0.5), (4235, 0.35), (5410, 0.3), (6890, 0.2), (8020, 0.12)]
    ping = sum(a * np.sin(2 * np.pi * f * x + R.uniform(0, 6)) for f, a in partials) * np.exp(-x / 0.18)
    wash = hp(noise(sec), 5500) * np.exp(-x / 0.7) * 0.18
    return (ping * 0.5 + wash) * vel


def brush_tap(vel=0.5):
    return bp(noise(0.12), 1800, 8000) * env(int(0.12 * SR), 0.002, 0.035) * vel


def sweep(sec, vel=0.25):
    """A circular brush stroke: a soft swell of band-limited noise."""
    x = tt(sec)
    return bp(noise(sec), 2500, 9000) * np.sin(np.pi * x / sec) ** 1.5 * vel


def kick(vel=0.5, f0=95, f1=48):
    x = tt(0.4)
    f = f1 + (f0 - f1) * np.exp(-x / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), 0.001, 0.14) * vel


def hat_foot(vel=0.3):
    return hp(noise(0.06), 6000) * env(int(0.06 * SR), 0.001, 0.012) * vel


def tom(f0, vel=0.7):
    x = tt(0.55)
    f = f0 * (0.78 + 0.22 * np.exp(-x / 0.05))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), 0.001, 0.2)
    skin = lp(noise(0.55), 1200) * env(len(x), 0.001, 0.03) * 0.5
    return (body + skin) * vel


def stab(chord, sec, vel=0.5):
    """Muted brass section hit: stacked short muted-trumpet notes with a fall-off."""
    out = np.zeros(int(sec * SR))
    for m in chord:
        x = tt(sec)
        f = hz(m) * (1 - 0.03 * np.clip((x - sec * 0.6) / (sec * 0.4), 0, 1))
        ph = 2 * np.pi * np.cumsum(f) / SR
        tone = sum(np.sin(k * ph) / k ** 0.7 for k in range(1, 12))
        out += bp(tone, 600, 3600) * env(len(x), 0.012, sec * 0.45)
    return out * vel / max(1, len(chord)) * 2


# ----------------------------------------------------------------------------------------------------- harmony
# chord: (root midi in the bass register, chord tones as intervals, rootless voicing for keys)
CH = {
    "Am9": (45, [0, 3, 7, 10, 14], [60, 64, 67, 71]),  # C E G B
    "Am6": (45, [0, 3, 7, 9], [60, 64, 66, 69]),  # C E F# A
    "Bb7": (46, [0, 4, 7, 10], [62, 65, 68, 72]),  # D F Ab C(9)
    "A7b9": (45, [0, 4, 7, 10, 13], [61, 64, 67, 70]),  # C# E G Bb
    "Dm9": (50, [0, 3, 7, 10, 14], [60, 64, 65, 69]),  # C E F A
    "E7b9": (40, [0, 4, 7, 10, 13], [62, 65, 68, 71]),  # D F G# B
    "Am7": (45, [0, 3, 7, 10], [60, 64, 67, 69]),  # C E G A
    "Fmaj7": (41, [0, 4, 7, 11], [60, 64, 65, 69]),  # C E F A
    "D9": (50, [0, 4, 7, 10, 14], [60, 64, 66, 69]),  # C E F# A
    "Dm7": (50, [0, 3, 7, 10], [60, 62, 65, 69]),  # C D F A
    "G7": (43, [0, 4, 7, 10], [59, 62, 65, 69]),  # B D F A(9)
    "Cmaj7": (48, [0, 4, 7, 11], [59, 62, 64, 67]),  # B D E G
    "E7#9": (40, [0, 4, 7, 10, 15], [62, 67, 68, 71]),  # D G G# B
}


def walk(prog, beat, swing_pos, rng_jit=0.006):
    """Walking bass: root, chord tones, and a chromatic approach into the next root on beat 4."""
    notes = []
    for bar, name in enumerate(prog):
        root, iv, _ = CH[name]
        nxt = CH[prog[(bar + 1) % len(prog)]][0]
        r = root - 12 if root > 44 else root  # keep the walk in E1..D#2 territory
        nr = nxt - 12 if nxt > 44 else nxt
        third = r + iv[1]
        fifth = r + iv[2]
        pick = R.integers(0, 3)
        b2 = [third, fifth, r + 12][pick]
        b3 = [fifth, r + 12, third + 12 if third + 12 < r + 19 else fifth][pick]
        b4 = nr + (1 if R.random() < 0.5 else -1)
        for q, m in enumerate([r, b2, b3, b4]):
            notes.append(((bar * 4 + q) * beat + R.normal(0, rng_jit), m, 0.85 if q in (0, 2) else 0.72))
    return notes


# ----------------------------------------------------------------------------------------------------- tracks
def music_base():
    bpm = 80
    beat = 60 / bpm
    sw = 2 / 3  # swing: the off-beat eighth lands two thirds of the way through the beat
    A = ["Am9", "Am6", "Bb7", "A7b9", "Dm9", "Bb7", "E7b9", "Am7"]
    B = ["Fmaj7", "E7b9", "Am7", "D9", "Dm7", "G7", "Cmaj7", "E7#9"]
    prog = A + B + A
    bars = len(prog)
    dur = bars * 4 * beat
    T = Track(dur)
    # bass
    for at, m, v in walk(prog, beat, sw):
        T.put(upright(hz(m), beat * 1.15, v), at, 0.0, 0.95)
    # drums: ride (ding, ding-a, ding, ding-a), brush taps on 2 and 4, sweeps, feathered kick, foot hat
    for b in range(bars * 4):
        at = b * beat
        T.put(ride(1.4, 0.32 if b % 2 == 0 else 0.26), at + R.normal(0, 0.004), 0.45)
        if b % 2 == 1:
            T.put(ride(1.0, 0.18), at + sw * beat, 0.45)
            T.put(brush_tap(0.55), at, -0.15)
            T.put(hat_foot(0.22), at, 0.2)
        T.put(sweep(beat * 0.95, 0.12), at, -0.2)
        if b % 4 in (0, 2):
            T.put(kick(0.32), at, 0.0)
    # Rhodes comping: Charleston (1, and-of-2) with variations; lighter in the B section where the vibes sing
    for bar, name in enumerate(prog):
        voicing = CH[name][2]
        base = bar * 4 * beat
        pattern = [(0, 1.2), (1 + sw, 1.6)] if R.random() < 0.6 else [(0 + sw, 1.0), (2, 1.8)]
        if 8 <= bar < 16:
            pattern = [(0, 3.4)]
        for s, d in pattern:
            for i, m in enumerate(voicing):
                T.put(rhodes(hz(m), d * beat, 0.16), base + s * beat + i * 0.012, -0.35)
    # the snake charmer: clarinet in A Phrygian dominant over the A sections (beats from the section start)
    mel = [
        (1.5, 0.5, 76, 0.7), (2.0, 0.5, 77, 0.75), (2.5, 1.5, 76, 0.8),
        (4 + 1 + sw, 0.34, 74, 0.6), (4 + 2, 0.5, 73, 0.65), (4 + 2.5, 1.5, 76, 0.8),
        (8 + 0.5, 0.5, 77, 0.7), (8 + 1, 0.5, 76, 0.7), (8 + 1.5, 0.5, 74, 0.7), (8 + 2, 2, 77, 0.8),
        (12 + 0, 1.5, 76, 0.75), (12 + 1.5, 0.5, 73, 0.7), (12 + 2, 1.0, 70, 0.7), (12 + 3, 1.0, 69, 0.7),
        (16 + 1, 0.5, 72, 0.7), (16 + 1.5, 0.5, 74, 0.7), (16 + 2, 1.5, 77, 0.8), (16 + 3.5, 0.5, 76, 0.65),
        (20 + 0, 1.0, 74, 0.7), (20 + 1, 1.0, 77, 0.7), (20 + 2, 2.0, 74, 0.75),
        (24 + 0.5, 0.5, 71, 0.7), (24 + 1, 0.5, 74, 0.7), (24 + 1.5, 0.5, 77, 0.75), (24 + 2, 1.5, 76, 0.8),
        (28 + 0, 3.5, 69, 0.75),
    ]
    for sec_bar in (0, 16):  # A and A'
        notes = [(sec_bar * 4 + s, d, m, v * (0.85 if sec_bar else 1)) for s, d, m, v in mel]
        T.put(line(notes, beat, dur, "clarinet"), 0, 0.25, 0.5)
    # B section: vibes answer (chord tones on the beat, a rising arpeggio into the turnaround)
    vib = [(0, 2, 76), (2, 2, 72), (4, 1, 76), (5, 1, 74), (6, 2, 71), (8, 3, 72), (11, 1, 76), (12, 2, 78), (14, 2, 74),
           (16, 2, 77), (18, 2, 74), (20, 3, 71), (23, 1, 74), (24, 2, 76), (26, 2, 74), (28, 1, 71), (29, 1, 74), (30, 2, 79)]
    for s, d, m in vib:
        T.put(vibes(hz(m), d * beat + 0.8, 0.42), (32 + s) * beat, -0.3)
    return T.b, dur


def music_hunt(layer=False):
    bpm = 104
    beat = 60 / bpm
    sw = 0.62
    prog = ["Am7", "Am7", "Bb7", "A7b9", "Am7", "Am7", "Bb7", "E7b9", "Dm7", "Dm7", "Bb7", "A7b9", "Dm7", "E7b9", "Am7", "E7#9"]
    bars = len(prog)
    dur = bars * 4 * beat
    T = Track(dur)
    if not layer:
        # jungle toms: low tom on every beat, accent on 1 and 3, a pickup flam into each bar
        for b in range(bars * 4):
            at = b * beat
            # tuned to the key: the floor tom settles on E2 (the fifth), the pickup tom on A2 (the root)
            T.put(tom(hz(40) / 0.78, 0.6 if b % 2 == 0 else 0.44), at, -0.1)
            if b % 4 == 3:
                T.put(tom(hz(45) / 0.78, 0.4), at + sw * beat, 0.15)
            T.put(kick(0.28, 90, 46), at, 0)
            T.put(ride(1.0, 0.26), at, 0.45)
            if b % 2 == 1:
                T.put(ride(0.8, 0.16), at + sw * beat, 0.45)
                T.put(brush_tap(0.5), at, -0.2)
        for at, m, v in walk(prog, beat, sw, 0.004):
            T.put(upright(hz(m), beat * 0.95, v), at, 0.0, 1.05)
        # low clarinet riff on the A chords (the snake underneath the stomp)
        riff = []
        for bar, name in enumerate(prog):
            if name.startswith("A") or name == "Bb7":
                s = bar * 4
                riff += [(s + 0, 0.5, 64, 0.6), (s + 0.5, 0.5, 65, 0.6), (s + 1, 0.5, 64, 0.6), (s + 1.5, 0.5, 61, 0.55), (s + 2, 1.5, 64, 0.6)]
        T.put(line(riff, beat, dur, "clarinet", 0.03), 0, -0.3, 0.6)
        # sustained low pad on the changes (Rhodes, long)
        for bar, name in enumerate(prog):
            for i, m in enumerate(CH[name][2]):
                T.put(rhodes(hz(m), 3.6 * beat, 0.17), bar * 4 * beat + i * 0.01, 0.3)
    else:
        # brass hits on the changes and a hot muted-trumpet lead in A Phrygian dominant
        for bar, name in enumerate(prog):
            v = [m + 12 for m in CH[name][2][1:]]
            T.put(stab(v, beat * 0.9, 0.55), bar * 4 * beat, 0.2)
            T.put(stab(v, beat * 0.5, 0.4), (bar * 4 + 2 + sw) * beat, 0.2)
        lead = []
        motif = [(0, 0.5, 76), (0.5, 0.5, 77), (1, 0.5, 76), (1.5, 0.5, 73), (2, 1, 76), (3, 0.5, 79), (3.5, 0.5, 77)]
        answer = [(0, 1, 76), (1, 0.5, 74), (1.5, 0.5, 73), (2, 0.5, 70), (2.5, 0.5, 73), (3, 1, 69)]
        for bar in range(bars):
            src = motif if bar % 2 == 0 else answer
            shift = 5 if 8 <= bar < 12 else 0  # up a fourth over the Dm bars
            lead += [(bar * 4 + s, d, m + shift, 0.75) for s, d, m in src]
        T.put(line(lead, beat, dur, "trumpet", 0.025), 0, -0.25, 0.55)
    return T.b, dur


# ----------------------------------------------------------------------------------------------------- output
def finish(buf, dur, wet=0.2, xfade=0.3):
    """Reverb, then fold the tail onto the head so the file loops sample-accurately at exactly `dur` seconds."""
    n = int(dur * SR)
    m = int(xfade * SR)
    L, Rr = buf[0][: n + m], buf[1][: n + m]
    mono = (L + Rr) * 0.5
    wl, wr = reverb_st(mono, wet)
    L = np.concatenate([L, np.zeros(len(wl) - len(L))]) + wl * wet
    Rr = np.concatenate([Rr, np.zeros(len(wr) - len(Rr))]) + wr * wet
    out = []
    for ch in (L, Rr):
        ch = hp(ch, 35)
        head = ch[:n].copy()
        tail = ch[n:]  # everything after the loop point (reverb included) wraps round to the start
        head[: len(tail)] += tail[: n]
        out.append(head)
    st = np.stack(out)
    return st / (np.max(np.abs(st)) or 1) * 0.84  # -1.5 dBFS: headroom for the MP3 encoder


def save_stereo(name, st, kbps=96):
    os.makedirs(OUT, exist_ok=True)
    pcm = (np.clip(st, -1, 1).T * 32767).astype(np.int16).tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(SR)
    enc.set_channels(2)
    enc.set_quality(2)
    data = enc.encode(pcm) + enc.flush()
    with open(os.path.join(OUT, f"{name}.mp3"), "wb") as f:
        f.write(data)
    return len(data)


def render():
    out = {}
    b, d = music_base()
    out["music_base"] = finish(b, d, 0.22)
    h, dh = music_hunt(False)
    out["music_hunt"] = finish(h, dh, 0.18)
    hl, dl = music_hunt(True)
    assert abs(dl - dh) < 1e-9
    out["music_hunt_layer"] = finish(hl, dl, 0.2)
    assert out["music_hunt"].shape == out["music_hunt_layer"].shape  # the layer stays in sync
    return out


def main():
    for name, st in render().items():
        size = save_stereo(name, st, 96)
        print(f"{name:20s} {st.shape[1] / SR:6.2f} s  {size / 1024:7.1f} KB")


if __name__ == "__main__":
    main()
