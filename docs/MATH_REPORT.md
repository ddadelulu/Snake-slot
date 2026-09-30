# CONSTRICTOR: Math Report

Math version **v2** · generated 2026-09-30 23:37 UTC by `math/make_report.py`.
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
| RTP (Monte-Carlo, 95 % CI) | 92.54 % ± 5.71 | 102.38 % ± 14.74 | 95.25 % ± 1.75 | 96.52 % ± 0.75 |
| Max win | 25,000× | 25,000× | 25,000× | 25,000× |
| Max-win frequency | 1 in 1,215,637 | 1 in 294,090 | 1 in 10,308 | 1 in 1,570 |
| Capped rounds (clipped) | 0.00008 % | 0.00034 % | 0.00970 % | 0.06368 % |
| Hit rate (win > 0) | 29.96 % (1 in 3.34) | 31.05 % (1 in 3.22) | 100.00 % (1 in 1.00) | 100.00 % (1 in 1.00) |
| Std dev (per unit cost) | 29.82 | 25.61 | 4.21 | 1.68 |
| Feature frequency | 1 in 250 | 1 in 51.05 | every round | every round |
| EGG hatch frequency | 1 in 16.02 | 1 in 16.03 | n/a | n/a |
| Rounds with OUROBOROS | 1 in 45,632 | 1 in 10,179 | 1 in 194 | 1 in 2.91 |
| Rounds with a retrigger | 1 in 6,838 | 1 in 1,420 | 1 in 27.11 | 1 in 23.66 |
| Avg final multiplier in feature | ×3.04 | ×2.98 | ×3.01 | ×9.10 |
| Avg spins played in feature | 10.56 | 10.54 | 10.57 | 12.22 |
| Unique payouts / non-zero | 4,765 / 4,764 | 6,190 / 6,189 | 8,723 / 8,723 | 24,901 / 24,901 |
| Zero-weight books | 0 | 0 | 0 | 0 |
| Most likely payout's share | 70.04 % | 68.95 % | 0.57 % | 0.11 % |

**RTP spread across modes: 0.00000 %** (limit 0.5 %).

### RTP split: base spins vs THE HUNT (target 60–65 % / 35–40 % in BASE)

- **BASE:** base spins 60.20 % · THE HUNT 39.80 % of the mode's RTP.
- **SERPENT CALL (ante):** base spins 24.08 % · THE HUNT 75.92 % of the mode's RTP.

The BASE trigger probability is exact: P(≥ 3 KEYs) = 0.00399600 (1 in 250.25).

### Brief §4.8 targets vs results

| Target | Result | |
|---|---|---|
| RTP 96.00 % in every mode (±0.05 %) | base 96.00000 %, ante 96.00000 %, hunt 96.00000 %, venom 96.00000 % | ✅ |
| Spread between modes ≤ 0.5 % | 0.00000 % | ✅ |
| Max win 25,000× more often than 1 in 10,000,000 in every mode | base 1 in 1,215,637, ante 1 in 294,090, hunt 1 in 10,308, venom 1 in 1,570 | ✅ |
| Base hit rate 25–35 % | 29.96 % | ✅ |
| EGG hatch about 1 in 12–20 | 1 in 16.02 | ✅ |
| THE HUNT from base about 1 in 200–300 | 1 in 250 | ✅ |
| Base RTP split ≈ 60–65 % base spins / 35–40 % Hunt | 60.20 % / 39.80 % | ✅ |
| High volatility (std dev per unit cost) | 29.82 | ✅ |
| No gaps in the win distribution (between the smallest and the largest win) | none | ✅ |
| 1M sims base/ante, 250k–500k per buy | base 1,000,000, ante 1,000,000, hunt 250,000, venom 250,000 | ✅ |
| Every book replays to its LUT payout (100 %) | 2,500,000 / 2,500,000 | ✅ |

## 2. Win distribution (share of rounds, by payout in × bet)

| Range | BASE | SERPENT CALL (ante) | THE HUNT (buy) | VENOM HUNT (buy) |
|---|---|---|---|---|
| 0 | 7.004e-01 | 6.895e-01 | 0 | 0 |
| 0-1 | 2.095e-01 | 2.062e-01 | 0 | 0 |
| 1-2 | 4.714e-02 | 4.633e-02 | 0 | 0 |
| 2-5 | 1.769e-02 | 1.738e-02 | 0 | 0 |
| 5-10 | 6.822e-03 | 6.806e-03 | 3.500e-03 | 0 |
| 10-20 | 1.039e-02 | 1.575e-02 | 3.579e-01 | 0 |
| 20-50 | 5.878e-03 | 9.366e-03 | 2.127e-01 | 0 |
| 50-100 | 1.192e-03 | 4.091e-03 | 1.866e-01 | 0 |
| 100-250 | 7.260e-04 | 3.399e-03 | 1.769e-01 | 1.519e-01 |
| 250-500 | 1.606e-04 | 7.707e-04 | 4.220e-02 | 4.774e-01 |
| 500-1000 | 5.528e-05 | 2.548e-04 | 1.367e-02 | 2.460e-01 |
| 1000-2500 | 1.920e-05 | 9.001e-05 | 4.827e-03 | 9.494e-02 |
| 2500-5000 | 3.856e-06 | 1.537e-05 | 1.002e-03 | 2.040e-02 |
| 5000-10000 | 1.905e-06 | 8.685e-06 | 4.504e-04 | 6.669e-03 |
| 10000-25000 | 4.326e-07 | 3.252e-06 | 2.395e-04 | 2.094e-03 |
| 25000 | 8.226e-07 | 3.400e-06 | 9.702e-05 | 6.368e-04 |

## 3. SDK "3-star volatility limits" (secondary targets, REQUIREMENTS §3.3)

| Metric (limit) | BASE | SERPENT CALL (ante) | THE HUNT (buy) | VENOM HUNT (buy) |
|---|---|---|---|---|
| prob5k (≤ 0.01) | 3.16e-06 ✅ | 1.534e-05 ✅ | 0.0007869 ✅ | 0.0047 ✅ |
| prob10k (≤ 0.005) | 1.255e-06 ✅ | 6.652e-06 ✅ | 0.0003365 ✅ | 0.001365 ✅ |
| etl40b (≤ 0.9) | 0.3973 ✅ | 1.324 ❌ | 10.43 ❌ | 0 ✅ |
| etl10k (≤ 0.8) | 0.02782 ✅ | 0.1361 ✅ | 6.176 ❌ | 46.52 ❌ |
| cvar (≤ 800) | 285.7 ✅ | 308.4 ✅ | 102.4 ✅ | 33.8 ✅ |

These are warnings in the SDK's upload verifier, not approval rules (REQUIREMENTS §3.3, D-009). `etl40b` and
`etl10k` are not divided by the mode cost, so a 100× or 700× buy with a 25,000× cap exceeds them by construction.
For SERPENT CALL, `etl40b` counts every win ≥ 100× (40 × 2.5), i.e. most Hunt results, which the ante makes 5× more
frequent. Meeting it would need a low-volatility Hunt, against the brief's high-volatility target. Kept and documented.

## 4. LUT weighting (SPEC 12.3, DECISIONS D-017)

| Mode | Books per bucket | Bucket probabilities | Tilt θ | Tail shaping |
|---|---|---|---|---|
| BASE | basegame: 949,500, freegame: 50,000, wincap: 500 | wincap: 2.500e-07, freegame: 3.996e-03, basegame: 9.960e-01 | -0.0175 | none |
| SERPENT CALL (ante) | basegame: 899,500, freegame: 100,000, wincap: 500 | wincap: 1.000e-06, freegame: 1.959e-02, basegame: 9.804e-01 | -0.0320 | none |
| THE HUNT (buy) | freegame: 249,500, wincap: 500 | wincap: 2.000e-05, freegame: 1.000e+00, basegame: 0.000e+00 | -0.0063 | none |
| VENOM HUNT (buy) | freegame: 249,000, wincap: 1,000 | wincap: 1.000e-04, freegame: 9.999e-01, basegame: 0.000e+00 | -0.0257 | none |

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

