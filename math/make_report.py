"""Render docs/MATH_REPORT.md from the verifier output (every number comes from a script that ran).

Usage (from /math):  env/bin/python make_report.py
Inputs:  games/constrictor/library/verification_report.json   (verify_constrictor.py)
         games/constrictor/library/weighting_<mode>.json         (optimize.py)
         games/constrictor/library/natural_<mode>.json           (optional: tune snapshot)
"""

import datetime
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, "games", "constrictor", "library")
OUT = os.path.join(HERE, "..", "docs", "MATH_REPORT.md")
NAMES = {"base": "BASE", "ante": "SERPENT CALL (ante)", "hunt": "THE HUNT (buy)", "venom": "VENOM HUNT (buy)"}
LIMITS = {"prob5k": 1e-2, "prob10k": 0.5e-2, "etl40b": 0.9, "etl10k": 0.8, "cvar": 800}


def fmt_1in(p):
    return "never" if not p else f"1 in {1/p:,.0f}" if 1 / p >= 100 else f"1 in {1/p:,.2f}"


def main():
    with open(os.path.join(LIB, "verification_report.json"), encoding="UTF-8") as f:
        reps = json.load(f)
    weights = {}
    for r in reps:
        p = os.path.join(LIB, f"weighting_{r['mode']}.json")
        if os.path.exists(p):
            with open(p, encoding="UTF-8") as f:
                weights[r["mode"]] = json.load(f)
    params_path = os.path.join(HERE, "games", "constrictor", "params.py")
    ver = "?"
    with open(params_path, encoding="UTF-8") as f:
        for line in f:
            if line.startswith("MATH_VERSION"):
                ver = line.split("=")[1].strip().strip('"')
    L = []
    a = L.append
    a("# CONSTRICTOR: Math Report")
    a("")
    a(f"Math version **{ver}** · generated {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} by `math/make_report.py`.")
    a("Every number below comes from these commands (run from `/math`):")
    a("")
    a("```")
    a("env/bin/python games/constrictor/run.py          # books (math-sdk) + LUT weighting + configs + SDK RGS checks")
    a("env/bin/python verify_constrictor.py             # independent replay of every book + all statistics")
    a("env/bin/python make_report.py                    # this file")
    a("env/bin/pytest tests -q                          # unit tests")
    a("```")
    a("")
    a("RTP is **exact**, computed from the published LUT (integer weights × payouts). The Monte-Carlo figure is a")
    a("cross-check that samples rounds by weight (200,000 draws, 95 % CI).")
    a("")
    a("## 1. Summary per mode")
    a("")
    a("| | " + " | ".join(NAMES[r["mode"]] for r in reps) + " |")
    a("|---|" + "---|" * len(reps))
    rows = [
        ("Cost (× bet)", lambda r: f"{r['cost']:g}×"),
        ("Books (simulations)", lambda r: f"{r['books']:,}"),
        ("Books replayed OK / failed", lambda r: f"{r['replayed_ok']:,} / {r['replay_fail']}"),
        ("**RTP (exact, LUT)**", lambda r: f"**{100*r['rtp_exact']:.5f} %**"),
        ("RTP (Monte-Carlo, 95 % CI)", lambda r: f"{100*r['mc_rtp']:.2f} % ± {100*r['mc_ci95']:.2f}"),
        ("Max win", lambda r: "25,000×"),
        ("Max-win frequency", lambda r: fmt_1in(r["max_win_prob"])),
        ("Capped rounds (clipped)", lambda r: f"{100*r['capped_fraction']:.5f} %"),
        ("Hit rate (win > 0)", lambda r: f"{100*r['hit_rate']:.2f} % ({fmt_1in(r['hit_rate'])})"),
        ("Std dev (per unit cost)", lambda r: f"{r['std_per_cost']:.2f}"),
        ("Feature frequency", lambda r: fmt_1in(r["feature_prob"]) if r["mode"] in ("base", "ante") else "every round"),
        ("EGG hatch frequency", lambda r: fmt_1in(r["egg_prob"]) if r["egg_prob"] else "n/a"),
        ("Rounds with OUROBOROS", lambda r: fmt_1in(r["ouroboros_round_prob"])),
        ("Rounds with a retrigger", lambda r: fmt_1in(r["retrigger_prob"])),
        ("Avg final multiplier in feature", lambda r: f"×{r['avg_final_mult_in_feature']:.2f}"),
        ("Avg spins played in feature", lambda r: f"{r['avg_spins_in_feature']:.2f}"),
        ("Unique payouts / non-zero", lambda r: f"{r['unique_payouts']:,} / {r['nonzero_weight_payouts']:,}"),
        ("Zero-weight books", lambda r: f"{r['zero_weight_books']}"),
        ("Most likely payout's share", lambda r: f"{100*r['most_likely_payout_share']:.2f} %"),
    ]
    for label, fn in rows:
        a(f"| {label} | " + " | ".join(fn(r) for r in reps) + " |")
    rtps = [r["rtp_exact"] for r in reps]
    a("")
    a(f"**RTP spread across modes: {100*(max(rtps)-min(rtps)):.5f} %** (limit 0.5 %).")
    a("")
    if any(r["mode"] == "base" for r in reps):
        b = next(r for r in reps if r["mode"] == "base")
        w = weights.get("base", {})
        a("### Base-game RTP split")
        if w:
            pt = w.get("p_trigger", 0)
            a(f"The trigger probability is exact: P(≥ 3 KEYs) = {pt:.8f} (1 in {1/pt:,.2f}).")
        a("")
    a("## 2. Win distribution (share of rounds, by payout in × bet)")
    a("")
    a("| Range | " + " | ".join(NAMES[r["mode"]] for r in reps) + " |")
    a("|---|" + "---|" * len(reps))
    for i, (lab, _) in enumerate(reps[0]["distribution"]):
        a(f"| {lab} | " + " | ".join(f"{r['distribution'][i][1]:.3e}" if r["distribution"][i][1] else "0" for r in reps) + " |")
    a("")
    a("## 3. SDK \"3-star volatility limits\" (secondary targets, REQUIREMENTS §3.3)")
    a("")
    a("| Metric (limit) | " + " | ".join(NAMES[r["mode"]] for r in reps) + " |")
    a("|---|" + "---|" * len(reps))
    for k, lim in LIMITS.items():
        a(f"| {k} (≤ {lim:g}) | " + " | ".join((f"{r['three_star'][k]:.4g}" + (" ✅" if r['three_star'][k] <= lim else " ❌")) for r in reps) + " |")
    a("")
    a("## 4. LUT weighting (SPEC 12.3, DECISIONS D-017)")
    a("")
    a("| Mode | Books per bucket | Bucket probabilities | Tilt θ | Tail shaping |")
    a("|---|---|---|---|---|")
    for r in reps:
        w = weights.get(r["mode"], {})
        if not w:
            continue
        bb = ", ".join(f"{k}: {v:,}" for k, v in w["bucket_books"].items())
        bp = ", ".join(f"{k}: {v:.3e}" for k, v in w["bucket_prob"].items())
        a(f"| {NAMES[r['mode']]} | {bb} | {bp} | {w['theta']:+.4f} | {w.get('tail') or 'none'} |")
    a("")
    a("## 5. Coverage")
    a("")
    for r in reps:
        miss = r["combos_missing"]
        a(f"- **{NAMES[r['mode']]}:** paytable combinations reached {64-len(miss)}/64"
          + (f" (missing: {', '.join(miss)})" if miss else "")
          + f"; pearl values seen {r['pearl_values_seen']}.")
    a("")
    a("## 6. Verification scope")
    a("")
    a("`verify_constrictor.py` imports no game logic. For every book it validates the JSON schema and replays the")
    a("events with an independent rules implementation: board rules (max one EGG, pearls in base only with an EGG, allowed")
    a("pearl values per mode, key lists), every snake step (adjacency, no self-entry, growth queue, EMPTY cells, pearl")
    a("multiplier and length cap), qualifying bites only (length ≥ 8, no pending growth, encloses a cell, last step), flood-fill")
    a("enclosure, constrict symbol, doubling, wild-aware cluster evaluation with its own paytable (cross-checked against the")
    a("published frontend config), multiplier application, cap clipping and the wincap event, retrigger awards and the 30-spin")
    a("cap, feature totals, and finally that the recomputed payout equals the book's `payoutMultiplier` and the LUT payout.")
    a("")
    with open(OUT, "w", encoding="UTF-8") as f:
        f.write("\n".join(L) + "\n")
    print("wrote", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
