"""CONSTRICTOR tunable parameters (SPEC 15). Plain data only. Compiled by game_config / tune.

Every pay is a multiple of 0.1x. Tables are {value: weight}.
"""

from copy import deepcopy

MATH_VERSION = "v2"  # 2026-09-30: trail refills (D-038); any change to a table below requires new books

# Paytable bands: 5, 6, 7, 8, 9-10, 11-12, 13-15, 16+  (x bet). Deliberately flat at the top: a long
# wild snake joins almost every neighbouring symbol into a cluster, so the multiplier (not the band)
# drives the big wins (see docs/DECISIONS.md D-013). v2: the v1 table x 0.83, rounded to 0.1x, to pay for
# the trail refills (D-038).
PAYTABLE = {
    "H1": [1.8, 2.2, 2.7, 3.2, 3.7, 4.5, 5.4, 7.1],
    "H2": [1.3, 1.7, 2.0, 2.3, 2.7, 3.2, 4.1, 5.4],
    "H3": [1.1, 1.2, 1.5, 1.8, 2.2, 2.5, 3.2, 4.1],
    "H4": [0.9, 1.1, 1.2, 1.4, 1.8, 2.2, 2.7, 3.6],
    "L1": [0.7, 0.8, 0.9, 1.1, 1.3, 1.6, 2.0, 2.7],
    "L2": [0.6, 0.7, 0.8, 0.9, 1.1, 1.2, 1.6, 2.2],
    "L3": [0.4, 0.5, 0.7, 0.8, 0.9, 1.1, 1.3, 1.8],
    "L4": [0.3, 0.4, 0.5, 0.7, 0.8, 0.9, 1.1, 1.4],
}

SYMBOLS = {"H1": 6, "H2": 7, "H3": 8, "H4": 9, "L1": 11, "L2": 12, "L3": 13, "L4": 14}
# Fresh gems dropping into the cells the snake's tail leaves (and, after a base spin, its whole trail) are
# drawn from the same weights (engine "fill" table; a block may override it with its own "fill").

WALK = {"bias_straight": 1.5, "bias_pearl": 4.0, "bias_seek": 2.0, "p_bite": 0.9, "bias_tail": 4.0, "seek_tail": 3.0}

# Pearl "tiers" are drawn once per egg spin (base) or once per feature (free games), like picking a
# reel set. They make the pearl supply lumpy: most hatchlings/hunts are lean, a few are rich.
BASE_TABLES = {
    "symbols": SYMBOLS,
    "key_count": {0: 900, 1: 85, 2: 12, 3: 3.4, 4: 0.5, 5: 0.1},  # P(>=3 keys) = 4.0/1001.0
    "p_egg": 1 / 16,
    "pearl_count": {0: 25, 1: 35, 2: 25, 3: 10, 4: 5},
    "pearl_value": {1: 50, 2: 25, 3: 15, 5: 10},
    "moves": {4: 10, 5: 15, 6: 18, 7: 18, 8: 15, 9: 12, 10: 10},
    **WALK,
    "tiers": [
        (98, {}),
        (2, {
            "pearl_count": {4: 20, 5: 35, 6: 30, 7: 15},
            "pearl_value": {1: 70, 2: 20, 3: 7, 5: 3},
            "moves": {8: 20, 9: 30, 10: 50},
            "bias_pearl": 8.0,
            "bias_seek": 5.0,
        }),
    ],
}

HUNT_TABLES = {
    "symbols": SYMBOLS,
    "key_count": {0: 800, 1: 150, 2: 30, 3: 3, 4: 0.5, 5: 0.1},
    "pearl_count": {0: 65, 1: 28, 2: 6, 3: 1},
    "pearl_value": {1: 50, 2: 30, 3: 12, 5: 6, 10: 2},
    "moves": {4: 8, 5: 10, 6: 12, 7: 13, 8: 13, 9: 12, 10: 11, 11: 10, 12: 11},
    **WALK,
    "tiers": [
        (85.5, {"pearl_count": {0: 85, 1: 14, 2: 1}, "pearl_value": {1: 55, 2: 30, 3: 12, 5: 3}}),
        (12, {}),
        (2.5, {
            "pearl_count": {0: 15, 1: 35, 2: 30, 3: 15, 4: 5},
            "pearl_value": {1: 70, 2: 18, 3: 7, 5: 3, 10: 2},
            "bias_pearl": 4.0,
            "bias_seek": 2.5,
        }),
    ],
}

VENOM_TABLES = {
    **{k: v for k, v in HUNT_TABLES.items() if k != "tiers"},
    "pearl_count": {0: 80, 1: 17, 2: 3},
    "pearl_value": {1: 60, 2: 25, 3: 10, 5: 3, 10: 1.5, 25: 0.5},
    "bias_tail": 1.5,
    "seek_tail": 1.5,
    "p_bite": 0.5,
}

# Boosted conditions used only to *find* max-win books (SPEC 12.2). Same rules, different draws.
BOOST = {
    "pearl_count": {1: 10, 2: 30, 3: 30, 4: 20, 5: 10},
    "pearl_value": {2: 20, 3: 25, 5: 35, 10: 20},
    "p_bite": 0.95,
    "bias_pearl": 8.0,
    "bias_seek": 4.0,
    "seek_tail": 4.0,
}

COMMON = {
    "fs_awards": {3: 10, 4: 12, 5: 15},
    "retrigger": 5,
    "fs_max": 30,
    "venom_spins": 12,
    "venom_len": 8,
    "venom_mult": 2,
}

MODES = {
    "base": {"cost": 1.0, "kind": "base", "base": BASE_TABLES, "fs": HUNT_TABLES},
    "ante": {
        "cost": 2.5,
        "kind": "base",
        # KEY chance x4.90: P(>=3 keys) = 19.92/1016.92 (≈ 1 in 51.05)
        "base": {**BASE_TABLES, "key_count": {0: 900, 1: 85, 2: 12, 3: 17.0, 4: 2.45, 5: 0.47}},
        "fs": HUNT_TABLES,
    },
    "hunt": {"cost": 100.0, "kind": "hunt", "fs": HUNT_TABLES, "buy_keys": {3: 3.4, 4: 0.5, 5: 0.1}},
    "venom": {"cost": 700.0, "kind": "venom", "fs": VENOM_TABLES},
}


def boosted(tables: dict) -> dict:
    """Max-win search conditions: no tiers, rich pearls, eager bites."""
    t = deepcopy({k: v for k, v in tables.items() if k != "tiers"})
    pv = dict(BOOST["pearl_value"])
    if 25 in tables["pearl_value"]:
        pv[25] = 10
    t.update({k: v for k, v in BOOST.items() if k != "pearl_value"})
    t["pearl_value"] = pv
    return t
