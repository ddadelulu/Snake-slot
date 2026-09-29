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
