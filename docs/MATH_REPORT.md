# CONSTRICTOR: Math Report

Math version **v1** · generated 2026-09-29 23:32 UTC by `math/make_report.py`.
Every number below comes from these commands (run from `/math`):

```
env/bin/python games/constrictor/run.py          # books (math-sdk) + LUT weighting + configs + SDK RGS checks
env/bin/python verify_constrictor.py             # independent replay of every book + all statistics
env/bin/python make_report.py                    # this file
env/bin/pytest tests -q                          # unit tests
```

RTP is **exact**, computed from the published LUT (integer weights × payouts). The Monte-Carlo figure is a
cross-check that samples rounds by weight (200,000 draws, 95 % CI).

## 1. Summary per mode

| | BASE | SERPENT CALL (ante) | THE HUNT (buy) | VENOM HUNT (buy) |
|---|---|---|---|---|
| Cost (× bet) | 1× | 2.5× | 100× | 700× |
| Books (simulations) | 1,000,000 | 1,000,000 | 250,000 | 250,000 |
| Books replayed OK / failed | 1,000,000 / 0 | 1,000,000 / 0 | 250,000 / 0 | 250,000 / 0 |
| **RTP (exact, LUT)** | **96.00000 %** | **96.00000 %** | **96.00000 %** | **96.00000 %** |
| RTP (Monte-Carlo, 95 % CI) | 94.07 % ± 8.03 | 106.10 % ± 19.75 | 94.69 % ± 2.05 | 96.26 % ± 0.77 |
| Max win | 25,000× | 25,000× | 25,000× | 25,000× |
| Max-win frequency | 1 in 1,241,198 | 1 in 239,236 | 1 in 6,190 | 1 in 1,366 |
| Capped rounds (clipped) | 0.00008 % | 0.00042 % | 0.01616 % | 0.07322 % |
| Hit rate (win > 0) | 29.47 % (1 in 3.39) | 30.66 % (1 in 3.26) | 100.00 % (1 in 1.00) | 100.00 % (1 in 1.00) |
| Std dev (per unit cost) | 33.86 | 28.62 | 4.87 | 1.75 |
| Feature frequency | 1 in 250 | 1 in 48.25 | every round | every round |
| EGG hatch frequency | 1 in 16.02 | 1 in 16.03 | n/a | n/a |
| Rounds with OUROBOROS | 1 in 48,675 | 1 in 10,072 | 1 in 157 | 1 in 2.92 |
| Rounds with a retrigger | 1 in 6,734 | 1 in 1,319 | 1 in 25.97 | 1 in 23.41 |
| Avg final multiplier in feature | ×3.10 | ×3.00 | ×3.20 | ×9.08 |
| Avg spins played in feature | 10.57 | 10.55 | 10.58 | 12.22 |
| Unique payouts / non-zero | 4,494 / 4,493 | 5,883 / 5,882 | 8,539 / 8,539 | 25,182 / 25,182 |
| Zero-weight books | 0 | 0 | 0 | 0 |
| Most likely payout's share | 70.53 % | 69.34 % | 0.56 % | 0.09 % |

**RTP spread across modes: 0.00000 %** (limit 0.5 %).

### RTP split: base spins vs THE HUNT (target 60–65 % / 35–40 % in BASE)


The BASE trigger probability is exact: P(≥ 3 KEYs) = 0.00399600 (1 in 250.25).

### Brief §4.8 targets vs results

| Target | Result | |
|---|---|---|
| RTP 96.00 % in every mode (±0.05 %) | base 96.00000 %, ante 96.00000 %, hunt 96.00000 %, venom 96.00000 % | ✅ |
| Spread between modes ≤ 0.5 % | 0.00000 % | ✅ |
| Max win 25,000× more often than 1 in 10,000,000 in every mode | base 1 in 1,241,198, ante 1 in 239,236, hunt 1 in 6,190, venom 1 in 1,366 | ✅ |
| Base hit rate 25–35 % | 29.47 % | ✅ |
| EGG hatch about 1 in 12–20 | 1 in 16.02 | ✅ |
| THE HUNT from base about 1 in 200–300 | 1 in 250 | ✅ |
| High volatility (std dev per unit cost) | 33.86 | ✅ |
| No gaps in the win distribution (between the smallest and the largest win) | none | ✅ |
| 1M sims base/ante, 250k–500k per buy | base 1,000,000, ante 1,000,000, hunt 250,000, venom 250,000 | ✅ |
| Every book replays to its LUT payout (100 %) | 2,500,000 / 2,500,000 | ✅ |

## 2. Win distribution (share of rounds, by payout in × bet)

| Range | BASE | SERPENT CALL (ante) | THE HUNT (buy) | VENOM HUNT (buy) |
|---|---|---|---|---|
| 0 | 7.053e-01 | 6.934e-01 | 0 | 0 |
| 0-1 | 1.891e-01 | 1.859e-01 | 3.600e-06 | 0 |
| 1-2 | 6.255e-02 | 6.143e-02 | 1.453e-05 | 0 |
| 2-5 | 1.895e-02 | 1.871e-02 | 2.580e-03 | 0 |
| 5-10 | 6.897e-03 | 8.635e-03 | 1.079e-01 | 0 |
| 10-20 | 9.629e-03 | 1.554e-02 | 3.438e-01 | 0 |
| 20-50 | 5.402e-03 | 7.696e-03 | 1.332e-01 | 0 |
| 50-100 | 1.333e-03 | 4.374e-03 | 1.913e-01 | 0 |
| 100-250 | 6.523e-04 | 3.179e-03 | 1.610e-01 | 1.932e-01 |
| 250-500 | 1.416e-04 | 7.055e-04 | 3.840e-02 | 4.494e-01 |
| 500-1000 | 4.789e-05 | 2.429e-04 | 1.410e-02 | 2.309e-01 |
| 1000-2500 | 1.759e-05 | 8.567e-05 | 5.217e-03 | 9.598e-02 |
| 2500-5000 | 4.773e-06 | 2.220e-05 | 1.351e-03 | 2.031e-02 |
| 5000-10000 | 1.828e-06 | 8.595e-06 | 6.415e-04 | 7.116e-03 |
| 10000-25000 | 1.350e-06 | 4.902e-06 | 2.779e-04 | 2.362e-03 |
| 25000 | 8.057e-07 | 4.180e-06 | 1.616e-04 | 7.322e-04 |

## 3. SDK "3-star volatility limits" (secondary targets, REQUIREMENTS §3.3)

| Metric (limit) | BASE | SERPENT CALL (ante) | THE HUNT (buy) | VENOM HUNT (buy) |
|---|---|---|---|---|
| prob5k (≤ 0.01) | 3.984e-06 ✅ | 1.768e-05 ✅ | 0.001081 ✅ | 0.005105 ✅ |
| prob10k (≤ 0.005) | 2.156e-06 ✅ | 9.082e-06 ✅ | 0.0004394 ✅ | 0.001547 ✅ |
| etl40b (≤ 0.9) | 0.3988 ✅ | 1.326 ❌ | 14.19 ❌ | 0 ✅ |
| etl10k (≤ 0.8) | 0.04212 ✅ | 0.1817 ✅ | 8.296 ❌ | 51.92 ❌ |
| cvar (≤ 800) | 287.9 ✅ | 331.3 ✅ | 122.1 ✅ | 34.35 ✅ |

These are warnings in the SDK's upload verifier, not approval rules (REQUIREMENTS §3.3, D-009). `etl40b` and
`etl10k` are not divided by the mode cost, so a 100× or 700× buy with a 25,000× cap exceeds them by construction.
For SERPENT CALL, `etl40b` counts every win ≥ 100× (40 × 2.5), i.e. most Hunt results, which the ante makes 5× more
frequent. Meeting it would need a low-volatility Hunt, against the brief's high-volatility target. Kept and documented.

## 4. LUT weighting (SPEC 12.3, DECISIONS D-017)

| Mode | Books per bucket | Bucket probabilities | Tilt θ | Tail shaping |
|---|---|---|---|---|
| BASE | basegame: 949,500, freegame: 50,000, wincap: 500 | wincap: 2.500e-07, freegame: 3.996e-03, basegame: 9.960e-01 | -0.0010 | none |
| SERPENT CALL (ante) | basegame: 899,500, freegame: 100,000, wincap: 500 | wincap: 1.000e-06, freegame: 2.072e-02, basegame: 9.793e-01 | -0.0157 | none |
| THE HUNT (buy) | freegame: 249,500, wincap: 500 | wincap: 2.000e-05, freegame: 1.000e+00, basegame: 0.000e+00 | +0.0356 | none |
| VENOM HUNT (buy) | freegame: 249,000, wincap: 1,000 | wincap: 1.000e-04, freegame: 9.999e-01, basegame: 0.000e+00 | -0.0193 | none |

## 5. Coverage

- **BASE:** paytable combinations reached 64/64; pearl values seen [1, 2, 3, 5, 10].
- **SERPENT CALL (ante):** paytable combinations reached 64/64; pearl values seen [1, 2, 3, 5, 10].
- **THE HUNT (buy):** paytable combinations reached 64/64; pearl values seen [1, 2, 3, 5, 10].
- **VENOM HUNT (buy):** paytable combinations reached 64/64; pearl values seen [1, 2, 3, 5, 10, 25].

## 6. Verification scope

`verify_constrictor.py` imports no game logic. For every book it validates the JSON schema and replays the
events with an independent rules implementation: board rules (max one EGG, pearls in base only with an EGG, allowed
pearl values per mode, key lists), every snake step (adjacency, no self-entry, growth queue, EMPTY cells, pearl
multiplier and length cap), qualifying bites only (length ≥ 8, no pending growth, encloses a cell, last step), flood-fill
enclosure, constrict symbol, doubling, wild-aware cluster evaluation with its own paytable (cross-checked against the
published frontend config), multiplier application, cap clipping and the wincap event, retrigger awards and the 30-spin
cap, feature totals, and finally that the recomputed payout equals the book's `payoutMultiplier` and the LUT payout.

