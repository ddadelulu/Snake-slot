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
- Loops (`*_loop`, `music_*`, `amb_*`) must loop sample-accurately, with no click at the seam.
- Two buses: **music** (music_*, amb_vault) and **sfx** (everything else). Mute, volumes and tab-hidden
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
| slither_loop | snake moving / entering / exiting | 2 s loop | scales dragging on velvet |
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
| amb_vault | always, very low | 30 s loop | room tone, distant ventilation, the odd drip |

## Placeholder generator
`math/env/bin/python art/audio/synth.py` regenerates every placeholder into `art/placeholder/audio/`.
Then `math/env/bin/python art/pipeline/build_assets.py` copies them into the game with the manifest.
