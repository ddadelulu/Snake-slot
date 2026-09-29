# CONSTRICTOR: Style Bible

Every visual and audio asset is judged against this document. If an asset breaks a rule, it is
regenerated, not retouched to "almost".

---

## 1. The world in one sentence
A 1940s jeweler's strongroom after midnight: riveted black steel, black velvet trays, aged brass, a round
vault door ajar in the dark. Hard film-noir light cuts through venetian blinds. A huge black serpent with
oil-slick scales is loose inside and swallowing the collection.

## 2. Lighting (the signature, shared by every asset)
| Light | Spec |
|---|---|
| Key | Hard warm **tungsten ~3200 K from the upper left**, about 45° elevation. Casts crisp shadows toward the lower right. |
| Rim | Faint **cool moonlight (~6500 K) from the right**. A thin edge highlight only, never a fill. |
| Blinds | Slatted light bands, **~30° from horizontal, falling left-high to right-low**. On the board they drift slowly (code). In stills they are baked only into environment plates. |
| Blacks | Deep. Shadows go to near-black `#07080A`, never grey fog. |
| Forbidden | Front/flat lighting, multiple competing key lights, coloured gel lighting, lens flares, bokeh orbs, glowing auras (except venom green). |

Symbols are shot **straight on from ~15° above**, with a **100 mm macro** look at f/8 (everything sharp,
no fake depth blur), isolated on transparent background, with shadows from the same key light.

## 3. Colour
The environment is **almost monochrome**. Colour is reserved for gems, pearls, venom and the snake's
iridescence. That is what keeps a dark theme rich instead of muddy.

| Token | Hex | Use |
|---|---|---|
| `--void` | `#07080A` | background black, deepest shadow |
| `--charcoal` | `#15171A` | panels |
| `--gunmetal` | `#2A2E33` | raised panels, dividers |
| `--brass` | `#9C7A45` | edges, frames, keylines |
| `--brass-hi` | `#D9B26F` | highlights, active states, win outlines |
| `--ivory` | `#EDE6D6` | primary text |
| `--ivory-dim` | `#A39C8C` | secondary text |
| `--venom` | `#3DFF8A` | venom pearls, the OUROBOROS ring, max-win moments only (**sparingly**) |
| `--ruby` | `#B0122E` | warnings / errors (UI), the Ruby gem |

Gem hues: Ruby deep red, Sapphire cornflower-to-navy, Citrine honey-gold, Amethyst violet. Opal: black
body with a vertical slit of red–green–blue fire. Pearls: white, gold, rose, black Tahitian (peacock
overtone), venom (luminous green, the only emissive object besides the ring).

**Studio 12 orange `#FF6B1A` never appears in the game palette.** It is used only on the studio splash and
loading screen wordmark.

## 4. The snake
- Reference animal: **sunbeam snake** (*Xenopeltis unicolor*): glossy black, small smooth scales, oil-slick
  rainbow iridescence that appears only where the light hits.
- Realistic, elegant, menacing. **Not** cartoon, **not** gory (no blood, no gaping wounds, no
  exaggerated fangs). Eyes: small, black, glassy. No extra eyes.
- In-engine the body is a textured rope mesh. Iridescence is a hue shift driven by segment angle, time
  and the blind-light slats. The head turns smoothly; the tongue flicks every 3–6 s.

## 5. Symbols (read at 48 px, colour-blind safe)
Each gem has a **distinct cut silhouette**, so they read without colour:

| ID | Object | Silhouette cue |
|---|---|---|
| H1 | Black Opal Eye: large cabochon, vertical fire slit like a serpent's pupil | smooth dome + slit |
| H2 | Serpent Signet Ring: heavy gold, coiled snake, tiny emerald eyes | ring with a coil |
| H3 | Venom Vial: antique apothecary vial, glass stopper, faint luminous green liquid | tall vial |
| H4 | Pocket Watch: open, antique gold, engraved scale pattern | circle + crown + open lid |
| L1 | Ruby: **pear** cut | teardrop |
| L2 | Sapphire: **cushion** cut | rounded square |
| L3 | Citrine: **emerald (step)** cut | rectangle with clipped corners |
| L4 | Amethyst: **round brilliant** | circle with star facets |
| EGG | Pale leathery egg, faint iridescent veins | oval |
| KEY | Antique brass key, bow shaped as a snake head | long key |
| PEARLS | White / Gold / Rose / Black Tahitian / Venom | sphere + code-rendered brass tag with the value |

**No text or numbers inside any art.** Pearl values are rendered in code on a small brass tag.

## 6. Typography (all self-hosted, OFL)
| Role | Face | Notes |
|---|---|---|
| Display: titles, win tiers | **Limelight**-style condensed Art-Deco (OFL). Final pick recorded in DECISIONS once licensed files are in `frontend/.../fonts` | uppercase, generous tracking |
| UI | **Archivo** (OFL, variable) | also used for the Studio 12 wordmark |
| Counters | Archivo with **tabular numerals** (`font-variant-numeric: tabular-nums`) | wins, balance, moves, multiplier |

## 7. UI
- Flat, restrained **charcoal panels, 1 px brass edges**, subtle brushed-metal or velvet texture.
- No gradient soup, no chunky cartoon buttons, no glossy pills. Radii ≤ 6 px.
- Readability beats decoration: ivory on charcoal, contrast ≥ 7:1 for body text, ≥ 4.5:1 minimum.
- Icons: thin-line (1.5 px) brass or ivory, consistent stroke.
- Motion: short and purposeful (120–220 ms UI transitions). Restraint everywhere except the three hero
  moments (Hunt trigger, OUROBOROS, max win).

## 8. Realism rules: reject and regenerate if any of these appear
Plastic sheen · random sparkles or bokeh orbs · glowing auras (except venom) · fantasy filigree ·
warped geometry · extra eyes or fangs · smeared details · any text, numbers or logos · a light
direction other than upper-left key · a background that isn't transparent (symbols) · cartoon proportions ·
child-like features.

## 9. Hero moments (where restraint is lifted)
1. **THE HUNT trigger:** the key turns, the vault door swings open, blackness, then the board.
2. **OUROBOROS:** slow motion, camera push, the ring ignites with venom-green light running around the
   scales, enclosed symbols shatter and re-form, and "×2" slams into the multiplier.
3. **Max win: "THE VAULT IS EMPTY."** The serpent is coiled on a mountain of jewels in an emptied vault.

## 10. Game tile (exception to the dark palette)
The Stake lobby is dark, so the **tile must be brighter than the platform, with no dark edges**. The tile
background uses warm lifted brass light, a lighter centre and golden-hour exposure (not the in-game noir
exposure). The foreground layer is the serpent head with the Black Opal on transparency. No text or numbers.

## 11. Audio (mirrors the visuals)
Noir, minor key, upright bass, brushed drums, sparse piano. Close, dry foley: velvet thuds, glassy gem
ticks, scales on velvet, a deep hiss. The only "big" sounds belong to the three hero moments.
Details: `art/AUDIO_SPEC.md`.
