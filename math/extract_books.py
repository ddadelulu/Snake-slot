"""Extract a small, representative book sample per mode for the frontend (mock RGS, Storybook, soak test).

For every mode:
  * `sample`: N book ids drawn with the published LUT weights (seeded), so the sample plays like the
    real game (hit rate, feature rate) at a fraction of the size;
  * `showcase`: hand-picked categories for QA and replay demos: loss, small win, each win tier, KEY
    trigger 3/4/5, hatch, OUROBOROS, retrigger, max win.

Writes frontend/apps/constrictor/dev/books/<mode>.jsonl (sample + showcase books, one JSON per line) and
frontend/apps/constrictor/dev/books/showcase.json ({mode: {category: [ids]}}).

Usage (from /math): env/bin/python extract_books.py [--n 1500] [--modes base ante hunt venom]
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re

import numpy as np
import zstandard as zstd

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, "games", "constrictor", "library")
PUB = os.path.join(LIB, "publish_files")
OUT = os.path.join(HERE, "..", "frontend", "apps", "constrictor", "dev", "books")
TIERS = [(1, 1500), (2, 5000), (3, 15000), (4, 50000)]  # book hundredths: 15x, 50x, 150x, 500x
WINCAP = 2_500_000
PER_CAT = 6


def read_lut(mode: str):
    ids, weights, pays = [], [], []
    with open(os.path.join(PUB, f"lookUpTable_{mode}_0.csv"), encoding="UTF-8") as f:
        for row in csv.reader(f):
            ids.append(int(row[0]))
            weights.append(int(row[1]))
            pays.append(int(row[2]))
    return np.array(ids), np.array(weights, dtype=np.float64), np.array(pays, dtype=np.int64)


def forces(mode: str):
    path = os.path.join(LIB, "forces", f"force_record_{mode}.json")
    out: dict[str, list[int]] = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding="UTF-8") as f:
        for rec in json.load(f):
            kv = {s["name"]: s["value"] for s in rec["search"]}
            ids = rec["bookIds"]
            if kv.get("symbol") == "KEY" and kv.get("gametype") == "basegame":
                out[f"trigger{kv['kind']}"] = ids
            elif "retrigger" in kv:
                out.setdefault("retrigger", []).extend(ids)
            elif "ouroboros" in kv:
                out.setdefault("ouroboros", []).extend(ids)
            elif "wincap" in kv:
                out["maxWin"] = ids
    return out


def pick(rng, pool, k):
    pool = sorted(set(int(x) for x in pool))
    if len(pool) <= k:
        return pool
    return sorted(int(x) for x in rng.choice(pool, size=k, replace=False))


def extract(mode: str, n: int, seed: int = 12):
    rng = np.random.default_rng(seed)
    ids, w, pays = read_lut(mode)
    p = w / w.sum()
    sample = sorted(set(int(i) for i in rng.choice(ids, size=n, replace=True, p=p)))
    show: dict[str, list[int]] = {}
    show["loss"] = pick(rng, ids[pays == 0], PER_CAT)
    show["smallWin"] = pick(rng, ids[(pays > 0) & (pays < TIERS[0][1])], PER_CAT)
    for lvl, lo in TIERS:
        hi = TIERS[lvl][1] if lvl < len(TIERS) else WINCAP
        show[f"tier{lvl}"] = pick(rng, ids[(pays >= lo) & (pays < hi)], PER_CAT)
    for k, pool in forces(mode).items():
        show[k] = pick(rng, pool, PER_CAT)
    show["maxWin"] = pick(rng, ids[pays == WINCAP], PER_CAT)
    show = {k: v for k, v in show.items() if v}
    want = set(sample) | {i for v in show.values() for i in v}
    # one streaming pass over the published books; also finds hatch books for base/ante
    hatch: list[int] = []
    books: dict[int, str] = {}
    # extra showcase categories (brief §10 Storybook list): separate RNG + reservoir, so the sample and the
    # categories above are unchanged by adding these
    rng2 = np.random.default_rng(seed + 1)
    extra = {"ouroboros2": [], "longSnake": []}
    seen_extra = {k: 0 for k in extra}
    len_re = re.compile(r'"len":(\d+)')
    with open(os.path.join(PUB, f"books_{mode}.jsonl.zst"), "rb") as fh:
        reader = io.TextIOWrapper(zstd.ZstdDecompressor().stream_reader(fh), encoding="UTF-8")
        for line in reader:
            bid = int(line[6 : line.index(",")]) if line.startswith('{"id":') else json.loads(line)["id"]
            if bid in want:
                books[bid] = line.strip()
            if len(hatch) < 200 and '"type":"hatch"' in line and bid not in want:
                if rng.random() < 0.05:
                    hatch.append(bid)
                    books[bid] = line.strip()
            if mode in ("hunt", "venom", "base", "ante") and bid not in want:
                conds = {
                    "ouroboros2": line.count('"type":"ouroboros"') >= 2,
                    "longSnake": '"len":1' in line and max((int(x) for x in len_re.findall(line)), default=0) >= 16,
                }
                for k, ok in conds.items():
                    if ok:
                        seen_extra[k] += 1
                        res = extra[k]
                        if len(res) < PER_CAT:
                            res.append((bid, line.strip()))
                        else:
                            j = int(rng2.integers(0, seen_extra[k]))
                            if j < PER_CAT:
                                res[j] = (bid, line.strip())
    for k, res in extra.items():
        if res:
            show[k] = sorted(b for b, _ in res)
            for b, line in res:
                books[b] = line
    if hatch:
        show["hatch"] = hatch[:PER_CAT]
        for bid in hatch[PER_CAT:]:
            books.pop(bid, None)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"{mode}.jsonl"), "w", encoding="UTF-8") as f:
        for bid in sorted(books):
            f.write(books[bid] + "\n")
    return {"sample": sample, "showcase": show, "count": len(books)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=1500)
    ap.add_argument("--modes", nargs="*", default=["base", "ante", "hunt", "venom"])
    a = ap.parse_args()
    index_path = os.path.join(OUT, "showcase.json")
    index = {}
    if os.path.exists(index_path):
        with open(index_path, encoding="UTF-8") as f:
            index = json.load(f)
    for mode in a.modes:
        if not os.path.exists(os.path.join(PUB, f"books_{mode}.jsonl.zst")):
            print(f"{mode}: no books yet, skipped")
            continue
        r = extract(mode, a.n)
        index[mode] = {"sample": r["sample"], "showcase": r["showcase"]}
        size = os.path.getsize(os.path.join(OUT, f"{mode}.jsonl")) / 1e6
        print(f"{mode}: {r['count']} books ({size:.1f} MB), showcase: " + ", ".join(f"{k}={len(v)}" for k, v in r["showcase"].items()))
    with open(index_path, "w", encoding="UTF-8") as f:
        json.dump(index, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
