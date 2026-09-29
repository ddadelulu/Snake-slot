# PROGRESS

Resume point for any session. Update after every phase.

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
| P7 Hero moments, polish, audio | ⏳ in progress | |
| P8 Compliance | ⏳ in progress | viewports, social, replay, resume tests written |
| P9 QA soak, screenshots, submission | ☐ | |

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
- Independent verification (`env/bin/python verify_constrictor.py`): every book replayed from its events with
  no game code, schema-validated, payout == LUT; results in `docs/MATH_REPORT.md`.
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

## Next up
P7 polish (hero moments), P8 compliance runs (`tests/e2e/{viewports,social,compliance}.mjs`),
P9 browser soak (`tests/e2e/soak.mjs`), Storybook, 7-viewport screenshots, `docs/SUBMISSION.md`.

## Open issues
- Live Stake docs sites are blocked by egress; the docs git repo (March 2026) plus math-sdk (Sept 2026) were used instead.
- Coba similarity (D-001/D-012) needs Dylan's eye before submission.
- Final art/video: allow the two Higgsfield CDN hosts in the environment's network settings, then run the
  prompts in `art/HIGGSFIELD_PROMPTS.md` (budget left ≈ 319 credits).
