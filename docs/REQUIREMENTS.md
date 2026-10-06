# REQUIREMENTS: Stake Engine rules, verified against the official sources

This document records what Stake Engine actually requires (as of **2026-09-29**), checked against the
official repositories. Where the official sources differ from the build brief, **the official source
wins** and the difference is listed in [§9 Differences from the brief](#9-differences-from-the-brief).

## 0. Sources and pinned versions

| Source | What | Commit / version | Date |
|---|---|---|---|
| `github.com/StakeEngine/math-sdk` | Math SDK (Python + Rust optimizer), `utils/rgs_verification.py` upload checks | `a6dccd86de740cc5d318079483cb6204cc5c19bc` | 2026-09-22 |
| `github.com/StakeEngine/web-sdk` | Frontend SDK (Svelte 5, PixiJS 8, Turborepo) | `1843d60cedb94b390e641b563f32ad64353bec5e` | 2025-11-28 |
| `github.com/StakeEngine/docs` | Source of stakeengine.org docs site (approval, API, reference pages) | `fefadc7bd117f8e06f0a01e750408da2244f8d8f` | 2026-03-17 |
| `github.com/ReSkin-Games/stake-engine-skills` | Community distilled checklist (**secondary source only**) | `b49e401905c99d19d6492e4d6b883a466abf494e` (v0.2.1) | 2026-06-11 |

The live sites `stake-engine.com`, `stakeengine.github.io` and `stakeengine.org` are **blocked by this
session's network egress policy**, so the git sources above were used instead. The docs repo is the
source of the docs website, so its pages are the same content. Doc paths below are relative to
`docs/src/routes/` in that repo.

Toolchain used: Python 3.12.3 (venv; the SDK requires ≥ 3.12), Rust/cargo (optimizer builds in ~19 s),
Node 22.22.2 (SDK needs ≥ 22.16.0), pnpm 10.5.0 (pinned by the web-sdk `packageManager` field).

Sample check (P0 exit criterion):
- `math-sdk`: `env/bin/python games/0_0_cluster/run.py` → sims, Rust optimization, PAR sheet and RGS
  format checks all pass (`[FAST PATH] base: SHA-256 OK, payout hash OK, entries=10000`). Runtime 2 min 7 s.
- `web-sdk`: `apps/cluster` → `vite build` completes ("Wrote site to build ✔ done"). Note: the process
  does not exit after the build (open handle); and turbo tries to reach `telemetry.vercel.com`, which
  is blocked here. Fix: set `TURBO_TELEMETRY_DISABLED=1`, and build through a wrapper that exits once the
  adapter reports done (see DECISIONS D-011).

---

## 1. General (docs/approval)

- **Strictly stateless.** Each bet is independent. No jackpots, gamble features, continuation or early
  cashout. (Free spins inside one bet round are allowed.)
- Team names, titles and assets must respect IP/copyright. Games must be **original**; pre-purchased or
  licensed games that exist elsewhere are not allowed.
- **No Stake™ / Kick™ branding or themes** in game assets.
- Nothing that promotes or appeals to minors, **including child-like characters**.
- Reviewer discretion: offensive, explicit, poor-taste or low-quality games can be rejected.
- **Post-release:** only minor visual fixes. No math changes, no new modes, no mechanic changes.
- **Game title must be unique** and must not contain terms like "Megaways" or "Xways" (checklist → PreChecks).

## 2. Quality rating (docs/approval/quality)

- 3 anonymous reviewers each score on the fixed scale 0, 0.33, 0.67, 1, …, 3. The average is rounded to
  a star tier.
- **Average < 1.0 → not approved** (policy since March 2026). The thread is locked for 7 days, then the
  game can be resubmitted.
- 3★ = "studio-quality … exceptional creativity, uniqueness, attention to detail" → featured placement.

## 3. Math (docs/approval/math-requirements, approval checklist, math-sdk `utils/rgs_verification.py`)

### 3.1 Hard requirements
| Rule | Value | Source |
|---|---|---|
| RTP per mode | **90.0 % – 98.0 %** | math-requirements |
| Spread between modes | **≤ 0.5 %** (e.g. base 97 % → others 96.5–97.5 %) | math-requirements; `execute_all_tests` warns if max diff > 0.05 |
| Mode cost in rules | Must be shown correctly for every mode | math-requirements |
| Max win in rules | Must match the math for every mode | math-requirements |
| Max win obtainable | "typically more frequent than **1 in 10,000,000**, depending on payout amount"; checklist says "**1 in 20,000,000** or more frequent" | math-requirements / checklist |
| Simulations | **100,000 – 1,000,000** per mode (slot-type games) | math-requirements |
| Non-zero hit rate | "< 1 in 20 bets, or more frequent"; checklist: "typically around 3–8, not > 20 for base" | math-requirements / checklist |
| Share of paying results | e.g. 90,000 non-paying out of 100,000 "may be grounds for rejection" | math-requirements |
| Most likely single outcome | Must not be "overwhelmingly dominant" when visuals imply variety | math-requirements |
| Base-mode std. dev. | Within industry norms | math-requirements |
| Zero-weight payouts | Must not dominate; report the count of non-zero-weight payouts | math-requirements |
| No gaps | Intermediate wins must exist between small wins and the max | math-requirements |

### 3.2 Upload format (docs faq/math/what-files-are-required + math-sdk writers/verifier)
- Per mode: `books_<mode>.jsonl.zst` (zstd JSON lines: `id`, `events`, `payoutMultiplier`),
  `lookUpTable_<mode>_0.csv` (`simulation_number,round_probability(weight),payout_multiplier`, all
  **uint64**), plus one `index.json` listing `{name, cost, events, weights}` for every mode.
- LUT and book payout arrays are hashed and **must match exactly**. The upload fails on any mismatch.
- **Payout granularity (NEW, not in the brief):** every `payoutMultiplier` must be a multiple of **10**
  (i.e. **0.1× bet increments**). Every non-zero payout must be ≥ 10 (≥ 0.1×). (`verify_lookup_format`)
- The sum of weights must fit in uint64.
- `payoutMultiplier` is an integer = payout × 100 (1150 = 11.5×), relative to the **base bet** (mode cost 1).

### 3.3 "3-star volatility limits" (NEW, math-sdk `verify_mode_volatility`, added by Stake staff Jul 2026)
The SDK's upload verifier prints `Mode [x] fails 3-star volatility limits` when any of these is exceeded.
They are **warnings, not rejections**, but they are named after the 3-star tier, so we treat them as
**secondary targets** and report them for every mode:

| Metric | Definition (payouts in base-bet multiples) | Limit |
|---|---|---|
| `prob5k` | P(payout ≥ 5,000×) × scale(cost) | ≤ 0.01 |
| `prob10k` | P(payout ≥ 10,000×) × scale(cost) | ≤ 0.005 |
| `etl40b` | Σ payout·p over payouts ≥ 40 × cost (**not** divided by cost) | ≤ 0.9 |
| `etl10k` | Σ payout·p over payouts ≥ 10,000× (**not** divided by cost) | ≤ 0.8 |
| `cvar` | mean payout in the top 0.1 % tail ÷ cost | ≤ 800 |
| `rtp` | RTP | ≤ 0.967 |

scale(cost) = 0.2 if cost ≥ 1000, 0.5 if ≥ 500, 0.8 if ≥ 200, otherwise 1.0.

## 4. RGS / API (docs/api/*, docs/reference/url-structure)

- **Launch URL query params:** `sessionID`, `rgs_url` (**never hardcode**; host only, prefix `https://`),
  `lang`, `currency`, `device` (`desktop`/`mobile`), `social` (`true` = Stake.us), `demo`, `replay`.
  Replay adds `game`, `version`, `mode`, `event`, and optionally `amount`, `currency`, `lang`, `device`, `social`.
- `POST {rgs}/wallet/authenticate {sessionID}` → `balance{amount,currency}`, `round` (active or last
  round, may be null), `config{minBet,maxBet,stepBet,defaultBetLevel,betLevels[],betModes,jurisdiction}`.
  `config.jurisdiction` and `meta`: docs say "Do not used. Ignore." (We still honour any `disabled*`
  flag defensively; see DECISIONS.)
- `POST {rgs}/wallet/play {amount, sessionID, mode}` → `balance`, `round{payoutMultiplier, costMultiplier, state}`.
  Errors: `ERR_IPB` (insufficient balance), `ERR_VAL`, `ERR_IS` (invalid session), `ERR_GEN`.
- `POST {rgs}/wallet/end-round {sessionID}` → balance. **Only needed when payout > 0.** Zero-payout
  rounds are auto-completed.
- `POST {rgs}/wallet/balance`, `POST {rgs}/bet/event {sessionID, event}` (optional progress tracking).
- If `authenticate` returns an active `round`: show its result to the player, then call `end-round`.
- **Bet levels:** use every level from `betLevels`; respect `stepBet`; min and max must be selectable.
  Checklist examples: USD $0.10–$1,000 (default $1.00), JPY ¥10–¥150,000 (default ¥100),
  MXN MX$1–MX$15,000 (default MX$10).
- **Refreshing mid-spin must keep the selected bet amount** (must not revert to the default).
- **Money:** integers with 6 decimals (`1000000` = 1.00). Currency table: 34 fiat + `XGC` ("GC", suffix)
  and `XSC` ("SC", suffix), **no `$`**. Decimals: JPY/IDR/KRW/VND/CLP use 0. Full table:
  docs/reference/currencies.
- **Languages:** only `en` is required; other `lang` values must not corrupt text. Codes: ar, zh, en, fi,
  fr, de, hi, id, ja, ko, po/pl, pt, ru, es, tr, vi.

## 5. Frontend (docs/approval/frontend-requirements + checklist)

- **Static files only.** No external requests (fonts, CDNs). "Check the network tab to ensure no errors
  or game information is being logged": no console output with game info.
- Unique audio and visuals: **no web-sdk sample assets** (backgrounds, symbols, animations, sounds).
- No visual bugs, no broken or missing assets.
- **Mini-player / popout** must render without distorting the board. **Mobile** fully usable.
- Viewports (docs/reference/dimensions): Desktop 1200×675, Laptop 1024×576, Popout L 800×450,
  Popout S 400×225, Mobile L 425×812, Mobile M 375×667, Mobile S 320×568.
- **Spacebar → bet button.** Sound-off option. **Autoplay needs a confirmation step.**
- **A confirmation is required when switching to any bet mode that costs more than 2×** (so a 50× buy
  can't be activated with one button). This applies to our ante too.
- Bet size changeable; all `betLevels` usable; balance shown; final win shown for non-zero results;
  the win counter increments to the exact final payout.
- Fast play (turbo): win amounts, winning combinations and popups stay legible.
- Checklist: "Check 10 wins for each game mode against the Game Rules and ensure that the win that is
  displayed is the same as payout."

### 5.1 Rules / info (must be reachable from the UI)
Full rules; cost of each mode and what it buys; RTP (game and every mode); max win per mode; payout for
every symbol and combination (cluster sizes); every special value (all pearl values, multiplier
effects); free-spin trigger and retrigger conditions; **UI guide** for every button; **disclaimer**.

### 5.2 Disclaimer (docs/approval/disclaimer)
Official template:
> Malfunction voids all wins and plays. A consistent internet connection is required. In the event of
> a disconnection, reload the game to finish any uncompleted rounds. The expected return is calculated
> over many plays. The game display is not representative of any physical device and is for illustrative
> purposes only. Winnings are settled according to the amount received from the Remote Game Server and
> not from events within the web browser. TM and © 2025 Stake Engine.

Required points: malfunction clause, internet requirement, disconnection recovery, expected return,
display accuracy, payout source (RGS), trademark/copyright notice. Must be reachable via `i`/`?`.

## 6. Bet replay (docs/api/bet-replay, changelog/replay-mode): mandatory

- Detect `replay=true`. `GET {rgs_url}/bet/replay/{game}/{version}/{mode}/{event}` →
  `{payoutMultiplier, costMultiplier, state}`. Show a loader while fetching.
- **No** authenticate, balance, play or end-round calls. Hide or disable bet controls, balance and autoplay.
- "Play" button → full animation with sound → results (bet cost, payout multiplier, win) → "Play Again".
- **Start-replay button content:** game mode, base bet amount, cost multiplier, currency, and the **real
  amount spent** (e.g. "BONUS 1 USD, 250 USD REAL COST"). If amount/currency are missing, default to
  1 USD (non-social) or 1 SC (social). No need to show the event id.
- Support the optional params (`currency`, `lang`, `amount`, `device`, `social`).
- Handle errors gracefully. **No way to start normal play from replay.**
- Social mode: the replay window must not contain restricted words.
- For review, provide event ids per mode for: normal win, big win, win cap, loss, bonus trigger.

## 7. Social mode / Stake.us (docs/reference/social-mode + checklist)

When `social=true`: English with replacements, whatever `lang` says. Replace every restricted phrase in
the UI, rules, popups, button labels and images (we bake no text into images). Official table (identical
to the brief's Appendix A): bet→play, bets→plays, bet/s→play/s, betting→playing, bonus buy→bonus /
feature, bought→instantly triggered, buy→play, buy bonus→get bonus, cash→coins, cost of→can be played
for, at the cost of→for, credit→coins, currency→token, deposit→get coins, gamble→play, loss limit→stop
limit, loss streak→miss streak, money→coins, paid→won, paid out→won, pay→win, pay out→win / won, pay
table→win table, payer→winner, pays→wins, pays out→win, place your bets→come and play / join in the game,
profit→net gain, purchase→play, rebet→respin, stake→play amount, total bet→total play, wager→play, win
feature→play feature, withdraw→redeem, be awarded to player's accounts→appear in player's accounts.

Checklist specifics: the bet button must not say "bet"; the bet amount field must not be labelled "bet
amount"; autoplay must not be called "AutoBET" (and its popups must not say "bet"); the bonus buy label
must not contain "BUY" and its confirmation must not include "buy" or "bet"; the insufficient-funds
error must not contain restricted words; SC and GC must display without a `$` prefix.

## 8. Game tile (docs/approval/game-tile)

Built in the dashboard Tile Editor from layers: **background** (PNG/JPG, high resolution, must be
**brighter than the Stake platform**, **no dark edges**, the editor has a brightness analysis) and
**foreground** (PNG with transparency, key character/item, fill the key focus area). **No text and no
multipliers** in either image. The gradient colour is picked from the art (light; avoid bright yellow,
green or blue). The title is added by the editor. The provider logo is set in Team Settings → Branding.

## 9. Differences from the brief

| # | Brief | Official source | What we do |
|---|---|---|---|
| 1 | Max win more often than 1 in 10,000,000 | Math page: "typically" 1 in 10M; checklist: 1 in 20M or better | Keep the **stricter 1 in 10M** target (satisfies both). |
| 2 | (not mentioned) | Payouts must be multiples of **0.1×** (LUT integer multiples of 10), minimum non-zero 0.1× | Paytable values are multiples of 0.1×, multipliers are integers, and the math works in integer tenths. Enforced in tests. |
| 3 | (not mentioned) | SDK "3-star volatility limits" (§3.3) | Secondary targets. Reported per mode in MATH_REPORT; conflicts logged in DECISIONS. |
| 4 | Mode switching: buy menu confirmation | Confirmation for **any** mode costing > 2×, including ante | The ante toggle also asks for confirmation (its cost is > 2×). |
| 5 | Disclaimer: use the template or cover every point | Template ends "TM and © 2025 Stake Engine" | Template wording with our own notice: "CONSTRICTOR™ and © 2026 Studio 12." (D-006) |
| 6 | Bet selector requirements | Also: a refresh mid-spin must keep the selected bet. Engine #242 / #187: open on `defaultBetLevel`; an unfinished round restores `round.amount` | No localStorage: a remembered bet would override `defaultBetLevel` (#242). A refresh mid-spin keeps the bet through the unfinished round's `round.amount` (#187). The ladder is exactly `betLevels` (min/max only trim it). |
| 7 | Replay: show bet cost | Show mode, base bet, cost multiplier, currency and **real cost**; default 1 USD / 1 SC | Implemented as specified. |
| 8 | Title | Must be unique; no "Megaways"/"Xways" | "CONSTRICTOR": no existing slot with this name found (DECISIONS D-001). |
| 9 | Bet modes ≤ 4 | No official limit found in any source | Keep 4. |
| 10 | Stake.us ceiling ~96.7 % | SDK flags `rtp > 0.967` | Target 96.00 % in all modes. |
| 11 | Polish code `pl` | Docs list `po`, RGS.md lists `pl` | Treat both as Polish; English fallback for everything. |
