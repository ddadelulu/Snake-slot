"""Generate CONSTRICTOR books, weight the lookup tables, write configs and run the RGS checks.

Usage (from /math):
    env/bin/python games/constrictor/run.py                          # all modes, production counts (SPEC 12.4)
    env/bin/python games/constrictor/run.py --sim-modes hunt venom   # (re)simulate some modes only
    env/bin/python games/constrictor/run.py --sim-modes              # no simulation: re-weight + configs + checks
    env/bin/python games/constrictor/run.py --quick                  # small smoke run of every mode

Steps: math-sdk create_books (per mode, memory-safe batch size) -> generate_configs ->
optimize.weight_all (SPEC 12.3) -> generate_configs (hashes of the weighted LUTs) -> execute_all_tests.
"""

import argparse
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gamestate import GameState  # noqa: E402
from game_config import GameConfig  # noqa: E402
from src.state.run_sims import create_books  # noqa: E402
from src.write_data.write_configs import generate_configs  # noqa: E402
from utils.rgs_verification import execute_all_tests  # noqa: E402

import optimize  # noqa: E402

ALL = ("base", "ante", "hunt", "venom")
PRODUCTION = {"base": 1_000_000, "ante": 1_000_000, "hunt": 250_000, "venom": 250_000}
# Books kept in memory per worker = batch. Feature books are large, so batches are smaller.
# Each count is divisible by threads x batch (math-sdk requirement for exact counts).
BATCH = {"base": 50_000, "ante": 50_000, "hunt": 12_500, "venom": 6_250}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sim-modes", nargs="*", default=list(ALL))
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()

    config = GameConfig()
    gamestate = GameState(config)
    for m in args.sim_modes:
        n = 4_000 if args.quick else PRODUCTION[m]
        batch = 1_000 if args.quick else BATCH[m]
        if os.path.isdir(gamestate.output_files.temp_path):
            shutil.rmtree(gamestate.output_files.temp_path)
        os.makedirs(gamestate.output_files.temp_path, exist_ok=True)
        create_books(gamestate, config, {m: n}, batch, args.threads, True, False)
    generate_configs(gamestate)
    optimize.weight_all(config, list(ALL))
    generate_configs(gamestate)
    execute_all_tests(config)


if __name__ == "__main__":
    main()
