# PROGRESS

Resume point for any session. Update after every phase.

## Status by phase

| Phase | Status | Notes |
|---|---|---|
| P0 SDKs, requirements, name check | ✅ done | See below |
| P1 SPEC.md | ⏳ next | |
| P2 Math core + tests | ☐ | |
| P3 Optimize + verify + MATH_REPORT | ☐ | |
| P4 Style bible + style lock | ☐ | Higgsfield available: 536.2 credits, budget ≤ 321.7 |
| P5 Asset production + contact sheet | ☐ | |
| P6 Frontend core | ☐ | |
| P7 Hero moments, polish, audio | ☐ | |
| P8 Compliance | ☐ | |
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

## Next up
P1: write `docs/SPEC.md` (full rules, event schema, math plan).

## Open issues
- Live Stake docs sites are blocked by egress; the docs git repo (March 2026) plus math-sdk (Sept 2026) were used instead.
- Coba similarity (D-001/D-012) needs Dylan's eye before submission.
