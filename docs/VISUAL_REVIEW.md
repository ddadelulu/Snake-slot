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
| 22 | Hunt / Venom trigger | Only a spinning wheel; §9 asks for "the key turns, the door swings open, blackness, then the board" | In-engine sequence: a brass key turns in the hub, the wheel spins, the door swings open on its left hinge (CSS 3D), a black veil falls, the title rises out of it, then the board; one duration drives it all (turbo/skip/reduced motion) |
| 23 | Max win | Gold shower + title only; §9's "THE VAULT IS EMPTY" should read literally | On the cap, every jewel left on the board is drawn into the serpent's mouth (nearest first, rising gulps), leaving empty velvet; then the gold shower and the title (frames: `node tests/e2e/hero.mjs`) |
| 24 | KEY symbol | Plain ring bow; §5 asks for a bow shaped as a snake head | Brass key with a viper-head bow (tapered snout, wide jaw, ring hole, engraved ridge, recessed eyes), shared brass shading lit from the upper left |

## Owner-directed UI restyle (D-031)

The owner's taskbar design replaced the brass control bar, and every UI surface now follows it: glass dock,
floating Buy Bonus popup, loading screen (TAP TO ENTER, progress bar, title card), dialogs (rules, bet,
autoplay, settings, confirm, error, resume), replay panel, HUD cards, the status plaque, the logo card and
the win cards. Checked in screenshots at all 7 viewports: no overflow, SPIN centred, BALANCE and WIN always
visible (on the dock; in the 400×225 mini-player the WIN sits in the side panel). The scene art (board, frame, background) is unchanged and still the noir set; the snake turned white later (D-037).

## Owner-directed snake changes (D-037)

| # | Where | Problem | Change |
|---|---|---|---|
| 25 | Snake on turns | A straight stub of neck stuck out across the body's curve: the head was a rigid sprite with about a cell of neck, turned to the new direction as soon as a step began | Head is a strip mesh on the body's spine: rigid to the jaw, then the neck bends into the curve; the heading follows the curve as the head moves (checked frame by frame through a forced HUNT) |
| 26 | Snake colour | Owner asked for a white snake | Leucistic white head and scales, black glassy eyes, shader lit with cool fill and warm key and a faint pearl sheen; wild, glint and ring re-tuned as tints so they still show on white; guardian coil at 84 % |
| 27 | Key art | The coil's lighting flipped sign at its middle, a seam that the black coil hid and the white one showed | Smooth light across the coil |

## Owner round: refills, taskbar balance, polish (D-038 to D-040)

| # | Where | Problem | Change |
|---|---|---|---|
| 28 | Board during and after the snake | The snake's trail left dark holes; the owner wanted gems to fall in | Every cell the tail leaves gets a fresh gem at once (math v2); the hatchling's cells refill as it leaves, with gems that never match a neighbour |
| 29 | Win outlines after the snake leaves | Outlines that counted the wild body would frame the fresh gems | Outlines fade as the exit refill starts |
| 30 | BALANCE / WIN | A separate card beside Buy Bonus read as floating | Inside the taskbar: beside the menu on wide screens (mirrors BET), a slim top row on phones; WIN turns gold on a win |
| 31 | TAP TO ENTER | The title covered the serpent in the key art; TAP was clipped at 400×225 | Title in the art's empty left third (top on phones); fits every viewport |
| 32 | Replay | The replay card sat on the taskbar | Centred over the board |
| 33 | Free-spin counter | "VENOM 0 / 12" before the first spin | "VENOM · 12 SPINS" until spin 1 |
| 34 | Snake tail | Long thin spike; a hatchling looked like a carrot | Short rounded taper |

## Owner round: less "AI-made" (D-041)

| # | Where | Problem | Change |
|---|---|---|---|
| 35 | Every UI surface | All the same black rounded card with a 3 px gold outline: reads as a template | Art-deco plaques: black lacquer, brushed-brass edge, 45° cut corners |
| 36 | SPIN | A text pill like every other button | Round raised brass knob with engraved arrows |
| 37 | Buy Bonus | Dashed italic pill | Solid brass ticket with cut corners; its menu is a list split by hairlines |
| 38 | Logo, loading title, win amounts | Text inside boxes / pills | Engraved brass lettering with deco rules, no box |
| 39 | Phone HUD | Three identical stat boxes | One plaque split by hairlines |
| 40 | Guardian serpent | Perfect even ring round the whole board | Drapes over the left rail and bottom; tail curls round the corner |
| 41 | Rules tabs, menu | Pill chips; stack of outlined buttons | Underlined tabs; list rows |

## Owner round: a bit more cartoony (D-042)

| # | Where | Change |
|---|---|---|
| 42 | Plaques, buttons, titles | Dark ink line and hard offset shadow; titles tilt −3° |
| 43 | Buttons, SPIN | Spring on hover, squash on press; SPIN knob with ink rings and a white shine |
| 44 | Snake | Ink line round body and head; big glossy eyes with two catchlights |

## Owner round: softer symbols, cooler room (D-043)

| # | Where | Change |
|---|---|---|
| 45 | Symbols | Saturation × 0.7, contrast × 0.94; dark ink outline with a fine gold hairline |
| 46 | Background | Moonlit vault: steel-blue walls, cool blind light, teal rim, mist and soft gold glints; brass door stays warm |

## Owner round: the snake stays (D-044)

| # | Where | Change |
|---|---|---|
| 47 | End of a base game round | The hatchling rests where it finished (breathing, tongue flicks, outlines kept) until the next spin, then fades as the new board drops; replaces the slither-off and exit refill (#28, #29) |

## Owner round: head and body one piece (D-045)

| # | Where | Change |
|---|---|---|
| 48 | Snake head and neck | One mesh from snout to tail: same scales, light and ink line; the neck curves smoothly into the body on turns with no fold or seam (checked frame by frame through tight turns, an OUROBOROS round and the guardian); eyes and nostrils drawn on top |

## What still falls short of the bible (and why)

- **Symbols and pearls are final** (the owner's Higgsfield set, `art/final/`, D-035). **The scene art is still illustrative, not photoreal:** background, frame, velvet, snake parts and key art are procedural placeholders because the Higgsfield
  results cannot be imported here (D-020). The realism rules in §8 apply to the finals; the prompts, models and
  target filenames are ready in `art/HIGGSFIELD_PROMPTS.md`, and the manifest swaps finals in without code changes.
- **Hero moments 1 and 3** are now in-engine sequences (#22, #23). The photographic versions the bible
  imagines (a real vault door swinging open; the serpent coiled on a mountain of jewels) need the final art or the
  videos listed in `art/HIGGSFIELD_PROMPTS.md`. The game already plays those clips when they are present
  (`src/game/video.ts`, D-026: intro, THE HUNT, max win, OUROBOROS overlay; checked by `tests/e2e/video.mjs`),
  so this gap closes by dropping the files into `art/final/` with no code change.
- The **tongue** is a procedural placeholder (tapered, wet, forked; it shoots out, waggles and draws back); the
  photoreal final is `SNAKE_TONGUE` in `art/HIGGSFIELD_PROMPTS.md`.
- **Audio** is synthesized placeholder audio (D-021); `art/AUDIO_SPEC.md` is the brief for the finals.
