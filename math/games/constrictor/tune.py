"""Fast natural Monte-Carlo tuner (not used for the published books).

Usage: env/bin/python games/constrictor/tune.py MODE N [--cond basegame|freegame]
Runs natural rounds with the current params and prints the headline stats.
"""

from __future__ import annotations

import os
import random
import sys
import time
from collections import Counter
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import modes  # noqa: E402
from rounds import play_round  # noqa: E402

BANDS = [0, 0.1, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 25000.01]


def _work(args):
    mode, crit_name, n, seed = args
    cfg = modes.compile_mode(mode)
    crit = modes.compile_criteria(mode, crit_name)
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        r = play_round(rng, cfg, crit, emit=False)
        s = r.stats
        out.append(
            (
                r.payout_tenths,
                r.base_tenths,
                r.free_tenths,
                s.egg,
                s.triggered,
                s.bites,
                s.pearls_eaten,
                s.final_mult,
                s.max_len,
                s.capped,
                s.fs_spins,
                s.retriggers,
                s.base_mult,
            )
        )
    return out


def run(mode, n, crit_name=None, procs=4, seed=12345):
    chunk = max(1, n // (procs * 8))
    jobs = []
    left = n
    i = 0
    while left > 0:
        k = min(chunk, left)
        jobs.append((mode, crit_name, k, seed + i))
        left -= k
        i += 1
    res = []
    with Pool(procs) as p:
        for part in p.imap_unordered(_work, jobs):
            res.extend(part)
    return res


def summarize(mode, res):
    cost = modes.compile_mode(mode)["cost"]
    n = len(res)
    tot = sum(r[0] for r in res) / 10
    base = sum(r[1] for r in res) / 10
    free = sum(r[2] for r in res) / 10
    hits = sum(1 for r in res if r[0] > 0)
    eggs = sum(1 for r in res if r[3])
    trig = sum(1 for r in res if r[4])
    capped = sum(1 for r in res if r[9])
    rtp = tot / n / cost
    print(f"mode={mode} n={n} cost={cost}")
    print(f"  RTP={rtp:.4f}  base_part={base/n/cost:.4f} free_part={free/n/cost:.4f}")
    print(f"  hit=1/{n/max(hits,1):.2f} ({hits/n:.3f})  egg=1/{n/max(eggs,1):.1f}  trig=1/{n/max(trig,1):.1f}  capped={capped}")
    fs = [r for r in res if r[4]]
    if fs:
        avg_fs = sum(r[2] for r in fs) / len(fs) / 10
        print(
            f"  FS: avg win={avg_fs:.1f}x  avg bites={sum(r[5] for r in fs)/len(fs):.2f}  avg pearls={sum(r[6] for r in fs)/len(fs):.1f}"
            f"  avg final mult={sum(r[7] for r in fs)/len(fs):.1f}  avg maxlen={sum(r[8] for r in fs)/len(fs):.1f}"
            f"  avg spins={sum(r[10] for r in fs)/len(fs):.1f}  retrig/round={sum(r[11] for r in fs)/len(fs):.3f}"
        )
        fw = sorted(r[2] / 10 for r in fs)
        q = lambda p: fw[min(len(fw) - 1, int(p * len(fw)))]  # noqa: E731
        print(f"  FS quantiles: p10={q(.1):.1f} p50={q(.5):.1f} p90={q(.9):.1f} p99={q(.99):.1f} p999={q(.999):.1f} max={fw[-1]:.1f}")
    eg = [r for r in res if r[3]]
    if eg:
        print(
            f"  EGG spins: avg base win={sum(r[1] for r in eg)/len(eg)/10:.2f}x  hit={sum(1 for r in eg if r[1]>0)/len(eg):.3f}"
            f"  avg mult={sum(r[12] for r in eg)/len(eg):.2f}  bites={sum(r[5] for r in eg if not r[4])}"
        )
    ne = [r for r in res if not r[3]]
    if ne:
        print(f"  non-egg spins: hit={sum(1 for r in ne if r[1]>0)/len(ne):.3f} avg={sum(r[1] for r in ne)/len(ne)/10:.3f}x")
    c = Counter()
    for r in res:
        x = r[0] / 10
        for j in range(len(BANDS) - 1):
            if BANDS[j] <= x < BANDS[j + 1]:
                c[j] += 1
                break
    print("  dist: " + "  ".join(f"[{BANDS[j]},{BANDS[j+1]}):{c[j]/n:.2e}" for j in range(len(BANDS) - 1) if c[j]))


if __name__ == "__main__":
    mode = sys.argv[1]
    n = int(sys.argv[2])
    crit = None
    if "--cond" in sys.argv:
        crit = sys.argv[sys.argv.index("--cond") + 1]
    t = time.time()
    res = run(mode, n, crit)
    summarize(mode, res)
    print(f"  time {time.time()-t:.1f}s ({(time.time()-t)/n*4*1000:.2f} ms/round/core)")
