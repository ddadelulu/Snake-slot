# CONSTRICTOR: Audio spec

The shipped audio is **original placeholder audio synthesized in code** (`art/audio/synth.py`, DECISIONS
D-021). No samples, loops or presets from third parties. This file is the brief for final audio. Any file
dropped into `art/final/audio/<id>.mp3` replaces its placeholder via the asset manifest
(`art/pipeline/build_assets.py`) with no code changes.

## Direction
Noir vault heist. 1940s jazz club behind a steel door: upright bass, brushed snare, muted trumpet, vibraphone,
low piano. The snake is dry and close: scales on velvet, a soft hiss, a wet gulp. Every sound sits under
the music and nothing is harsh. Mix for phone speakers first: fundamentals above 80 Hz, a hiss band
around 4–6 kHz.

## Global rules
- Format: MP3 44.1 kHz, 96–128 kbps (music 128 kbps), peak −1 dBFS; SFX trimmed to −60 dB tails.
- Loops (`*_loop`, `music_*`) must loop sample-accurately, with no click at the seam.
- Two buses: **music** (music_*) and **sfx** (everything else). Mute, volumes and tab-hidden
  silence are handled by the game (`src/game/sound.ts`).
- Turbo pitches nothing up. Repeated sounds (gulp, mult_tick) are pitched by the game (+12 % per step, capped).

## Asset list (id: use, length, notes)

| id | Trigger (book event) | Length | Notes |
|---|---|---|---|
| land_1, land_2, land_3 | each column lands (`reveal`) | 0.15 s | felt-tipped thud on velvet, three variants |
| gem_tick | gem symbols settle | 0.1 s | tiny glass tick |
| key_land | a column with a KEY lands; retrigger | 0.6 s | heavy brass key on a steel tray, short ring |
| heartbeat_loop | anticipation (2 KEYs landed) | 1.6 s loop | low double heartbeat, ~70 bpm |
| egg_wobble | `hatch` start | 0.5 s | leathery creak |
| egg_crack | shell splits | 0.4 s | dry crack and crumble |
| hatch_hiss | hatchling emerges | 0.8 s | soft hiss, rising |
| tongue_flick | idle flick | 0.2 s | tiny wet flutter |
| gulp | pearl swallowed (`snakeMoves` step eats a pearl) | 0.35 s | wet gulp, pitch-stepped by the game |
| mult_tick | multiplier increases | 0.2 s | brass counter click |
| mult_slam | OUROBOROS doubling | 0.9 s | slammed brass stamp + sub |
| ouro_bite | OUROBOROS bite | 0.5 s | jaws snap on scale |
| constrict_crunch | enclosed cells constrict | 1.0 s | leather creak into glass crunch |
| deep_boom | constriction lands | 1.5 s | sub boom, very short tail |
| cluster_win | `winInfo` | 0.7 s | vibraphone chord, key follows the music |
| countup_loop | count-up running | 1 s loop | soft ticking coin counter |
| vault_door | THE HUNT awarded | 2.5 s | wheel lock spins, bolts retract |
| ui_click, ui_toggle | UI | 0.05 s | quiet, dry |
| stinger_strike / _constrict / _devour / _apex / _vault_empty | win tiers 1–5 | 1.5–4 s | same motif rising in scale; vault_empty is the full band hit |
| hunt_intro_sting | feature intro | 2.5 s | muted trumpet phrase over the bass |
| ouroboros_sting | OUROBOROS title | 2 s | reversed cymbal into low brass swell |
| music_base | base game | 60–90 s loop | slow noir jazz, bass + brushes + sparse piano, 72 bpm |
| music_hunt | THE HUNT / VENOM HUNT | 60 s loop | same key, 96 bpm, walking bass, ride |
| music_hunt_layer | added as the multiplier grows | 60 s loop, synced to music_hunt | trumpet/vibes layer; the game fades it in from ×2 up to ×21 |

## Placeholder generator
`math/env/bin/python art/audio/synth.py` regenerates every placeholder into `art/placeholder/audio/`.
Then `math/env/bin/python art/pipeline/build_assets.py` copies them into the game with the manifest.

## QA check
`node tests/e2e/audio.mjs http://localhost:8080` (in `frontend/apps/constrictor`, with any server of the build)
decodes every shipped file with the browser's WebAudio decoder (the one the game uses) and checks: peak ≤ −1 dBFS,
no near-silent file, loop seams, and every id in this spec present. Result for the placeholders: 33 files, 0 problems.
The placeholders are normalised to −1.5 dBFS because MP3 encoding overshoots sharp transients (`gem_tick` hit
−0.1 dBFS at −1.0). Chromium honours the encoder's gapless tag, so the loops start and end within 40 samples.

Known placeholder differences from the lengths above (informational; the finals should follow the spec):
reverb tails make `cluster_win`, `constrict_crunch`, `deep_boom`, `hatch_hiss`, `key_land`, `mult_slam`,
`ouroboros_sting` and `stinger_strike` 2–4× longer, and `music_hunt` / `music_hunt_layer` loop at 37 s instead of 60 s.
The placeholder music (D-051, `art/audio/music.py`) is stereo at 96 kbps: base 72 s at 80 bpm (swung noir jazz with a
clarinet "snake charmer" line in A Phrygian dominant), Hunt 37 s at 104 bpm (jungle toms tuned to the key, walking bass)
with a layer of muted-trumpet lead and brass hits of exactly the same length.
