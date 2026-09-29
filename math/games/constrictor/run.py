"""Generate CONSTRICTOR books, weight the lookup tables, write configs and run the RGS checks.

Usage (from /math):
    env/bin/python games/constrictor/run.py                 # production counts (SPEC 12.4)
    env/bin/python games/constrictor/run.py --quick         # small smoke run
    env/bin/python games/constrictor/run.py --modes base hunt --sims 20000

Steps: math-sdk create_books -> generate_configs -> optimize.weight_all (SPEC 12.3) ->
generate_configs (hashes of the weighted LUTs) -> math-sdk execute_all_tests.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gamestate import GameState  # noqa: E402
from game_config import GameConfig  # noqa: E402
from src.state.run_sims import create_books  # noqa: E402
from src.write_data.write_configs import generate_configs  # noqa: E402
from utils.rgs_verification import execute_all_tests  # noqa: E402

import optimize  # noqa: E402

PRODUCTION = {"base": 1_000_000, "ante": 1_000_000, "hunt": 500_000, "venom": 500_000}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modes", nargs="+", default=list(PRODUCTION))
    ap.add_argument("--sims", type=int, default=None, help="override sims for every selected mode")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--batch", type=int, default=50_000)
    ap.add_argument("--skip-sims", action="store_true", help="reuse existing books, only weight + configs")
    args = ap.parse_args()

    sims = {m: 0 for m in PRODUCTION}
    for m in args.modes:
        sims[m] = PRODUCTION[m]
        if args.quick:
            sims[m] = 4_000
        if args.sims:
            sims[m] = args.sims

    config = GameConfig()
    gamestate = GameState(config)
    if not args.skip_sims:
        create_books(gamestate, config, {m: n for m, n in sims.items() if n}, args.batch, args.threads, True, False)
    generate_configs(gamestate)
    optimize.weight_all(config, [m for m in args.modes])
    generate_configs(gamestate)
    execute_all_tests(config, excluded_modes=[m for m in PRODUCTION if m not in args.modes])


if __name__ == "__main__":
    main()
