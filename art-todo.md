# Tower Siege — Art Manifest

Tower Siege ships with **zero gameplay bitmaps**. Every block, enemy,
projectile and background layer is drawn procedurally in `src/use/useTowerArt.ts`
from the palettes in `src/game/art.ts`. That is a deliberate choice, not a
placeholder state: it keeps the download tiny and keeps the art crisp at any DPR
and any zoom level.

**But every drawable already has a drop-in override slot.** `spriteFor()` probes
for a bitmap at the paths below on first draw; if the image decodes, the
renderer blits it instead of drawing. No code change is needed to adopt art —
drop the file in, set the flag below, and reload.

> **The probe is OFF by default.** Set `VITE_ENABLE_ART_OVERRIDES=true` in `.env`
> to turn it on. With no override art shipping, every probe missed — and a miss
> is only free for the game, not for the portal: CrazyGames' QA console reports
> each one as `Missing resource detected: …/images/blocks/wood.webp`, one line
> per block and per enemy, which reads as a broken build to a reviewer. Turn it
> on when there is art in these folders to find.

---

## How overrides work

```
src/game/art.ts → spriteFor(kind, id)
  → VITE_ENABLE_ART_OVERRIDES !== 'true'?  return null, request nothing
  → probes  /public/images/<folder>/<id>.webp
  → decodes?  use the bitmap
  → 404?      keep drawing procedurally, forever (never re-requested)
```

* Format: **WebP** (the probe only looks for `.webp`).
* Blocks and enemies are drawn into a **square** box, so ship them square.
* Blocks are drawn at exactly one cell — the sprite's edges ARE the cell edges.
* Transparency is honoured; the renderer composites normally.
* A missing file is not an error and costs nothing after the first probe.

---

## Blocks — `/public/images/blocks/<id>.webp`

Square. Recommended 256×256 (they are drawn at 14–120 px/cell).

| File | Block | Notes |
|---|---|---|
| `gate.webp` | Gate | The core. Should read as a fortified door; warm light from within. |
| `wood.webp` | Wood Crate | Plain plank crate, corner nails. |
| `brace.webp` | Braced Crate | Same crate with a bold X-brace. |
| `stone.webp` | Stone Block | Running-bond masonry, visibly heavier than wood. |
| `archer.webp` | Archery | Platform only — the **bow is drawn live** and rotates. |
| `cannon.webp` | Cannon | Platform only — the **barrel is drawn live** and rotates + recoils. |
| `mortar.webp` | Mortar | Platform only — the **tube is drawn live**. |
| `tesla.webp` | Lightning Coil | Platform only — the **coil + glow are drawn live**. |
| `frost.webp` | Frost Spire | Platform only — the **crystals are drawn live**. |
| `spikes.webp` | Spiked Wall | Palisade face only — the **spikes are drawn live** on all four sides. |
| `bombard.webp` | Bombard | Emplacement only — the **barrel is drawn live** and recoils into its pit. |
| `repair.webp` | Repair Bay | Platform only — the **wrench is drawn live**. |
| `sawmill.webp` | Sawmill | Platform only — the **blade spins live**. |
| `quarry.webp` | Quarry | Platform only — the **pick rocks live**. |
| `mint.webp` | Gold Mine | Platform only — the **coin stack bobs live**. |

> **Important for weapon blocks:** the moving fixture (barrel, bow, coil, blade)
> is drawn on top of the sprite every frame because it rotates, recoils and
> pulses. A weapon-block override should therefore be the **base platform only**
> — if the bitmap includes a barrel, it will appear twice. If you want the whole
> block baked into one bitmap, delete the corresponding `case` in `drawFixture`.

---

## Enemies — `/public/images/enemies/<id>.webp`

Square, drawn centred on the enemy's position and **mirrored horizontally** to
face its direction of travel. Author them facing **right**.

| File | Enemy | Draw scale (cells) |
|---|---|---|
| `grunt.webp` | Grunt | 0.62 |
| `runner.webp` | Runner | 0.55 |
| `slinger.webp` | Slinger | 0.60 |
| `brute.webp` | Brute | 0.85 |
| `bomber.webp` | Bomber | 0.66 |
| `bat.webp` | Bat | 0.50 — flies; author with wings spread |
| `bulwark.webp` | Bulwark | 0.78 — shield on the leading (right) side |
| `wyvern.webp` | Wyvern | 0.80 — late-game flyer, wings spread |
| `eel.webp` | Sea Serpent | 0.85 — see the sea-creature note below |
| `kraken.webp` | Kraken | 1.25 — see the sea-creature note below |
| `golem.webp` | Siege Golem | 1.45 — boss |
| `ram.webp` | Battering Ram | 1.55 — siege engine, see the note below |
| `ballista.webp` | Ballista | 1.35 — siege engine |
| `catapult.webp` | Catapult | 1.70 — siege engine |
| `siegeTower.webp` | Siege Tower | 2.05 — siege engine |
| `trebuchet.webp` | Trebuchet | 2.10 — siege engine |
| `ironRam.webp` | Ironclad Ram | 1.85 — siege engine, **immune to arrows** |
| `bombardier.webp` | Bombardier | 0.82 — bomber; author with the payload visible |
| `firebug.webp` | Firebug | 0.90 — bomber; author with the molotov visible |

> **Sea creatures** are drawn twice per frame: once clipped BELOW the waterline
> as a dark silhouette, once clipped ABOVE it as the full body. An override
> bitmap replaces both passes with the same image, so it must read as a coiling
> body seen head-on with the tail trailing DOWNWARD (the clip splits it
> horizontally at the waterline). The surface wake is always drawn on top
> procedurally and is not overridable.

> **Sea creatures are fish**, not serpents: deep body, sweeping caudal fin,
> dorsal and pectoral fins, gill slit, one round eye. The kraken adds tentacles.

> **Siege engines** animate on state, not on a timer: the wheels turn with
> distance travelled (so a halted engine's wheels stop — the tell that it has
> set up to fire), the catapult and trebuchet arms run a cock-and-release cycle
> only while they have a target, and the siege tower's ramp drops on contact.
> A static override loses all of that; prefer overriding only the chassis.

> Overriding an enemy replaces its **whole** body including the walk cycle, so
> an override is a static pose. Only do it if the art is strong enough to
> justify losing the animation, or extend `drawEnemy` to blit a sprite strip.

---

## Allies — `/public/images/allies/<id>.webp`

| File | Ally | Draw scale (cells) |
|---|---|---|
| `cavalry.webp` | Cavalry | 0.80 — author facing **right**, cool blue with a gold pennant |

> Allies are deliberately the coolest, brightest palette on the field. Whatever
> replaces this art must stay unmistakable at a glance from the warm-toned
> enemies — a friendly unit that reads as a target is worse than no art.

---

## Background — `/public/images/bg/`

The background (sky gradient, two mountain ranges, forest band, ground, water
reflection) is fully procedural and re-tinted by wave tier — dawn → day → dusk
→ night → blood-moon every 5 waves. There is currently **no override hook** for
it, because a static bitmap would lose that progression. To adopt painted
backdrops, add a `bg` probe in `renderBackground` keyed by tier:

| Suggested file | Used for |
|---|---|
| `sky-tier0.webp` … `sky-tier4.webp` | Sky gradient per wave tier |
| `mountains-far.webp`, `mountains-near.webp` | Parallax ranges (tileable horizontally) |
| `forest.webp` | Forest band (tileable horizontally) |

## Already shipped (UI chrome, not gameplay)

| Path | Used by |
|---|---|
| `/public/images/logo/logo_256x256.webp` | Splash logo |
| `/public/images/logo/logo_192x192.png`, `logo_512x512.png` | PWA manifest icons |
| `/public/images/bg/parchment-ribbon_553x188.webp` | Result-screen ribbon (`FReward`) |
| `/public/favicon.ico` | Favicon |

---

## Roofs

Roofed blocks wear a red gable drawn procedurally ON TOP of the block sprite,
overhanging the cell's upper edge. It is deliberately a colour no block material
uses, because "can I build on this?" is a question the player asks constantly.

There is no override hook for the roof itself — an override block bitmap will
still get the procedural gable stacked on it. If you want roofs baked into art,
supply one bitmap per roofed variant and extend `drawBlock` to pick by
`block.roof`.

## Water

The lake in front of the tower (gradient, shoreline, ripple bands) and the
mirrored tower reflection are procedural, keyed off `SEA_LEVEL` in
`src/game/world.ts`. There is no override hook; the reflection has to be
generated from the live tower, so a static bitmap could only ever replace the
water surface underneath it.

## Palette reference

If you are painting art to match the procedural look, the source of truth is
`PALETTES` in `src/game/art.ts`. Each entry is `{ dark, mid, light, accent,
accent2, debris }` — `debris` is the RGB triplet the particle system uses for
that material's shards, so keeping it consistent makes destruction VFX match
your art without any code change.

There is no re-skinning layer on top of the palettes. Cosmetic block themes were
cut because they fought the one thing the renderer has to guarantee: that a
player can tell a cannon from a crate at a glance with forty enemies on screen.
Palette identity IS the readability.

---

# Complete asset checklist

Everything the game currently draws, in one list. **Nothing here is required** —
the game ships complete without a single one of these files. This is the order
to commission art in if you want to replace the procedural look, and the last
column is what the art has to communicate.

Priority: **P0** = the player looks at it constantly; **P1** = frequently;
**P2** = occasionally or late-game only; **P3** = polish.

## A. Blocks — `/public/images/blocks/<id>.webp` · 256×256, square

| # | File | Block | Pri | Notes |
|---|---|---|---|---|
| A1 | `gate.webp` | Gate | **P0** | The thing the whole game protects. Warm light from within; must read as a door at 14 px. |
| A2 | `wood.webp` | Wood Crate | **P0** | The block the player places most. Plank crate, iron corner brackets. |
| A3 | `stone.webp` | Stone Block | **P0** | Running-bond masonry, visibly heavier than wood. |
| A4 | `brace.webp` | Braced Crate | P1 | Wood plus a bold X of squared timber. |
| A5 | `archer.webp` | Archery | **P0** | **Platform only** — the bow is drawn live and rotates. |
| A6 | `cannon.webp` | Cannon | **P0** | **Platform only** — the barrel rotates and recoils. |
| A7 | `mortar.webp` | Mortar | P1 | **Platform only** — the tube is drawn live. |
| A8 | `bombard.webp` | Bombard | P1 | **Emplacement only** — the barrel recoils into its pit. |
| A9 | `spikes.webp` | Spiked Wall | P1 | **Palisade face only** — spikes are drawn live on all four sides. |
| A10 | `tesla.webp` | Lightning Coil | P2 | **Platform only** — coil and glow are drawn live. |
| A11 | `frost.webp` | Frost Spire | P2 | **Platform only** — crystals are drawn live. |
| A12 | `repair.webp` | Repair Bay | P2 | **Platform only** — the wrench is drawn live. |
| A13 | `sawmill.webp` | Sawmill | P2 | **Platform only** — the blade spins live. |
| A14 | `quarry.webp` | Quarry | P2 | **Platform only** — the pick rocks live. |
| A15 | `mint.webp` | Gold Mine | P2 | **Platform only** — the coin stack bobs live. |

> **Weapon and economy blocks want the BASE ONLY.** The moving fixture (barrel,
> bow, coil, blade, wrench) is composited on top every frame because it rotates,
> recoils and pulses. Ship a bitmap with a barrel already on it and the block
> will have two. To bake a whole block into one image, delete its `case` in
> `drawFixture`.

## B. Enemies — `/public/images/enemies/<id>.webp` · square, author facing RIGHT

| # | File | Enemy | Scale | Pri |
|---|---|---|---|---|
| B1 | `grunt.webp` | Grunt | 0.62 | **P0** |
| B2 | `runner.webp` | Runner | 0.55 | **P0** |
| B3 | `slinger.webp` | Slinger | 0.60 | P1 |
| B4 | `brute.webp` | Brute | 0.85 | P1 |
| B5 | `bomber.webp` | Bomber | 0.66 | P1 |
| B6 | `bat.webp` | Bat | 0.50 | P1 — flying, wings spread |
| B7 | `bulwark.webp` | Bulwark | 0.78 | P1 — shield on the leading (right) side |
| B8 | `bombardier.webp` | Bombardier | 0.82 | P1 — bomber, payload visible under it |
| B9 | `eel.webp` | Sea Serpent | 0.85 | P2 — fish-shaped, see the sea note above |
| B10 | `wyvern.webp` | Wyvern | 0.80 | P2 — late-game flyer |
| B11 | `firebug.webp` | Firebug | 0.90 | P2 — bomber, lit molotov visible |
| B12 | `kraken.webp` | Kraken | 1.25 | P2 — fish body plus tentacles |
| B13 | `golem.webp` | Siege Golem | 1.45 | **P0** — the wave-10 boss |

## C. Siege engines — same folder, same rules

| # | File | Engine | Scale | Pri | Must read as |
|---|---|---|---|---|---|
| C1 | `ram.webp` | Battering Ram | 1.55 | P1 | Roofed shed on wheels, log swinging inside |
| C2 | `ballista.webp` | Ballista | 1.35 | P1 | Wheeled frame, horizontal bow, loaded bolt |
| C3 | `catapult.webp` | Catapult | 1.70 | P2 | Single arm with a bucket |
| C4 | `siegeTower.webp` | Siege Tower | 2.05 | P2 | Tall rolling tower, drop ramp, banner |
| C5 | `trebuchet.webp` | Trebuchet | 2.10 | P2 | A-frame, long arm, counterweight box |
| C6 | `ironRam.webp` | Ironclad Ram | 1.85 | P2 | **Cold iron** — plated casemate, vision slit, spent arrows stuck in the plating |

> **The Ironclad Ram's art carries a rule.** It is the only enemy immune to
> arrows, and the palette — cold grey, riveted plate, arrows lodged uselessly in
> it — is how the player is told. Do not paint it as timber.

## D. Allies — `/public/images/allies/<id>.webp`

| # | File | Ally | Scale | Pri |
|---|---|---|---|---|
| D1 | `cavalry.webp` | Cavalry | 0.80 | P1 — cool blue, gold pennant, facing right |

## E. Projectiles — no override hook today

All drawn procedurally in `drawProjectile`, rotated to their velocity. To adopt
art, add a `projectile` probe keyed by `kind`.

| # | Suggested file | Kind | Pri | Notes |
|---|---|---|---|---|
| E1 | `bolt.webp` | `bolt` | P2 | Arrow — the most-fired round in the game |
| E2 | `ball.webp` | `ball` | P2 | Cannonball |
| E3 | `shell.webp` | `shell` | P3 | Mortar shell on a ballistic arc |
| E4 | `bomb.webp` | `bomb` | P2 | Finned iron bomb, dropped by bombers |
| E5 | `fire.webp` | `fire` | P2 | Molotov bottle, tumbling |
| E6 | — | `zap` | — | Lightning is a live polyline; a bitmap cannot replace it |
| E7 | — | `frost` | — | The frost round is a live particle emitter |

## F. Background — `/public/images/bg/` · no override hook today

The background is re-tinted by wave tier (dawn → day → dusk → night → blood
moon, every 5 waves), so one static plate would lose the progression. To adopt
painted backdrops, add a `bg` probe in `renderBackground` keyed by tier.

| # | Suggested file | Layer | Pri |
|---|---|---|---|
| F1 | `sky-tier0.webp` … `sky-tier4.webp` | Sky gradient, one per tier | P3 |
| F2 | `mountains-far.webp` | Far range, tileable horizontally | P3 |
| F3 | `mountains-near.webp` | Near range, tileable horizontally | P3 |
| F4 | `forest-far.webp` | Hazy far tree line, tileable | P3 |
| F5 | `forest-near.webp` | Near trees, tileable | P3 |
| F6 | `grass.webp` | Meadow strip, tileable | P3 |
| F7 | `water.webp` | Lake surface — the reflection stays procedural | P3 |
| F8 | `sun.webp` / `moon.webp` | Celestial disc | P3 |

## G. UI chrome — already shipped

| # | Path | Used by | Status |
|---|---|---|---|
| G1 | `/public/images/logo/logo_256x256.webp` | Splash logo | shipped |
| G2 | `/public/images/logo/logo_192x192.png`, `logo_512x512.png` | PWA manifest | shipped |
| G3 | `/public/images/bg/parchment-ribbon_553x188.webp` | Result ribbon (`FReward`) | shipped |
| G4 | `/public/images/icons/movie_128x96.webp` | Every rewarded-ad button | shipped |
| G5 | `/public/favicon.ico` | Favicon | shipped |

## H. Effects — procedural by design

Not asset slots. Listed so nobody commissions art for them by mistake.

| # | Effect | Where |
|---|---|---|
| H1 | Roof gables | `drawRoof` — stacked on top of any block override |
| H2 | Reinforced-block shine | `drawBlock` — a swept gradient with a per-cell phase offset |
| H3 | Burning blocks | `drawBlock` — sine-driven flame tongues plus an ember wash |
| H4 | Explosions, sparks, smoke, blood, coins | `useTowerVfx` pooled particles |
| H5 | Lightning bolts | Live polyline from the simulation's fork points |
| H6 | Water reflection | Generated from the live tower every frame |
| H7 | Damage cracks | Deterministic overlay, three stages, baked into the sprite cache |
| H8 | Build sockets and the ghost piece | `drawBuildOverlay` |
| H9 | Block pictograms | `src/game/blockGlyph.ts` — shared by the tray and the inspector |

## Summary

| Category | Files | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| A. Blocks | 15 | 5 | 4 | 6 | 0 |
| B. Enemies | 13 | 3 | 5 | 5 | 0 |
| C. Siege engines | 6 | 0 | 2 | 4 | 0 |
| D. Allies | 1 | 0 | 1 | 0 | 0 |
| E. Projectiles | 5 | 0 | 0 | 4 | 1 |
| F. Background | 12 | 0 | 0 | 0 | 12 |
| **Total optional** | **52** | **8** | **12** | **19** | **13** |

A minimal pass that visibly lifts the game is **the eight P0 files**: Gate, Wood
Crate, Stone Block, the Archery and Cannon platforms, Grunt, Runner and Golem.
