# CONSTRICTOR: Visual self-review (brief §10)

Screenshots are judged against `docs/STYLE_BIBLE.md` at the 7 required viewports and in play: base, hatch,
THE HUNT, VENOM HUNT, OUROBOROS, max win, social mode, currencies, rules, replay. They come from
`node tests/e2e/screenshots.mjs` (`docs/screenshots/`), `tests/e2e/smoke.mjs` sequences with forced showcase books,
and Storybook. Every problem below was seen in a screenshot, fixed, and re-checked in a new screenshot.

## Problems found and fixed

| # | Where | Problem (rule broken) | Change |
|---|---|---|---|
| 1 | Desktop, laptop, popout L | Round spin button overflowed below the viewport (layout) | Bar grid row fixed to the bar height; the button rises above the bar instead |
| 2 | Popout S (400×225) | Balance overlapped the bet "−" button (readability) | Dense control-bar mode: compact sizes, AUTO/TURBO move to the menu, win shown in the side HUD |
| 3 | All | Empty board before the first spin (looked broken) | Fixed decorative idle board (not an outcome) |
| 4 | Portrait | Empty band above the board when idle | Text wordmark + "WIN UP TO 25,000×" plaque (no text baked into art) |
| 5 | Snake head | Thumb-shaped silhouette, 8-bit banding in the shading, eyes invisible at game size (§4 realism) | Analytic height-field viper head: broad jaw, brow ridges, diamond scales continuous with the body |
| 6 | Snake head | Hard square edge where the head sprite met the body | Neck alpha fades into the body mesh; head scaled so its neck matches the body width |
| 7 | Snake eyes | Amber slit eyes contradicted §4 ("small, black, glassy") | Black glassy eyes with a thin warm iris rim and a catchlight, so they still read at 48–96 px |
| 8 | Guardian | Coil hidden under the frame sprite; square corners folded the mesh into a bright sliver; scale texture shimmered | Guardian drawn above the frame on a rounded path; scale strip mipmapped |
| 9 | Board | Black snake low-contrast on near-black velvet | Warm pool of lamp light on the velvet (masked to the board) |
| 10 | Wins | Glow bands too heavy; outline drawn twice (shared Graphics context) | Glow toned down; outline and glow each own their geometry |
| 11 | HUD | "×1" read as "×\|" in the condensed Deco face (§6: counters) | Counters use Archivo with tabular numerals; Deco face kept for titles |
| 12 | Portrait Hunt | Free-spin counter clipped at the top | HUD row grows during features |
| 13 | Board | MOVES flash overlapped the top row of symbols | MOVES/LENGTH/multiplier brass plaque on the frame's top rail |
| 14 | Free spins | A full-screen win banner on nearly every free spin made the feature drag (restraint, §7) | Full banners only for DEVOUR+ inside features; smaller wins get a brief amount pop; count-ups shortened |
| 15 | After OUROBOROS | Venom-green sheen stayed on the snake in later spins (§3: venom sparingly) | Sheen and wild glow settle as the next board drops |
| 16 | Background | Plain diagonal stripes; no strongroom (§1) | Procedural strongroom plate: riveted steel panels, round vault door ajar, brass-trimmed counter, tungsten key upper left, cool moon rim right |
| 17 | Background + snake + overlay | Blind slats rose to the right at ~60° (§2: ~30°, falling left-high to right-low) | Plate, drifting overlay (now centred, always covering the view) and snake shader all use the §2 direction |
| 18 | Right panel | Wordmark over the busy vault-door wheel | Soft dark backing behind the wordmark |
| 19 | Frame | Flat dark slab (§1/§7) | Bevelled brushed steel, brass lip lit from the upper left, stepped Deco corner plates |
| 20 | Tile | Floating head above the gem | Serpent coiled around the Black Opal, head rising from the coil; background bright with no dark edges (§10) |
| 21 | Board (popout L) | "WILD" label drawn above a top-row snake, hidden under the frame and plaque | Label clamped inside the board; it goes below the body when the body is on the top row |

## What still falls short of the bible (and why)

- **Materials are illustrative, not photoreal.** Every image is procedural placeholder art because the Higgsfield
  results cannot be imported here (D-020). The realism rules in §8 apply to the finals; the prompts, models and
  target filenames are ready in `art/HIGGSFIELD_PROMPTS.md`, and the manifest swaps finals in without code changes.
- **Hero moment 1 (Hunt trigger)** is an in-engine vault-door wheel that spins open behind the title; the bible's
  "key turns, door swings open, blackness" needs the video or final art (D-026).
- **Hero moment 3 (max win)** is a gold shower, a shake and "THE VAULT IS EMPTY" in Limelight; the bible's
  "serpent coiled on a mountain of jewels" needs the final art or video.
- **KEY bow** is a plain ring, not a snake head, and the **tongue** is a simple forked sprite (placeholders).
- **Audio** is synthesized placeholder audio (D-021); `art/AUDIO_SPEC.md` is the brief for the finals.
