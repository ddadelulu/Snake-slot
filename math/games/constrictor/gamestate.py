"""CONSTRICTOR math-sdk GameState: runs one round per simulation and writes the SPEC 11 events.

The round itself is played by the pure engine (rounds.play_round). This class connects it to the
SDK: seeding, criteria repeats, WinManager bookkeeping, force-record keys and book output.
"""

import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.state.state import GeneralGameState  # noqa: E402

import modes  # noqa: E402
from rounds import SnakeStuck, play_round  # noqa: E402


class GameState(GeneralGameState):
    """Core simulation state."""

    _cfg_cache = {}
    _crit_cache = {}

    def assign_special_sym_function(self):
        self.special_symbol_functions = {}

    def _cfg(self, mode):
        if mode not in self._cfg_cache:
            self._cfg_cache[mode] = modes.compile_mode(mode)
        return self._cfg_cache[mode]

    def _crit(self, mode, criteria):
        key = (mode, criteria)
        if key not in self._crit_cache:
            self._crit_cache[key] = modes.compile_criteria(mode, criteria)
        return self._crit_cache[key]

    def run_spin(self, sim, simulation_seed=None):
        self.reset_seed(sim)
        self.repeat = True
        while self.repeat:
            self.reset_book()
            cfg = self._cfg(self.betmode)
            crit = self._crit(self.betmode, self.criteria)
            try:
                res = play_round(random, cfg, crit, emit=True)
            except SnakeStuck:
                # A boxed-in snake has no legal move: discard and redraw (SPEC 5.5).
                self.repeat_count += 1
                self.repeat = True
                continue
            self._apply_result(res)
            self.check_repeat()
        self.imprint_wins()

    def _apply_result(self, res):
        for ev in res.events:
            self.book.events.append(ev)
        wm = self.win_manager
        wm.reset_spin_win()
        if res.base_tenths:
            wm.update_spinwin(res.base_tenths / 10)
        wm.update_gametype_wins(self.config.basegame_type)
        wm.reset_spin_win()
        if res.free_tenths:
            wm.update_spinwin(res.free_tenths / 10)
        wm.update_gametype_wins(self.config.freegame_type)
        st = res.stats
        self.triggered_freegame = st.triggered
        self.wincap_triggered = st.capped
        self.update_final_win()
        assert self.book.to_json()["payoutMultiplier"] == res.payout_tenths * 10
        self._record(st)

    def _record(self, st):
        """Force-record keys (rare, searchable features only)."""
        if st.triggered and self.betmode in ("base", "ante"):
            self.record({"kind": st.trigger_keys, "symbol": "KEY", "gametype": "basegame"})
        if st.retriggers:
            self.record({"retrigger": st.retriggers, "gametype": "freegame"})
        if st.bites:
            self.record({"ouroboros": min(st.bites, 3)})
        if st.capped:
            self.record({"wincap": True})
        if st.fs_tier is not None and st.fs_tier == 2:
            self.record({"pearlTier": "rich"})

    def run_freespin(self):
        """Free spins are played inside rounds.run_freegame (single round function)."""
        raise NotImplementedError
