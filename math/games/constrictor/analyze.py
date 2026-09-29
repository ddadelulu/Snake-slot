"""Linear paytable analysis (tuning aid, not used for publishing).

The boards and snake paths do not depend on the paytable, so each round's uncapped win is linear in
the 64 paytable entries: win = sum(pay[s][band] * A[round][s][band]). This script samples natural rounds
once, stores the sparse A matrix, and then evaluates candidate paytables instantly.

Usage:
  env/bin/python games/constrictor/analyze.py collect MODE N OUT.pkl
"""

from __future__ import annotations

import os
import pickle
import random
import sys
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import modes  # noqa: E402
from rounds import play_round  # noqa: E402

BAND_LIST = (5, 6, 7, 8, 9, 11, 13, 16)
BAND_IDX = {b: i for i, b in enumerate(BAND_LIST)}
TYPES = ("ne", "eg", "fs")


def col(t, s, b):
    return TYPES.index(t) * 64 + s * 8 + BAND_IDX[b]


def _work(args):
    mode, n, seed = args
    cfg = modes.compile_mode(mode)
    crit = modes.compile_criteria(mode, None)
    rng = random.Random(seed)
    rows = []
    meta = []
    for _ in range(n):
        acc = {}
        r = play_round(rng, cfg, crit, emit=False, acc=acc)
        rows.append({col(t, s, b): m for (t, s, b), m in acc.items()})
        st = r.stats
        meta.append((st.egg, st.triggered, st.bites, st.final_mult, st.max_len, st.fs_spins, st.pearls_eaten, -1 if st.fs_tier is None else st.fs_tier, -1 if st.base_tier is None else st.base_tier))
    return rows, meta


def collect(mode, n, out, procs=4, seed=777):
    chunk = max(1, n // (procs * 8))
    jobs = []
    left, i = n, 0
    while left > 0:
        k = min(chunk, left)
        jobs.append((mode, k, seed + i))
        left -= k
        i += 1
    rows, meta = [], []
    with Pool(procs) as p:
        for r, m in p.imap(_work, jobs):
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
    with open(out, "wb") as f:
        pickle.dump({"mode": mode, "A": A, "meta": np.array(meta, dtype=np.int64)}, f)


def pay_vector(paytable: dict) -> np.ndarray:
    names = ("H1", "H2", "H3", "H4", "L1", "L2", "L3", "L4")
    v = np.zeros(64)
    for s, nme in enumerate(names):
        for b in range(8):
            v[s * 8 + b] = paytable[nme][b]
    return np.concatenate([v, v, v])


def wins(data, paytable, by_type=False):
    A = data["A"]
    pv = pay_vector(paytable)
    if not by_type:
        return A @ pv
    out = {}
    for ti, t in enumerate(TYPES):
        m = np.zeros(192)
        m[ti * 64 : (ti + 1) * 64] = pv[ti * 64 : (ti + 1) * 64]
        out[t] = A @ m
    return out


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        collect(sys.argv[2], int(sys.argv[3]), sys.argv[4])
