"""Tuning sweep helper (not used for publishing).

Collects linear cluster statistics for a parameter *structure* (tables, tiers, walk biases) once,
then evaluates any number of paytables instantly. See analyze.py for the linear model.

Usage (python API):
    from sweep import collect_all, evaluate
    data = collect_all(overrides, n_base=300_000, n_hunt=30_000, n_venom=20_000)
    evaluate(data, paytable)
"""

from __future__ import annotations

import os
import sys
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import analyze  # noqa: E402
import params  # noqa: E402

_OVR = {}


def _apply(ovr):
    for key, val in ovr.items():
        tgt = getattr(params, key)
        if isinstance(tgt, dict):
            tgt.update(val)
        else:
            setattr(params, key, val)
    params.MODES["base"]["base"] = params.BASE_TABLES
    params.MODES["base"]["fs"] = params.HUNT_TABLES
    params.MODES["ante"]["fs"] = params.HUNT_TABLES
    params.MODES["hunt"]["fs"] = params.HUNT_TABLES
    params.MODES["venom"]["fs"] = params.VENOM_TABLES


def _init(ovr):
    _apply(ovr)


def _collect(mode, n, ovr, seed):
    jobs = [(mode, max(1, n // 32), seed + i) for i in range(32)]
    rows, meta = [], []
    with Pool(4, initializer=_init, initargs=(ovr,)) as p:
        for r, m in p.map(analyze._work, jobs):
            rows.extend(r)
            meta.extend(m)
    from scipy.sparse import csr_matrix

    data, ind, ptr = [], [], [0]
    for r in rows:
        for k, v in r.items():
            ind.append(k)
            data.append(v)
        ptr.append(len(ind))
    A = csr_matrix((np.array(data, dtype=np.float64), np.array(ind), np.array(ptr)), shape=(len(rows), 192))
    return {"A": A, "meta": np.array(meta, dtype=np.int64)}


def collect_all(ovr, n_base=300_000, n_hunt=30_000, n_venom=20_000, seed=4242):
    out = {}
    if n_base:
        out["base"] = _collect("base", n_base, ovr, seed)
    if n_hunt:
        out["hunt"] = _collect("hunt", n_hunt, ovr, seed + 100)
    if n_venom:
        out["venom"] = _collect("venom", n_venom, ovr, seed + 200)
    return out


def _fs_line(name, w, m):
    q = np.quantile(w, [0.1, 0.5, 0.9, 0.99, 0.999])
    s = (
        f"{name}: avg={w.mean():7.1f} q10/50/90/99/99.9={np.round(q,0).astype(int).tolist()} max={w.max():.0f} "
        f"P>=1k={(w>=1000).mean():.4f} P>=4k={(w>=4000).mean():.5f} P>=10k={(w>=10000).mean():.5f} cap={(w>=25000).mean():.5f} "
        f"mult={m[:,3].mean():.2f} len={m[:,4].mean():.2f} L8+={(m[:,4]>=8).mean():.3f} bite-rounds={(m[:,2]>0).mean():.4f}"
    )
    print(s)
    for t in sorted(set(m[:, 7])):
        sel = m[:, 7] == t
        if t < 0:
            continue
        print(
            f"     tier {t}: share={sel.mean():.3f} avg={w[sel].mean():7.1f} med={np.median(w[sel]):6.1f} "
            f"L8+={(m[sel,4]>=8).mean():.3f} bite-rounds={(m[sel,2]>0).mean():.3f} pearls={m[sel,6].mean():.2f}"
        )


def evaluate(data, pt, p_trig=4.0 / 1001.0, verbose=True):
    res = {}
    if "base" in data:
        B = data["base"]
        wb = analyze.wins(B, pt, by_type=True)
        egg = B["meta"][:, 0] == 1
        spin = wb["ne"] + wb["eg"]
        res.update(ne=wb["ne"].mean(), eg=wb["eg"].mean(), hit=(spin > 0).mean(), egg_avg=wb["eg"][egg].mean())
        if verbose:
            print(
                f"BASE: ne={res['ne']:.4f} eg={res['eg']:.4f} spins={res['ne']+res['eg']:.4f} hit={res['hit']:.3f} "
                f"egg_avg={res['egg_avg']:.2f} egg_hit={(wb['eg'][egg]>0).mean():.3f} base-bites={B['meta'][egg,2].sum()}"
            )
    for mode in ("hunt", "venom"):
        if mode in data:
            D = data[mode]
            w = np.minimum(analyze.wins(D, pt), 25000.0)
            res[mode] = w.mean()
            res[mode + "_w"] = w
            if verbose:
                _fs_line(mode.upper(), w, D["meta"])
    if "hunt" in res and "ne" in res and verbose:
        tot = res["ne"] + res["eg"] + p_trig * res["hunt"]
        print(f"=> base RTP (natural) = {tot:.4f}  split: spins {100*(res['ne']+res['eg'])/tot:.1f}% / hunt {100*p_trig*res['hunt']/tot:.1f}%")
    return res
