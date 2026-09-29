# CONSTRICTOR: Higgsfield prompt sheet (every asset)

Drop each final file into `art/final/` with the **exact filename** below. On the next frontend build the
asset manifest (`frontend/apps/constrictor/static/assets/manifest.json`) swaps the file in for its
placeholder, with no code changes (see `art/final/README.md` for the sizes the pipeline expects).
All assets follow `docs/STYLE_BIBLE.md`. **No text, numbers or logos in any image.**

Shared prompt blocks (paste where noted):

- **[LIGHT]** = `single warm tungsten key light (3200K) from the upper left, faint cool blue moonlight rim light from the right, deep black shadows`
- **[SHOT]** = `centered, isolated on a transparent background, camera straight-on from slightly above (15 degrees), 100mm macro lens look, f/8, everything in sharp focus`
- **[QUALITY]** = `photoreal materials, crisp fine surface detail, 1940s jeweler's collection, no text, no numbers, no logos, no extra props, no sparkles, no bokeh, no glow`
- **[REF]** = attach the chosen style-lock image(s) as `image_references` (H1 for objects, SNAKE_HEAD for snake parts).

Style-lock drafts already generated (Higgsfield project "CONSTRICTOR (Studio 12) game art"): H1 ×4,
SNAKE_HEAD ×4. Job IDs are in `GENERATION_LOG.md`. Pick the best one of each, then use it as [REF].

## 1. Symbols: `gpt_image_2_5`, quality `high`, resolution `2k`, aspect `1:1`, background `transparent`

| ID | Target filename | Prompt |
|---|---|---|
| H1 | `sym_H1.png` | Studio product photograph of a large oval cabochon black opal, highly polished dome, deep black body with a single vertical slit of red, orange and green play-of-color fire running through its center like a serpent's pupil, set in a thin aged-gold bezel, [SHOT], [LIGHT], [QUALITY] |
| H2 | `sym_H2.png` | Studio product photograph of a heavy antique gold signet ring shaped as a coiled snake wrapped twice around the band, the snake's head resting on the bezel with two tiny emerald eyes, worn aged gold with engraved scales, ring shown three-quarter from above, [SHOT], [LIGHT], [QUALITY] |
| H3 | `sym_H3.png` | Studio product photograph of a small antique apothecary glass vial with a faceted glass stopper, thick old glass with tiny bubbles, filled two-thirds with faintly luminous venom-green liquid, the only soft glow comes from the liquid itself, [SHOT], [LIGHT], [QUALITY] |
| H4 | `sym_H4.png` | Studio product photograph of an open antique gold pocket watch, lid open to the left, engraved snake-scale pattern on the case, cream enamel dial with plain hands and no numerals, short chain loop at the crown, [SHOT], [LIGHT], [QUALITY] |
| L1 | `sym_L1.png` | Studio product photograph of a single deep red ruby, pear cut (teardrop) loose gemstone, point facing up, crisp facets, [SHOT], [LIGHT], [QUALITY] |
| L2 | `sym_L2.png` | Studio product photograph of a single cornflower blue sapphire, cushion cut (rounded square) loose gemstone, crisp facets, [SHOT], [LIGHT], [QUALITY] |
| L3 | `sym_L3.png` | Studio product photograph of a single honey-gold citrine, emerald step cut (rectangle with clipped corners) loose gemstone, long axis vertical, crisp step facets, [SHOT], [LIGHT], [QUALITY] |
| L4 | `sym_L4.png` | Studio product photograph of a single violet amethyst, round brilliant cut loose gemstone seen from above, crisp star facets, [SHOT], [LIGHT], [QUALITY] |
| EGG | `sym_EGG.png` | Studio photograph of a single pale leathery reptile egg, slightly elongated oval, matte ivory skin with faint iridescent blue-green veins under the surface, resting upright, [SHOT], [LIGHT], [QUALITY] |
| KEY | `sym_KEY.png` | Studio product photograph of an antique brass vault key, long shaft with a heavy toothed bit, the bow of the key sculpted as a snake's head, worn brass with dark patina in the recesses, key lying diagonally from lower-left bow to upper-right bit, [SHOT], [LIGHT], [QUALITY] |
| P1 | `pearl_white.png` | Studio product photograph of a single round white South Sea pearl, lustrous, soft pink-silver overtones, [SHOT], [LIGHT], [QUALITY] |
| P2 | `pearl_gold.png` | Studio product photograph of a single round golden South Sea pearl, deep gold lustre, [SHOT], [LIGHT], [QUALITY] |
| P3 | `pearl_rose.png` | Studio product photograph of a single round rose-pink pearl, delicate pink lustre, [SHOT], [LIGHT], [QUALITY] |
| P5 | `pearl_black.png` | Studio product photograph of a single round black Tahitian pearl, dark charcoal body with peacock green and aubergine overtones, [SHOT], [LIGHT], [QUALITY] |
| P10 | `pearl_venom.png` | Studio product photograph of a single round pearl that glows from within with luminous venom green (#3DFF8A), subtle inner light only, slight milky translucency, [SHOT], [LIGHT], no text, no numbers, no sparkles, no bokeh |
| P25 | `pearl_venom_grand.png` | Same as P10 but larger and more intense, faint dark veins inside the glowing green pearl (the grand venom pearl) |

Post-processing (pipeline `art/pipeline/process.py`): trim transparent padding, fit into 88 % of a
square canvas (visual centering), export `512×512` (@2x) and `256×256` (@1x) WebP (q=90, alpha), then pack atlases.

## 2. Snake parts: `gpt_image_2_5`, quality `high`, resolution `2k`, background `transparent`, [REF]=SNAKE_HEAD

| ID | Target filename | Aspect | Prompt |
|---|---|---|---|
| SNAKE_HEAD | `snake_head.png` | 1:1 | Top-down macro photograph of the head of a glossy black sunbeam snake (Xenopeltis unicolor) seen directly from above, head pointing straight up toward the top of the frame, mouth closed, smooth polished scales with subtle oil-slick rainbow iridescence only where the light hits, small dark glassy eyes, elegant and menacing, realistic, only the head and the first few centimetres of neck, neck ending cleanly at the bottom edge of the frame, isolated on a transparent background, [LIGHT], photoreal, crisp fine scale detail, no text, no logos |
| SNAKE_HEAD_OPEN | `snake_head_open.png` | 1:1 | Same snake and angle as the reference, mouth opened wide as if gulping (seen from above: the jaws spread apart, pale pink inner mouth visible, no exaggerated fangs, no blood), head pointing straight up, isolated on a transparent background, [LIGHT], photoreal |
| SNAKE_TONGUE | `snake_tongue.png` | 1:1 | Macro photograph of a single thin forked snake tongue, dark charcoal with a slightly red tint, fully extended straight up, isolated on a transparent background, [LIGHT], photoreal, no head |
| SNAKE_TAIL | `snake_tail.png` | 1:1 | Top-down macro photograph of the tail tip of a glossy black sunbeam snake, tapering to a point toward the top of the frame, body continuing off the bottom edge, same iridescent scales as the reference, isolated on a transparent background, [LIGHT], photoreal |
| SNAKE_SCALES | `snake_scales_strip.png` | 8:1 → crop `2048×256` | Seamless horizontally tileable texture, top-down macro of a black snake's dorsal scales, smooth glossy scales with oil-slick rainbow iridescence like a sunbeam snake, even lighting, no head, no tail, no background, 8:1 strip (use `21:9`, then crop the centre band and make it seamless with the pipeline's offset-blend) |
| SNAKE_SHED | `snake_shed.png` | 1:1 | Macro photograph of a translucent shed snake skin, pale ghostly grey, papery scale pattern, crumpled in a loose ring shape, isolated on a transparent background, [LIGHT], photoreal |

## 3. Environment: `soul_location`

| ID | Target filename | Aspect | Prompt |
|---|---|---|---|
| BG_L | `bg_landscape.jpg` (2560×1440) | 16:9 | 1940s jeweler's strongroom at night, riveted steel walls, round vault door ajar in the far background, black velvet display trays, aged brass fittings, hard film-noir light through venetian blinds casting slatted shadows, faint dust in the air, deep blacks, photoreal, cinematic, calm empty area in the center for a game board, no people, no text |
| BG_P | `bg_portrait.jpg` (1440×2560) | 9:16 | Same room, vertical composition, the calm empty area in the upper two-thirds for a square game board, vault door glimpsed at the very top, velvet trays at the bottom, no people, no text |
| FRAME | `board_frame.png` (2048×2048, transparent centre) | 1:1 (`gpt_image_2_5`, transparent) | Top-down photograph of a square frame of riveted black steel with a thin aged-brass inner edge, the inside of the frame is empty and transparent, rivets evenly spaced, subtle wear, [LIGHT], no text |
| VELVET | `board_velvet.jpg` (2048×2048) | 1:1 | Top-down macro photograph of deep black velvet fabric, fine pile texture, very subtle sheen, evenly lit, seamless, no folds |
| GUARDIAN | `guardian_serpent.png` (3000×3000, transparent) | 1:1 (`gpt_image_2_5`, transparent, [REF]=SNAKE_HEAD) | A giant black sunbeam serpent coiled in a square loop around an empty square space (as if wrapped around a game board), top-down three-quarter view, massive glossy iridescent body, head resting on the upper-left coil with its eye CLOSED, isolated on a transparent background, the centre square completely empty and transparent, [LIGHT], photoreal, no text |
| GUARDIAN_EYE | `guardian_eye.png` (512×512, transparent) | 1:1 (`gpt_image_2_5`) | Extreme macro of a single serpent eye, glossy black with a thin gold-amber iris ring and vertical slit pupil, wet reflection of a warm tungsten light from the upper left, isolated on transparent background, photoreal, no text |

## 4. Videos (silent, no text, center-safe; compress to WebM/MP4 ≤ ~3 MB each)

| ID | Target filename | Model | Settings | Prompt |
|---|---|---|---|---|
| INTRO | `vid_intro_16x9.mp4`, `vid_intro_9x16.mp4` | `veo3_1` (or `kling3_0`) | 6–8 s, sound off | Slow push-in through a heavy round vault door into a dark 1940s jeweler's strongroom at night, a single beam of venetian-blind light sweeps across black velvet trays of jewels, a glossy black iridescent serpent slides silently across the velvet and out of frame, film noir, deep blacks, photoreal, no people, no text |
| HUNT | `vid_hunt_16x9.mp4`, `vid_hunt_9x16.mp4` | `kling3_0` | 3–4 s, sound off | Extreme close-up: an antique brass key with a snake-head bow turns in a vault lock, the massive round vault door swings open into total darkness, dust in a hard light beam, film noir, photoreal, no text |
| OUROBOROS | `vid_ouroboros_loop.mp4` (1:1) | `kling3_0` | ~3 s, **same start and end frame** (seamless loop), sound off | A thin ring of venom-green light racing around in a perfect circle on black, like light running along glossy snake scales, dark background, subtle, no text (overlay only; the real board animation stays in engine) |
| MAXWIN | `vid_maxwin_16x9.mp4`, `vid_maxwin_9x16.mp4` | `veo3_1` | ~6 s, sound off | A giant glossy black iridescent serpent coiled on top of a mountain of jewels, pearls, gold rings and pocket watches inside an emptied round vault, warm tungsten light from above left, slow orbit, triumphant but dark, film noir, photoreal, no text |

## 5. Loading screen and game tile

| ID | Target filename | Model | Prompt |
|---|---|---|---|
| KEYART | `keyart_16x9.jpg` | `gpt_image_2_5` high 2k 16:9, [REF] both | Key art: a black sunbeam serpent rising from black velvet with a black opal in its coils, venetian-blind light across its iridescent scales, 1940s vault in deep shadow, photoreal, cinematic, large empty dark area on the left third, no text |
| TILE_BG | `tile_background.png` (≥ 1200×1200) | `soul_location` 1:1 | A 1940s jeweler's display room bathed in **bright warm golden light**, lifted exposure, cream and warm brass tones, soft light rays through venetian blinds, open vault door glowing warmly behind, lighter centre, **no dark edges**, no people, no text |
| TILE_FG | `tile_foreground.png` (transparent) | `gpt_image_2_5` high 2k 1:1 transparent, [REF] both | Head and upper coils of a glossy black sunbeam serpent with oil-slick rainbow iridescence, its coils holding a large black opal with a vertical fire slit, looking at the viewer, bright rim light, isolated on a transparent background, photoreal, no text |

The Studio 12 splash is typographic (Archivo, "12" in `#FF6B1A`) and built in code.
