"""LUT weighting for CONSTRICTOR (docs/SPEC.md 12.3).

The published ``lookUpTable_<mode>_0.csv`` weights define the probability of every book. Method:

1. Bucket probabilities are fixed exactly:
   * base/ante: P(feature) = the natural trigger probability of the key table (exact fraction);
     inside it, P(wincap books) = the chosen max-win frequency; the rest goes to the natural
     ``freegame`` books. P(basegame) = 1 - P(feature).
   * hunt/venom: P(wincap books) = chosen frequency, rest = ``freegame`` books.
2. Inside a bucket, books start with equal weight (the natural sample).
3. Optional tail shaping (buy modes): books above a payout threshold get a common factor < 1.
4. A power tilt ``w_i ∝ (1 + x_i) ** theta`` inside the ``freegame`` bucket is solved by bisection so
   the LUT RTP equals the target. theta is reported (0 = untouched natural sample).
5. Weights are scaled to integers (uint64), every book keeps weight >= 1.

Only payouts and weights are touched; books are never modified (the LUT and books stay consistent).
"""

from __future__ import annotations

import csv
import json
import math
import os
import sys
from fractions import Fraction

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import modes  # noqa: E402

RTP_TARGET = 0.96
TOTAL_WEIGHT = 2**53  # integer weight budget per mode (sum of weights), far below uint64 max

# Chosen max-win (wincap-bucket) frequencies per mode (SPEC 12.4: better than 1 in 10M everywhere).
CAP_FREQ = {"base": 1 / 4_000_000, "ante": 1 / 1_000_000, "hunt": 1 / 50_000, "venom": 1 / 10_000}

# Optional tail shaping for buy modes: {mode: [(payout_threshold_x, factor), ...]} (applied to the
# freegame bucket; the cap bucket is set by CAP_FREQ). Empty = natural tail.
TAIL = {"hunt": [], "venom": []}


def _paths(config, mode):
    lut = os.path.join(config.library_path, "lookup_tables", f"lookUpTable_{mode}.csv")
    seg = os.path.join(config.library_path, "lookup_tables", f"lookUpTableSegmented_{mode}.csv")
    out = os.path.join(config.publish_path, f"lookUpTable_{mode}_0.csv")
    return lut, seg, out


def load(config, mode):
    lut, seg, _ = _paths(config, mode)
    ids, pays = [], []
    with open(lut, encoding="UTF-8") as f:
        for row in csv.reader(f):
            ids.append(int(row[0]))
            pays.append(int(row[2]))
    crit = {}
    with open(seg, encoding="UTF-8") as f:
        for row in csv.reader(f):
            crit[int(row[0])] = row[1]
    return np.array(ids, dtype=np.int64), np.array(pays, dtype=np.int64), np.array([crit[i] for i in ids])


def _rtp(w, x, cost):
    return float(np.dot(w, x) / w.sum() / cost)


def weight_mode(config, mode, cap_freq=None, tail=None, verbose=True):
    ids, pays, crit = load(config, mode)
    cost = modes.compile_mode(mode)["cost"]
    x = pays / 100.0
    p_trig = Fraction(1)
    if modes.compile_mode(mode)["kind"] == "base":
        kt = modes.compile_criteria(mode, None)["base"]["key_count"]
        p_trig = Fraction(kt.prob(lambda k: k >= 3)).limit_denominator(10**12)
    cap_freq = CAP_FREQ[mode] if cap_freq is None else cap_freq
    tail = TAIL.get(mode, []) if tail is None else tail

    buckets = {c: np.where(crit == c)[0] for c in np.unique(crit)}
    assert set(buckets) <= {"basegame", "freegame", "wincap"}, buckets.keys()
    assert np.all(x[buckets["wincap"]] == 25000.0), "wincap criteria books must pay the cap"
    target = {
        "wincap": cap_freq,
        "freegame": float(p_trig) - cap_freq,
        "basegame": 1.0 - float(p_trig),
    }

    base_w = np.zeros(len(x))
    fg = buckets["freegame"]
    shape = np.ones(len(fg))
    for thr, fac in tail:
        shape[x[fg] >= thr] *= fac

    def build(theta):
        w = np.zeros(len(x))
        for c, idx in buckets.items():
            if c == "freegame":
                v = shape * np.power(1.0 + x[idx], theta)
            else:
                v = np.ones(len(idx))
            w[idx] = target[c] * v / v.sum()
        return w

    lo, hi = -3.0, 3.0
    f_lo, f_hi = _rtp(build(lo), x, cost) - RTP_TARGET, _rtp(build(hi), x, cost) - RTP_TARGET
    if f_lo > 0 or f_hi < 0:
        raise RuntimeError(f"{mode}: RTP target not bracketed: rtp(lo)={f_lo+RTP_TARGET} rtp(hi)={f_hi+RTP_TARGET}")
    for _ in range(200):
        mid = (lo + hi) / 2
        if _rtp(build(mid), x, cost) < RTP_TARGET:
            lo = mid
        else:
            hi = mid
    theta = (lo + hi) / 2
    w = build(theta)

    # Integer weights (every book >= 1)
    wi = np.maximum(1, np.round(w * TOTAL_WEIGHT)).astype(np.int64)
    # exact integer RTP check
    num = sum(int(a) * int(b) for a, b in zip(wi, pays))
    den = int(wi.sum()) * 100
    rtp_exact = Fraction(num, den) / Fraction(cost).limit_denominator(1000)

    _, _, out = _paths(config, mode)
    with open(out, "w", encoding="UTF-8", newline="") as f:
        for i, wt, p in zip(ids, wi, pays):
            f.write(f"{i},{wt},{p}\n")

    rep = {
        "mode": mode,
        "cost": cost,
        "books": int(len(x)),
        "bucket_books": {c: int(len(v)) for c, v in buckets.items()},
        "bucket_prob": target,
        "p_trigger": float(p_trig),
        "theta": theta,
        "tail": tail,
        "rtp_exact": float(rtp_exact),
        "rtp_fraction": f"{rtp_exact.numerator}/{rtp_exact.denominator}",
        "sum_weights": int(wi.sum()),
    }
    rep_path = os.path.join(config.library_path, f"weighting_{mode}.json")
    with open(rep_path, "w", encoding="UTF-8") as f:
        json.dump(rep, f, indent=2)
    if verbose:
        print(f"[weight] {mode}: theta={theta:+.4f} rtp={float(rtp_exact):.8f} buckets={rep['bucket_books']}")
    return rep


def weight_all(config, mode_list):
    return [weight_mode(config, m) for m in mode_list]


if __name__ == "__main__":
    from game_config import GameConfig

    cfg = GameConfig()
    weight_all(cfg, sys.argv[1:] or ["base", "ante", "hunt", "venom"])
