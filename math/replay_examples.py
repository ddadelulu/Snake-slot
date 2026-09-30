"""Pick one published book per replay category and mode for docs/SUBMISSION.md §4 (bet replay examples).

Streams the published books (games/constrictor/library/publish_files) and prints the markdown table rows.
Usage (from /math): env/bin/python replay_examples.py
"""

from __future__ import annotations

import io
import json
import os

import zstandard as zstd

PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "games", "constrictor", "library", "publish_files")
X = 100  # book amounts are hundredths of the base bet
COST = {"base": 1, "ante": 2.5, "hunt": 100, "venom": 700}


def shows(mode, types):
    out = []
    if "hatch" in types:
        out.append("EGG/snake")
    if mode in ("base", "ante") and "freeSpinTrigger" in types:
        out.append("Hunt")
    if "ouroboros" in types:
        out.append("OUROBOROS")
    if "freeSpinRetrigger" in types:
        out.append("retrigger")
    if "wincap" in types:
        out.append("wincap event")
    return ", ".join(out) or "—"


def categories(mode):
    c = COST[mode] * X
    if mode in ("base", "ante"):
        return [
            ("loss", lambda p, t: p == 0),
            ("normal win", lambda p, t: 1 * X <= p <= 10 * X and "hatch" in t and "freeSpinTrigger" not in t),
            ("big win", lambda p, t: 500 * X <= p <= 5000 * X and "wincap" not in t),
            ("bonus trigger", lambda p, t: "freeSpinTrigger" in t and 50 * X <= p <= 200 * X),
            ("win cap", lambda p, t: "wincap" in t),
        ]
    lo, hi = (1000 * X, 5000 * X) if mode == "hunt" else (5000 * X, 10000 * X)
    return [
        (f"loss (pays below the {COST[mode]:g}× cost)", lambda p, t: 0 < p < c * 0.5),
        ("normal win", lambda p, t: c <= p <= c * 2 and "freeSpinRetrigger" not in t),
        ("big win", lambda p, t: lo <= p <= hi and "wincap" not in t),
        ("retrigger", lambda p, t: "freeSpinRetrigger" in t and "wincap" not in t),
        ("win cap", lambda p, t: "wincap" in t),
    ]


def main():
    taken = set()  # base and ante share seeds per book id; show different examples for ante
    for mode in ("base", "ante", "hunt", "venom"):
        cats = categories(mode)
        found = {}
        with open(os.path.join(PUB, f"books_{mode}.jsonl.zst"), "rb") as fh:
            reader = io.TextIOWrapper(zstd.ZstdDecompressor().stream_reader(fh), encoding="utf-8")
            for line in reader:
                b = json.loads(line)
                p = b["payoutMultiplier"]
                t = {e["type"] for e in b["events"]}
                if mode == "ante" and b["id"] in taken:
                    continue
                for name, ok in cats:
                    if name not in found and ok(p, t):
                        found[name] = (b["id"], p, shows(mode, t))
                if len(found) == len(cats):
                    break
        for name, _ in cats:
            bid, p, s = found[name]
            if mode == "base":
                taken.add(bid)
            print(f"| {mode} | {name} | {bid} | {p / X:,.1f}× | {s} |")


if __name__ == "__main__":
    main()
