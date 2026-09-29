"""Round logic for CONSTRICTOR (SPEC 4, 8, 9). Pure: no math-sdk imports.

``play_round`` runs one complete bet round and returns a ``RoundResult`` with the SPEC 11 events.
All money is in integer tenths of the base bet; event amounts are hundredths (tenths × 10).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from engine import (
    EGG,
    KEY,
    NCELLS,
    PEARL,
    WILD,
    WINCAP_TENTHS,
    Snake,
    cell_json,
    constrict,
    draw_board,
    evaluate,
    generate_path_safe,
    pick_tier,
    has_future,
    overlay_cell,
    snake_entry,
    sym_json,
    win_level,
    REG_NAMES,
)


class SnakeStuck(RuntimeError):
    """No legal path exists; the generator discards the round (never observed in production sims)."""


class Emitter:
    __slots__ = ("events", "on")

    def __init__(self, on: bool = True):
        self.events = []
        self.on = on

    def add(self, etype: str, **fields):
        if self.on:
            ev = {"index": len(self.events), "type": etype}
            ev.update(fields)
            self.events.append(ev)


@dataclass
class RoundStats:
    triggered: bool = False
    trigger_keys: int = 0
    egg: bool = False
    fs_spins: int = 0
    fs_awarded: int = 0
    retriggers: int = 0
    bites: int = 0
    pearls_eaten: int = 0
    pearl_values_eaten: list = field(default_factory=list)
    final_mult: int = 1
    max_len: int = 0
    base_mult: int = 1
    capped: bool = False
    uncapped_tenths: int = 0
    cluster_keys: set = field(default_factory=set)  # (sym, band) reached
    max_base_spin: int = 0
    acc: dict | None = None  # tuner only: {(spin_type, sym, band): sum of multiplier}
    spin_type: str = "ne"
    fallbacks: int = 0
    fs_tier: int | None = None
    base_tier: int | None = None


@dataclass
class RoundResult:
    payout_tenths: int
    base_tenths: int
    free_tenths: int
    events: list
    stats: RoundStats


def _board_json(board, snake_cells=()):
    sc = set(snake_cells)
    return [[None if (r * 7 + w) in sc else sym_json(board[r * 7 + w]) for w in range(7)] for r in range(7)]


def _band(size):
    if size <= 8:
        return size
    if size <= 10:
        return 9
    if size <= 12:
        return 11
    if size <= 15:
        return 13
    return 16


def _moves_and_path(rng, board, snake, tables, stats, em, future=0):
    """Draw N, generate a legal path, emit snakeMoves (+ ouroboros). Returns bite flag.

    ``future`` > 0 (free games): prefer a final shape that guarantees that many pearl-proof steps
    next spin (SPEC 5.5); fall back to smaller guarantees (never below the minimum move count)."""
    levels = [future] if future == 0 else [future, 8, min(tables["moves"].values)]
    res = None
    for lvl in levels:
        for _ in range(12):
            n = tables["moves"].draw(rng)
            res = generate_path_safe(rng, board, snake, n, tables, future=lvl)
            if res is not None:
                break
        if res is not None:
            break
        stats.fallbacks += 1
    if res is None:  # last resort: shortest counters first, no guarantee required
        for n in sorted(tables["moves"].values):
            res = generate_path_safe(rng, board, snake, n, tables, future=0)
            if res is not None:
                break
    if res is None:
        raise SnakeStuck("no legal snake path")
    steps, bite = res
    if em.on:
        out = []
        for s in steps:
            d = {
                "from": cell_json(s[0]),
                "to": cell_json(s[1]),
                "eat": None if (s[2] is None or s[2] == 10) else sym_json(s[2]),
                "len": s[5],
                "mult": s[7],
            }
            if s[3]:
                d["grow"] = True
            if s[8]:
                d["bite"] = True
            out.append(d)
        em.add("snakeMoves", moves=n, steps=out)
    for s in steps:
        if s[2] is not None and s[2] >= PEARL:
            stats.pearls_eaten += 1
            stats.pearl_values_eaten.append(s[2] - PEARL)
    if bite:
        mb = snake.mult
        enc, crushed, x, _ = constrict(board, snake)
        stats.bites += 1
        em.add(
            "ouroboros",
            ring=[cell_json(c) for c in snake.body],
            enclosed=[cell_json(c) for c in enc],
            crushed=[sym_json(c) for c in crushed],
            symbol=REG_NAMES[x],
            multFrom=mb,
            mult=snake.mult,
        )
    stats.max_len = max(stats.max_len, len(snake.body))
    return bite


def _evaluate_and_pay(board, snake, cfg, running_total, stats, em):
    """Evaluate the board, apply multiplier and cap. Returns (spin_win_tenths_capped, capped, uncapped_spin)."""
    base_pay, clusters = evaluate(board, cfg["pay"])
    mult = snake.mult if snake is not None else 1
    win = base_pay * mult
    for s, comp, size, nw, p in clusters:
        stats.cluster_keys.add((s, _band(size)))
        if stats.acc is not None:
            k = (stats.spin_type, s, _band(size))
            stats.acc[k] = stats.acc.get(k, 0) + mult
    capped = False
    spin = win
    if running_total + win >= WINCAP_TENTHS:
        spin = WINCAP_TENTHS - running_total
        capped = True
    if win > 0 and em.on:
        em.add(
            "winInfo",
            totalWin=win * 10,
            wins=[
                {
                    "symbol": REG_NAMES[s],
                    "clusterSize": size,
                    "win": p * mult * 10,
                    "positions": [cell_json(c) for c in sorted(comp)],
                    "meta": {
                        "globalMult": mult,
                        "winWithoutMult": p * 10,
                        "wildCount": nw,
                        "overlay": cell_json(overlay_cell(comp)),
                    },
                }
                for s, comp, size, nw, p in clusters
            ],
        )
    if spin > 0:
        em.add("setWin", amount=spin * 10, winLevel=win_level(spin))
    em.add("setTotalWin", amount=(running_total + spin) * 10)
    return spin, capped, win


def run_freegame(rng, cfg, fsT, total_fs, start_len, start_mult, keys, key_positions, running_total, stats, em):
    """THE HUNT / VENOM HUNT (SPEC 8). Returns (free_win_tenths, capped)."""
    stats.triggered = True
    stats.fs_awarded = total_fs
    stats.fs_tier, fsT = pick_tier(rng, fsT)
    em.add("freeSpinTrigger", totalFs=total_fs, keys=keys, positions=[cell_json(c) for c in key_positions])
    while True:
        body, edge = snake_entry(rng, start_len)
        if has_future(body, start_len, max(fsT["moves"].values)):
            break
    snake = Snake(body, start_len, start_mult)
    em.add("snakeEnter", body=[cell_json(c) for c in body], edge=edge, mult=snake.mult)
    fs = 0
    free_total = 0
    capped = False
    max_fs = cfg["fs_max"]
    stats.spin_type = "fs"
    while fs < total_fs:
        fs += 1
        em.add("updateFreeSpin", amount=fs, total=total_fs)
        board, kcells, _ = draw_board(rng, fsT, "freegame", snake.body)
        em.add("reveal", board=_board_json(board, snake.body), gameType="freegame", keys=[cell_json(c) for c in kcells])
        _moves_and_path(rng, board, snake, fsT, stats, em, future=max(fsT["moves"].values))
        em.add("snakeWild", cells=[cell_json(c) for c in snake.body], mult=snake.mult)
        spin, capped, uncapped = _evaluate_and_pay(board, snake, cfg, running_total + free_total, stats, em)
        free_total += spin
        if capped:
            stats.capped = True
            stats.uncapped_tenths = running_total + free_total - spin + uncapped
            em.add("wincap", amount=WINCAP_TENTHS * 10, uncappedAmount=stats.uncapped_tenths * 10)
            break
        if len(kcells) >= 3:
            add = min(cfg["retrigger"], max_fs - total_fs)
            if add > 0:
                total_fs += add
                stats.retriggers += 1
                em.add(
                    "freeSpinRetrigger",
                    totalFs=total_fs,
                    added=add,
                    keys=len(kcells),
                    positions=[cell_json(c) for c in kcells],
                )
    stats.fs_spins = fs
    stats.final_mult = snake.mult
    em.add("freeSpinEnd", amount=free_total * 10, winLevel=win_level(free_total))
    return free_total, capped


def play_base_spin(rng, cfg, crit, stats, em):
    """One BASE/ANTE spin (SPEC 4.1). Returns (spin_win_tenths, capped, keys, key_cells)."""
    stats.base_tier, bT = pick_tier(rng, crit["base"])
    board, kcells, egg = draw_board(rng, bT, "basegame", key_table=crit.get("key_table"))
    em.add("reveal", board=_board_json(board), gameType="basegame", keys=[cell_json(c) for c in kcells])
    snake = None
    stats.spin_type = "ne"
    if egg is not None:
        stats.spin_type = "eg"
        stats.egg = True
        snake = Snake([egg], 3, 1)
        board[egg] = WILD
        em.add("hatch", at=cell_json(egg))
        _moves_and_path(rng, board, snake, bT, stats, em)
        em.add("snakeWild", cells=[cell_json(c) for c in snake.body], mult=snake.mult)
        stats.base_mult = snake.mult
    spin, capped, uncapped = _evaluate_and_pay(board, snake, cfg, 0, stats, em)
    stats.max_base_spin = spin
    if capped:
        stats.capped = True
        stats.uncapped_tenths = uncapped
        em.add("wincap", amount=WINCAP_TENTHS * 10, uncappedAmount=uncapped * 10)
    if snake is not None:
        em.add("snakeExit")
    return spin, capped, len(kcells), kcells


def play_round(rng, cfg, crit, emit=True, acc=None) -> RoundResult:
    """Play one bet round.

    cfg: compiled mode config (see game_config.compile_mode).
    crit: compiled criteria block: {"base": tables, "fs": tables, "key_table": Table|None, "buy_keys": Table}
    """
    em = Emitter(emit)
    stats = RoundStats()
    stats.acc = acc
    kind = cfg["kind"]
    base_tenths = 0
    free_tenths = 0
    if kind == "base":
        spin, capped, k, kcells = play_base_spin(rng, cfg, crit, stats, em)
        base_tenths = spin
        if not capped and k >= 3:
            stats.trigger_keys = k
            awards = cfg["fs_awards"]
            free_tenths, capped = run_freegame(
                rng, cfg, crit["fs"], awards[min(k, 5)], 3, 1, k, kcells, base_tenths, stats, em
            )
    elif kind == "hunt":
        em.add("enterBonus", reason="hunt")
        k = crit["buy_keys"].draw(rng)
        stats.trigger_keys = k
        free_tenths, capped = run_freegame(rng, cfg, crit["fs"], cfg["fs_awards"][k], 3, 1, k, [], 0, stats, em)
    elif kind == "venom":
        em.add("enterBonus", reason="venom")
        stats.trigger_keys = 0
        free_tenths, capped = run_freegame(
            rng, cfg, crit["fs"], cfg["venom_spins"], cfg["venom_len"], cfg["venom_mult"], 0, [], 0, stats, em
        )
    else:  # pragma: no cover
        raise ValueError(kind)
    total = base_tenths + free_tenths
    assert total <= WINCAP_TENTHS
    em.add("finalWin", amount=total * 10)
    return RoundResult(total, base_tenths, free_tenths, em.events, stats)
