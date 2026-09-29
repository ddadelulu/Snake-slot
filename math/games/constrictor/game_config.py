"""CONSTRICTOR math-sdk configuration (docs/SPEC.md sections 2, 7, 10, 12.2)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.config.config import Config  # noqa: E402
from src.config.distributions import Distribution  # noqa: E402
from src.config.betmode import BetMode  # noqa: E402

import params as P  # noqa: E402
from engine import SIZE_BANDS  # noqa: E402

RTP_TARGET = 0.96
WINCAP = 25000.0

# Share of simulations per criteria (SPEC 12.2). Quotas only decide how many books are *sampled*;
# the real probability of each book is set by its LUT weight (SPEC 12.3).
QUOTAS = {
    "base": {"wincap": 0.0005, "freegame": 0.05, "basegame": 0.9495},
    "ante": {"wincap": 0.0005, "freegame": 0.10, "basegame": 0.8995},
    "hunt": {"wincap": 0.002, "freegame": 0.998},
    "venom": {"wincap": 0.004, "freegame": 0.996},
}


def _dist(criteria, quota, force_freegame, force_wincap):
    return Distribution(
        criteria=criteria,
        quota=quota,
        win_criteria=WINCAP if force_wincap else None,
        conditions={
            # math-sdk requires a reel_weights key; CONSTRICTOR draws cells directly (SPEC 3)
            "reel_weights": {"basegame": {"CELLS": 1}, "freegame": {"CELLS": 1}},
            "force_freegame": force_freegame,
            "force_wincap": force_wincap,
        },
    )


class GameConfig(Config):
    """Singleton game configuration."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        super().__init__()
        self.game_id = "constrictor"
        self.provider_name = "Studio 12"
        self.provider_number = 12
        self.game_name = "CONSTRICTOR"
        self.working_name = "CONSTRICTOR"
        self.math_version = P.MATH_VERSION
        self.wincap = WINCAP
        self.win_type = "cluster"
        self.rtp = RTP_TARGET
        self.construct_paths()
        self.output_regular_json = False

        self.num_reels = 7
        self.num_rows = [7] * self.num_reels
        self.include_padding = False
        self.padding_reels = {}

        pay_group = {}
        for sym, vals in P.PAYTABLE.items():
            for (lo, hi), v in zip(SIZE_BANDS, vals):
                pay_group[((lo, hi), sym)] = v
        self.paytable = self.convert_range_table(pay_group)

        self.special_symbols = {"scatter": ["KEY"], "egg": ["EGG"], "pearl": ["PEARL"]}
        self.freespin_triggers = {
            self.basegame_type: dict(P.COMMON["fs_awards"]),
            self.freegame_type: {3: P.COMMON["retrigger"], 4: P.COMMON["retrigger"], 5: P.COMMON["retrigger"]},
        }
        self.anticipation_triggers = {self.basegame_type: 2, self.freegame_type: 2}

        self.bet_modes = []
        for name in ("base", "ante", "hunt", "venom"):
            m = P.MODES[name]
            q = QUOTAS[name]
            if m["kind"] == "base":
                dists = [
                    _dist("wincap", q["wincap"], True, True),
                    _dist("freegame", q["freegame"], True, False),
                    _dist("basegame", q["basegame"], False, False),
                ]
            else:
                dists = [
                    _dist("wincap", q["wincap"], True, True),
                    _dist("freegame", q["freegame"], True, False),
                ]
            self.bet_modes.append(
                BetMode(
                    name=name,
                    cost=m["cost"],
                    rtp=self.rtp,
                    max_win=self.wincap,
                    auto_close_disabled=False,
                    is_feature=m["kind"] == "base",
                    is_buybonus=m["kind"] != "base",
                    distributions=dists,
                )
            )
