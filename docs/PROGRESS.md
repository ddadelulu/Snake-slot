# PROGRESS

Resume point for any session. Update after every phase.

## Handoff (2026-10-01): read this first

State at commit `b6b1256` (math v2). Work continues on `claude/admiring-gates-ol8le4`. The game is complete and playable
end to end on real, verified books. What is left: final scene art and audio, the owner's sign-off on four decisions,
and the upload. The phase log further down has the full history.

### Task board

| Status | Task | Notes |
|---|---|---|
| ✅ Done | P0–P9: SDKs, SPEC, math core, optimise + verify, style bible, assets, frontend, hero moments, compliance, QA, submission pack | phase log below |
| ✅ Done | Owner round 1: taskbar (D-031 → D-034 → D-036 black and gold), Studio 12 loading screen (D-033), one-spin skip and lighter snake (D-032), final symbols and pearls (D-035), white snake with a bending neck (D-037) | |
| ✅ Done | Owner round 2: math v2 trail refills (D-038), BALANCE/WIN inside the taskbar (D-039), polish pass (D-040) | 2.5 M books re-verified; build, 36 screenshots, MATH_REPORT, RULES, SUBMISSION regenerated |
| ✅ Done | Owner's play-money demo on the v2 build | Checked 2026-10-01: https://claude.ai/artifact/GpsfSiMxA2Cf2bHe5aSyhj runs the `b6b1256` build (version `1790811653738`) with the v2 books |
| ⛔ Blocked | Final scene art: background plate, frame, velvet, snake head, scales and tongue, key art | Placeholders ship. Cloud egress blocks the Higgsfield result hosts (D-020). Prompts and filenames in `art/HIGGSFIELD_PROMPTS.md`; ≈ 319 credits left |
| ⛔ Blocked | Hero videos `vid_*` (intro, Hunt, OUROBOROS, max win) | Optional: in-engine versions ship (D-026); the clips play with no code change once in `art/final/` |
| ⛔ Blocked | Final audio | Synthesized placeholders (D-021); brief in `art/AUDIO_SPEC.md` |
| 👤 Owner | Coba overlap: keep the title, 7×7 and 25,000×? | D-001, D-012 (the cap is the cheapest lever) |
| 👤 Owner | VENOM HUNT at 700× with a length-8 ×2 start | D-015 (the brief's ~400× / ×5 did not balance) |
| 👤 Owner | Accept the SDK 3-star advisory flags on ante, hunt and venom | D-009, MATH_REPORT §3 |
| 🔲 To do | Re-check `docs/REQUIREMENTS.md` against the live Stake Engine docs | The live sites were blocked in the cloud; the March 2026 docs repo was used |
| 🔲 To do | Upload: `math/games/constrictor/publish/` (joined) + `frontend/apps/constrictor/build/`, then put the dashboard's version into the replay URL in SUBMISSION §4 | Needs the owner's Stake Engine account |

### Decisions made (full text in `docs/DECISIONS.md`)

| ID | Decision |
|---|---|
| D-001 | Title CONSTRICTOR kept: no slot uses it. ELK's Coba overlap flagged for the owner |
| D-002 | Math runs on a Python 3.12 venv (`math/env`) |
| D-003 | Control bar and loading screen built fresh (Solvent repo not reachable) |
| D-004 | Art is generated in Higgsfield; budget ≤ 321.7 credits |
| D-005 | All math in integer tenths of a bet (0.1× payout granularity) |
| D-006 | Disclaimer ends "CONSTRICTOR™ and © 2026 Studio 12. All rights reserved." |
| D-007 | Jurisdiction flags are honoured whenever they are `true` |
| D-008 | Max win must hit at least 1 in 10M in every mode |
| D-009 | The SDK 3-star volatility limits are secondary; violations are documented |
| D-010 | math-sdk `a6dccd8` vendored into `/math`; game in `math/games/constrictor/` |
| D-011 | Build wrapper for the vite exit hang; turbo telemetry off |
| D-012 | 7×7 and 25,000× kept (brief values); the cap is the lever if more distance from Coba is wanted |
| D-013 | Flat top end in the paytable: the multiplier, not cluster size, drives big wins |
| D-014 | Hidden pearl tier per round (lean / normal / rich), like a reel-set choice |
| D-015 | VENOM HUNT starts at length 8, ×2; cost set by the math (700×) |
| D-016 | Compact book encoding + zstd level 19 (two SDK lines patched) |
| D-017 | Own LUT weighting (bucket quotas + power tilt) → exactly 96.00000 % |
| D-018 | Pearl-proof lookahead so the snake never boxes itself in |
| D-019 | Rule details: bite ends the moves, buys start in the feature, Venom retriggers like the Hunt, edge entry. (Empty trail cells superseded by D-038) |
| D-020 | Higgsfield results can't be imported in the cloud → placeholders + manifest swap |
| D-021 | Placeholder audio synthesized in code |
| D-022 | Frontend: web-sdk monorepo, own app, thin Pixi 8 stage + Svelte 5 UI, single-file static build |
| D-023 | Payouts shown from book amounts × bet; balance always from the RGS |
| D-024 | Dev mock RGS (`scripts/mock_rgs.py`), not part of the submission |
| D-025 | Upload set committed in < 100 MB parts (`math/publish_parts.py`) |
| D-026 | Hero transitions in-engine; video layer plays final clips when present |
| D-027 | Guardian = a second snake wrapped around the frame |
| D-028 | No filters in the render loop |
| D-029 | Counters in Archivo tabular numerals, titles in the Deco face |
| D-030 | MOVES / LENGTH plaque on the board's top rail |
| D-031 | Owner's glass-dock taskbar adopted; all UI restyled to match |
| D-032 | A skip fast-forwards one spin only; lighter snake shadow |
| D-033 | Studio 12 loading screen per the owner's spec |
| D-034 | Dark glass and brass; SPIN in the exact centre |
| D-035 | Final symbols and pearls from the owner's Higgsfield set |
| D-036 | Owner's layout in black with gold outlines |
| D-037 | White (leucistic) snake; the neck bends into the body on turns |
| D-038 | Math v2: fresh gems refill the trail; paytable × 0.83; SERPENT CALL keys ×4.90 |
| D-039 | BALANCE and WIN inside the taskbar |
| D-040 | Polish pass ("sand the game") |

### Next steps (in order)

1. **Owner sign-off** on D-001/D-012, D-015 and D-009. A change to the cap or the Venom start means a math re-run (step 6).
2. **Final scene art.** From a machine where the Higgsfield result hosts are reachable (a local terminal should be),
   generate the remaining prompts in `art/HIGGSFIELD_PROMPTS.md`: background, frame, velvet, snake head, scales,
   tongue, key art. Use the style-lock drafts as references and log credits in `art/GENERATION_LOG.md`. Install
   them with `art/pipeline/fetch_finals.py` (by URL, or `--from-dir`), then `math/env/bin/python art/pipeline/build_assets.py`.
3. **Optional hero videos** (`vid_*` in the prompts file), then `node tests/e2e/video.mjs`.
4. **Final audio** per `art/AUDIO_SPEC.md` (same filenames as the placeholders).
5. **Rebuild and re-check**: build, the full test list below, regenerate `docs/screenshots/`, update
   `docs/VISUAL_REVIEW.md` against `docs/STYLE_BIBLE.md`, rebuild the demo for the owner.
6. Only if the math changes: production run, verifier, `make_report.py`, `publish_parts.py pack`,
   `export_frontend_config.py`, `extract_books.py`, `replay_examples.py`, then RULES and SUBMISSION.
7. **Re-check REQUIREMENTS.md against the live Stake docs**, then upload (task board).

### How to resume

```bash
# Math (Python 3.12)
cd math
python3.12 -m venv env && env/bin/pip install -r requirements.txt && env/bin/pip install -e .
env/bin/pytest tests -q                       # 132 passed
env/bin/python publish_parts.py join          # rebuild + checksum the upload set
env/bin/python games/constrictor/run.py       # production books (hours); --quick = 4,000 per mode
env/bin/python verify_constrictor.py && env/bin/python make_report.py   # ~1 h on 4 cores

# Frontend (Node >= 22.16, pnpm)
cd frontend && pnpm install && pnpm build     # -> apps/constrictor/build/ (the upload)
cd apps/constrictor
npx vitest run                                # 30 passed + 1 skipped
python3 scripts/mock_rgs.py                   # serves the build + real books on :8080
node tests/e2e/smoke.mjs                      # also compliance, viewports, social, soak, screenshots, storybook
python3 scripts/make_demo.py <outDir>         # play-money demo for the owner
```

Last green run (`b6b1256`): pytest 132, vitest 30 + 1 skipped, compliance 14/14, viewports 7/7,
smoke clean, soak 100 rounds 0 mismatches, social 0, Storybook 44/44, verifier 2,500,000 / 2,500,000.

## Status by phase

| Phase | Status | Notes |
|---|---|---|
| P0 SDKs, requirements, name check | ✅ done | See below |
| P1 SPEC.md | ✅ done | Parameters frozen in §15 (P3) |
| P2 Math core + tests | ✅ done | 72 tests pass |
| P3 Optimize + verify + MATH_REPORT | ✅ done | math v1 frozen, see below |
| P4 Style bible + style lock | ✅ done | Style bible; 8 style-lock drafts (2.00 credits); finals blocked by CDN egress (D-020) |
| P5 Asset production + contact sheet | ✅ done (placeholders) | Procedural placeholders + synthesized audio, manifest swap, `art/contact_sheet.png` |
| P6 Frontend core | ✅ done | Playable loop on real books, all 4 modes |
| P7 Hero moments, polish, audio | ✅ done (placeholder art) | see below |
| P8 Compliance | ✅ done | every brief §3 item ✅ except the advisory 3-star metrics (⚠️, D-009) |
| P9 QA soak, screenshots, submission | ✅ done | `docs/SUBMISSION.md`, `docs/MATH_REPORT.md`, `docs/screenshots/` |

## P0: done (2026-09-29)

- Cloned and pinned: math-sdk `a6dccd8` (2026-09-22), web-sdk `1843d60` (2025-11-28), docs `fefadc7`
  (2026-03-17), community skills `b49e401` (secondary). Details: `docs/REQUIREMENTS.md` §0.
- The math-sdk sample `0_0_cluster` runs end to end (sims + Rust optimizer + analysis + RGS checks, 2 min 7 s).
- The web-sdk sample `apps/cluster` builds (`vite build` → "Wrote site to build ✔ done"). The build
  process hangs after finishing (open handle), and turbo telemetry is blocked; handled per D-011.
- `docs/REQUIREMENTS.md` written from the official sources. **New findings not in the brief:** 0.1×
  payout granularity, the SDK "3-star volatility limits", ante needs confirmation (cost > 2×), replay
  button content rules, and the refresh must keep the bet level.
- Name check: "Constrictor" is free as a slot title (D-001). **Coba (ELK) overlap flagged** for Dylan (D-001, D-012).
- Math SDK vendored into `/math` (D-010). The venv is `math/env` (python3.12), created with
  `cd math && python3.12 -m venv env && env/bin/pip install -r requirements.txt && env/bin/pip install -e .`
- Solvent repo is not available → build the control bar + loading screen fresh (D-003).

## P1: done (2026-09-29)
- `docs/SPEC.md` written: rules §2–§10, event schema §11, math plan §12. Numeric parameters are marked [P3] and frozen at math v1.
- Key rule decisions (in SPEC): cells the tail leaves become EMPTY (blockers); the bite ends the snake's moves; buys start directly in the feature (no base spin); the Venom Hunt retrigger works as in the Hunt.

## P2: done (2026-09-29)
- `math/games/constrictor/`: `engine.py` (pure: board draw, path DFS, enclosure, constrict, wild-aware
  clusters, all in integer tenths), `rounds.py` (base/Hunt/Venom rounds, SPEC 11 events, cap clipping),
  `params.py` (all tunables), `modes.py`, `game_config.py` + `gamestate.py` (math-sdk integration),
  `optimize.py` (LUT weighting, D-017), `run.py` (full pipeline), `schema/book.schema.json`.
- Tuning aids (not used for publishing): `tune.py`, `analyze.py`, `sweep.py`.
- Tests: `cd math && env/bin/pytest tests -q` → **72 passed**.
- Quick end-to-end run (`env/bin/python games/constrictor/run.py --quick`, 4,000 books per mode): SDK books,
  exact 96.00000000 % weighting, configs and the SDK RGS checks (hash, format) all pass. The 3-star warnings
  flag the ante/hunt/venom tails (to address in P3).
- Natural tuning results (tune.py; see MATH_REPORT in P3 for the published numbers):
  base hit ≈ 29.5 %, egg 1/16, Hunt 1/250, split ≈ 62/38; Hunt avg ≈ 90× (lean 50×, mid 149×, rich 1,165×).
- Decisions D-013 … D-019.

## P3: done (2026-09-29)
- Production books: base 1,000,000 · ante 1,000,000 · hunt 250,000 · venom 250,000
  (`cd math && env/bin/python games/constrictor/run.py`, batches reduced to avoid OOM: see `BATCH` in run.py).
- Weighting (D-017): every mode exactly 96.00 % from the LUT (θ base −0.0010, ante −0.0157, hunt +0.0356, venom −0.0193).
- SDK upload checks (`execute_all_tests`): SHA-256 + payout hash OK for all modes. 3-star advisory flags:
  ante `etl40b`, hunt `etl40b`/`etl10k`, venom `etl10k` (D-009: not cost-normalised; documented in MATH_REPORT).
- Independent verification (`env/bin/python verify_constrictor.py`, 53 min on 4 cores): **2,500,000 / 2,500,000 books
  replayed with no game code, schema-valid, payout == LUT**. Exact RTP 96.00000 % in all modes (spread 0.00000 %).
  Base: hit 29.47 %, EGG 1 in 16.02, Hunt 1 in 250, max win 1 in 1,241,198, std 33.86, RTP split 61.79 % base
  spins / 38.21 % Hunt. Full tables and the brief
  §4.8 target check in `docs/MATH_REPORT.md` (`env/bin/python make_report.py`).
- `MATH_VERSION = "v1"`, SPEC §15 filled. Upload set packed for git: `math/games/constrictor/publish/`
  (`publish_parts.py join` rebuilds and verifies it).

## P4/P5: done with placeholders (2026-09-29)
- `docs/STYLE_BIBLE.md`, `art/HIGGSFIELD_PROMPTS.md` (every asset prompt/model/setting), `art/GENERATION_LOG.md`.
- Higgsfield: 2.00 of 321.7 budgeted credits spent on style-lock drafts. The result CDN hosts
  (`d8j0ntlcm91z4.cloudfront.net`, `d2ol7oe51mr4n9.cloudfront.net`) are blocked by this environment's egress
  policy, so finals cannot be imported (D-020). The game ships procedural placeholders
  (`art/pipeline/placeholders.py`) and synthesized audio (`art/audio/synth.py`, D-021); dropping finals into
  `art/final/` and running `art/pipeline/build_assets.py` swaps them in with no code change.
- `art/contact_sheet.png` (`art/pipeline/contact_sheet.py`), `art/AUDIO_SPEC.md`, tile layers (bright, no text).

## P6: done (2026-09-29)
- `frontend/apps/constrictor`: Svelte 5 + Pixi 8, single-file static build (`pnpm build`), D-022.
- Loop: authenticate → play → animate book → end-round (payout > 0), resume of unfinished rounds, bet replay,
  autoplay (confirmed), buy + ante confirmation, rules/paytable/modes/UI guide/disclaimer, social wording.
- Dev loop: `python3 scripts/mock_rgs.py` serves the build + real books (D-024);
  `node tests/e2e/smoke.mjs` (FORCE=mode:category for showcase books).
- Tests: `npx vitest run` → 21 passed (money, bets, social, params, book soak over 3,981 real books).

## P7: done (2026-09-29)
- Hero moments in-engine (D-026): vault-door wheel intro for THE HUNT / VENOM HUNT; OUROBOROS slow motion + camera
  push + ring ignition + venom shards + ×2 slam; gold showers for DEVOUR/APEX/max win; guardian serpent coiled
  around the frame with glowing eyes on anticipation and a head that follows the mouse (D-027); MOVES/LENGTH plaque
  (D-030); viper head placeholder; coiled-serpent tile. Performance: no filters in the render loop (D-028).
- Audio: synthesized placeholders for every cue in `art/AUDIO_SPEC.md` (music layers with the Hunt multiplier).

## P8: done (2026-09-29)
- `node tests/e2e/compliance.mjs` 14/14 (resume, replay without wallet calls, insufficient balance, clean console),
  `node tests/e2e/social.mjs` 0 hits, `node tests/e2e/viewports.mjs` 7/7 with no overflow, rules-content test 7/7.

## P9: done (2026-09-29)
- Browser soak `node tests/e2e/soak.mjs http://localhost:8080 1200`: 1,200 real rounds (all modes), 0 WIN/BALANCE
  mismatches, 0 console/network problems. It found a real memory leak (Pixi 8 GraphicsContext retention), now fixed;
  heap 11.4 → 15.2 MB over 1,200 rounds and flattening, heap-snapshot diff shows no JS-object growth.
- Storybook: 44 stories render (`npx storybook build`, `node tests/e2e/storybook.mjs`).
- Visual self-review against the style bible: `docs/VISUAL_REVIEW.md` (24 problems found in screenshots and fixed;
  remaining gaps are the placeholder art and the two video-dependent hero moments).
- Environment placeholders (2026-09-30): strongroom plate, riveted Deco frame, loading key art; blind light and eyes
  aligned with the style bible.
- `docs/screenshots/` (36), `docs/RULES.md` (generated), `docs/SUBMISSION.md` (blurb, rules, RTP/cost/max win,
  20 replay event ids, tile layers, QA evidence, compliance checklist, open items).

## Owner feedback round (2026-09-30)
- Shareable play-money demo (`scripts/make_demo.py`, in-page RGS stand-in); private link for the owner.
- Symbol sheet for Higgsfield (Claude Doc): every symbol, pearl, snake part and scene image with its filename and
  a copy-ready prompt.
- Owner's taskbar design adopted (D-031): glass dock, menu popup, centred SPIN, bet −/+, floating Buy Bonus popup;
  then every UI surface restyled to match (loading, dialogs, HUD, plaque, logo, win cards). Unused BuyModal removed.
- Checks: svelte-check 0/0, vitest 30 passed + 1 skipped, viewports 7/7 no overflow, compliance 14/14, social 0
  restricted words, smoke with HUNT + VENOM buys clean, Storybook 43/43 stories render, `docs/screenshots` regenerated (36).
- Snake (D-037): the neck bends into the body on turns (head on the body's spine, rigid to the jaw); the snake is
  white (leucistic, black eyes), guardian coil a little dimmer. Checks: svelte-check 0/0, vitest 30 + 1 skipped,
  viewports 7/7, compliance 14/14, smoke clean, soak 40 rounds 0 mismatches, Storybook 44/44, frame-by-frame turns
  in a forced HUNT, `docs/screenshots` regenerated (36).

## Owner round 2 (2026-09-30): refills, taskbar balance, polish
- Math v2 (D-038): fresh gems refill the snake's trail; paytable × 0.83, SERPENT CALL keys trimmed; 2.5 M
  production books, exact 96.00000 % in all modes, independent verification 2,500,000 / 2,500,000 OK,
  pytest 132 passed. MATH_REPORT, SPEC §5/§7/§11/§15, RULES, SUBMISSION (RTP table, replay examples via
  `math/replay_examples.py`), publish set and frontend config/books regenerated.
- BALANCE and WIN inside the taskbar (D-039); polish pass (D-040).

Next up and open issues: see the handoff at the top.
