# CONSTRICTOR: Game Specification (canonical)

> **This file is canonical.** If code and SPEC disagree, find out which one is wrong, fix it, and log
> the fix in DECISIONS.md. Numeric parameters marked **[P3]** were set during optimisation and are frozen
> at **math v1** (values in §15).

- Studio: **Studio 12** · Working title: **CONSTRICTOR** · Math version: **v2 (2026-09-30, §15; v1 frozen 2026-09-29)**
- Engine: Stake Engine math-sdk `a6dccd8` (vendored in `/math`), web-sdk `1843d60`.

---

## 1. Overview

A 7×7 cluster-pays slot fused with arcade Snake. When an **EGG** lands, a white serpent hatches and
**slithers across the board cell by cell**, following classic Snake rules. It swallows **PEARLs** to
grow and to raise a round **multiplier**, and its **whole body is WILD**. If it bites its own tail
(**OUROBOROS**), the ring **constricts** every cell inside it into a single symbol and the multiplier
**doubles**. Three or more **KEYs** open the vault: **THE HUNT**, free spins where the snake stays on the
board and its length and multiplier carry from spin to spin. A buy-only super bonus, **VENOM HUNT**,
starts with a long snake and a head-start multiplier.

The board never has holes: the moment the snake's tail leaves a cell, a **fresh gem drops into it** (math v2,
D-038). No tumbles (nothing is removed and re-evaluated). No jackpots, no gamble, nothing carries between bets. Every outcome is pre-computed in the
books; the frontend only animates it.

---

## 2. Board, coordinates, symbols

### 2.1 Grid and coordinates
- 7 columns × 7 rows = 49 cells.
- A cell is `{"reel": x, "row": y}` with `x` = column 0..6 left→right, `y` = row 0..6 top→bottom
  (math-sdk naming). Boards in events are arrays of 7 **columns**, each with 7 cells top→bottom:
  `board[reel][row]`.
- Adjacency is **orthogonal only** (up, down, left, right), for clusters, snake moves and enclosure.

### 2.2 Symbols

| Code | Name | Class | Notes |
|---|---|---|---|
| `H1` | Black Opal Eye | high | top symbol |
| `H2` | Serpent Signet Ring | high | |
| `H3` | Venom Vial | high | |
| `H4` | Pocket Watch | high | |
| `L1` | Ruby (pear cut) | low | |
| `L2` | Sapphire (cushion cut) | low | |
| `L3` | Citrine (step cut) | low | |
| `L4` | Amethyst (round brilliant) | low | |
| `EGG` | Serpent Egg | special | base & ante only; max 1 per board; hatches the snake |
| `KEY` | Vault Key | scatter | 3+ trigger THE HUNT; never pays by itself |
| `PEARL` | Pearl, carries `value` | multiplier food | values: 1 White, 2 Gold, 3 Rose, 5 Black, 10 Venom (bonuses only), 25 Venom (Venom Hunt only) |

- **Paying ("regular") symbols:** H1–H4, L1–L4. Their rank for "highest-paying" is
  H1 > H2 > H3 > H4 > L1 > L2 > L3 > L4.
- In events a cell is `{"name": "<code>"}`. A pearl is `{"name": "PEARL", "value": v}`. In a free-spin
  reveal, a cell occupied by the snake is `null`.
- A cell state that only exists during a spin (never in a `reveal`): **SNAKE** (occupied by the body,
  counts as WILD for evaluation). Math v1 also had **EMPTY** (a cell the tail left); since v2 such a cell
  is refilled at once (§5.4), so EMPTY never reaches evaluation.
- There is **no wild symbol**. The snake's body is the wild.

---

## 3. Board generation (the math's cell-draw rules)

Every board is drawn by this algorithm. The weights and tables depend on the **mode** and the
**game type** (`basegame` / `freegame`) and on the distribution criteria (§12), all **[P3]**.

1. **KEYs:** draw a count `k ∈ {0,…,5}` from the key-count table; place the keys in `k` distinct
   uniformly random free cells.
2. **EGG** (basegame only): with probability `pEgg`, place one EGG in a uniformly random free cell.
   **Max 1 EGG per board.**
3. **PEARLs:**
   - basegame: pearls land **only if an EGG landed**. Draw a count from the base pearl-count table.
   - freegame: draw a count from the free-game pearl-count table.

   Place the pearls in random free cells. Each pearl draws its value from the mode/gametype
   pearl-value table (Venom 10 only in free games; Venom 25 only in Venom Hunt).
4. **Regular symbols:** every remaining free cell draws independently from the regular-symbol weight
   table (H1…L4).
5. In free games, cells occupied by the snake are **not** drawn (they stay `null` in the reveal).

---

## 4. Round flow

### 4.1 BASE and SERPENT CALL (ante) spin
1. `reveal` the board (gameType `basegame`). KEYs are **counted now**, before any snake movement.
2. If an EGG landed: **hatch** (§5.2), then the snake makes its moves (§5.3–5.5). If the last move is a
   qualifying bite: **OUROBOROS** (§6).
3. If a snake is on the board: its body cells become WILD (`snakeWild`).
4. **Evaluate** clusters (§7). Spin win = Σ cluster pays × multiplier. Apply the win cap (§9).
5. If a snake was present: `snakeExit` (§5.6). Nothing carries over.
6. If `k ≥ 3` KEYs landed: **THE HUNT** is awarded (§8.1): 3→10, 4→12, 5→15 free spins.
7. `finalWin`.

### 4.2 THE HUNT (bonus buy)
The round starts directly in THE HUNT (`enterBonus`, reason `hunt`). The number of starting keys (3/4/5 →
10/12/15 spins) is drawn from the buy's key table **[P3]**. No base spin is played.

### 4.3 VENOM HUNT (super buy)
The round starts directly in VENOM HUNT (`enterBonus`, reason `venom`): **12 free spins**, snake starts at
**length 8** with a **×2** multiplier (§8.2). No base spin is played.

---

## 5. The Snake

### 5.1 State
- `body`: list of cells, **head first … tail last**. `length = len(body)`.
- `target`: the length the snake is growing toward. Its growth queue is `target − length ≥ 0`.
- `multiplier` `M`: integer ≥ 1, applied to the spin's total cluster win.
- **Length cap `LCAP` = 20.** `target` never exceeds 20. At the cap the snake is "gorged": pearls still
  add to `M`, but it no longer grows.

### 5.2 Hatch (base and ante)
- The snake appears on the EGG's cell: `body = [egg cell]`, `length = 1`, `target = 3`, `M = 1`.
  The EGG is consumed.
- The snake "unfurls" over its first 2 moves (length 1 → 2 → 3) because of the growth queue.
  Eating works normally during these moves.

### 5.3 The MOVES counter
- Before moving, the math announces `moves = N`: basegame **4–10**, free games **4–12** (distribution [P3]).
- The frontend shows N and ticks it down with each step.
- An OUROBOROS bite **ends the snake's movement for that spin**. Any moves left on the counter are
  forfeited, and the rules say so.

### 5.4 Movement rules (classic Snake); one step
1. The head moves one cell up, down, left or right. It may **not** leave the grid.
2. The head may **not** enter a cell occupied by its own body. This also rules out reversing into the
   neck. **Single exception:** the head may enter the **tail tip** cell, and only as a qualifying
   OUROBOROS bite (§6.1). No other move into the tail cell is ever generated.
3. After the head moves:
   - if `length < target`: the tail **stays**, so `length += 1` (growth);
   - else: the tail **advances**. A **fresh gem** drops into the cell the tail leaves at once: one regular
     symbol (H1–L4) drawn from the mode's `fill` weights (the regular-symbol weights, §15.2), never a KEY,
     PEARL or EGG. It is part of this spin's evaluation board (step field `fill`).
4. **Eating:** what was in the cell the head entered:
   - `PEARL(v)`: swallowed. `M += v`; `target = min(target + 1, LCAP)`.
   - H1–L4 (fresh gems included), `KEY`: eaten (covered by the body); no effect on length or multiplier.
     KEYs were already counted at landing.
5. Pearls the snake never reaches do nothing, pay nothing, and do not form clusters.
6. **The math generates the entire path.** Every generated path has exactly `N` legal steps, or ends
   earlier only with a bite. The frontend never chooses a move.

> Consequence of step 3: a swallowed pearl makes the snake one segment longer on the **next** step that
> the growth queue is served, which is immediately unless unfurl growth is still pending. The swallow
> bulge the frontend animates travels to the tail and the tail extends one cell.

### 5.5 Path generation (math-internal, not a player-facing rule)
A randomized depth-first search over legal steps, with per-candidate weights
`w = biasStraight (same direction) × biasPearl (cell holds a pearl) × biasSeek (step gets closer to the
nearest pearl) × biasTail (length ≥ 7 and the cell touches the tail) × seekTail (length ≥ 8, no pending
growth, step gets closer to the tail)`. If a partial path cannot be completed to `N` steps, the search
backtracks. At each step where a qualifying bite is legal, it is taken with probability `pBite`
(otherwise only if no other move exists). All bias parameters are part of the draw tables **[P3]**.
- **Never boxed in (free games):** a path is accepted only if its final shape still leaves a
  *pearl-proof* continuation, i.e. a self-avoiding walk of 12 cells from the head that avoids the whole body.
  That walk stays legal whatever the next board holds. If none exists for any drawn N, the guarantee
  relaxes to 8, then to 4 (the minimum counter), then to none with the shortest counters. If the snake
  still cannot move (never observed in natural play, ~1 in 10⁴ under the boosted max-win search), the
  generator discards the round and draws again. So every published book has a legal path.
- N is always announced **after** a valid path exists.
- **Pearl tiers:** each base egg spin, and each feature round, first draws a hidden pearl *tier*
  (like choosing a reel set). The tier selects the pearl count/value tables and walk biases for that spin
  or round. This makes the pearl supply lumpy (most hatchlings and hunts are lean, a few are rich) without
  changing any rule.

### 5.6 End of a base-game spin
After evaluation the hatchling slithers off the board (`snakeExit`), tail first, and a fresh gem drops into
each cell it uncovers (`snakeExit.fill`, in that order). The spin's win is already counted, so these gems are
drawn so that **each differs from every orthogonal neighbour** (already-filled ones included): none can form
or extend a cluster, so the board never shows an unpaid win. After a max win there is no exit fill (the vault
stays empty). Nothing carries over.

Presentation (§13, D-044): the frontend keeps the hatchling on the board after the round and does not draw the
exit fill; the next reveal replaces the whole board. The book still carries `snakeExit.fill` (math unchanged).

---

## 6. OUROBOROS

### 6.1 Qualifying bite
A step where the head moves into the current **tail** cell is an OUROBOROS bite if and only if:
1. `length ≥ 8`, and
2. `length == target` (no pending growth, so the tail advances on this step), and
3. the resulting ring **encloses at least one cell** (§6.2).

After the bite, `body = [old tail cell] + body[:-1]`. All `length` cells form a closed simple cycle,
the **ring**. The bite is always the snake's last step of the spin (§5.3).

### 6.2 Enclosure (flood fill)
- `ring` = the set of body cells after the bite.
- Flood-fill (orthogonal) from every **border** cell of the grid that is not a ring cell. Every
  non-ring cell the fill cannot reach is **enclosed**.
- Rings that touch or run along the walls follow the same rule: ring cells on the border are not
  starting points, so the space inside a ring built against a wall is enclosed.

### 6.3 Constrict
1. The chosen symbol `X` is the **highest-paying regular symbol** (by §2.2 rank) found in any enclosed
   cell. If no enclosed cell holds a regular symbol, **X = H1**.
2. **Every enclosed cell** becomes `X`, whatever it held: a regular symbol (fresh gems included), KEY or
   uneaten PEARL.
   (Pearls crushed this way give no multiplier.)
3. `M ← M × 2`.
4. The ring is the snake body, so it is WILD for this spin's evaluation.
5. The snake then releases its tail. In free games it keeps its length, `target` and `M`, and moves on
   from the ring shape next spin.

Several OUROBOROS events can happen in one bonus round, at most one per spin. Each one doubles `M`.

---

## 7. Evaluation (cluster pays with a wild snake)

### 7.1 Evaluation grid
After the moves (and any constrict): SNAKE cells → **WILD**. KEY and uneaten PEARL cells are
**blockers** (not wild, never paying). EGG never survives to evaluation. Every other cell holds its regular symbol.

### 7.2 Clusters
For each regular symbol `S` in H1…L4, independently:
1. Take the cell set `C_S = {cells holding S} ∪ {WILD cells}`.
2. Find its orthogonally connected components.
3. A component **pays** if it contains **at least one real `S` cell** and its size (S cells + wild
   cells) is **≥ 5**.

Consequences (stated in the rules):
- A wild cell can count toward clusters of **several different symbols** in the same spin.
- A group made **only** of wild cells does not pay.
- Two groups of the same symbol joined through wild cells form **one** cluster.

### 7.3 Paytable (× bet): values in §15.1
Size bands: **5, 6, 7, 8, 9–10, 11–12, 13–15, 16+**. Every value is a multiple of 0.1× (REQUIREMENTS §3.2).

### 7.4 Spin win
`spinWin = M × Σ pay(S, size)` over all paying clusters. With integer `M` and 0.1× pays, every spin
win is a multiple of 0.1×. The math works in **integer tenths of a bet** internally.
With no snake on the board, `M = 1`.

---

## 8. Free spins

### 8.1 THE HUNT
- **Trigger:** 3 / 4 / 5 KEYs anywhere on a base or ante board → **10 / 12 / 15** free spins
  (5 is the maximum number of KEYs that can land).
- **Start:** the snake **enters from a grid edge** at length 3 with `M = ×1` (`snakeEnter`). Its tail cell
  is on the grid border; the body leads inward along a self-avoiding path.
- **Each free spin:**
  1. `updateFreeSpin`.
  2. New symbols drop into **every non-snake cell** (`reveal`, gameType `freegame`, `null` at snake
     cells). KEYs are counted now.
  3. The snake makes **4–12** moves (§5.3–5.5), with a possible OUROBOROS on the last move.
  4. `snakeWild`, evaluation, win cap check.
  5. **Retrigger:** if 3 or more KEYs landed in step 2, **+5 spins**, up to **30 spins in total**
     (the award is `min(5, 30 − total)`; nothing is awarded when the total is already 30).
- **Persistence within the round:** the snake's position, length, growth queue and `M` carry from spin
  to spin. **`M` never resets during the feature.**
- Pearls land more often than in the base game, and **Venom Pearls (+10)** can appear.
- **End:** `freeSpinEnd` (summary screen: the Hunt total).

### 8.2 VENOM HUNT (buy only)
The same as THE HUNT except:
- **12 free spins**. Retriggers work exactly as in THE HUNT (+5, max 30 total).
- The snake enters at **length 8** with **M = ×2**. (The brief's ×5 did not balance: a length-8 wild snake pays ~15× per spin before the multiplier. Following the brief, the cost rises instead of the mechanic changing; see D-015.)
- Venom Pearls **+10 and +25** are both enabled.
- OUROBOROS is more likely (the snake is long from the start; `pBite` [P3]).

---

## 9. Win cap

- **Max win: 25,000× the base bet in every mode** (the buy cost does not scale it).
- The running round total is checked after **every** spin's evaluation. When it reaches or exceeds the
  cap, the spin win is **clipped** so the total equals exactly 25,000× and an explicit **`wincap`**
  event is emitted (with the uncapped amount). The round then **ends immediately**. Any remaining free
  spins are forfeited (stated in the rules).
- The clipping is part of the books' `payoutMultiplier`, so it is part of the RTP computed from the LUT.
- The verifier checks the cap against the theoretical maximum per mode and reports the capped fraction.

---

## 10. Bet modes (4)

| Mode id | Name | Cost | What it does |
|---|---|---|---|
| `base` | BASE | 1× | Normal play. |
| `ante` | SERPENT CALL | **2.5×** | Same as BASE, but the KEY chance is raised: THE HUNT triggers ×4.90 as often (1 in 51.05 vs 1 in 250.25). EGG chance unchanged. |
| `hunt` | THE HUNT | **100×** | Starts THE HUNT immediately; 3/4/5-key start weighted 3.4 : 0.5 : 0.1. |
| `venom` | VENOM HUNT | **700×** | Starts VENOM HUNT immediately (brief ~400×; cost follows the math, D-015). |

- RTP target **96.00 % in every mode** (hard limits 90–98 %, spread ≤ 0.5 %; aim ±0.05 %).
- Max win **25,000×** in every mode.
- Ante costs more than 2×, so switching it on needs a confirmation step (REQUIREMENTS §5). Both buys also need confirmation.

---

## 11. Book event schema

Compact encoding (book size, DECISIONS D-016). All amounts are integers in **hundredths of the base
bet** (`100` = 1×), the same unit as `payoutMultiplier`. Every amount is a multiple of 10. Each event
has `index` (its position in `events`, used by the web-sdk) and `type`. The machine-readable JSON Schema is
`math/games/constrictor/schema/book.schema.json`. Every book is validated against it (P3).

**Cells** are `[reel, row]`. **Symbols** are strings: `H1`…`L4`, `KEY`, `EGG`, pearls `P1` `P2` `P3`
`P5` `P10` `P25` (value after the P), `EMPTY` (math v1 only, in `crushed`), and `null` for a snake-occupied cell in a
free-spin reveal. Boards are `board[reel][row]` (7 columns × 7 rows, top to bottom).

| type | Fields | When |
|---|---|---|
| `reveal` | `board`, `gameType` (`basegame`/`freegame`), `keys` (list of KEY cells) | every spin |
| `hatch` | `at` (egg cell). The snake starts: length 1, target 3, mult 1 | base/ante spin with an EGG |
| `enterBonus` | `reason` (`hunt`/`venom`) | first event of a buy round |
| `freeSpinTrigger` | `totalFs`, `keys` (count 3–5; 0 for Venom), `positions` (key cells; `[]` for buys) | feature start |
| `snakeEnter` | `body` (head→tail; tail on the border), `edge` (`left/right/top/bottom`), `mult`. target = length | feature start |
| `updateFreeSpin` | `amount` (spin number, 1-based), `total` | before each free spin |
| `snakeMoves` | `moves` (N on the counter), `steps[]` | whenever a snake is on the board |
| `ouroboros` | `ring` (head→tail), `enclosed`, `crushed` (prior contents of `enclosed`), `symbol` (X), `multFrom`, `mult` | after a biting `snakeMoves` |
| `snakeWild` | `cells` (all body cells, head→tail), `mult` | before evaluation, when a snake is present |
| `winInfo` | `totalWin`, `wins[]`: `{symbol, clusterSize, win, positions, meta:{globalMult, winWithoutMult, wildCount, overlay}}` | spin with ≥ 1 paying cluster |
| `setWin` | `amount` (spin win after clipping), `winLevel` | spin with win > 0 |
| `setTotalWin` | `amount` (running round total, capped) | after every spin's evaluation |
| `wincap` | `amount` (= 2,500,000), `uncappedAmount` | when the cap is reached; the round ends |
| `freeSpinRetrigger` | `totalFs`, `added`, `keys` (count), `positions` | 3+ KEYs in a free spin, if spins can still be added |
| `snakeExit` | `fill` (`[{at, sym}]`, tail first; `[]` after a max win) | end of a base/ante spin that had a snake |
| `freeSpinEnd` | `amount` (feature total, capped), `winLevel` | end of a feature |
| `finalWin` | `amount` (= `payoutMultiplier`) | last event of every book |

`snakeMoves.steps[i]`: `from`, `to` (head before/after), `eat` (contents of `to` before entry: a symbol
code, or `null` for the tail cell of a bite), `len` and `mult` (state after the step, pearl added),
`grow: true` only when the tail stayed, `bite: true` only on a qualifying OUROBOROS step (always the last
step), `fill` (the fresh gem that dropped into the cell the tail left; present exactly when the tail advanced). The tail and the growth queue are implied by the step sequence (§5.4). The verifier
reconstructs them.

`winLevel` (presentation tiers, × base bet): 0 = below 15×, 1 = STRIKE ≥ 15×, 2 = CONSTRICT ≥ 50×,
3 = DEVOUR ≥ 150×, 4 = APEX PREDATOR ≥ 500×, 5 = THE VAULT IS EMPTY (max win).

Event order, base spin with an egg: `reveal → hatch → snakeMoves → (ouroboros) → snakeWild → (winInfo →
setWin) → setTotalWin → (wincap) → snakeExit (with its fill) → (freeSpinTrigger → snakeEnter → [updateFreeSpin → reveal →
snakeMoves → (ouroboros) → snakeWild → (winInfo → setWin) → setTotalWin → (wincap | freeSpinRetrigger)]* →
freeSpinEnd) → finalWin`. Buy rounds start with `enterBonus → freeSpinTrigger → snakeEnter …`.

---

## 12. Math plan

### 12.1 Implementation (math-sdk, `/math/games/constrictor/`)
- `game_config.py`: symbols, paytable, per-mode tables, bet modes, distributions.
- `engine.py`: **pure** functions: board draw, snake step/path generator, flood-fill enclosure,
  constrict, wild-aware cluster evaluation. Works in integer tenths.
- `gamestate.py` / `game_override.py` / `game_events.py`: math-sdk `GeneralGameState` subclass that
  runs rounds, emits the §11 events, uses `WinManager`, records force keys, clips at the cap.
- `run.py`: the SDK flow `create_books` → weighting (§12.3) → `generate_configs` → `execute_all_tests`.
- `schema/book.schema.json`: the event schema.
- Tests (`math/tests/`, pytest): movement legality, growth and length cap, flood-fill edge cases
  (rings against walls and in corners), wild sharing between clusters, wild-only groups not paying,
  multiplier application, doubling, retrigger cap, cap clipping, 0.1× granularity.

### 12.2 Distribution criteria (math-sdk `Distribution`)
- `base` / `ante`: `wincap` (forced trigger + forced cap, boosted feature conditions), `freegame`
  (forced trigger ≥ 3 KEYs), `basegame` (a natural spin conditioned on no trigger; may be zero or a win).
- `hunt` / `venom`: `wincap` (forced cap, boosted conditions), `freegame` (natural feature).
- "Boosted conditions" change only the math's draw tables and walk biases (more pearls, higher bite
  chance) inside the same rules, so every book is a legal outcome. The book's **LUT weight** sets its
  real probability.

### 12.3 Weighting (LUT optimisation)
The LUT weights **define** the probability of every book. Method (primary):
1. **Bucket quotas:** each criteria bucket gets a target probability:
   - `freegame` = the natural trigger probability from the key table (computed exactly);
   - `wincap` = a chosen max-win frequency (≥ 1 in 10M);
   - `basegame` = the remainder.
2. Inside a bucket, weights are uniform by default (the natural distribution of sampled outcomes).
3. **Exact RTP to 96.00 %:** a one-parameter exponential tilt `w_i ∝ exp(θ·win_i)` inside the
   `freegame` bucket (and, if needed, the `basegame` bucket), solved by bisection so the LUT RTP equals
   the target to < 1e-6. The tilt is kept small (reported), and the game parameters are tuned so the
   natural RTP is already close.
4. Integer weights (uint64), with every book weight ≥ 1 (no zero-weight books).

The math-sdk Rust optimizer (PigFarm) was built and tested in P0. It can be used as an alternative; if
it is, that is recorded in DECISIONS.

### 12.4 Targets (brief §4.8)
| Target | Value |
|---|---|
| RTP | 96.00 % every mode (±0.05 %) |
| Max win | 25,000×, frequency better than 1 in 10M in every mode |
| Base hit rate | 25–35 % |
| EGG hatch (base) | 1 in 12–20 spins |
| THE HUNT from base | 1 in 200–300 spins |
| Base RTP split | 60–65 % base spins / 35–40 % Hunt |
| Volatility | high; std dev reported per mode |
| Distribution table | 0, 0–1, 1–2, 2–5, 5–10, 10–20, 20–50, 50–100, 100–250, 250–500, 500–1k, 1k–2.5k, 2.5k–5k, 5k–10k, 10k–<25k, 25k |
| Sims | base 1,000,000; ante 1,000,000; hunt & venom 250k–500k |
| Secondary | SDK 3-star limits (REQUIREMENTS §3.3) |

### 12.5 Independent verification (`math/verify_constrictor.py`, imports none of the game logic)
- Exact RTP per mode from the LUT (weights × payouts), plus a Monte-Carlo cross-check with 95 % CI.
- **Replays every book from its events alone**: rebuilds the board, the snake body step by step,
  enclosure and constrict, the evaluation grid and clusters, the pays × multiplier, the cap. The
  recomputed payout must equal the LUT payout for **100 % of books**.
- Asserts every movement rule (§5.4, §6.1) on every step.
- Reports hit rate, max-win frequency, capped fraction, std dev, distribution table, bonus frequency,
  average multiplier in the features, reachability of every paytable entry and special value, and the
  SDK 3-star metrics.

---

## 13. Presentation-only rules (frontend)

- Win tiers (§11 `winLevel`): 15× **STRIKE**, 50× **CONSTRICT**, 150× **DEVOUR**, 500× **APEX PREDATOR**,
  max **THE VAULT IS EMPTY**. The counters count up and can be skipped with a tap or spacebar.
- Anticipation: once 2 KEYs have landed during the drop, the guardian's eye opens, the lights dim and
  a heartbeat plays. The frontend reads this from the reveal board (presentation only).
- End of a base game round (D-044): the hatchling stays where it finished (breathing, flicking its tongue,
  win outlines kept) until the next spin starts, then fades as the new board drops (or as THE HUNT starts).
  `snakeExit.fill` is not drawn: those cells stay under the snake and the next reveal replaces the board.
  The Hunt's snake does the same when the feature ends (`freeSpinEnd`, D-049), so its cells never show as holes.
- The frontend never decides outcomes and never uses `Math.random()` for results. Randomness is allowed
  only for cosmetics (dust, particles).

---

## 14. Player-facing rules text
Maintained in `frontend/apps/constrictor/src/i18n/en.ts` (rules section). Final text is copied into
`docs/SUBMISSION.md` in P9. It must state every rule in §4–§10, the paytable, all pearl values, the
multiplier effects, trigger and retrigger conditions, the cap/forfeit rule, RTP and max win per mode,
the UI guide, and the disclaimer.

---

## 15. Parameters (math v2): 2026-09-30

Source of truth: `math/games/constrictor/params.py` (`MATH_VERSION = "v2"`). v2 = v1 plus the trail refills
(§5.4, §5.6; D-038), paid for by the paytable × 0.83 and a slightly lower SERPENT CALL KEY chance. Changing any value below
requires new books, new LUTs and a new verification run. Measured results (RTP, hit rates, feature
frequencies, distribution, SDK metrics) are in `docs/MATH_REPORT.md`, generated from the verifier output.

### 15.1 Paytable (× bet), size bands 5 · 6 · 7 · 8 · 9–10 · 11–12 · 13–15 · 16+

| Sym | 5 | 6 | 7 | 8 | 9–10 | 11–12 | 13–15 | 16+ |
|---|---|---|---|---|---|---|---|---|
| H1 | 1.8 | 2.2 | 2.7 | 3.2 | 3.7 | 4.5 | 5.4 | 7.1 |
| H2 | 1.3 | 1.7 | 2.0 | 2.3 | 2.7 | 3.2 | 4.1 | 5.4 |
| H3 | 1.1 | 1.2 | 1.5 | 1.8 | 2.2 | 2.5 | 3.2 | 4.1 |
| H4 | 0.9 | 1.1 | 1.2 | 1.4 | 1.8 | 2.2 | 2.7 | 3.6 |
| L1 | 0.7 | 0.8 | 0.9 | 1.1 | 1.3 | 1.6 | 2.0 | 2.7 |
| L2 | 0.6 | 0.7 | 0.8 | 0.9 | 1.1 | 1.2 | 1.6 | 2.2 |
| L3 | 0.4 | 0.5 | 0.7 | 0.8 | 0.9 | 1.1 | 1.3 | 1.8 |
| L4 | 0.3 | 0.4 | 0.5 | 0.7 | 0.8 | 0.9 | 1.1 | 1.4 |

Flat top end on purpose: a long wild snake joins nearly every neighbour into one cluster, so the
multiplier, not the size band, drives the big wins (D-013).

### 15.2 Cell draws
- Regular symbol weights (every mode, every game type): H1 6 · H2 7 · H3 8 · H4 9 · L1 11 · L2 12 · L3 13 · L4 14.
- Fresh gems (trail and exit refills, `fill`): the same weights (exit refills redraw any gem that matches a
  neighbour, §5.6).
- KEY count {0,1,2,3,4,5}: base 900 · 85 · 12 · 3.4 · 0.5 · 0.1 (P(≥3) = 4.0/1001.0 = 1 in 250.25);
  SERPENT CALL 900 · 85 · 12 · 17.0 · 2.45 · 0.47 (P(≥3) = 19.92/1016.92 = 1 in 51.05, ×4.90);
  free spins 800 · 150 · 30 · 3 · 0.5 · 0.1 (retrigger P(≥3) = 3.6/984.1 per spin).
- EGG (base and ante): p = 1/16 per spin.
- Base pearls (only with an EGG), count {0..4}: 25 · 35 · 25 · 10 · 5; values {1,2,3,5}: 50 · 25 · 15 · 10.
- MOVES: base {4..10}: 10 · 15 · 18 · 18 · 15 · 12 · 10; free spins {4..12}: 8 · 10 · 12 · 13 · 13 · 12 · 11 · 10 · 11.

### 15.3 Pearl tiers (hidden, drawn once per base egg spin / once per feature)

| Where | Tier (weight) | Pearl count | Pearl values | Other |
|---|---|---|---|---|
| Base egg spin | lean (98) | as 15.2 | as 15.2 | |
| | rich (2) | {4..7}: 20 · 35 · 30 · 15 | {1,2,3,5}: 70 · 20 · 7 · 3 | moves {8,9,10}: 20 · 30 · 50; biasPearl 8, biasSeek 5 |
| THE HUNT | lean (85.5) | {0,1,2}: 85 · 14 · 1 | {1,2,3,5}: 55 · 30 · 12 · 3 | |
| | normal (12) | {0..3}: 65 · 28 · 6 · 1 | {1,2,3,5,10}: 50 · 30 · 12 · 6 · 2 | |
| | rich (2.5) | {0..4}: 15 · 35 · 30 · 15 · 5 | {1,2,3,5,10}: 70 · 18 · 7 · 3 · 2 | biasPearl 4, biasSeek 2.5 |
| VENOM HUNT | single | {0,1,2}: 80 · 17 · 3 | {1,2,3,5,10,25}: 60 · 25 · 10 · 3 · 1.5 · 0.5 | biasTail 1.5, seekTail 1.5, pBite 0.5 |

### 15.4 Snake walk (math-internal, §5.5)
biasStraight 1.5 · biasPearl 4.0 · biasSeek 2.0 · biasTail 4.0 · seekTail 3.0 · pBite 0.9 (tier and mode
overrides above). Pearl-proof lookahead 12 → 8 → 4 → none. LCAP 20, minimum bite length 8.

### 15.5 Features and modes
- THE HUNT: 3/4/5 KEYs → 10/12/15 spins; retrigger +5; max 30 spins; snake enters at length 3, ×1.
- VENOM HUNT: 12 spins; snake enters at length 8, ×2; retrigger as THE HUNT.
- Hunt buy start keys {3,4,5}: 3.4 · 0.5 · 0.1 (the same relative odds as a natural trigger).
- Costs: BASE 1× · SERPENT CALL 2.5× · THE HUNT 100× · VENOM HUNT 700× (the brief's ~400× did not pay
  back at ×2 with length 8; the cost follows the math, D-015).

### 15.6 Simulation and weighting
- Books: base 1,000,000 · ante 1,000,000 · hunt 250,000 · venom 250,000.
- Simulation criteria quotas (book counts only, not probabilities): base wincap 0.05 % / freegame 5 %;
  ante wincap 0.05 % / freegame 10 %; hunt wincap 0.2 %; venom wincap 0.4 %. Max-win books are searched
  under boosted draws (same rules).
- LUT weighting (D-017): exact bucket probabilities: P(freegame) = the KEY-table trigger probability
  (1 for buys), P(max win) = 1 in 4,000,000 (base), 1 in 1,000,000 (ante), 1 in 50,000 (hunt),
  1 in 10,000 (venom). Natural weights within buckets, one power tilt (1 + payout)^θ on the freegame
  bucket, solved for RTP = 96.00 %. Integer weights summing to ≈ 2⁵³. θ (v2): base −0.0175, ante −0.0320,
  hunt −0.0063, venom −0.0257 (v1: −0.0010, −0.0157, +0.0356, −0.0193).
