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

### D-025: The upload set is committed in <100 MB parts
GitHub rejects files over 100 MB, and three book files are larger (ante 138 MB, hunt 229 MB, venom 369 MB).
`math/publish_parts.py pack` splits them into 95 MB parts under `math/games/constrictor/publish/`, with
`SHA256SUMS` of the whole files. `join` rebuilds and verifies them. Alternatives rejected: Git LFS (it can't be
verified through this environment's git proxy); leaving the books out and regenerating (about 2 h of compute
and not guaranteed byte-identical, so the LUT hashes would not match what was verified).

### D-026: Hero transitions are in-engine, not video, for now
The brief's videos (intro, Hunt trigger, Ouroboros accent, max win) can't be imported (D-020). The Hunt/Venom
intro follows STYLE_BIBLE §9 in-engine: a brass key turns in the hub, the wheel spins, the door swings open on its
left hinge (CSS 3D), a black veil falls, the title rises out of it, then the board. At the max win, every jewel
left on the board is drawn into the serpent's mouth before the title, so the vault is literally empty.
**Video layer (`src/game/video.ts`):** when final clips exist (`art/final/vid_*.webm|mp4` → manifest), they play
with no code change: the Hunt clip before the in-engine title, the max-win clip after the vault empties, the
OUROBOROS clip as a screen-blended overlay while the board animation runs, and the intro after the loading
screen only if it has already loaded. Hero clips lazy-load after the first spin; every clip is skippable
(tap/space) and skipped in turbo and under reduced motion. Checked with a generated test clip:
`node tests/e2e/video.mjs` (7/7). OUROBOROS is slow motion,
camera push, ring ignition, green shards and a ×2 slam. Max win is a gold shower, a shake and the
Limelight-set "THE VAULT IS EMPTY". The manifest already has video slots (`vid_*`); when finals exist they can
play as lazy-loaded overlays without replacing the board animation.

### D-027: Guardian = the snake renderer wrapped around the frame
Instead of a separate guardian illustration plus an eye sprite, the guardian is a second `SnakeView` whose
path is a rounded rectangle around the frame (the same scale strip, shader and head as the playing snake).
For anticipation its eyes glow venom green (two additive soft dots on the head rig). When the pointer is a
mouse, its head turns subtly toward it (desktop only, off under reduced motion). The `guardian_eye` asset was
dropped from the manifest and the prompts file. Reason: one consistent creature, no extra art dependency,
and it stays alive (breathing, tongue flicks).

### D-028: No filters in the render loop
All Pixi `BlurFilter`s were removed: the snake contact shadow uses layered strokes, cluster glows use layered
wide strokes, and key glows and particles use one shared radial soft-dot texture. Measured in headless
software rendering at 1200×675: 1.7 fps → 4 fps. Mobile GPUs pay for filters in the same way. The scale strip
is mipmapped to stop shimmer when minified.

### D-029: Counters use Archivo tabular numerals, titles use the Deco face
In Big Shoulders Display 900 the "1" reads as "|" at HUD sizes (for example "×1" looked like "×|"). Every
counter (MOVES, LENGTH, multiplier, money) uses Archivo 800 with tabular figures. Titles, win tiers and the
wordmark keep Big Shoulders; the max-win title uses Limelight.

### D-030: MOVES + snake status on a plaque above the board
The brief asks for a MOVES counter above the board and a status line "LENGTH 12 · ×17". In landscape, a
brass plaque sits on the board's top rail (`StatusPlaque.svelte`), and the side panel keeps the feature
counter and feature win. In portrait, the HUD row above the board shows the same values.

### D-031: UI in the owner's glass dock style
The owner supplied a taskbar design (`slot_layout.html`): a beige glass dock with a 3 px black outline and
round corners, a menu button with a popup (auto spin, speed, sound), a central SPIN, bet −/+, and a floating
dashed "Buy Bonus" button with its own popup. It replaces the brass control bar and the BUY / SERPENT CALL
plaques (`Taskbar.svelte`, `BonusButton.svelte`), and every other UI surface follows it: loading screen,
dialogs, HUD cards, the status plaque, the logo card and the win cards (STYLE_BIBLE §7). Kept from the game:
its fonts. Added for Stake: BALANCE and WIN on the dock at all times, the SERPENT CALL switch in the bonus
popup with an "on" chip, rules and settings in the menu. Turbo runs at exactly 2× so "SPEED: ×2" is literal.

### D-032: A skip fast-forwards the current spin only; lighter snake rendering
Owner report: quick-spinning in the bonus, and the moment the snake leaves, felt laggy. Measured with a CPU
profile (`NO_MINIFY=1` build): one tap in free spin 1 played the rest of THE HUNT inside a single frame (every
move, board update and sound at once), and every frame rebuilt the snake's soft shadow from four round-joined
strokes for both snakes. Changes: `clock.skipping` is cleared at each `updateFreeSpin`, so a tap skips one spin;
short sound effects and effect loops are not started while skipping (win stingers and UI sounds still play);
the shadow is a second mesh sharing the body geometry (widened and offset in its vertex shader, no per-frame
tessellation); the exit is one linear glide of about a second instead of an ease-in-out stop at every cell; path
sampling uses a moving cursor. Presentation only: outcomes, books and the round flow are unchanged.

### D-033: Studio 12 loading screen (owner's spec)
The owner's studio spec defines one loading screen for every game, on desktop and phones: the STUDIO12 wordmark
(Archivo 800, "12" in `#FF6B1A`) centred on `#17181E`, with a thin progress bar under it (orange fill on a dark
track, a little wider than the wordmark) that shows the real asset-loading progress. It stays up at least 2 s and
until loading is done, then hands over to the key art with the title and TAP TO ENTER (the tap also unlocks audio,
which browsers require). The wordmark is about a third of the screen width, capped on large screens. It lives in
the shared `ui-loading` package; the Archivo 800 file is preloaded so the wordmark never shows a fallback font.

### D-034: Taskbar colour to dark glass and brass; SPIN in the exact centre (owner's go-ahead)
The owner allowed the taskbar colour to change and asked for SPIN in the middle. The beige glass clashed with the
noir scene, so every UI surface moved to dark smoked glass with brass outlines, ivory text and brass fills (SPIN,
primary and active buttons); the shapes stay the owner's (rounded, outlined). SPIN was already centred on desktop
but not on phones, where the bet controls pushed it aside: the phone taskbar now has balance | bet | win on top and
menu | − SPIN + below, measured 0 px from the screen centre at all 7 viewports. In the 400×225 mini-player the WIN
card in the side panel is now always shown (it used to appear only after a win).

### D-035: Final symbols and pearls from the owner's Higgsfield set
The owner generated all 16 board images in Higgsfield (GPT Image 2.5, 1024×1024, transparent) for this game and
sent them as files. `art/pipeline/fetch_finals.py --from-dir` checked each (PNG, square, transparent), saved it
under the game filename in `art/final/`, and `build_assets.py` swapped it in (trimmed, 88 % fill, 256 px WebP).
The high symbols now each carry a snake detail; the EGG and KEY glow green; the +25 pearl sits in a gold serpent.
Direct download from the Higgsfield image host is refused by this environment's network policy, so the files came
in as chat attachments. Background, frame, snake parts and audio are still placeholders.

### D-036: The owner's layout, in black with gold outlines
The owner re-sent the taskbar design: keep that layout, black with golden outlines. The dock is now exactly the
design on every screen (menu | SPIN | − BET +); the phone variant with bet above SPIN is gone. BALANCE and WIN
(required on screen by Stake) moved out of the dock into a small card in the same style that mirrors Buy Bonus
(`Readouts.svelte`: beside Buy Bonus on phones, bottom of the right panel on wider screens). SPIN is measured
into the exact centre whenever − BET + fits beside it (a ResizeObserver compares the bet group with the free side
width); otherwise the dock spreads out like the owner's file does below 650 px. Colours: black glass, gold
outlines #D4AF37, gold text #E6C46B, gold SPIN with a black inset ring. Checks: SPIN 0 px off centre at 1200, 1024,
800, 400×225, 425 and 375 px at a $1 bet; no overlap at 320 px even at $1,000; soak 100 rounds 0 mismatches.


### D-037: A white snake whose neck bends on turns
The owner asked to "fix the neck when he turns and make the snake white". **Neck:** the head was a rigid sprite
with about a cell of neck behind the eyes, turned toward the new direction the moment a step began, so on every
turn a straight stub of neck stuck out across the body's curve. The head is now a strip mesh on the same spine as
the body: straight along the heading back to the jaw (a skull does not bend), then the neck bends into the body
curve over 0.7 cells. The heading is the chord to a point 0.4 cells back along the body, so the head swings round
with the curve as it moves into a turn instead of snapping, and body and head can no longer part. **White:** the
snake is a leucistic white (not albino: the eyes stay small, black and glassy). Head and scale textures are white
with soft grey seams; the body shader lights them like the plates (cool fill, warm tungsten key) with a faint
pearl sheen instead of the oil-slick rainbow, and wild, glint and the OUROBOROS ring now tint the white rather than
add light (added light is invisible on white). The guardian coil is the same snake at 84 % brightness so the
hunting snake leads. Style bible §1/§3/§4, the Higgsfield snake prompts and the placeholder key art follow.

### D-038: Math v2: fresh gems refill the snake's trail
The owner asked that gems fall in as soon as the snake eats, instead of leaving holes. In v1 every cell the tail
left stayed EMPTY (a blocker) until the next spin. v2: **the moment the tail leaves a cell, a fresh regular gem
(H1–L4, same weights as the board draw, never a KEY/PEARL/EGG) drops into it** and counts for this spin's
evaluation (`snakeMoves.steps[i].fill`). When a base-game hatchling slithers off after the win is counted, its
cells refill too (`snakeExit.fill`, tail first); those gems are drawn so that none matches a neighbour, so the
board never shows an unpaid cluster (none after a max win: the vault stays empty). Not a tumble: nothing is
removed and re-evaluated. Pearls stay the only multiplier food, so the path generator is unchanged.
**Cost:** the refills add paying cells next to the wild body, lifting natural RTP from ~96 % to ~122 % (base),
~115 % (THE HUNT) and ~118 % (VENOM). Every mode moved by a similar factor, so one even cut was fairest: the whole
paytable × 0.83 (rounded to 0.1×, rows kept increasing). SERPENT CALL's KEY chance was trimmed from ×5.19 to ×4.90
(1 in 51.05) so its natural RTP lands near 96 % like the others; buy prices unchanged. Production books (2.5 M),
LUT weighting to exactly 96.00000 % (θ base −0.0175, ante −0.0320, hunt −0.0063, venom −0.0257) and the
independent verifier (taught the refills: every vacated tail cell must carry a regular `fill`, exit fills must
cover the body and match no neighbour) all pass: 2,500,000 / 2,500,000 books replayed, 0 failures. Every brief
§4.8 target still passes (base hit 29.96 %, EGG 1 in 16, Hunt 1 in 250, split 60.2 / 39.8 %). Math version v2.

### D-039: BALANCE and WIN inside the taskbar
The owner asked for the balance "where it actually belongs". Their layout has no balance at all, and D-036 had
put BALANCE and WIN in a separate card beside Buy Bonus / under the side panel, which read as floating. In slots
the balance lives in the bottom bar: on wide screens BALANCE and WIN now sit inside the dock, right of the menu
button, in the same label-over-value style as BET (a mirror of − BET +, split by a thin gold rule); on phones
they are a slim row across the top of the dock (BALANCE left, WIN right). The WIN amount turns gold while the
round has a win. SPIN stays measured into the exact centre when both sides fit (the ResizeObserver now compares
both side groups). `Readouts.svelte` is gone; the e2e selectors (`.readout`, `.readout.win .val`) are unchanged.

### D-040: Polish pass (owner: "sand the game")
Found in a screen-by-screen review and fixed: the TAP TO ENTER title covered the serpent in the key art (it now
takes the art's empty left third on wide screens and the top on phones, and fits the 400×225 player); the bet
replay card sat on top of the taskbar (now centred over the board); the free-spin counter read "0 / 12" before
the first spin (now "VENOM · 12 SPINS" / "HUNT · 10 SPINS"); cluster outlines stayed after the hatchling left,
framing the fresh gems that took its place (they fade as the refill starts); the tail tapered into a long spike
that made a hatchling look like a carrot (short rounded taper).

### D-041: Less "AI-made": the UI as art-deco vault hardware
The owner asked to make the layout look less AI-made. The tell was uniformity: every element (logo, HUD, stat
boxes, Buy Bonus, plaque, dialogs, win banners, taskbar, SPIN) was the same black rounded card with the same 3 px
gold outline, plus a dashed pill and a perfectly even white ring around the board. Kept the owner's layout (menu
left, SPIN centre, bet right, balance in the bar, Buy Bonus above) and rebuilt the surfaces as one family of 1940s
hardware: black lacquer plaques with a brushed-brass edge and 45° cut corners (`.deco`), a round raised brass SPIN
knob with engraved arrows, a solid brass Buy Bonus ticket, engraved brass lettering for the logo, loading title and
win amounts (no boxes), one stats plaque split by hairlines instead of three boxes, list menus instead of stacked
outlined buttons, underlined rules tabs, squared secondary buttons. The guardian serpent now drapes over the left
rail and the bottom of the frame (tail curling round the corner) instead of looping the whole board. On phones the
BALANCE / WIN row moved to the bottom of the bar so the raised SPIN knob has a clear top edge. No layout, flow or
test selector changed.

### D-042: A light cartoon touch
The owner asked for small changes to make the game a bit more cartoony. Layout, colours, art and gameplay are
unchanged; the change is in line and motion: a dark ink line round every plaque, button and display title (stacked
CSS drop-shadows that follow the cut corners) with a hard offset shadow in place of the soft blur; titles tilt −3°;
buttons spring up on hover and squash on press; the SPIN knob gets ink rings, a white shine and a hard drop. The
snake gets the same ink line (the body strip drawn a little wider in ink under the body, one extra draw sharing its
geometry; the head strip widened and tinted ink under the head) and big glossy black eyes with two catchlights.
The symbols (the owner's final art) are untouched. Style bible §4 and §7 updated.

### D-043: Softer symbols with an outline; a cool moonlit room
The owner found the symbol colours too strong and asked for a better outline and a cooler background. The
owner's finals stay untouched in `art/final/`; `build_assets.py` now grades the game copies: saturation × 0.7 and
contrast × 0.94 (rich, not neon), then a sticker edge (a ~3 px dark ink line hugging the solid silhouette and a
fine gold hairline outside it), so every symbol reads crisply on the dark velvet. The room plate is now moonlit:
steel-blue riveted walls, cool moonlight through the blinds from the upper left, a teal rim on the right, low mist
over the counter and a few soft gold glints; the brass vault door and trim stay warm against it. The in-engine
blind light, floating dust and the light pool on the velvet follow (cool). Style bible §2 updated.

### D-044: The hatchling stays on the board after a base game round
The owner could not see the snake at all with fast spin: in turbo the whole hatch, walk and exit took well under
two seconds, and the snake slithered off at the end of every round. Now the round ends with the hatchling resting
where it finished (still breathing and flicking its tongue, the win outlines kept, its wild glow eased off). It
leaves only when the next spin starts, fading in 120 ms (turbo) / 300 ms as the new board drops, or as THE HUNT
starts. Presentation only: the books, RTP and verification are unchanged. The book's `snakeExit.fill` (fresh gems
for the hatchling's cells) is still produced and checked, but no longer drawn, because those cells stay under the
snake until the next reveal replaces the whole board. Rules text, SPEC §5.6 and §13 updated.

### D-045: Head and body as one piece
The owner asked to fix the neck on turns and make the head and the body one piece. The head was a separate
textured strip (its own baked lighting and diamond scales) laid over the body strip; on a sharp turn its stiff
neck folded over itself just behind the jaw (a crumpled, torn-looking join) and the change of material at the
neck read as two parts. Now one mesh runs from the snout tip to the tail: the head is the front of the body
strip, shaped by a width profile (rounded snout, broad jaw, taper into the neck) and drawn with the same scale
texture, shader light and ink line (the outline and contact shadow round the snout too). The skull stays rigid
to the back of the jaw; behind it a Hermite curve leaves the jaw along the head's heading and joins the body
path, tangent to it, 0.75 cells further back, so the neck has no kink. Tangents span a tenth of a cell, so normals
turn smoothly over the path's sample points, and on a bend tighter than the strip is wide the inner edge is held
inside the radius of curvature (eased along the strip, a soft dent rather than a fold). The eyes (ink socket,
glossy black eye, thin warm rim, two catchlights), nostrils and the gulp gape are vector shapes on the head's
design grid, so they stay crisp at any size; the eye glows and tongue keep their places. The guardian on the
frame is the same snake and gets the same head. `snake_head.png` / `snake_head_open.png` are no longer drawn in
the game (the head is part of the body); the placeholder pipeline still uses `snake_head` for the key art, and it
stays the style reference for the snake parts in `art/HIGGSFIELD_PROMPTS.md`. Presentation only.

### D-046: A see-through taskbar
The owner asked for the taskbar to be a bit transparent. Lowering the face opacity of the `.deco` plaque alone does
not work: its brass `::before` fills the whole shape (it would glow through), and the ink-outline filter on the
plaque paints its stacked drop-shadows under a see-through face, making it opaque again. The dock now has its own
layers: a smoked-glass panel (`rgba(9,9,10,0.4)` with a 7 px backdrop blur, cut corners) and a separate brass rim
(an even-odd clip-path ring with the ink line on both edges); the ink line and drop are applied to the controls
only, with a shorter drop (3 px) so the readouts never smudge on the lighter glass. Layout, sizes and selectors
are unchanged; the other plaques (HUD, dialogs, menu) stay solid. Style bible §7 updated.

### D-047: A richer room
The owner asked for a nicer background. The room plate (still a procedural placeholder, D-020) was a flat grid of
riveted steel panels with hard blind stripes, a plain door and an empty counter. It is now an art-deco strongroom:
deep blue lacquer walls with fluted pilasters, inset panels framed by double brass pinstripes with stepped corners,
a dentil frieze and a brass dado rail; softer moonlight shafts through the blinds with haze and dust in the beams;
fan-shaped Deco sconces on the pilasters casting warm pools (style bible §2 "practicals"); a heavy round vault door
in a bolted frame ring, its machined face with a faint sunburst, brass bolts, spoked wheel and combination dial,
standing a little ajar so gold light leaks round its rim; and a polished black counter with a brass edge that
mirrors the room and catches a few gold glints. Composition is unchanged (board centre calm and darker, door right
in landscape and top in portrait, behind the logo). `room()` now has its own seeded generator; the key art, which
composes the room, was regenerated with it.

### D-048: Type with character: Limelight and Josefin Sans
The owner found the type too plain and asked for something that fits and looks special. Archivo (a plain grotesk)
set nearly every label and number and Big Shoulders (a condensed industrial face) set the titles. Candidates were
compared on the game's black and gold at real sizes. Fascinate was the first pick (bold, very Deco), but its
stylised capital S reads as "ʃ" at game sizes ("CONʃTRICTOR"), so it was dropped. Now: **Limelight** (Art Deco,
1930s–40s) for the logo, win tiers, feature titles, dialog titles, HUD titles and the WILD label; **Josefin Sans**
(1920s geometric) for labels, buttons and readouts; **Archivo** stays for running text (rules, dialog copy, tables)
and the Studio 12 wordmark. All are OFL, self-hosted (`static/fonts`, licences alongside); Big Shoulders and
Fascinate were removed. Neither new face has tabular figures, so the win-banner counters render each digit in a
fixed-width cell (`Digits.svelte`; screen readers get the plain text). `font-synthesis: none` stops faux bold on the
single-weight display face. The logo and titles were resized for the wider letters (the logo scales with the
viewport's height and width so it always fits beside the board). The loading screen title and the in-canvas
texts (WILD, pearl tags) follow. Style bible §6 and §7 updated.

### D-049: The Hunt's snake also stays when the feature ends
While checking banners, the end of a feature showed holes in the board: `freeSpinEnd` removed the Hunt's snake,
and the cells under its body (hidden while it was on the board) stayed empty until the next spin. It now rests on
the board like the base game's hatchling (D-044) and fades as the next board drops. Presentation only.

### D-050: A Deco poster loading screen
The owner asked for a new loading screen design. The Studio 12 splash is unchanged (the owner's spec). The game
screen after it was the key art with the title on the left and a dark tap plate. It is now a centred Art Deco
poster: a brass fan crest, the title in Limelight with the "Win up to 25,000×" line between diamond rules, three
feature cards (EGG: the hatchling and pearls; OUROBOROS; THE HUNT: KEYs to free spins, numbers from the exported
math like the rules), a solid brass "Tap to enter the vault" plate with a soft glow, a brass gauge while loading
(plain preset), and a double brass hairline with corner brackets round the screen. The cards sit left of the hero on
wide screens, in a row under it on tall ones, and hide on very short pop-out players. The key art was redrawn to
match: the hero is smaller and centred for the poster, and its raised neck and head are now one piece with the
coil (same scales and light, an S-curved neck, the game's cartoon head and glossy eyes, D-045) inside the game's
ink line; the dashboard tile foreground follows. `LoadingScreen` gained optional `tagline` and `features` props.

### D-051: New music: noir jazz with a snake charmer
The owner asked to change the music. The placeholders were thin (12 bars of plucked bass, noise brushes and a few
piano chords; the Hunt was 8 bars of bass over a sine pad) and mono. New original music, synthesized from scratch in
`art/audio/music.py` (nothing sampled), all in A minor so the win stingers still fit:
- **Base game** (72 s, 80 bpm, swung): an upright-bass walk with chromatic approach notes, brushes, ride and a
  feathered kick, Rhodes comping in a Charleston rhythm, and a gliding clarinet line in A Phrygian dominant (the
  "snake charmer" mode) over changes that lean on the Phrygian Bb7; a vibraphone answers in the B section (A-B-A').
- **The Hunt** (37 s, 104 bpm): a big-band jungle-tom stomp (toms tuned to E and A, the key's fifth and root), a
  driving walk, a low clarinet riff and a Rhodes pad. **The layer** (exactly the same number of samples, so the game's
  fade-in as the multiplier grows stays in sync) adds a hot muted-trumpet lead and brass hits.
Stereo with a wide room reverb whose tail wraps round the loop point (seamless loops), peaks at -1.5 dBFS, 96 kbps.
Checked by measurement (pitch-class profile per track, band balance for phone speakers, loudness over time, seams,
spectrograms) and the audio QA test (33 files, 0 problems). The SFX are byte-identical; the vault ambience changed
only in its noise pattern (the music now has its own random generator). These are still placeholders: finals per
`art/AUDIO_SPEC.md` drop into `art/final/audio/` and win.

### D-052: No rain ambience, no slither swoosh
The owner did not like the "water and swoosh" sounds (and does like the music). They were the vault ambience
(`amb_vault`: rain-like filtered noise with random drips, looping under everything) and the snake's `slither_loop`
(pulsing filtered noise while it moves or enters). Both are removed from the game, the asset build, the audio spec and
the audio QA list; the music carries the room on its own. The snake's moves keep their musical feedback: a gem tick for
each fresh gem that drops into its trail and the gulp for pearls. `synth.py` still synthesizes (and drops) the slither
so its noise generator stays in step: every other file regenerates byte-identical. 31 audio files, QA clean.

### D-053: Retina fix: the stage is sized by `app.screen`
On Stake (the owner's Mac) the room filled only the top-left quarter of the screen and the right side was black.
`Stage.layout()` sized the background, blinds and dim layer by `renderer.width / renderer.resolution`, but in Pixi 8
`renderer.width` is already in CSS pixels, so on a 2x screen the stage thought it was half its real size (the dust
wrapped at half width too). Every earlier check ran at device pixel ratio 1, where the bug is invisible. The stage now
uses `app.screen` (CSS px). New test `tests/e2e/hidpi.mjs` loads the game at DPR 1, 2 and 3 on desktop and phone and
checks the right-hand strip and the bottom-left corner are drawn room, not the flat backdrop (it fails on the old
code at 2x and 3x, passes now).

### D-054: A visible build label
After re-uploading the Retina fix the owner still saw the old game, and the uploaded file could not be told apart
from the old one. Every build now carries a label (UTC build time, `vite.config.js` `define`, `src/build.ts`), shown
faintly in the bottom-right corner of the loading screen and in Game Info > Legal ("Build 2026.10.06-0507"), so it
is clear at a glance which upload a server serves. Zips handed over are named after the build.

### D-055: Cover art layers for the Stake game tile
The owner needs a 3:4 background and foreground for the cover art that also look good at 16:9. Each ratio gets its
own composition (a crop of one ratio into the other would cut the hero), all in `art/cover/`:
`background_3x4.png` (1500×2000) and `background_16x9.png` (1920×1080): the game's strongroom recomposed for a cover
(`room()` gained optional door/lamps/counter/hero-glow settings; the game's plates regenerate byte-identical): the
vault door centred behind the hero with gold light at its rim, a fan sconce either side, moonlight through the
blinds, the counter low for a title band. `foreground_3x4.png` / `foreground_16x9.png` (transparent): the white
serpent coiled round the black opal (one piece, D-045/D-050) with the owner's gems and pearls spilling at its base
(the wide one adds the snake ring and the pocket watch at the sides). `title.png`: CONSTRICTOR in the game's
Limelight lettering, transparent. `preview_*.png`: the layers assembled with a bottom gradient and the title.
No text in the background or foreground layers. Regenerate: `art/pipeline/cover_art.py`, then
`frontend/apps/constrictor/scripts/cover_title.mjs`.

### D-056: Cover art v2: the vault fits 3:4, the 16:9 adds room; an angry serpent
Owner feedback on D-055: the vault should be composed for 3:4 and the 16:9 should be that picture with more background,
and the foreground should be a proper angry snake. Both covers are now 2160 px tall: `background_3x4.png` (1620×2160)
is the exact centre of `background_16x9.png` (3840×2160). `room()` renders it once, wide (`xpad` widens the plate
without moving anything in the 3:4 frame; the game's plates still regenerate byte-identical), with the vault door
whole inside the 3:4 frame behind the serpent's head, a fan sconce either side, more panelled wall and a second pair
of sconces in the 16:9 margins, and a deep polished counter top for the coils. Only the vignette differs per ratio.
The foreground is new (`art/pipeline/angry_snake.py`, a small numpy 3D renderer: the body a swept tube in a z-buffer,
the head a ray-marched distance field, a shadow map from the key light, ambient occlusion): the white serpent reared
up out of its coils in an S, the head in three-quarter view striking at the viewer, jaws wide, two long fangs and a
row of teeth, venom (the game's green) dripping from the fangs, a slit pupil glowing green under a scowling brow
ridge, imbricated scales with belly plates up the front of the neck, a soft shadow on the counter. It sits inside the
3:4 frame; `foreground_16x9.png` is the same pixels with clear margins. The title is unchanged (`title.png`);
`cover_art.py` now assembles the previews.

### D-057: The 16:9 cover's foreground gets the vault's hoard
Owner request: keep the angry serpent and add the gems round it so the 16:9 looks full and natural. The 16:9
foreground (`art/pipeline/cover_treasure.py`) is the 3:4 snake layer in the middle with a heap of treasure on the
counter either side: a mound of gold coins (drawn procedurally, lit from the upper left, reeded edges) over a mass of
coins in shadow, the owner's jewels resting on it (the opal brooch crowning the left heap with the sapphire,
amethyst, ruby, citrine and the key; the pocket watch crowning the right one with the snake ring, venom vial, egg and
gems), a pearl strand spilling down each heap, a few coin stacks and loose coins and pearls towards the snake. Every
piece is placed on the counter in the snake's own camera and drawn back to front, with a soft shadow under each heap,
contact and cast shadows from the snake's key light, faint reflections in the polished counter, less light further
back, the snake's shadow where it falls on a piece, and a few glints. Nothing sits behind the coil. The 3:4 layers
are unchanged; the preview's bottom gradient is lighter so the heaps stay bright under the title.
