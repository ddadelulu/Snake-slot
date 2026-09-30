# CONSTRICTOR: Submission pack

Studio **Studio 12** · Game id `constrictor` · Math **v1** (frozen 2026-09-29) · Upload-ready web build `frontend/apps/constrictor/build/` (static, 3.9 MB, 76 files; `pnpm build`) · Math upload set `math/games/constrictor/publish/` (`publish_parts.py join`)

## 1. Promo blurb

After midnight in a 1940s jeweler's strongroom, a black serpent with oil-slick scales is loose among the velvet
trays, and it is swallowing everything. **CONSTRICTOR** fuses arcade Snake with a 7×7 cluster slot. An EGG hatches
a snake that slithers across the grid cell by cell, swallowing pearls to grow longer and to raise the round
multiplier, and its whole body is WILD. Bite your own tail? In any other Snake game that ends the run. Here it
is **OUROBOROS**: the ring constricts everything inside it into one symbol and the multiplier doubles. Three KEYs
open the vault for **THE HUNT**, where the snake stays on the board and keeps its length and multiplier from spin
to spin. Win up to **25,000×** the bet.

**Game description tag:** 7×7 cluster pays · snake mechanic · wild snake body · pearl multipliers · free spins
with a persistent snake · ante bet · feature buys · max win 25,000×.

## 2. Rules

The final player-facing rules are generated from the game's own source into [`docs/RULES.md`](RULES.md)
(`EXPORT_RULES=1 npx vitest run tests/unit/rules.test.ts` in `frontend/apps/constrictor`), so the submitted text
and the in-game popup cannot drift apart. `tests/unit/rules.test.ts` asserts that the popup states every pearl
value, the multiplier effects, trigger/award/retrigger conditions, the 30-spin cap, the cap and forfeit rules,
RTP, cost and max win per mode, a UI guide entry for every control, and every disclaimer point.

## 3. RTP, max win and cost per mode

From `docs/MATH_REPORT.md` (exact LUT RTP; `cd math && env/bin/python verify_constrictor.py && env/bin/python make_report.py`).

| Mode | Stake mode id | Cost | What it does | RTP | Max win | Max-win frequency |
|---|---|---|---|---|---|---|
| BASE | `base` | 1× | Normal play | 96.00 % | 25,000× | 1 in 1,241,198 rounds |
| SERPENT CALL (ante) | `ante` | 2.5× | THE HUNT triggers ×5.19 as often (1 in 48.25 vs 1 in 250.25); EGG unchanged | 96.00 % | 25,000× | 1 in 239,236 rounds |
| THE HUNT (buy) | `hunt` | 100× | Starts THE HUNT (10/12/15 spins) | 96.00 % | 25,000× | 1 in 6,190 rounds |
| VENOM HUNT (buy) | `venom` | 700× | Starts VENOM HUNT (12 spins, length-8 snake at ×2, Venom +10/+25) | 96.00 % | 25,000× | 1 in 1,366 rounds |

When a round reaches 25,000× the win is capped, a `wincap` event is shown, the round ends immediately and any remaining free spins or moves are forfeited (stated in the rules).

## 4. Replay event IDs

Book ids from the published books (`math/games/constrictor/publish/`), one per category and mode. Replay URL:
`?replay=true&game=<game>&version=<published version>&mode=<mode>&event=<id>&rgs_url=<rgs>` (the version is the one
the dashboard assigns on upload). Payouts are × base bet.

| Mode | Category | Event id | Payout | Shows |
|---|---|---|---|---|
| base | loss | 303 | 0.0× | — |
| base | normal win | 1090 | 3.3× | EGG/snake |
| base | big win | 161426 | 609.4× | Hunt |
| base | bonus trigger | 46180 | 96.4× | Hunt |
| base | win cap | 74605 | 25,000.0× | OUROBOROS, Hunt, wincap event |
| ante | loss | 2724 | 0.0× | — |
| ante | normal win | 432 | 2.2× | EGG/snake |
| ante | big win | 166211 | 1,763.0× | Hunt |
| ante | bonus trigger | 1146 | 112.6× | EGG/snake, Hunt |
| ante | win cap | 74974 | 25,000.0× | OUROBOROS, Hunt, retrigger, wincap event |
| hunt | loss (pays below the 100× cost) | 1768 | 7.6× | — |
| hunt | normal win | 705 | 102.6× | — |
| hunt | big win | 10823 | 1,423.0× | — |
| hunt | retrigger | 4245 | 559.7× | retrigger |
| hunt | win cap | 39209 | 25,000.0× | OUROBOROS, retrigger, wincap event |
| venom | loss (pays below the 700× cost) | 10824 | 204.4× | — |
| venom | normal win | 704 | 848.9× | OUROBOROS |
| venom | big win | 193028 | 6,456.0× | OUROBOROS |
| venom | retrigger | 3376 | 430.8× | retrigger |
| venom | win cap | 6100 | 25,000.0× | OUROBOROS, wincap event |

## 5. Game tile layers

| Layer | File | Notes |
|---|---|---|
| Background | `art/placeholder/images/tile_background.png` (1200×1200) | warm brass light, bright centre, no dark edges (mean luminance 193/255), no text |
| Foreground | `art/placeholder/images/tile_foreground.png` (1024×1024, transparent) | the serpent coiled around the Black Opal, head raised; no text |

These are procedural placeholders (D-020); the final prompts for both layers are in `art/HIGGSFIELD_PROMPTS.md`.

## 6. QA evidence

All commands from `frontend/apps/constrictor` unless noted; the mock RGS serves the static build plus real
books (`python3 scripts/mock_rgs.py`, D-024). Headless Chromium uses software rendering (≈ 2–4 fps), so wall-clock
times in these runs are not representative of real devices.

| Check | Command | Result |
|---|---|---|
| Math unit tests | `cd math && env/bin/pytest tests -q` | 72 passed |
| Independent verification of every book | `cd math && env/bin/python verify_constrictor.py` | see MATH_REPORT (all modes PASS, 0 failures) |
| JSON schema of every book | part of the verifier (fastjsonschema, `math/games/constrictor/schema/book.schema.json`) | 2,500,000 / 2,500,000 valid |
| Frontend unit tests | `npx vitest run` | 30 passed (money/currencies, bet levels, social wording, launch params, rules content, round settlement incl. a failing animation, model soak over the real-book sample); 1 skipped = the `EXPORT_RULES` export step |
| Type check | `npx svelte-check` | 0 errors, 0 warnings |
| Browser soak (real handlers, skip on) | `node tests/e2e/soak.mjs http://localhost:8080 1200` | 1,200 rounds (base 1,032 · ante 120 · hunt 24 · venom 24): **0 WIN/BALANCE mismatches**, 0 console/network problems, no round left open |
| Memory over time | same soak (heap after forced GC) | 11.4 MB after 50 rounds → 13.8 MB at 500 → 15.2 MB at 1,200, flattening. Heap-snapshot diff over 300 rounds (`tests/e2e/heapdiff.mjs`): JS objects grow < 50 KB; the rest is JIT code (≈ 0.5 MB) and Pixi buffer pools (≈ 0.4 MB) warming up. An earlier real leak (Pixi 8 GraphicsContext retention, 11.9 → 105 MB) was found by this soak and fixed |
| Compliance flows | `node tests/e2e/compliance.mjs` | 14/14: resume + settle after refresh, bet kept, balance matches; replay shows mode/bet/cost multiplier/real cost, plays, shows win, PLAY AGAIN, **no wallet calls**; insufficient balance → error; console clean |
| Social mode scan | `node tests/e2e/social.mjs` | 0 restricted words and no `$` on every screen/popup (main, rules tabs, feature menu + confirm, ante confirm, autoplay, settings, bet menu, error, replay) |
| Viewports | `node tests/e2e/viewports.mjs` | 7/7 sizes, 0 overflow, 0 console problems |
| Screenshots + visual self-review | `node tests/e2e/screenshots.mjs http://localhost:8081 ../../../docs/screenshots` | 36 files in `docs/screenshots/`; critique against the style bible and the 23 fixes it led to in [`docs/VISUAL_REVIEW.md`](VISUAL_REVIEW.md) |
| Storybook | `npx storybook build` + `node tests/e2e/storybook.mjs` | 44 stories render without page errors (UI states, every modal, 21 real-book scenarios incl. small win, hatch, long snake, OUROBOROS once and twice, Hunt trigger, retrigger, Venom Hunt, max win, turbo, social); the only network miss is Chromium's automatic `/favicon.ico` probe inside Storybook |

## 7. Compliance checklist (brief §3, verified against `docs/REQUIREMENTS.md`)

Evidence commands run from `frontend/apps/constrictor` against the mock RGS (`python3 scripts/mock_rgs.py`)
unless noted. The mock serves real books from the published math (D-024).

### General
| Item | Status | Evidence |
|---|---|---|
| Strictly stateless: no jackpots, gamble, carry-over, early cashout | ✅ | SPEC §1/§4; the base-game snake exits each spin; free spins live inside one round |
| Original work, no web-sdk sample assets, no Stake branding | ✅ | All art is procedural (`art/pipeline/placeholders.py`), all audio synthesized (`art/audio/synth.py`); sample apps not shipped; no Stake names/logos in UI or art |
| Nothing appealing to minors | ✅ | Noir jeweler's vault, realistic serpent, no characters |
| Math final before submission | ✅ | Math v1 frozen (SPEC §15); upload set + checksums in `math/games/constrictor/publish/` |

### Math
| Item | Status | Evidence |
|---|---|---|
| RTP 90–98 % in every mode | ✅ | 96.00000 % exact in all 4 modes (MATH_REPORT §1) |
| Modes within 0.5 % | ✅ | spread 0.00000 % (MATH_REPORT §1) |
| Declared max win matches the math | ✅ | 25,000× in rules/modes; wincap books hit exactly 2,500,000 (verifier) |
| Max win obtainable (> 1 in 10M) | ✅ | MATH_REPORT §1 "Max-win frequency" per mode |
| Base hit rate > 1 in 20 | ✅ | MATH_REPORT §1 "Hit rate" |
| No gaps in the win distribution | ✅ | MATH_REPORT §2: every range populated |
| Zero-weight outcomes do not dominate | ✅ | 0 zero-weight books (MATH_REPORT §1) |
| Every declared combination reachable | ✅ | MATH_REPORT §5 coverage (64/64 symbol × band) and all pearl values |
| 100k–1M simulations per mode | ✅ | 1,000,000 · 1,000,000 · 250,000 · 250,000 |
| SDK upload checks | ✅ | `execute_all_tests`: SHA-256 + payout hash OK for all modes |
| SDK 3-star advisory metrics | ⚠️ | ante `etl40b`, hunt `etl40b`/`etl10k`, venom `etl10k` exceed the advisory limits (warnings, not rejections; not cost-normalised for buys; D-009, MATH_REPORT §3) |

### Frontend
| Item | Status | Evidence |
|---|---|---|
| Static files only, fonts self-hosted, no external requests | ✅ | single `index.html` + `assets/` + `fonts/`; every e2e run records `requestfailed` / HTTP ≥ 400 / console — all clean |
| Mobile + mini-player, board never distorted | ✅ | `node tests/e2e/viewports.mjs` (7 sizes, overflow check) → 0 problems; `docs/screenshots/` |
| Spacebar spins (and skips) | ✅ | `Game.svelte` `onKey`; used by smoke/soak tests |
| Mute | ✅ | sound button in the bar + Settings (music/SFX volumes) |
| Autoplay needs explicit confirmation | ✅ | AUTO opens the settings dialog; only START AUTOPLAY begins; stop conditions; STOP always available |
| Turbo keeps wins/popups legible | ✅ | turbo = 2.2× animation speed; count-ups keep ≥ 45 % of their duration; banners and amounts unchanged |
| Bet levels from authenticate, stepBet, min and max | ✅ | `tests/unit/bets.test.ts`; bet menu lists every level |
| Balance and final win shown; counter reaches the exact payout | ✅ | browser soak: displayed WIN == book payout for every round (`tests/e2e/soak.mjs`, see §6) |
| Money formatting incl. XGC/XSC without `$` | ✅ | `tests/unit/money.test.ts`; screenshots `desktop_social_XSC`, `desktop_currency_XGC`, `_JPY`, `_EUR`, `_BRL` |
| Query params, `rgs_url` never hardcoded | ✅ | `src/game/url.ts`, `tests/unit/url.test.ts` |
| English + robust to any `lang` | ✅ | `tests/unit/social.test.ts` ("any lang falls back to English") |
| Rules popup: full rules, costs, RTP per mode, max win, paytable, special values, triggers, UI guide, disclaimer | ✅ | `tests/unit/rules.test.ts` (7 checks); text in `docs/RULES.md` |
| Bet replay: replay=true, GET /bet/replay/…, no wallet calls, controls hidden, Play → animation → cost/payout/win → Play Again, errors handled, no path to real play | ✅ | `node tests/e2e/compliance.mjs` (replay checks + "no wallet calls") |
| Unfinished round resumes and is settled; refresh keeps the bet | ✅ | `tests/e2e/compliance.mjs` (resume checks) |
| Social mode: every restricted phrase replaced | ✅ | `tests/unit/social.test.ts` (every string, rule and the disclaimer) + `node tests/e2e/social.mjs` (every screen and popup incl. error and replay) → 0 hits |
| Game tile: bright background, transparent foreground, no text | ✅ | `art/placeholder/images/tile_background.png` (mean luminance 193/255, no dark edges), `tile_foreground.png` (serpent coiled around the black opal) |

## 8. Known limitations and open items (for Dylan)

- **Art and audio are original placeholders.** Higgsfield generation works, but its result CDN hosts are blocked in
  this environment (D-020); the procedural art and synthesized audio ship instead. Every final prompt, model and target
  filename is in `art/HIGGSFIELD_PROMPTS.md`; dropping files into `art/final/` and running
  `math/env/bin/python art/pipeline/build_assets.py` swaps them in with no code change. The hero videos are replaced by
  in-engine sequences (D-026).
- **SDK 3-star advisory metrics** are exceeded by ante/hunt/venom (warnings, see MATH_REPORT §3, D-009).
- **VENOM HUNT** costs 700× with a ×2 start (the brief's ~400× / ×5 did not balance; D-015).
- **Coba overlap** (7×7, 25,000×, snake theme) is flagged for review (D-001, D-012).
- **Studio 12 wordmark** appears only on the studio splash (loading screen), never in the game palette.
