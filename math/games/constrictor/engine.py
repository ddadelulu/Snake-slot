"""CONSTRICTOR pure game engine (docs/SPEC.md is canonical).

Pure functions: no math-sdk imports, no global state. All money is in integer **tenths of the base
bet** (SPEC 7.4 / REQUIREMENTS 3.2). Book amounts are hundredths, so we multiply by 10 when emitting.

Randomness comes only from the ``rng`` argument: the ``random`` module (seeded per simulation by the
SDK) or a ``random.Random`` instance.
"""

from __future__ import annotations

from bisect import bisect_right
from itertools import accumulate

# ----------------------------------------------------------------------------------------------------
# Grid
# ----------------------------------------------------------------------------------------------------
COLS = ROWS = 7
NCELLS = COLS * ROWS
REEL = [i // ROWS for i in range(NCELLS)]
ROW = [i % ROWS for i in range(NCELLS)]


def cell_index(reel: int, row: int) -> int:
    return reel * ROWS + row


NEIGH = []
for _i in range(NCELLS):
    _r, _w = REEL[_i], ROW[_i]
    _n = []
    if _w > 0:
        _n.append(_i - 1)  # up
    if _w < ROWS - 1:
        _n.append(_i + 1)  # down
    if _r > 0:
        _n.append(_i - ROWS)  # left
    if _r < COLS - 1:
        _n.append(_i + ROWS)  # right
    NEIGH.append(tuple(_n))
NEIGH = tuple(NEIGH)
BORDER = tuple(i for i in range(NCELLS) if REEL[i] in (0, COLS - 1) or ROW[i] in (0, ROWS - 1))

# ----------------------------------------------------------------------------------------------------
# Cell codes
# ----------------------------------------------------------------------------------------------------
H1, H2, H3, H4, L1, L2, L3, L4 = range(8)
NREG = 8  # regular (paying) symbols are codes 0..7; lower code = higher rank (SPEC 2.2)
KEY = 8
EGG = 9
EMPTY = 10
WILD = 11  # a snake-occupied cell
PEARL = 100  # a pearl of value v is encoded as PEARL + v

REG_NAMES = ("H1", "H2", "H3", "H4", "L1", "L2", "L3", "L4")
NAMES = REG_NAMES + ("KEY", "EGG", "EMPTY", "WILD")
NAME_TO_CODE = {n: c for c, n in enumerate(NAMES)}

LCAP = 20  # length cap (SPEC 5.1)
MIN_BITE_LEN = 8  # SPEC 6.1
WINCAP_TENTHS = 250_000  # 25,000x
SIZE_BANDS = ((5, 5), (6, 6), (7, 7), (8, 8), (9, 10), (11, 12), (13, 15), (16, NCELLS))
TIER_THRESHOLDS_TENTHS = (150, 500, 1500, 5000)  # STRIKE 15x, CONSTRICT 50x, DEVOUR 150x, APEX 500x


def is_pearl(code: int) -> bool:
    return code >= PEARL


def cell_json(i: int) -> list:
    """Book cell reference: [reel, row] (SPEC 11)."""
    return [REEL[i], ROW[i]]


def sym_json(code):
    """Book symbol code (SPEC 11): H1..L4, KEY, EGG, EMPTY, P<value> for pearls; None stays None."""
    if code is None:
        return None
    if code >= PEARL:
        return "P%d" % (code - PEARL)
    return NAMES[code]


def win_level(amount_tenths: int) -> int:
    """Presentation tier (SPEC 11): 0 none … 4 APEX PREDATOR, 5 max win."""
    if amount_tenths >= WINCAP_TENTHS:
        return 5
    lvl = 0
    for t in TIER_THRESHOLDS_TENTHS:
        if amount_tenths >= t:
            lvl += 1
    return lvl


# ----------------------------------------------------------------------------------------------------
# Weighted draws
# ----------------------------------------------------------------------------------------------------
class Table:
    """A discrete weighted distribution {value: weight} with O(log n) draws."""

    __slots__ = ("values", "cum", "total")

    def __init__(self, dist: dict):
        items = [(v, w) for v, w in dist.items() if w > 0]
        if not items:
            raise ValueError("empty distribution")
        self.values = [v for v, _ in items]
        self.cum = list(accumulate(w for _, w in items))
        self.total = self.cum[-1]

    def draw(self, rng):
        return self.values[bisect_right(self.cum, rng.random() * self.total)]

    def restricted(self, allowed) -> "Table":
        """Conditional distribution given value in ``allowed`` (same relative weights)."""
        prev = 0
        d = {}
        for v, c in zip(self.values, self.cum):
            if v in allowed:
                d[v] = c - prev
            prev = c
        return Table(d)

    def prob(self, pred) -> float:
        prev = 0
        s = 0
        for v, c in zip(self.values, self.cum):
            if pred(v):
                s += c - prev
            prev = c
        return s / self.total


def build_paytable(paygroups: dict) -> list:
    """paygroups: {sym_name: [8 band values in x bet]} -> pay[sym][size] in integer tenths."""
    pay = [[0] * (NCELLS + 1) for _ in range(NREG)]
    for name, vals in paygroups.items():
        s = NAME_TO_CODE[name]
        assert len(vals) == len(SIZE_BANDS)
        for (lo, hi), v in zip(SIZE_BANDS, vals):
            t = round(v * 10)
            assert abs(t - v * 10) < 1e-9, f"pay {name} {v} is not a multiple of 0.1x"
            for size in range(lo, hi + 1):
                pay[s][size] = t
    return pay


# ----------------------------------------------------------------------------------------------------
# Board draw (SPEC 3)
# ----------------------------------------------------------------------------------------------------
def draw_board(rng, tables, gametype: str, snake_cells=(), key_table: Table | None = None, allow_egg=True):
    """Return (board, keys, egg_cell). ``tables`` is a compiled parameter dict (see compile_params).

    board: list of 49 codes; snake cells are WILD.
    """
    board = [0] * NCELLS
    occupied = set(snake_cells)
    for c in occupied:
        board[c] = WILD
    free = [i for i in range(NCELLS) if i not in occupied]
    kt = key_table or tables["key_count"]
    k = kt.draw(rng)
    picks = rng.sample(free, k) if k else []
    for c in picks:
        board[c] = KEY
    taken = set(picks)
    egg = None
    npearls = 0
    if gametype == "basegame":
        if allow_egg and rng.random() < tables["p_egg"]:
            rem = [i for i in free if i not in taken]
            egg = rem[int(rng.random() * len(rem))]
            board[egg] = EGG
            taken.add(egg)
            npearls = tables["pearl_count"].draw(rng)
    else:
        npearls = tables["pearl_count"].draw(rng)
    if npearls:
        rem = [i for i in free if i not in taken]
        npearls = min(npearls, len(rem))
        for c in rng.sample(rem, npearls):
            board[c] = PEARL + tables["pearl_value"].draw(rng)
            taken.add(c)
    sym = tables["symbols"]
    for i in free:
        if i not in taken:
            board[i] = sym.draw(rng)
    return board, sorted(picks), egg


def exit_fill(rng, board, cells, fill_table):
    """Fresh gems for the cells a leaving snake vacates (SPEC 5.6), in the order given.

    The spin's win is already counted, so these gems must never look like an unpaid cluster: each one
    differs from every orthogonal neighbour (already-filled cells included), so it joins no group.
    Mutates ``board``; returns [(cell, code), ...]."""
    out = []
    for c in cells:
        near = {board[n] for n in NEIGH[c]}
        while True:
            code = fill_table.draw(rng)
            if code not in near:
                break
        board[c] = code
        out.append((c, code))
    return out


# ----------------------------------------------------------------------------------------------------
# Enclosure (SPEC 6.2)
# ----------------------------------------------------------------------------------------------------
def enclosed_cells(ring: set) -> list:
    """Non-ring cells not orthogonally reachable from a non-ring border cell."""
    seen = bytearray(NCELLS)
    stack = []
    for b in BORDER:
        if b not in ring:
            seen[b] = 1
            stack.append(b)
    while stack:
        c = stack.pop()
        for n in NEIGH[c]:
            if not seen[n] and n not in ring:
                seen[n] = 1
                stack.append(n)
    return [i for i in range(NCELLS) if not seen[i] and i not in ring]


# ----------------------------------------------------------------------------------------------------
# Snake (SPEC 5)
# ----------------------------------------------------------------------------------------------------
class Snake:
    __slots__ = ("body", "target", "mult")

    def __init__(self, body, target, mult):
        self.body = list(body)  # head first
        self.target = target
        self.mult = mult

    def copy(self):
        return Snake(self.body, self.target, self.mult)


def bite_qualifies(snake: Snake) -> bool:
    body = snake.body
    L = len(body)
    if L < MIN_BITE_LEN or L != snake.target:
        return False
    if body[-1] not in NEIGH[body[0]]:
        return False
    return len(enclosed_cells(set(body))) > 0


class PathBudgetExceeded(Exception):
    pass


def _nearest_pearl_dist(board, cell):
    best = 99
    r0, w0 = REEL[cell], ROW[cell]
    for i in range(NCELLS):
        if board[i] >= PEARL:
            d = abs(REEL[i] - r0) + abs(ROW[i] - w0)
            if d < best:
                best = d
    return best


def has_future(body, target: int, depth: int, budget: int = 20000) -> bool:
    """True if the head can make ``depth`` more steps **even if every step grows** the snake.

    This is a pearl-proof guarantee: a self-avoiding walk of ``depth`` cells from the head that
    avoids the whole current body. It stays legal whatever the next board holds, because growing
    is the worst case (a tail that moves only frees cells). Used so a free-spin path never leaves the
    snake boxed in for the next spin (SPEC 5.5). ``target`` is unused and kept for call-site clarity.
    """
    blocked = set(body)
    nodes = [0]

    def rec(cell, left):
        if left == 0:
            return True
        nodes[0] += 1
        if nodes[0] > budget:
            return False
        for nb in NEIGH[cell]:
            if nb not in blocked:
                blocked.add(nb)
                ok = rec(nb, left - 1)
                blocked.discard(nb)
                if ok:
                    return True
        return False

    return rec(body[0], depth)


def generate_path(rng, board, snake: Snake, n: int, prm: dict, budget: int = 20000, future: int = 0):
    """Generate a legal path of exactly ``n`` steps, or ending earlier with a qualifying bite.

    Mutates ``board`` and ``snake`` to the final state. Returns (steps, bite) where steps are tuples
    (frm, to, eaten_code_or_None, grow, tail_after, length, target, mult, bite, fill). ``fill`` is the
    fresh regular symbol that drops into the cell the tail just left (None when the tail stayed), so the
    trail never stays empty (SPEC 5.4). Returns None if no
    legal path exists within the node budget; board and snake may then be partially modified, so
    always call it through ``generate_path_safe``.
    """
    body = snake.body
    steps = []
    bias_straight = prm["bias_straight"]
    bias_pearl = prm["bias_pearl"]
    bias_seek = prm["bias_seek"]
    p_bite = prm["p_bite"]
    bias_tail = prm.get("bias_tail", 1.0)
    seek_tail = prm.get("seek_tail", 1.0)
    nodes = [0]

    fill_table = prm["fill"]

    def do_step(c):
        eaten = board[c]
        grow = len(body) < snake.target
        old_tail = None
        fill = None
        if not grow:
            old_tail = body.pop()
            fill = fill_table.draw(rng)
            board[old_tail] = fill
        frm = body[0]
        body.insert(0, c)
        board[c] = WILD
        prev_mult, prev_target = snake.mult, snake.target
        if eaten >= PEARL:
            snake.mult += eaten - PEARL
            snake.target = min(snake.target + 1, LCAP)
        steps.append((frm, c, eaten, grow, body[-1], len(body), snake.target, snake.mult, False, fill))
        return (c, eaten, grow, old_tail, prev_mult, prev_target)

    def undo_step(u):
        c, eaten, grow, old_tail, prev_mult, prev_target = u
        steps.pop()
        body.pop(0)
        board[c] = eaten
        if not grow:
            body.append(old_tail)
            board[old_tail] = WILD
        snake.mult, snake.target = prev_mult, prev_target

    def do_bite():
        frm = body[0]
        tail = body.pop()
        body.insert(0, tail)  # tail cell stays WILD, now the head
        steps.append((frm, tail, None, False, body[-1], len(body), snake.target, snake.mult, True, None))

    def candidates():
        head = body[0]
        bodyset = set(body)
        prev_dir = head - body[1] if len(body) > 1 else None
        out = []
        need_seek = bias_seek != 1.0
        d0 = _nearest_pearl_dist(board, head) if need_seek else 0
        for nb in NEIGH[head]:
            if nb in bodyset:
                continue
            w = 1.0
            if prev_dir is not None and nb - head == prev_dir:
                w *= bias_straight
            if board[nb] >= PEARL:
                w *= bias_pearl
            elif need_seek and d0 < 99:
                if _nearest_pearl_dist(board, nb) < d0:
                    w *= bias_seek
            if bias_tail != 1.0 and len(body) >= MIN_BITE_LEN - 1 and body[-1] in NEIGH[nb]:
                w *= bias_tail
            if seek_tail != 1.0 and len(body) >= MIN_BITE_LEN and len(body) == snake.target:
                t = body[-2]
                if abs(REEL[nb] - REEL[t]) + abs(ROW[nb] - ROW[t]) < abs(REEL[head] - REEL[t]) + abs(ROW[head] - ROW[t]):
                    w *= seek_tail
            out.append((nb, w))
        return out

    def weighted_order(cands):
        cands = list(cands)
        order = []
        while cands:
            tot = sum(w for _, w in cands)
            x = rng.random() * tot
            acc = 0.0
            for j, (c, w) in enumerate(cands):
                acc += w
                if x < acc or j == len(cands) - 1:
                    order.append(c)
                    cands.pop(j)
                    break
        return order

    def rec(left):
        if left == 0:
            return future == 0 or has_future(body, snake.target, future)
        nodes[0] += 1
        if nodes[0] > budget:
            raise PathBudgetExceeded
        can_bite = bite_qualifies(snake)
        if can_bite and rng.random() < p_bite:
            do_bite()
            if future == 0 or has_future(body, snake.target, future):
                return True
            steps.pop()
            body.append(body.pop(0))
        for c in weighted_order(candidates()):
            u = do_step(c)
            if rec(left - 1):
                return True
            undo_step(u)
        if can_bite:
            do_bite()
            if future == 0 or has_future(body, snake.target, future):
                return True
            steps.pop()
            body.append(body.pop(0))
        return False

    try:
        ok = rec(n)
    except PathBudgetExceeded:
        ok = False
    if not ok:
        return None  # state may be partially modified; callers use generate_path_safe
    return steps, bool(steps and steps[-1][8])


def generate_path_safe(rng, board, snake: Snake, n: int, prm: dict, budget: int = 20000, future: int = 0):
    """Like generate_path but works on copies so a failure leaves inputs untouched."""
    b2 = list(board)
    s2 = snake.copy()
    res = generate_path(rng, b2, s2, n, prm, budget, future)
    if res is None:
        return None
    board[:] = b2
    snake.body, snake.target, snake.mult = s2.body, s2.target, s2.mult
    return res


def constrict(board, snake: Snake):
    """Apply OUROBOROS constrict after a bite (SPEC 6.3). Returns (enclosed, crushed, symbol, mult_before)."""
    ring = set(snake.body)
    enc = enclosed_cells(ring)
    crushed = [board[i] for i in enc]
    regs = [c for c in crushed if c < NREG]
    x = min(regs) if regs else H1
    for i in enc:
        board[i] = x
    mb = snake.mult
    snake.mult *= 2
    return enc, crushed, x, mb


def snake_entry(rng, length: int):
    """Hunt entry (SPEC 8.1): tail on a border cell, first step inward, self-avoiding body.

    Returns (body head-first, edge name)."""
    for _ in range(1000):
        edge = ("left", "right", "top", "bottom")[int(rng.random() * 4)]
        k = int(rng.random() * 7)
        if edge == "left":
            tail, inward = cell_index(0, k), ROWS
        elif edge == "right":
            tail, inward = cell_index(COLS - 1, k), -ROWS
        elif edge == "top":
            tail, inward = cell_index(k, 0), 1
        else:
            tail, inward = cell_index(k, ROWS - 1), -1
        path = [tail, tail + inward]
        ok = True
        while len(path) < length:
            cur = path[-1]
            opts = [n for n in NEIGH[cur] if n not in path]
            # keep the entering body loosely straight: prefer continuing direction
            d = cur - path[-2]
            w = [3.0 if n - cur == d else 1.0 for n in opts]
            if not opts:
                ok = False
                break
            tot = sum(w)
            x = rng.random() * tot
            acc = 0.0
            for n, ww in zip(opts, w):
                acc += ww
                if x < acc:
                    path.append(n)
                    break
            else:
                path.append(opts[-1])
        if ok:
            return list(reversed(path)), edge
    raise RuntimeError("could not place entering snake")


# ----------------------------------------------------------------------------------------------------
# Evaluation (SPEC 7)
# ----------------------------------------------------------------------------------------------------
def evaluate(board, pay):
    """Wild-aware cluster evaluation. Returns (total_tenths_before_mult, clusters).

    clusters: list of (sym, cells(list), size, wild_count, pay_tenths)."""
    clusters = []
    total = 0
    has_wild = WILD in board
    for s in range(NREG):
        cells_s = [i for i in range(NCELLS) if board[i] == s]
        if not cells_s:
            continue
        if not has_wild and len(cells_s) < 5:
            continue
        seen = bytearray(NCELLS)
        for st in cells_s:
            if seen[st]:
                continue
            comp = [st]
            seen[st] = 1
            j = 0
            while j < len(comp):
                c = comp[j]
                j += 1
                for n in NEIGH[c]:
                    if not seen[n]:
                        b = board[n]
                        if b == s or b == WILD:
                            seen[n] = 1
                            comp.append(n)
            size = len(comp)
            if size >= 5:
                p = pay[s][size]
                nw = sum(1 for c in comp if board[c] == WILD)
                clusters.append((s, comp, size, nw, p))
                total += p
    return total, clusters


def overlay_cell(cells):
    mr = sum(REEL[c] for c in cells) / len(cells)
    mw = sum(ROW[c] for c in cells) / len(cells)
    return min(cells, key=lambda c: ((REEL[c] - mr) ** 2 + (ROW[c] - mw) ** 2, c))


# ----------------------------------------------------------------------------------------------------
# Parameters
# ----------------------------------------------------------------------------------------------------
def compile_tables(raw: dict) -> dict:
    """Compile a raw parameter block (plain dicts) into Tables.

    Optional ``tiers``: [(weight, overrides), ...]. A tier is drawn once per feature round (free games)
    or once per egg spin (base), like choosing a reel set; each tier compiles to a full table set."""
    if raw.get("tiers"):
        base_raw = {k: v for k, v in raw.items() if k != "tiers"}
        out = compile_tables(base_raw)
        out["tier_table"] = Table({i: w for i, (w, _) in enumerate(raw["tiers"])})
        out["tier_sets"] = [compile_tables({**base_raw, **ov}) for _, ov in raw["tiers"]]
        return out
    t = dict(raw)
    t["symbols"] = Table({NAME_TO_CODE[k]: v for k, v in raw["symbols"].items()})
    t["key_count"] = Table({int(k): v for k, v in raw["key_count"].items()})
    t["pearl_count"] = Table({int(k): v for k, v in raw["pearl_count"].items()})
    t["pearl_value"] = Table({int(k): v for k, v in raw["pearl_value"].items()})
    t["moves"] = Table({int(k): v for k, v in raw["moves"].items()})
    f = raw.get("fill", raw["symbols"])
    t["fill"] = f if isinstance(f, Table) else Table({NAME_TO_CODE[k]: v for k, v in f.items()})
    t.setdefault("p_egg", 0.0)
    t.setdefault("bias_tail", 1.0)
    return t


def pick_tier(rng, tables):
    """Return (tier_index, tables_for_tier); (None, tables) if the block has no tiers."""
    if "tier_table" not in tables:
        return None, tables
    i = tables["tier_table"].draw(rng)
    return i, tables["tier_sets"][i]
