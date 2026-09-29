# DECISIONS

Each entry lists the decision, the alternatives and the reason. The newest entries are at the bottom.
IDs are stable and referenced from the other docs.

---

### D-001: Title stays "CONSTRICTOR" (name check passed)
- **Checked (2026-09-29, web search):** `"Constrictor" slot game`, `Constrictor slot Stake Hacksaw Pragmatic Nolimit`,
  catalogue-limited searches (slotcatalog, bigwinboard, slotslaunch, stake, casino.guru, askgamblers),
  `site:stake.com constrictor`, provider-limited searches, `"Constrictor" video game`, trademark queries.
  Direct fetches of slotcatalog, slotslaunch, bigwinboard and stake.com were blocked by the egress policy,
  so the check relied on the search index.
- **Result:** no casino slot or casino game is called "Constrictor". Non-gambling uses exist: a free browser
  Snake game on Kongregate, a puzzle game on thinkygames, a ship in *Elite*, a Battlesnake map name.
  None of these is a gaming trademark conflict for a slot title. The backup "Serpent Strongroom" is also free.
- **Overlap to be aware of:** ELK Studios' **Coba** (7×7 cluster pays, max 25,000×) has snakes that
  move across the grid eating matching symbols, leave multiplier wilds where they cross, and has a
  feature buy called **"Boa Constrictor"**. Massive Studios' *Serpentina* (Stake exclusive) is a Medusa
  cluster game.
- **Decision:** keep **CONSTRICTOR**. The title is free. The mechanics differ in substance from Coba:
  one persistent creature following classic Snake rules; pearls feed a round multiplier; the whole body
  is wild; the Ouroboros self-bite encloses and constricts a region; the noir-vault theme. Coba uses
  meter-spawned snakes, avalanches and crossing multiplier wilds.
  The rules text and art avoid Coba's vocabulary (no "snake meter", no avalanche/tumble, no "Boa").
- **Flag for Dylan:** 7×7 and 25,000× both match Coba's headline numbers. They are the brief's numbers,
  so they are kept; see D-012.

### D-002: Python 3.12 venv for the math
The system Python is 3.11 and the SDK requires ≥ 3.12. `/usr/bin/python3.12` exists, so the venv is built on it.

### D-003: Solvent modules are not available, so the control bar and loading screen are built fresh
`list_repos` shows only `ddadelulu/Snake-slot` and `ddadelulu/hardmode-playtest`, so the Solvent repo is
not reachable. Both modules are built as reusable, theme-able Svelte components with a plain default
preset and a Studio 12 preset, so Solvent can adopt them later.

### D-004: Higgsfield is available, so the art is generated
Balance at the start: **536.2 credits (pro plan)**. Hard budget: **≤ 321.7 credits (60 %)**. Every
generation is logged in `art/GENERATION_LOG.md`. The manifest-driven asset loading (swap files, zero
code changes) is built anyway so Dylan can replace any asset later.

### D-005: 0.1× payout granularity is built into the math
The SDK upload verifier requires payout multiples of 0.1×. All paytable values are multiples of 0.1,
multipliers are integers, and all game math runs in **integer tenths of a bet** (no float drift). An
explicit assertion runs on every book.

### D-006: Disclaimer copyright line
The official template ends with "TM and © 2025 Stake Engine." The brief forbids Stake branding in
the game, and the notice should name the rights holder of this game. Decision: keep the template's
wording for every required point and end with "CONSTRICTOR™ and © 2026 Studio 12. All rights reserved."
Alternative: the verbatim template, rejected because the copyright would name the wrong owner.

### D-007: Jurisdiction flags are honoured defensively
The docs say to ignore `config.jurisdiction`. The example payload still carries `disabledTurbo`,
`disabledAutoplay`, `disabledBuyFeature`, etc. The frontend honours any flag that is `true`
(hide or disable that feature). This costs nothing when the flags are false or absent.

### D-008: Max-win frequency target
The math page says "typically 1 in 10M"; the checklist says "1 in 20M". We target the stricter
**≥ 1 in 10M in every mode**.

### D-009: The SDK's 3-star volatility limits are secondary targets
They are warnings in `utils/rgs_verification.py`, not documented approval rules. They are reported per mode in
MATH_REPORT.md, and we aim to meet them where that doesn't break a hard rule or a brief target. For
buy modes, `etl40b` and `etl10k` are not divided by mode cost, which makes them very strict at 100–400×.
Any remaining violation is documented rather than hidden.

### D-010: Books and LUTs live in `/math` (the SDK is vendored)
The pinned math-sdk (`a6dccd8`, MIT) is copied into `/math`: `src/`, `utils/`, `optimization_program/`
and the licence. The game goes in `/math/games/constrictor/`, as the brief asks. Sample games are
not copied. This keeps the repo reproducible without a second checkout.

### D-011: web-sdk build hang and telemetry
`vite build` in the web-sdk sample finishes ("done") but the process never exits, and turbo calls
`telemetry.vercel.com`, which is blocked. Our build sets `TURBO_TELEMETRY_DISABLED=1` / `DO_NOT_TRACK=1`
and runs through a wrapper script that exits after the static adapter reports completion.

### D-012: Headline numbers vs Coba (open question for Dylan, no change made)
7×7 and 25,000× are the brief's values and are kept. If reviewers or Dylan want more distance from Coba,
the cheapest change is the cap (e.g. 30,000×, if the math supports it and the cap stays obtainable; MATH_REPORT
will say whether it does). The grid size is baked into the whole game and should stay 7×7.

### D-013: A flat top end in the paytable
A snake of length ≥ 4 turns almost every neighbouring symbol into a paying cluster (wild sharing, SPEC 7.2).
Per-spin pays before the multiplier grow very fast with length under a conventional steep paytable:
C(8) ≈ 23×, C(15) ≈ 145× (measured, `/tmp` sweep `cl.py`, 3,000 boards per length). With a flat top end,
C(8) ≈ 14× and C(15) ≈ 29×. We use the flat shape: the **multiplier**, not the size band, drives the big
wins, and the natural RTP stays controllable.
Alternatives: a steep paytable plus a much lower pearl supply, rejected because the Hunt then dies
(OUROBOROS never happens); fewer symbol types, rejected because the brief fixes 8.

### D-014: Pearl tiers (a per-round "reel-set" choice for pearls)
The value of a Hunt is extremely convex in pearls eaten: a Hunt with no pearls pays ~7×, with ~1.4
pearls ~76×, with ~4.6 pearls ~845× (measured). With i.i.d. pearls, a Hunt averaging ~90× almost never
reaches length 8, so OUROBOROS never happens. Decision: draw a hidden pearl tier once per feature
round (lean / normal / rich) and once per base egg spin (normal / rich), the same way games pick a reel set.
Rich rounds are where the snake grows long and bites its tail. Rules are unchanged; SPEC 5.5 documents it.

### D-015: VENOM HUNT starts at ×2 instead of ×5; the cost is set by the math
A length-8 snake pays ~15× per spin before the multiplier. Starting at ×5 put the natural average at
~2,700–5,500× (sweeps V1–V4, S1). Following the brief ("if it doesn't balance, make it cost more;
don't change the mechanic"), the start is **length 8, ×2**, lean pearls, and the cost is chosen so
the natural RTP sits just above 96 % (the LUT tilt then trims it). Start length stays 8, so OUROBOROS is
on from the first spin.

### D-016: Compact book encoding + zstd level 19
Measured on the same sample: Hunt books were 2,674 B each (SDK default level 3, verbose cells). Compact cells
`[reel,row]` + string symbols + level 19 gives 822 B (3.25× smaller). Venom went from 4,196 to 1,356 B.
Two lines in the vendored SDK writer are patched (marked `CONSTRICTOR patch`): the compressor level and
compact JSON separators. The output is standard zstd / JSONL, and the RGS format checks pass.

### D-017: LUT weighting by exact bucket quotas + a power tilt (instead of the Rust PigFarm)
The weights define the real probability of each book. Our own weighting (SPEC 12.3, `optimize.py`):
exact bucket probabilities (the trigger probability is a known fraction from the key table, the max-win
frequency is explicit), natural in-bucket distribution, and one power-tilt parameter solved by
bisection for **exact 96.00000 %**. The tilt is reported per mode. Why: it keeps the natural feature
frequencies (egg, trigger, Ouroboros) honest and lands RTP exactly. The PigFarm optimizer was built and
run on the SDK sample in P0 and remains an alternative.

### D-018: The snake never boxes itself in (pearl-proof lookahead)
A first run hit "no legal path" (head trapped by its own body next to pearls). Fix (SPEC 5.5): a
free-spin path is only accepted if its final shape keeps a 12-cell self-avoiding escape walk that
avoids the whole body. That walk is pearl-proof, because growing is the worst case. There is a relaxation
ladder, and a round is discarded only as a last resort. Measured: 0 stuck in 40,000 natural Hunts;
3 in 24,000 boosted-Venom stress rounds (those are resampled).

### D-019: Rule details settled in SPEC
- Cells the tail leaves are **EMPTY** (the snake ate them) and act as blockers until the next drop.
  Alternative: the symbols reappear, rejected because the brief says the symbol is eaten.
- The OUROBOROS bite **ends the snake's moves** for that spin; the remaining counter is forfeited.
- Buy rounds start directly in the feature (no paid base spin); the Hunt buy's 3/4/5-key start uses the
  same relative odds as a natural base trigger (3.4 : 0.5 : 0.1), so a bought Hunt matches a triggered one.
- VENOM HUNT retriggers work the same as in THE HUNT (+5, max 30).
- The snake enters free spins from an edge: its tail cell is on the border, and the frontend slides it in.

### D-020: Art pipeline: Higgsfield generates, but results can't be imported here, so placeholders + manifest
Higgsfield works (the balance was read, 8 style-lock drafts were generated for 2 credits). But generated files
live on `d8j0ntlcm91z4.cloudfront.net` / `d2ol7oe51mr4n9.cloudfront.net`, which this environment's egress
policy blocks (curl 403, WebFetch EGRESS_BLOCKED). Higgsfield's sandbox can fetch them, but its tooling
forbids relaying bytes as base64/text. A test relay also truncated at ~20 KB per call, which is impractical.
**Decision:** do not generate finals blind. The frontend ships with procedural (code-drawn) placeholder
art in the palette. `frontend/.../assets/manifest.json` makes any file dropped in `art/final/` with the
listed name replace its placeholder with zero code changes. `art/HIGGSFIELD_PROMPTS.md` has every final
prompt, model, setting and target filename. Once the two hosts are allowed, the same prompts are run here
(using the style-lock drafts as references) and the assets are post-processed and reviewed.
Alternatives rejected: blind generation of the full set (wastes credits without QA); base64 relay (forbidden
by the tool, impractical).

### D-021: Audio is synthesized in code (original placeholders)
Higgsfield's audio tool is speech-only; its music/SFX models are reserved for its own game pipeline
(tool description). All SFX and the music loops are synthesized by `art/audio/synth.py` (numpy: filtered noise,
FM bells, plucked-string bass, heartbeats). They are original, license-free and clearly marked as placeholders.
The final-audio brief is in `art/AUDIO_SPEC.md`.

### D-022: Frontend architecture (web-sdk monorepo, own app, lean runtime)
The frontend is the web-sdk monorepo (pinned `1843d60`), with the game as `apps/constrictor`. It reuses the SDK's
`rgs-fetcher`, `utils-fetcher`, `utils-event-emitter` (UI events) and `utils-book` (`createPlayBookUtils`:
one async handler per book event). It does **not** use the SDK's xstate machines or `pixi-svelte`
components. The game needs a custom snake mesh/shader and a clock that owns every delay (turbo, skip,
reduced motion), and a thin Pixi 8 stage behind a Svelte 5 DOM UI is smaller and easier to audit.
Studio 12 reusable modules: `packages/ui-controlbar` (presets plain/studio12/noir, dense mode for the
mini-player) and `packages/ui-loading` (studio splash then key art). The build is SvelteKit
adapter-static with `bundleStrategy: 'inline'` and relative paths, so a single `index.html` plus
`assets/` and `fonts/` work from any CDN path. Fonts are self-hosted OFL (@fontsource). `@font-face` lives in
`app.html` with `%sveltekit.assets%`, so the URLs stay relative. Alternatives rejected: the SDK's sample-app
template (sample assets must not ship; its machine layer is more than this game needs).

### D-023: Payout display source
The RGS docs give `round.payoutMultiplier` as a float (×bet), while books store integer hundredths. The frontend
shows only book amounts × the round's bet (`bookToMoney`) and takes the round payout from the book's
`finalWin`, using the RGS float only as a fallback. The balance always comes from the RGS. So whether the
RGS reports 11.5 or 1150, the game shows the same numbers.

### D-024: Development RGS
`apps/constrictor/scripts/mock_rgs.py` is a stdlib-only mock of the wallet API plus bet replay. It serves the
static build and real books (a weighted sample from `math/extract_books.py`) and has dev endpoints to force a
showcase book. It is used for manual play, Playwright smoke/screenshot runs and the soak test. It is not part of
the submission.
