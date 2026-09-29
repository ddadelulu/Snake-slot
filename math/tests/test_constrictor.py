"""CONSTRICTOR math tests (docs/SPEC.md). Run from /math: env/bin/pytest tests -q"""

import os
import random
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "games", "constrictor"))

import engine as E  # noqa: E402
import modes  # noqa: E402
import params as P  # noqa: E402
from rounds import play_round  # noqa: E402

C = E.cell_index
PAY = E.build_paytable(P.PAYTABLE)
WALK = {"bias_straight": 1.0, "bias_pearl": 1.0, "bias_seek": 1.0, "p_bite": 1.0}


def ring_cells(r0, c0, r1, c1):
    """Border cells of the rectangle [r0..r1] x [c0..c1] (reel, row), as a clockwise cycle."""
    cells = []
    for r in range(r0, r1 + 1):
        cells.append(C(r, c0))
    for w in range(c0 + 1, c1 + 1):
        cells.append(C(r1, w))
    for r in range(r1 - 1, r0 - 1, -1):
        cells.append(C(r, c1))
    for w in range(c1 - 1, c0, -1):
        cells.append(C(r0, w))
    return cells


def board_of(code=E.L4):
    return [code] * E.NCELLS


# --------------------------------------------------------------------------------------------------
# Enclosure / flood fill (SPEC 6.2)
# --------------------------------------------------------------------------------------------------
class TestEnclosure:
    def test_ring_in_corner_encloses_center(self):
        ring = set(ring_cells(0, 0, 2, 2))
        assert len(ring) == 8
        assert E.enclosed_cells(ring) == [C(1, 1)]

    def test_ring_along_whole_wall(self):
        ring = set(ring_cells(0, 0, 6, 2))  # touches left, top and bottom walls
        assert sorted(E.enclosed_cells(ring)) == sorted(C(r, 1) for r in range(1, 6))

    def test_ring_touching_two_walls_opposite(self):
        ring = set(ring_cells(2, 0, 4, 6))  # spans top to bottom
        assert sorted(E.enclosed_cells(ring)) == sorted(C(3, w) for w in range(1, 6))

    def test_two_by_two_loop_encloses_nothing(self):
        ring = {C(3, 3), C(3, 4), C(4, 3), C(4, 4)}
        assert E.enclosed_cells(ring) == []

    def test_large_ring_interior(self):
        ring = set(ring_cells(1, 1, 5, 5))
        enc = E.enclosed_cells(ring)
        assert len(enc) == 9 and C(3, 3) in enc

    def test_open_shape_encloses_nothing(self):
        cells = ring_cells(1, 1, 4, 4)[:-1]  # one gap
        assert E.enclosed_cells(set(cells)) == []

    def test_whole_border_ring(self):
        ring = set(ring_cells(0, 0, 6, 6))
        assert len(E.enclosed_cells(ring)) == 25


# --------------------------------------------------------------------------------------------------
# Snake movement (SPEC 5)
# --------------------------------------------------------------------------------------------------
def replay_steps(start_body, start_target, start_mult, board, steps):
    """Independent re-implementation of SPEC 5.4 used to check generated paths."""
    body = list(start_body)
    target, mult = start_target, start_mult
    board = list(board)
    for i, (frm, to, eaten, grow, tail, length, tgt, m, bite) in enumerate(steps):
        assert frm == body[0]
        assert to in E.NEIGH[frm], "must move orthogonally inside the grid"
        if bite:
            assert i == len(steps) - 1, "a bite always ends the moves"
            assert to == body[-1], "bite enters the tail tip"
            assert len(body) >= 8 and len(body) == target
            assert E.enclosed_cells(set(body)), "bite must enclose something"
            body = [body[-1]] + body[:-1]
        else:
            assert to not in body, "cannot enter own body (incl. neck => no reversal)"
            assert eaten == board[to]
            exp_grow = len(body) < target
            assert grow == exp_grow
            if not grow:
                t = body.pop()
                board[t] = E.EMPTY
            body.insert(0, to)
            board[to] = E.WILD
            if eaten >= E.PEARL:
                mult += eaten - E.PEARL
                target = min(target + 1, E.LCAP)
        assert tail == body[-1] and length == len(body) and tgt == target and m == mult
        assert len(body) <= E.LCAP and len(set(body)) == len(body)
    return body, target, mult


class TestMovement:
    @pytest.mark.parametrize("seed", range(40))
    def test_generated_paths_are_legal(self, seed):
        rng = random.Random(seed)
        T = E.compile_tables({**P.HUNT_TABLES, "tiers": None, "pearl_count": {0: 1, 3: 2, 6: 1}, **WALK})
        body, _ = E.snake_entry(rng, 3 + seed % 10)
        snake = E.Snake(body, len(body) + seed % 3, 1 + seed % 4)
        for _ in range(6):
            board, _, _ = E.draw_board(rng, T, "freegame", snake.body)
            start = (list(snake.body), snake.target, snake.mult, list(board))
            n = T["moves"].draw(rng)
            res = E.generate_path_safe(rng, board, snake, n, T, future=4)
            if res is None:
                continue
            steps, bite = res
            if not bite:
                assert len(steps) == n
            b, t, m = replay_steps(start[0], start[1], start[2], start[3], steps)
            assert b == snake.body and t == snake.target
            if bite:
                E.constrict(board, snake)

    def test_hatch_unfurls_to_three(self):
        rng = random.Random(1)
        board = board_of(E.L3)
        board[C(3, 3)] = E.WILD
        snake = E.Snake([C(3, 3)], 3, 1)
        steps, _ = E.generate_path_safe(rng, board, snake, 5, {**WALK, "p_bite": 0.0})
        assert [s[5] for s in steps] == [2, 3, 3, 3, 3]
        assert [s[3] for s in steps] == [True, True, False, False, False]

    def test_pearl_grows_and_multiplies(self):
        board = board_of(E.L3)
        body = [C(3, 3), C(2, 3), C(1, 3)]
        for c in body:
            board[c] = E.WILD
        board[C(4, 3)] = E.PEARL + 5
        snake = E.Snake(body, 3, 1)
        rng = random.Random(0)
        steps, _ = E.generate_path_safe(rng, board, snake, 2, {**WALK, "bias_pearl": 1e9, "p_bite": 0.0})
        assert steps[0][1] == C(4, 3) and steps[0][7] == 6 and steps[0][6] == 4
        assert steps[0][3] is False, "growth is served on the next step"
        assert steps[1][3] is True and steps[1][5] == 4

    def test_length_cap(self):
        board = board_of(E.L3)
        snake = E.Snake([C(0, 0)], 20, 1)
        board[C(0, 0)] = E.WILD
        for r in range(1, 7):
            board[C(r, 0)] = E.PEARL + 1
        rng = random.Random(0)
        # force a long straight path through pearls
        steps, _ = E.generate_path_safe(
            rng, board, snake, 6, {"bias_straight": 1e6, "bias_pearl": 1e6, "bias_seek": 1.0, "p_bite": 0.0}
        )
        assert snake.target == E.LCAP
        assert all(s[6] <= E.LCAP for s in steps)

    def test_no_bite_below_length_8(self):
        s = E.Snake(ring_cells(0, 0, 1, 2), 6, 1)  # 6-cell loop, tail next to head
        assert not E.bite_qualifies(s)

    def test_bite_qualifies_at_8(self):
        cyc = ring_cells(0, 0, 2, 2)
        s = E.Snake(cyc, 8, 1)  # head cyc[0], tail cyc[-1] adjacent
        assert cyc[-1] in E.NEIGH[cyc[0]]
        assert E.bite_qualifies(s)

    def test_no_bite_with_pending_growth(self):
        cyc = ring_cells(0, 0, 2, 2)
        assert not E.bite_qualifies(E.Snake(cyc, 9, 1))

    def test_future_guarantee(self):
        # head boxed in the corner by its own body: no pearl-proof future
        body = [C(0, 0), C(1, 0), C(1, 1), C(0, 1)]
        assert not E.has_future(body, 4, 1)
        assert E.has_future([C(3, 3), C(3, 4), C(3, 5)], 3, 12)


# --------------------------------------------------------------------------------------------------
# Constrict + doubling (SPEC 6.3)
# --------------------------------------------------------------------------------------------------
class TestConstrict:
    def test_highest_paying_symbol_wins(self):
        board = board_of(E.L1)
        ring = ring_cells(1, 1, 4, 4)  # 12-cell ring, 4 enclosed
        for c in ring:
            board[c] = E.WILD
        board[C(2, 2)], board[C(2, 3)], board[C(3, 2)], board[C(3, 3)] = E.L4, E.H3, E.KEY, E.PEARL + 3
        s = E.Snake(ring, 12, 4)
        enc, crushed, x, mb = E.constrict(board, s)
        assert x == E.H3 and mb == 4 and s.mult == 8
        assert all(board[c] == E.H3 for c in enc) and len(enc) == 4

    def test_no_regular_symbol_defaults_to_h1(self):
        board = board_of(E.L1)
        ring = ring_cells(0, 0, 2, 2)
        for c in ring:
            board[c] = E.WILD
        board[C(1, 1)] = E.EMPTY
        s = E.Snake(ring, 8, 3)
        _, _, x, _ = E.constrict(board, s)
        assert x == E.H1 and s.mult == 6


# --------------------------------------------------------------------------------------------------
# Evaluation (SPEC 7)
# --------------------------------------------------------------------------------------------------
class TestEvaluation:
    def test_plain_cluster_of_five(self):
        board = [E.KEY] * E.NCELLS
        for r in range(5):
            board[C(r, 0)] = E.H2
        total, cl = E.evaluate(board, PAY)
        assert len(cl) == 1 and cl[0][2] == 5 and total == PAY[E.H2][5]

    def test_four_is_not_a_cluster(self):
        board = [E.KEY] * E.NCELLS
        for r in range(4):
            board[C(r, 0)] = E.H2
        assert E.evaluate(board, PAY) == (0, [])

    def test_wild_shared_between_two_symbols(self):
        board = [E.EMPTY] * E.NCELLS
        # wild column in the middle, H1 on its left, L2 on its right
        for w in range(3):
            board[C(3, w)] = E.WILD
            board[C(2, w)] = E.H1
            board[C(4, w)] = E.L2
        total, cl = E.evaluate(board, PAY)
        syms = sorted((c[0], c[2], c[3]) for c in cl)
        assert syms == [(E.H1, 6, 3), (E.L2, 6, 3)]
        assert total == PAY[E.H1][6] + PAY[E.L2][6]

    def test_wild_only_group_does_not_pay(self):
        board = [E.EMPTY] * E.NCELLS
        for r in range(7):
            board[C(r, 3)] = E.WILD
        assert E.evaluate(board, PAY) == (0, [])

    def test_groups_joined_through_wild_are_one_cluster(self):
        board = [E.EMPTY] * E.NCELLS
        board[C(0, 0)] = board[C(1, 0)] = E.L3
        board[C(2, 0)] = E.WILD
        board[C(3, 0)] = board[C(4, 0)] = E.L3
        total, cl = E.evaluate(board, PAY)
        assert len(cl) == 1 and cl[0][2] == 5 and cl[0][3] == 1

    def test_blockers(self):
        board = [E.EMPTY] * E.NCELLS
        for r in range(6):
            board[C(r, 0)] = E.H4
        board[C(3, 0)] = E.PEARL + 2  # uneaten pearl splits the line
        assert E.evaluate(board, PAY) == (0, [])

    def test_paytable_granularity(self):
        for s in range(E.NREG):
            for size in range(5, E.NCELLS + 1):
                assert PAY[s][size] > 0 and PAY[s][size] >= PAY[s][size - 1] if size > 5 else True
        for vals in P.PAYTABLE.values():
            for v in vals:
                assert abs(v * 10 - round(v * 10)) < 1e-9


# --------------------------------------------------------------------------------------------------
# Rounds (SPEC 4, 8, 9)
# --------------------------------------------------------------------------------------------------
def _types(events):
    return [e["type"] for e in events]


class TestRounds:
    @pytest.mark.parametrize("mode", ["base", "ante", "hunt", "venom"])
    def test_round_invariants(self, mode):
        cfg = modes.compile_mode(mode)
        crit = modes.compile_criteria(mode, None)
        rng = random.Random(99)
        for _ in range(150 if mode in ("base", "ante") else 25):
            r = play_round(rng, cfg, crit)
            ev = r.events
            assert ev[-1]["type"] == "finalWin" and ev[-1]["amount"] == r.payout_tenths * 10
            assert r.payout_tenths * 10 % 10 == 0 and r.payout_tenths <= E.WINCAP_TENTHS
            totals = [e["amount"] for e in ev if e["type"] == "setTotalWin"]
            assert totals == sorted(totals)
            if totals:
                assert totals[-1] == r.payout_tenths * 10
            assert sum(e["amount"] for e in ev if e["type"] == "setWin") == r.payout_tenths * 10
            for e in ev:
                if e["type"] == "freeSpinRetrigger":
                    assert e["totalFs"] <= 30

    def test_retrigger_cap(self):
        cfg = modes.compile_mode("hunt")
        raw = {**P.HUNT_TABLES, "tiers": None, "key_count": {3: 1}}
        crit = {"fs": E.compile_tables(raw), "buy_keys": E.Table({5: 1})}
        r = play_round(random.Random(3), cfg, crit)
        ups = [e for e in r.events if e["type"] == "updateFreeSpin"]
        rts = [e for e in r.events if e["type"] == "freeSpinRetrigger"]
        assert ups[-1]["total"] == 30 or r.stats.capped
        assert sum(e["added"] for e in rts) == ups[-1]["total"] - 15
        assert len(ups) <= 30

    def test_cap_clipping(self):
        cfg = modes.compile_mode("venom")
        crit = {"fs": E.compile_tables(P.boosted(P.VENOM_TABLES))}
        rng = random.Random(5)
        seen = False
        for _ in range(400):
            r = play_round(rng, cfg, crit)
            if r.stats.capped:
                seen = True
                types = _types(r.events)
                i = types.index("wincap")
                assert types[i + 1 :] == ["freeSpinEnd", "finalWin"], "round ends right after the cap"
                assert r.events[i]["amount"] == 2_500_000 and r.events[i]["uncappedAmount"] >= 2_500_000
                assert r.payout_tenths == E.WINCAP_TENTHS
                break
        assert seen, "boosted venom should reach the cap within 400 rounds"

    def test_multiplier_applies_to_spin_total(self):
        cfg = modes.compile_mode("hunt")
        crit = modes.compile_criteria("hunt", None)
        rng = random.Random(11)
        for _ in range(30):
            r = play_round(rng, cfg, crit)
            for e in r.events:
                if e["type"] == "winInfo":
                    m = e["wins"][0]["meta"]["globalMult"]
                    assert all(w["meta"]["globalMult"] == m for w in e["wins"])
                    assert e["totalWin"] == m * sum(w["meta"]["winWithoutMult"] for w in e["wins"])

    def test_trigger_probability_exact(self):
        assert abs(modes.trigger_probability("base") - 4.0 / 1001.0) < 1e-15


# --------------------------------------------------------------------------------------------------
# Book schema (SPEC 11)
# --------------------------------------------------------------------------------------------------
def test_schema_validates_generated_rounds():
    import json

    import fastjsonschema

    path = os.path.join(os.path.dirname(__file__), "..", "games", "constrictor", "schema", "book.schema.json")
    validate = fastjsonschema.compile(json.load(open(path)))
    for mode in ("base", "ante", "hunt", "venom"):
        cfg = modes.compile_mode(mode)
        for crit_name in modes.CRITERIA[mode]:
            crit = modes.compile_criteria(mode, crit_name)
            rng = random.Random(21)
            for i in range(10):
                r = play_round(rng, cfg, crit)
                validate({"id": i, "payoutMultiplier": r.payout_tenths * 10, "events": r.events})
