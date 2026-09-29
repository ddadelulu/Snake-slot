"""Independent verification of the published CONSTRICTOR math (docs/SPEC.md 12.5).

This script does NOT import any game logic (engine/rounds/params/game_config). It re-implements the
rules from SPEC and replays every book from its events alone:
  * rebuilds the board, the snake body step by step (growth queue, tail, EMPTY cells),
  * checks every movement rule (adjacency, no self-entry, qualifying bites only, bite ends the moves),
  * recomputes the enclosure (flood fill), the constrict symbol and the doubling,
  * evaluates the wild-aware clusters itself and recomputes every pay x multiplier,
  * applies the cap, and checks that the recomputed payout equals the LUT payout for 100% of books.
It also validates every book against the JSON schema and reports all statistics from the LUT (exact
RTP via integer weights x payouts, plus a Monte-Carlo cross-check with 95% confidence intervals).

Usage (from /math):
    env/bin/python verify_constrictor.py [--modes base ante hunt venom] [--limit N] [--json out.json]
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import random
import sys
import time
from collections import Counter, defaultdict
from fractions import Fraction
from multiprocessing import Pool

import zstandard as zstd

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLISH = os.path.join(HERE, "games", "constrictor", "library", "publish_files")
CONFIGS = os.path.join(HERE, "games", "constrictor", "library", "configs")
SCHEMA = os.path.join(HERE, "games", "constrictor", "schema", "book.schema.json")

# ------------------------------------------------------------------------------------------------
# Rules, written out independently from docs/SPEC.md (NOT imported from the game code)
# ------------------------------------------------------------------------------------------------
REG = ["H1", "H2", "H3", "H4", "L1", "L2", "L3", "L4"]  # rank order, best first
BANDS = [(5, 5), (6, 6), (7, 7), (8, 8), (9, 10), (11, 12), (13, 15), (16, 49)]
BAND_NAMES = ["5", "6", "7", "8", "9-10", "11-12", "13-15", "16+"]
PAYTABLE_X = {  # SPEC 15 (x bet)
    "H1": [2.2, 2.7, 3.2, 3.8, 4.4, 5.4, 6.5, 8.6],
    "H2": [1.6, 2.0, 2.4, 2.8, 3.2, 3.9, 4.9, 6.5],
    "H3": [1.3, 1.5, 1.8, 2.2, 2.6, 3.0, 3.8, 4.9],
    "H4": [1.1, 1.3, 1.5, 1.7, 2.2, 2.6, 3.2, 4.3],
    "L1": [0.9, 1.0, 1.1, 1.3, 1.6, 1.9, 2.4, 3.2],
    "L2": [0.7, 0.8, 0.9, 1.1, 1.3, 1.5, 1.9, 2.7],
    "L3": [0.5, 0.6, 0.8, 0.9, 1.1, 1.3, 1.6, 2.2],
    "L4": [0.4, 0.5, 0.6, 0.8, 0.9, 1.1, 1.3, 1.7],
}
CAP = 2_500_000  # hundredths (25,000x)
LCAP = 20
FS_AWARD = {3: 10, 4: 12, 5: 15}
RETRIGGER, FS_MAX = 5, 30
VENOM_SPINS, VENOM_LEN, VENOM_MULT = 12, 8, 2
HUNT_LEN, HUNT_MULT = 3, 1
BASE_MOVES, FS_MOVES = (4, 10), (4, 12)
PEARLS_BASE, PEARLS_FS, PEARLS_VENOM = {1, 2, 3, 5}, {1, 2, 3, 5, 10}, {1, 2, 3, 5, 10, 25}
TIERS_X = [15, 50, 150, 500]
DIST_EDGES = [0, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000]


def pay_h(sym, size):
    """Cluster pay in hundredths."""
    for (lo, hi), v in zip(BANDS, PAYTABLE_X[sym]):
        if lo <= size <= hi:
            return int(round(v * 100))
    return 0


def band_name(size):
    for (lo, hi), n in zip(BANDS, BAND_NAMES):
        if lo <= size <= hi:
            return n
    return None


def neighbours(c):
    r, w = c
    out = []
    if w > 0:
        out.append((r, w - 1))
    if w < 6:
        out.append((r, w + 1))
    if r > 0:
        out.append((r - 1, w))
    if r < 6:
        out.append((r + 1, w))
    return out


ALL = [(r, w) for r in range(7) for w in range(7)]
BORDER = [c for c in ALL if c[0] in (0, 6) or c[1] in (0, 6)]


def enclosed(ring):
    ring = set(ring)
    seen = set()
    stack = [c for c in BORDER if c not in ring]
    seen.update(stack)
    while stack:
        c = stack.pop()
        for n in neighbours(c):
            if n not in seen and n not in ring:
                seen.add(n)
                stack.append(n)
    return {c for c in ALL if c not in seen and c not in ring}


def clusters(grid, wild):
    """grid: dict cell->code (regular symbol code or other), wild: set of cells."""
    out = []
    for s in REG:
        seen = set()
        for st in ALL:
            if grid.get(st) != s or st in seen:
                continue
            comp = []
            stack = [st]
            seen.add(st)
            while stack:
                c = stack.pop()
                comp.append(c)
                for n in neighbours(c):
                    if n not in seen and (grid.get(n) == s or n in wild):
                        seen.add(n)
                        stack.append(n)
            if len(comp) >= 5:
                out.append((s, frozenset(comp), sum(1 for c in comp if c in wild)))
    return out


def tier(amount):
    if amount >= CAP:
        return 5
    return sum(1 for t in TIERS_X if amount >= t * 100)


class Fail(Exception):
    pass


def check(cond, msg):
    if not cond:
        raise Fail(msg)


# ------------------------------------------------------------------------------------------------
# Book replay
# ------------------------------------------------------------------------------------------------
def replay(book, mode):
    """Replay one book from its events. Returns (payout, info dict). Raises Fail on any rule break."""
    ev = book["events"]
    info = {
        "trigger": False, "egg": False, "bites": 0, "fs_final_mult": None, "combos": set(), "pearls": set(),
        "max_len": 0, "retriggers": 0, "keys": 0, "capped": False, "fs_spins": 0,
    }
    for i, e in enumerate(ev):
        check(e["index"] == i, "event index")
    check(ev[-1]["type"] == "finalWin", "last event must be finalWin")
    pos = 0
    total = 0  # running round total (hundredths)
    capped = False

    def nxt(t=None):
        nonlocal pos
        check(pos < len(ev), "unexpected end of events")
        e = ev[pos]
        if t is not None:
            check(e["type"] == t, f"expected {t}, got {e['type']} at {pos}")
        pos += 1
        return e

    def peek():
        return ev[pos]["type"] if pos < len(ev) else None

    def reveal_grid(e, gametype, body):
        check(e["gameType"] == gametype, "gameType")
        grid = {}
        keys = []
        eggs = []
        pearls = 0
        for r in range(7):
            for w in range(7):
                v = e["board"][r][w]
                c = (r, w)
                if v is None:
                    check(c in body, "null cell must be a snake cell")
                    continue
                check(c not in body, "snake cell must be null")
                grid[c] = v
                if v == "KEY":
                    keys.append(c)
                elif v == "EGG":
                    eggs.append(c)
                elif v.startswith("P"):
                    pearls += 1
                    val = int(v[1:])
                    allowed = PEARLS_BASE if gametype == "basegame" else (PEARLS_VENOM if mode == "venom" else PEARLS_FS)
                    check(val in allowed, f"pearl value {val} not allowed in {gametype}/{mode}")
                    info["pearls"].add(val)
        check(sorted(keys) == sorted(tuple(k) for k in e["keys"]), "reveal.keys must list the KEY cells")
        check(len(keys) <= 5, "at most 5 keys")
        if gametype == "basegame":
            check(len(eggs) <= 1, "max 1 EGG")
            check(pearls == 0 or len(eggs) == 1, "base pearls only with an EGG")
            check(len(body) == 0, "no snake at a base reveal")
        else:
            check(not eggs, "no EGG in free games")
        return grid, keys, eggs

    def moves_phase(grid, snake, gametype):
        """snakeMoves (+ouroboros) + snakeWild. snake = dict(body, target, mult)."""
        e = nxt("snakeMoves")
        lo, hi = BASE_MOVES if gametype == "basegame" else FS_MOVES
        check(lo <= e["moves"] <= hi, "moves counter range")
        steps = e["steps"]
        body = snake["body"]
        bit = False
        for k, st in enumerate(steps):
            frm, to = tuple(st["from"]), tuple(st["to"])
            check(frm == body[0], "step from == head")
            check(to in neighbours(frm), "orthogonal move inside grid")
            if st.get("bite"):
                check(k == len(steps) - 1, "bite must be the last step")
                check(to == body[-1], "bite enters the tail tip")
                check(len(body) >= 8, "bite needs length >= 8")
                check(len(body) == snake["target"], "bite needs no pending growth")
                check(len(enclosed(body)) > 0, "bite must enclose a cell")
                check(st["eat"] is None, "bite eats nothing")
                check(not st.get("grow"), "bite does not grow")
                body.insert(0, body.pop())
                bit = True
            else:
                check(to not in body, "cannot enter own body")
                prev = grid.get(to, "EMPTY")
                check((st["eat"] if st["eat"] is not None else "EMPTY") == prev, f"eat mismatch at {to}")
                grow = len(body) < snake["target"]
                check(bool(st.get("grow")) == grow, "growth flag")
                if not grow:
                    t = body.pop()
                    grid[t] = "EMPTY"
                body.insert(0, to)
                grid.pop(to, None)
                if prev.startswith("P"):
                    snake["mult"] += int(prev[1:])
                    snake["target"] = min(snake["target"] + 1, LCAP)
            check(st["len"] == len(body), "len after step")
            check(st["mult"] == snake["mult"], "mult after step")
            check(len(body) <= LCAP and len(set(body)) == len(body), "body shape")
            info["max_len"] = max(info["max_len"], len(body))
        if not bit:
            check(len(steps) == e["moves"], "must use every move unless it bites")
        if bit:
            o = nxt("ouroboros")
            info["bites"] += 1
            check([tuple(c) for c in o["ring"]] == body, "ring == body")
            enc = enclosed(body)
            check({tuple(c) for c in o["enclosed"]} == enc, "enclosed cells")
            prior = [grid.get(tuple(c), "EMPTY") for c in o["enclosed"]]
            check(o["crushed"] == prior, "crushed contents")
            regs = [p for p in prior if p in REG]
            x = min(regs, key=REG.index) if regs else "H1"
            check(o["symbol"] == x, "constrict symbol")
            check(o["multFrom"] == snake["mult"] and o["mult"] == 2 * snake["mult"], "doubling")
            for c in enc:
                grid[c] = x
            snake["mult"] *= 2
        else:
            check(peek() != "ouroboros", "ouroboros without a bite")
        w = nxt("snakeWild")
        check([tuple(c) for c in w["cells"]] == body, "snakeWild cells == body")
        check(w["mult"] == snake["mult"], "snakeWild mult")

    def evaluate_phase(grid, snake):
        nonlocal total, capped
        wild = set(snake["body"]) if snake else set()
        mult = snake["mult"] if snake else 1
        cl = clusters(grid, wild)
        raw = sum(pay_h(s, len(c)) for s, c, _ in cl) * mult
        if cl:
            e = nxt("winInfo")
            check(e["totalWin"] == raw, "winInfo.totalWin")
            got = sorted((w["symbol"], frozenset(tuple(p) for p in w["positions"])) for w in e["wins"])
            exp = sorted((s, c) for s, c, _ in cl)
            check(got == exp, "cluster sets")
            for w in e["wins"]:
                c = frozenset(tuple(p) for p in w["positions"])
                check(w["clusterSize"] == len(c), "clusterSize")
                check(w["meta"]["winWithoutMult"] == pay_h(w["symbol"], len(c)), "cluster pay")
                check(w["meta"]["globalMult"] == mult and w["win"] == w["meta"]["winWithoutMult"] * mult, "cluster mult")
                check(w["meta"]["wildCount"] == len(c & wild), "wildCount")
                check(tuple(w["meta"]["overlay"]) in c, "overlay inside cluster")
                info["combos"].add((w["symbol"], band_name(len(c))))
        else:
            check(peek() not in ("winInfo", "setWin"), "win events without clusters")
        spin = min(raw, CAP - total)
        if spin > 0:
            e = nxt("setWin")
            check(e["amount"] == spin, "setWin amount")
            check(e["winLevel"] == tier(spin), "setWin winLevel")
        total += spin
        e = nxt("setTotalWin")
        check(e["amount"] == total, "setTotalWin")
        if total >= CAP and raw > 0 and total - spin + raw >= CAP:
            e = nxt("wincap")
            check(e["amount"] == CAP and e["uncappedAmount"] == total - spin + raw, "wincap amounts")
            capped = True
            info["capped"] = True
        else:
            check(peek() != "wincap", "unexpected wincap")
        return spin

    def free_games(total_fs, start_len, start_mult, trigger_keys):
        nonlocal total
        e = nxt("snakeEnter")
        body = [tuple(c) for c in e["body"]]
        check(len(body) == start_len and e["mult"] == start_mult, "entry length/multiplier")
        check(body[-1] in BORDER, "tail enters from the border")
        for a, b in zip(body, body[1:]):
            check(b in neighbours(a), "entry body contiguous")
        check(len(set(body)) == len(body), "entry body unique")
        snake = {"body": body, "target": start_len, "mult": start_mult}
        spins = 0
        free_total = 0
        while spins < total_fs and not capped:
            spins += 1
            u = nxt("updateFreeSpin")
            check(u["amount"] == spins and u["total"] == total_fs, "updateFreeSpin")
            grid, keys, _ = reveal_grid(nxt("reveal"), "freegame", set(snake["body"]))
            moves_phase(grid, snake, "freegame")
            free_total += evaluate_phase(grid, snake)
            if capped:
                break
            if len(keys) >= 3:
                add = min(RETRIGGER, FS_MAX - total_fs)
                if add > 0:
                    r = nxt("freeSpinRetrigger")
                    total_fs += add
                    check(r["added"] == add and r["totalFs"] == total_fs and r["keys"] == len(keys), "retrigger")
                    check(sorted(tuple(c) for c in r["positions"]) == sorted(keys), "retrigger positions")
                    info["retriggers"] += 1
            else:
                check(peek() != "freeSpinRetrigger", "retrigger without 3 keys")
        check(total_fs <= FS_MAX, "max 30 spins")
        if not capped:
            check(spins == total_fs, "all spins played")
        fe = nxt("freeSpinEnd")
        check(fe["amount"] == free_total and fe["winLevel"] == tier(free_total), "freeSpinEnd")
        info["fs_final_mult"] = snake["mult"]
        info["fs_spins"] = spins

    if mode in ("base", "ante"):
        grid, keys, eggs = reveal_grid(nxt("reveal"), "basegame", set())
        info["keys"] = len(keys)
        snake = None
        if eggs:
            h = nxt("hatch")
            check(tuple(h["at"]) == eggs[0], "hatch at the egg")
            info["egg"] = True
            grid.pop(eggs[0])
            snake = {"body": [eggs[0]], "target": 3, "mult": 1}
            moves_phase(grid, snake, "basegame")
        else:
            check(peek() != "hatch", "hatch without egg")
        info["base_win"] = evaluate_phase(grid, snake)
        if snake:
            nxt("snakeExit")
        if len(keys) >= 3 and not capped:
            t = nxt("freeSpinTrigger")
            check(t["totalFs"] == FS_AWARD[len(keys)] and t["keys"] == len(keys), "trigger award")
            check(sorted(tuple(c) for c in t["positions"]) == sorted(keys), "trigger positions")
            info["trigger"] = True
            free_games(t["totalFs"], HUNT_LEN, HUNT_MULT, len(keys))
        else:
            check(peek() != "freeSpinTrigger", "trigger without 3 keys")
    else:
        b = nxt("enterBonus")
        check(b["reason"] == mode, "enterBonus reason")
        t = nxt("freeSpinTrigger")
        info["trigger"] = True
        if mode == "hunt":
            check(t["keys"] in FS_AWARD and t["totalFs"] == FS_AWARD[t["keys"]] and t["positions"] == [], "hunt buy trigger")
            free_games(t["totalFs"], HUNT_LEN, HUNT_MULT, t["keys"])
        else:
            check(t["keys"] == 0 and t["totalFs"] == VENOM_SPINS and t["positions"] == [], "venom trigger")
            free_games(VENOM_SPINS, VENOM_LEN, VENOM_MULT, 0)
    f = nxt("finalWin")
    check(pos == len(ev), "events after finalWin")
    check(f["amount"] == total, "finalWin == running total")
    check(book["payoutMultiplier"] == total, "payoutMultiplier == recomputed total")
    check(total % 10 == 0, "0.1x granularity")
    return total, info


# ------------------------------------------------------------------------------------------------
# Parallel driver
# ------------------------------------------------------------------------------------------------
_VALIDATE = None


def _init():
    global _VALIDATE
    import fastjsonschema

    with open(SCHEMA, encoding="UTF-8") as f:
        _VALIDATE = fastjsonschema.compile(json.load(f))


def _work(args):
    mode, lines = args
    out = []
    for line in lines:
        book = json.loads(line)
        try:
            _VALIDATE(book)
            pay, info = replay(book, mode)
            out.append((book["id"], pay, info, None))
        except Exception as exc:  # noqa: BLE001
            out.append((book.get("id"), None, None, f"{type(exc).__name__}: {exc}"))
    return out


def iter_chunks(path, size=2000):
    with open(path, "rb") as fh:
        reader = io.TextIOWrapper(zstd.ZstdDecompressor().stream_reader(fh), encoding="UTF-8")
        chunk = []
        for line in reader:
            if line.strip():
                chunk.append(line)
                if len(chunk) >= size:
                    yield chunk
                    chunk = []
        if chunk:
            yield chunk


def read_lut(path):
    ids, w, p = [], [], []
    with open(path, encoding="UTF-8") as f:
        for row in csv.reader(f):
            ids.append(int(row[0]))
            w.append(int(row[1]))
            p.append(int(row[2]))
    return ids, w, p


# ------------------------------------------------------------------------------------------------
# Statistics
# ------------------------------------------------------------------------------------------------
def three_star(dist, cost):
    """Same definitions as math-sdk utils/analysis/distribution_functions.py (REQUIREMENTS 3.3)."""
    tot = sum(dist.values())
    p5k = sum(w for x, w in dist.items() if x >= 5000) / tot
    p10k = sum(w for x, w in dist.items() if x >= 10000) / tot
    etl10k = sum(x * w for x, w in dist.items() if x >= 10000) / tot
    etl40 = sum(x * w for x, w in dist.items() if x >= 40 * cost) / tot
    ordered = sorted(dist.items())
    cum, tail_start = 0.0, ordered[0][0]
    for x, w in ordered:
        cum += w / tot
        if cum >= 0.999:
            tail_start = x
            break
    tp = sum(w for x, w in ordered if x >= tail_start) / tot
    tv = sum(x * w for x, w in ordered if x >= tail_start) / tot
    cvar = (tv / tp) / cost if tp else 0.0
    scale = 0.2 if cost >= 1000 else 0.5 if cost >= 500 else 0.8 if cost >= 200 else 1.0
    return {"prob5k": p5k * scale, "prob10k": p10k * scale, "etl40b": etl40, "etl10k": etl10k, "cvar": cvar}


LIMITS = {"prob5k": 1e-2, "prob10k": 0.5e-2, "etl40b": 0.9, "etl10k": 0.8, "cvar": 800, "rtp": 0.967}


def verify_mode(mode, cost, limit=None, procs=4):
    t0 = time.time()
    ids, weights, pays = read_lut(os.path.join(PUBLISH, f"lookUpTable_{mode}_0.csv"))
    lut = {i: (w, p) for i, w, p in zip(ids, weights, pays)}
    wsum = sum(weights)
    rtp = Fraction(sum(w * p for w, p in zip(weights, pays)), wsum * 100) / Fraction(cost).limit_denominator(1000)

    n_ok = n_fail = 0
    fails = []
    seen = set()
    acc = defaultdict(float)
    combos_w = defaultdict(int)
    pearls_seen = set()
    mults = []
    jobs = ((mode, ch) for ch in iter_chunks(os.path.join(PUBLISH, f"books_{mode}.jsonl.zst")))
    with Pool(procs, initializer=_init) as pool:
        for res in pool.imap(_work, jobs):
            for bid, pay, info, err in res:
                if limit and n_ok + n_fail >= limit:
                    break
                if err is not None or bid not in lut:
                    n_fail += 1
                    if len(fails) < 20:
                        fails.append((bid, err or "missing in LUT"))
                    continue
                w, lp = lut[bid]
                if pay != lp:
                    n_fail += 1
                    if len(fails) < 20:
                        fails.append((bid, f"payout {pay} != LUT {lp}"))
                    continue
                n_ok += 1
                seen.add(bid)
                pr = w / wsum
                acc["trigger"] += pr * info["trigger"]
                acc["egg"] += pr * info["egg"]
                acc["bite_rounds"] += pr * (info["bites"] > 0)
                acc["bites"] += pr * info["bites"]
                acc["capped"] += pr * info["capped"]
                acc["retrig"] += pr * (info["retriggers"] > 0)
                acc["len8"] += pr * (info["max_len"] >= 8)
                # RTP split (base/ante): the base spin's own win vs everything the feature adds
                acc["rtp_base_part"] += pr * info.get("base_win", 0)
                acc["rtp_feature_part"] += pr * (pay - info.get("base_win", 0))
                if info["trigger"] and info["fs_final_mult"] is not None:
                    acc["fs_w"] += pr
                    acc["fs_mult"] += pr * info["fs_final_mult"]
                    acc["fs_spins"] += pr * info["fs_spins"]
                for c in info["combos"]:
                    combos_w[c] += w
                pearls_seen |= info["pearls"]
            if limit and n_ok + n_fail >= limit:
                pool.terminate()
                break

    # Distribution statistics from the LUT
    dist = Counter()
    for w, p in zip(weights, pays):
        dist[p / 100] += w
    mean = sum(x * w for x, w in dist.items()) / wsum
    var = sum((x - mean) ** 2 * w for x, w in dist.items()) / wsum
    hit = sum(w for x, w in dist.items() if x > 0) / wsum
    pmax = dist.get(25000.0, 0) / wsum
    top_share = max(dist.values()) / wsum
    table = []
    zero = dist.get(0.0, 0) / wsum
    table.append(("0", zero))
    for a, b in zip(DIST_EDGES, DIST_EDGES[1:]):
        pr = sum(w for x, w in dist.items() if a <= x < b and x > 0) / wsum
        table.append((f"{a}-{b}" if a else "0-1", pr))
    table.append(("25000", pmax))
    # Monte-Carlo cross-check (sample rounds by weight)
    rng = random.Random(2026)
    cum = []
    s = 0
    for w in weights:
        s += w
        cum.append(s)
    import bisect

    mc_n = 200_000
    xs = [pays[bisect.bisect_right(cum, rng.random() * s)] / 100 for _ in range(mc_n)]
    mc_mean = sum(xs) / mc_n / cost
    mc_sd = math.sqrt(sum((x / cost - mc_mean) ** 2 for x in xs) / (mc_n - 1))
    mc_ci = 1.96 * mc_sd / math.sqrt(mc_n)
    fs = acc["fs_w"] or 1
    out = {
        "mode": mode,
        "cost": cost,
        "books": len(ids),
        "replayed_ok": n_ok,
        "replay_fail": n_fail,
        "fails": fails,
        "all_books_covered": len(seen) == len(ids) if not limit else None,
        "rtp_exact": float(rtp),
        "rtp_fraction": f"{rtp.numerator}/{rtp.denominator}",
        "mc_rtp": mc_mean,
        "mc_ci95": mc_ci,
        "mc_rounds": mc_n,
        "std_per_cost": math.sqrt(var) / cost,
        "hit_rate": hit,
        "hit_1_in": 1 / hit if hit else None,
        "max_win_prob": pmax,
        "max_win_1_in": 1 / pmax if pmax else None,
        "capped_fraction": acc["capped"],
        "feature_prob": acc["trigger"],
        "feature_1_in": 1 / acc["trigger"] if acc["trigger"] else None,
        "egg_prob": acc["egg"],
        "egg_1_in": 1 / acc["egg"] if acc["egg"] else None,
        "ouroboros_round_prob": acc["bite_rounds"],
        "ouroboros_per_round": acc["bites"],
        "len8_prob": acc["len8"],
        "retrigger_prob": acc["retrig"],
        "rtp_split": (
            {"base_spins": acc["rtp_base_part"] / (acc["rtp_base_part"] + acc["rtp_feature_part"]),
             "feature": acc["rtp_feature_part"] / (acc["rtp_base_part"] + acc["rtp_feature_part"])}
            if mode in ("base", "ante") and acc["rtp_base_part"] + acc["rtp_feature_part"] > 0 else None
        ),
        "avg_final_mult_in_feature": acc["fs_mult"] / fs,
        "avg_spins_in_feature": acc["fs_spins"] / fs,
        "most_likely_payout_share": top_share,
        "nonzero_weight_payouts": len([x for x in dist if x > 0]),
        "unique_payouts": len(dist),
        "zero_weight_books": sum(1 for w in weights if w == 0),
        "distribution": table,
        "three_star": three_star(dist, cost),
        "combos_reached": sorted(f"{a}:{b}" for a, b in combos_w),
        "combos_missing": sorted(f"{s}:{b}" for s in REG for b in BAND_NAMES if (s, b) not in combos_w),
        "pearl_values_seen": sorted(pearls_seen),
        "seconds": round(time.time() - t0, 1),
    }
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modes", nargs="+", default=["base", "ante", "hunt", "venom"])
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--json", default=os.path.join(HERE, "games", "constrictor", "library", "verification_report.json"))
    ap.add_argument("--procs", type=int, default=4)
    args = ap.parse_args()
    idx_path = os.path.join(PUBLISH, "index.json")
    if os.path.exists(idx_path):
        with open(idx_path, encoding="UTF-8") as f:
            costs = {m["name"]: m["cost"] for m in json.load(f)["modes"]}
    else:  # pre-config smoke test only
        print("WARNING: index.json missing; using base cost 1 for a smoke test")
        costs = {"base": 1.0}
    # the published frontend config must carry the same paytable as this verifier
    fe = [f for f in os.listdir(CONFIGS) if f.startswith("config_fe_")] if os.path.isdir(CONFIGS) else []
    if fe:
        with open(os.path.join(CONFIGS, fe[0]), encoding="UTF-8") as f:
            fe_cfg = json.load(f)
        for entry in fe_cfg["symbols"]:
            (name, spec), = entry.items()
            if name in PAYTABLE_X:
                for kv in spec["paytable"]:
                    (size, v), = kv.items()
                    assert abs(pay_h(name, int(size)) - round(v * 100)) == 0, f"fe config pay mismatch {name} {size}"
        print("fe config paytable == verifier paytable: OK")
    # results are merged into the JSON after every mode, so an interrupted run only loses the mode in progress
    existing = []
    if os.path.exists(args.json):
        with open(args.json, encoding="UTF-8") as f:
            existing = [r for r in json.load(f) if r.get("mode") not in args.modes]
    reports = []
    ok = True
    for m in args.modes:
        r = verify_mode(m, costs[m], args.limit, args.procs)
        reports.append(r)
        with open(args.json, "w", encoding="UTF-8") as f:
            json.dump(existing + reports, f, indent=2, default=str)
        status = "PASS" if r["replay_fail"] == 0 else "FAIL"
        ok &= r["replay_fail"] == 0
        ts = r["three_star"]
        viol = [k for k, v in ts.items() if v > LIMITS[k]]
        print(
            f"[{status}] {m}: books={r['books']} replayed={r['replayed_ok']} fail={r['replay_fail']} "
            f"RTP={r['rtp_exact']*100:.5f}% (MC {r['mc_rtp']*100:.2f}±{r['mc_ci95']*100:.2f}) hit=1/{r['hit_1_in']:.2f} "
            f"max=1/{r['max_win_1_in'] or float('inf'):,.0f} std={r['std_per_cost']:.2f} feature=1/{r['feature_1_in'] or 0:.1f} "
            f"3star-violations={viol} [{r['seconds']}s]"
        )
        for bid, err in r["fails"][:5]:
            print("    fail", bid, err)
    rtps = [r["rtp_exact"] for r in existing + reports]
    print(f"RTP spread across modes: {100*(max(rtps)-min(rtps)):.5f}%")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
