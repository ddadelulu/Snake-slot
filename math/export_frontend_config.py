"""Export the math facts the frontend displays (rules, paytable, costs, RTP, max win) to JSON.

The frontend never re-types numbers: rules and paytable are rendered from this file.
Usage (from /math): env/bin/python export_frontend_config.py
Writes: ../frontend/apps/constrictor/src/game/generated/mathConfig.json
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "games", "constrictor"))

import params as P  # noqa: E402
from engine import LCAP, MIN_BITE_LEN, SIZE_BANDS  # noqa: E402
from modes import trigger_probability  # noqa: E402

OUT = os.path.join(HERE, "..", "frontend", "apps", "constrictor", "src", "game", "generated", "mathConfig.json")
LIB = os.path.join(HERE, "games", "constrictor", "library")


def main():
    modes = []
    for name in ("base", "ante", "hunt", "venom"):
        m = P.MODES[name]
        rtp = 0.96
        wpath = os.path.join(LIB, f"weighting_{name}.json")
        if os.path.exists(wpath):
            with open(wpath, encoding="UTF-8") as f:
                rtp = json.load(f)["rtp_exact"]
        modes.append({"id": name, "cost": m["cost"], "kind": m["kind"], "rtp": rtp, "maxWin": 25000, "huntTrigger": trigger_probability(name)})
    base_pearls = sorted({int(v) for v in P.BASE_TABLES["pearl_value"]})
    hunt_pearls = sorted({int(v) for t in [P.HUNT_TABLES] + [ov for _, ov in P.HUNT_TABLES.get("tiers", [])] for v in t.get("pearl_value", {})})
    venom_pearls = sorted({int(v) for v in P.VENOM_TABLES["pearl_value"]})
    cfg = {
        "mathVersion": P.MATH_VERSION,
        "grid": {"cols": 7, "rows": 7},
        "paytable": {
            "bands": [[lo, hi] for lo, hi in SIZE_BANDS],
            "symbols": {k: v for k, v in P.PAYTABLE.items()},
        },
        "modes": modes,
        "maxWin": 25000,
        "freeSpins": {
            "awards": {str(k): v for k, v in P.COMMON["fs_awards"].items()},
            "retrigger": P.COMMON["retrigger"],
            "max": P.COMMON["fs_max"],
            "venomSpins": P.COMMON["venom_spins"],
            "venomLength": P.COMMON["venom_len"],
            "venomMult": P.COMMON["venom_mult"],
            "huntLength": 3,
            "huntMult": 1,
        },
        "snake": {
            "lengthCap": LCAP,
            "minBiteLength": MIN_BITE_LEN,
            "hatchLength": 3,
            "movesBase": [min(P.BASE_TABLES["moves"]), max(P.BASE_TABLES["moves"])],
            "movesFree": [min(P.HUNT_TABLES["moves"]), max(P.HUNT_TABLES["moves"])],
        },
        "pearls": {"base": base_pearls, "hunt": hunt_pearls, "venom": venom_pearls},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="UTF-8") as f:
        json.dump(cfg, f, indent=2)
    print("wrote", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
