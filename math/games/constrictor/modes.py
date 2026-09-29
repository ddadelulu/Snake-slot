"""Compile params.py into runtime configs for rounds.play_round."""

from __future__ import annotations

import params as P
from engine import Table, build_paytable, compile_tables

CRITERIA = {
    "base": ("basegame", "freegame", "wincap"),
    "ante": ("basegame", "freegame", "wincap"),
    "hunt": ("freegame", "wincap"),
    "venom": ("freegame", "wincap"),
}


def compile_mode(name: str) -> dict:
    m = P.MODES[name]
    cfg = {
        "name": name,
        "cost": m["cost"],
        "kind": m["kind"],
        "pay": build_paytable(P.PAYTABLE),
        **P.COMMON,
    }
    return cfg


def compile_criteria(mode: str, criteria: str | None) -> dict:
    """criteria None = fully natural sampling (used by the tuner)."""
    m = P.MODES[mode]
    crit = {}
    fs_raw = m["fs"]
    if criteria == "wincap":
        fs_raw = P.boosted(fs_raw)
    crit["fs"] = compile_tables(fs_raw)
    if m["kind"] == "base":
        base = compile_tables(m["base"])
        crit["base"] = base
        if criteria == "basegame":
            crit["key_table"] = base["key_count"].restricted({0, 1, 2})
        elif criteria in ("freegame", "wincap"):
            crit["key_table"] = base["key_count"].restricted({3, 4, 5})
        else:
            crit["key_table"] = None
    if m["kind"] == "hunt":
        crit["buy_keys"] = Table(m["buy_keys"])
    return crit


def trigger_probability(mode: str) -> float:
    m = P.MODES[mode]
    if m["kind"] != "base":
        return 1.0
    return compile_tables(m["base"])["key_count"].prob(lambda k: k >= 3)
