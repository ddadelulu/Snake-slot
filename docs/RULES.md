# CONSTRICTOR: player-facing rules (generated)

_Generated from `frontend/apps/constrictor/src/game/i18n/rules.ts` by `EXPORT_RULES=1 npx vitest run tests/unit/rules.test.ts`. This is the exact text the game shows._

## HOW TO PLAY

CONSTRICTOR is played on a 7×7 grid. Symbols pay in clusters: 5 or more of the same symbol connected horizontally or vertically (not diagonally). All wins are multiplied by the bet.

Each winning cluster pays according to the paytable for its symbol and size. Clusters of different symbols are evaluated separately, and all cluster wins of a spin are added together.

The outcome of every round is decided by the game server when the round starts. Animations only show that result.

## THE EGG AND THE SNAKE

At most one EGG can land on a base game board. When it lands, a snake hatches on the EGG's cell. It starts with length 1 and unfurls to length 3 over its first two moves.

The MOVES counter shows how many moves the snake makes this spin (4 to 10 in the base game, 4 to 12 in free spins). Each move takes the head one cell up, down, left or right. The snake never leaves the grid and never crosses its own body.

When the snake's tail leaves a cell, a fresh gem drops into it at once, so the board never has holes. Fresh gems are always one of the eight paying symbols (never a KEY, PEARL or EGG) and count for this spin's wins. The snake eats whatever its head moves onto, fresh gems included. Eaten symbols and KEYs are covered by the body. KEYs are counted when they land, before the snake moves.

The snake's whole body is WILD. Wild cells substitute for every paying symbol and can be part of clusters of several different symbols in the same spin. A cluster must contain at least one real symbol; a group made only of wild cells does not pay. KEYs and uneaten PEARLs block clusters.

At the end of a base game spin the snake slithers off the board and fresh gems fill the cells it leaves (except after a max win). They arrive after the spin's win is counted: none of them matches a neighbouring symbol, so they never form or extend a cluster. Nothing carries over to the next spin.

## PEARLS AND THE MULTIPLIER

PEARLs only land together with an EGG in the base game, and on any free spin. Each PEARL shows its value: White +1, Gold +2, Rose +3, Black +5, Venom +10 (free spins only) and Venom +25 (VENOM HUNT only).

When the snake eats a PEARL, the pearl's value is added to the multiplier and the snake grows by one segment. The multiplier starts at ×1. The whole spin win (the sum of all cluster wins) is multiplied by it.

The snake can grow to a length of 20. After that, eaten PEARLs still add to the multiplier but the snake no longer grows. PEARLs the snake does not eat have no effect and do not pay.

Base game values: +1, +2, +3, +5. THE HUNT: +1, +2, +3, +5, +10. VENOM HUNT: +1, +2, +3, +5, +10, +25.

## OUROBOROS

When the snake is at least 8 long and is not still growing, its head can bite its own tail. If the closed ring encloses at least one cell, OUROBOROS happens.

Every enclosed cell is constricted into the highest-paying symbol found inside the ring (H1 if there is none). Enclosed KEYs and PEARLs are changed too. Crushed PEARLs add nothing.

The multiplier is doubled. The ring is the snake's body, so it stays WILD for the win evaluation.

The bite is always the snake's last move of the spin. Any moves left on the counter are forfeited. OUROBOROS can happen at most once per spin, and several times in one bonus round. It needs a long snake, so it is seen mostly during free spins.

## THE HUNT (FREE SPINS)

3, 4 or 5 KEYs anywhere on a base game board award 10, 12 or 15 free spins of THE HUNT. The base spin is completed first.

A snake of length 3 with a ×1 multiplier enters the board from an edge. It stays on the board for the whole feature: its position, length and multiplier carry over from spin to spin. The multiplier never resets during the feature.

Each free spin, new symbols land in every cell the snake does not occupy, then the snake makes its moves.

3 or more KEYs on a free spin award +5 free spins, up to 30 free spins in total.

In the base game THE HUNT triggers on average once every 250 spins, and once every 51 spins with SERPENT CALL on.

## VENOM HUNT

VENOM HUNT can only be bought. It plays like THE HUNT with 12 free spins, but the snake enters at length 8 with a ×2 multiplier, and Venom PEARLs +10 and +25 can land. Retriggers work as in THE HUNT (+5, up to 30 in total).

## MAXIMUM WIN

The maximum win is 25,000× the base bet in every mode, including bought features. When a round's total win reaches 25,000×, the win is capped at 25,000×, the round ends immediately and any remaining free spins or moves are forfeited.

## RETURN TO PLAYER

Theoretical return to player: BASE GAME 96.00%, SERPENT CALL 96.00%, THE HUNT 96.00%, VENOM HUNT 96.00%.

The expected return is calculated over many plays. It is a long-term statistical average and says nothing about the result of any single round.

## MODES

- **BASE GAME** (1×, RTP 96.00%, max win 25,000×): Normal play.
- **SERPENT CALL** (2.5×, RTP 96.00%, max win 25,000×): Every spin costs 2.5× the bet. More KEYs land, so THE HUNT triggers about 4.9× as often. The EGG chance is unchanged.
- **THE HUNT** (100×, RTP 96.00%, max win 25,000×): Buy THE HUNT for 100× the bet: 10, 12 or 15 free spins start immediately.
- **VENOM HUNT** (700×, RTP 96.00%, max win 25,000×): Buy VENOM HUNT for 700× the bet: 12 free spins with a length-8 snake at ×2 from the first spin. Venom pearls +10 and +25.

## PAYTABLE (× bet by cluster size)

| Symbol | 5 | 6 | 7 | 8 | 9–10 | 11–12 | 13–15 | 16+ |
|---|---|---|---|---|---|---|---|---|
| H1 | 1.8 | 2.2 | 2.7 | 3.2 | 3.7 | 4.5 | 5.4 | 7.1 |
| H2 | 1.3 | 1.7 | 2 | 2.3 | 2.7 | 3.2 | 4.1 | 5.4 |
| H3 | 1.1 | 1.2 | 1.5 | 1.8 | 2.2 | 2.5 | 3.2 | 4.1 |
| H4 | 0.9 | 1.1 | 1.2 | 1.4 | 1.8 | 2.2 | 2.7 | 3.6 |
| L1 | 0.7 | 0.8 | 0.9 | 1.1 | 1.3 | 1.6 | 2 | 2.7 |
| L2 | 0.6 | 0.7 | 0.8 | 0.9 | 1.1 | 1.2 | 1.6 | 2.2 |
| L3 | 0.4 | 0.5 | 0.7 | 0.8 | 0.9 | 1.1 | 1.3 | 1.8 |
| L4 | 0.3 | 0.4 | 0.5 | 0.7 | 0.8 | 0.9 | 1.1 | 1.4 |

## UI GUIDE

- **SPIN**: Starts a round at the current bet. Press the spacebar to spin. During a round, the spacebar or a tap on the board skips animations.
- **− / +**: Lowers or raises the bet. Tap the bet amount to choose any bet level.
- **SERPENT CALL**: Turns the ante on or off. While it is on, each spin costs 2.5× the bet and THE HUNT triggers more often.
- **BUY**: Opens the feature menu to buy THE HUNT or VENOM HUNT. A purchase must be confirmed.
- **AUTO**: Opens the autoplay settings. Autoplay starts only after you confirm, and stops when you press STOP or a stop condition is met.
- **TURBO**: Plays animations faster. It never changes the outcome.
- **SOUND**: Mutes or unmutes the game.
- **i**: Opens these game rules.
- **MENU**: Opens the settings: sound and music volume, turbo and reduced motion.

## LEGAL

Malfunction voids all wins and plays. A consistent internet connection is required. In the event of a disconnection, reload the game to finish any uncompleted rounds. The expected return is calculated over many plays. The game display is not representative of any physical device and is for illustrative purposes only. Winnings are settled according to the amount received from the Remote Game Server and not from events within the web browser. CONSTRICTOR™ and © 2026 Studio 12.
