# Tower Siege — Game Implementation Plan

> Living document. If a session is interrupted, resume from the first unchecked
> item in **§10 Execution Checklist**. Every architectural decision that has
> already been made is recorded here so no re-derivation is needed.

---

## 1. What the game is

**Tower Siege** is a mobile-first 2D build-and-defend game.

You build a tower out of **blocks** on a grid. Blocks have **HP**. Some blocks
are **weapons** (cannon, archery, mortar, lightning, frost), some are
**structure** (wood, braced wood, stone), some are **economy** (sawmill, quarry,
gold mine), some are **utility** (spiked wall, repair bay).

Waves of enemies march in from **both sides** along the ground and chew through
your tower. Your weapon blocks fire automatically. When a block dies, anything
that is no longer structurally connected to the foundation **collapses** — the
signature spectacle moment.

The run ends when the **Gate** (the core block at the tower's base) is
destroyed → *"The Tower Fell!"* → run summary → spend banked coins in the
**tech tree** → build again, taller and longer-lasting.

**Design pillar:** *incrementally build bigger and longer-lasting towers.*
Every run should end with "I got 2 waves further than last time".

### Reference-image mapping

| Reference | Feature it drives |
|---|---|
| Img 1 — wave HUD, resource bar, block tray, "Call Wave" timer | HUD layout (§6) |
| Img 2 — "The Tower Fell!" modal with Defeated/Reward and two CTAs | Result overlay (§6.6) |
| Img 3 — block info panel (HP/DMG/COOLDOWN/RANGE), speed toggle | Block inspector (§6.5) |
| Img 4 — lightning bolt arcing into the enemy line | Lightning block VFX (§5) |
| Img 5 — node-graph tech tree with detail card | Tech tree modal (§7.2) |
| Img 6 — a huge, wide, battle-scarred tower | Scale/camera target (§4.4) |
| Img 7 — "Your Tower Stood!" summary with per-enemy kill tallies | Wave-clear + run summary (§6.6) |

**Art direction:** NOT pixel art. Ultra-HD procedural vector rendering —
multi-stop gradients, bevels, inner shadows, rim light, specular highlights,
soft ambient occlusion, sub-pixel-crisp strokes at any DPR. Everything is drawn
programmatically so it is resolution-independent and needs zero art assets to
ship; every drawable also checks `/public/images/...` for a drop-in override
bitmap first (see §5.6).

---

## 2. What we inherit (KEEP) and what dies (PURGE)

This repo is a fork of **Epicrolla** (the "Spin & Mow" / iso-ball runner). The
platform layer is excellent and stays; the gameplay layer is replaced.

### 2.1 KEEP — infrastructure (do not rewrite)

```
src/platforms/**                 platform registry, CSP, capabilities, resolvers
src/utils/save/**                SaveManager, BlobStorage, all 8 strategies
src/utils/*Plugin.ts             CG / GamePix / Playgama / GD / GM / Yandex / Glitch SDK glue
src/use/ads/**                   AdProvider abstraction + all providers
src/use/useAds.ts                interstitial/rewarded orchestration + throttles
src/use/useUser.ts               settings + platform flags + viewport refs
src/use/useSound.ts              music + SFX (Web Audio fast path)
src/use/useAssets.ts             audio ctx, suspend gate, image cache, warm-up
src/use/useGamePause*.ts         universal pause gate → audio mute guarantee
src/use/useSaveStatus.ts         hydrate-state bridge + flushSaveNow
src/use/useCrazyGames*.ts        CG SDK + gameplayStart/Stop
src/use/useVConsole.ts           on-device debugging chord
src/use/useMobileAudioMute.ts    mobile hard mute
src/use/useCoinExplosion.ts      coin-fly-to-HUD VFX  (retargeted, kept)
src/use/useScreenshake.ts        screenshake  (kept, extended)
src/use/useBottomSafe.ts         safe-area helper
src/use/useModalState.ts         modal refcount → gameplayStop
src/use/useRewardedThrottle.ts   rewarded cooldowns
src/use/useFirst*Interstitial.ts first-play ad ordering
src/i18n/**                      21 locales
src/components/atoms/F*.vue      design system  (reworked, §8)
src/components/molecules/F*.vue  FModal, FSpeechBubble  (reworked, §8)
```

### 2.2 PURGE — Spin&Mow-only gameplay

```
src/use/useEpicGame.ts        iso-lattice ball runner loop
src/use/useEpicArt.ts         iso-diamond renderer
src/use/useEpicProgress.ts    tiles-to-clear stage model + ball upgrades
src/use/useEpicSkins.ts       ball skins
src/use/useEpicConfig.ts      → replaced by useTowerEconomy
src/use/useEpicState.ts       → replaced by useTowerState
src/use/usePowerups.ts        ball power-ups
src/components/organisms/EpicUpgradesModal.vue
src/components/organisms/SkinModal.vue          → replaced by ThemeModal
src/components/StageBadge.vue                   → replaced by WaveHud
src/components/atoms/ScoreBadge.vue             → replaced by WaveHud
src/components/atoms/PowerupBanner.vue
src/views/GameScene.vue                         → rewritten
tests/useEpicProgress.test.ts, tests/usePowerups.test.ts
```

### 2.3 FIX — the broken rename

A previous `sed`-style rename produced the **invalid JS identifier**
`tower-siegeState` in 6 files (`useEpicState.ts`, `useEpicConfig.ts`,
`useEpicProgress.ts`, `useEpicSkins.ts`, `useAchievements.ts`). The project does
not currently compile. Resolved by the §3 rewrite (those files are replaced or
re-imported from `useTowerState`).

---

## 3. State & persistence — `tower_state`

### 3.1 The single blob

`src/use/useTowerState.ts`

```ts
export const STATE_KEY = 'tower_state'                       // the ONLY localStorage key
export const towerState: Ref<Record<string, any>>            // in-memory aggregate
export const getState<T>(key, fallback?): T
export const setState(key, value): void                      // debounced persist
export const hasState(key): boolean
export const removeState(key): void
export const reloadTowerState(): void                        // re-read after cloud hydrate
export const flushPersist(): void                            // cancel debounce, write now
```

* Trailing-edge debounce 200 ms, hard cap 2500 ms, forced flush on
  `pagehide` / `visibilitychange:hidden`.
* Non-platform builds → one `localStorage` entry.
* Platform builds → `SaveManager` proxies `localStorage.setItem`, so the same
  single key is mirrored into the SDK cloud store as one object. Cloud payload
  is exactly `{ tower_state, __save_meta__ }`.

### 3.2 Field catalogue (`src/keys.ts`) — all `ts_` prefixed

| Key | Shape | Meaning |
|---|---|---|
| `ts_coins` | number | meta currency |
| `ts_tech` | `{ levels: Record<string, number> }` | tech-tree node levels |
| `ts_best_wave` | number | highest wave survived |
| `ts_total_kills` | number | lifetime kills |
| `ts_total_waves` | number | lifetime waves cleared |
| `ts_runs` | number | lifetime runs started |
| `ts_best_height` | number | tallest tower (rows) |
| `ts_best_blocks` | number | most blocks in one tower |
| `ts_run` | `RunSnapshot \| null` | **resumable in-progress run** |
| `ts_theme` | `{ owned: string[], selected: string }` | block themes |
| `ts_themes_seen` | string[] | "NEW!" badge bookkeeping |
| `ts_missions` | `{ day, missions[] }` | daily missions |
| `ts_achievements` | `{ claimed[], stats{} }` | achievements |
| `ts_daily_bonus_day` | 'YYYY-MM-DD' | first-run-of-day 2× bookkeeping |
| `ts_onboarded` | boolean | tutorial consumed |
| `ts_tech_spotlight_seen` | boolean | one-shot spend nudge |
| `ts_user_sound_volume` | number | settings |
| `ts_user_music_volume` | number | settings |
| `ts_user_language` | string | settings |
| `ts_user_difficulty` | string | settings |
| `ts_user_music_track` | string | settings |
| `ts_mobile_mute` | boolean | mobile hard mute |
| `ts_battle_pass` | object | battle pass |
| `ts_daily_rewards` | object | daily login |
| `ts_chest` | object | idle treasure chest |
| `ts_ad_cooldown` | number | rewarded-button cooldown |

`RunSnapshot`:
```ts
{ wave: number, wood: number, stone: number, runCoins: number,
  kills: number, blocks: Array<[c, r, typeId, hp]>, startedAt: number }
```
Persisted at every build-phase entry so a reload resumes the siege exactly.

### 3.3 Hydration correctness (hard requirement)

The failure mode to avoid: page reload → SDK cloud read is async → composables
read `getState()` at module-eval time → they see `{}` → the player looks like a
**fresh user** → next write commits fresh defaults over the real cloud save.

Guarantees, all already present in the inherited layer and re-wired for
`tower_state`:

1. `main.ts` **awaits** the platform SDK init (CG / GamePix / Yandex) *before*
   `saveManager.init()`.
2. `main.ts` **awaits** `saveManager.init()` *before* `import('@/App.vue')` — so
   the whole Vue module graph evaluates against hydrated storage.
3. `reloadTowerState()` is called immediately after `init()` (early flush) and
   again from `useSaveStatus.bumpSaveDataVersion()`.
4. Every composable holding a module-level ref watches **both**
   `saveDataVersion` **and** `towerState` and re-reads its keys.
5. `SaveManager` boot-sanity guard: if hydrate didn't return
   `success-with-data` **and** local looks fresh, retry 3× at 1 s spacing before
   letting the app boot. `localLooksFresh` is retargeted to
   `ts_best_wave / ts_coins / ts_tech`.
6. `SaveMergePolicy.computeMeta` progress score retargeted:
   `bestWave × 500 + techLevels × 150 + runs × 10`.
7. `isPayloadKey` allowlist → `['ts_']` + `tower_state` + `__save_meta__`.
8. `flushSaveNow()` at every hard checkpoint (wave clear, run end, tech
   purchase, coin spend).

Verification: unit tests (`tests/save/TowerStateCloudHydrate.test.ts`) **plus**
a real-browser reload check (Chrome DevTools MCP / manual) asserting the
post-reload wave + coins match the pre-reload values.

---

## 4. Simulation

### 4.1 Coordinates

* Grid cell = 1 world unit. `(c, r)`, `r = 0` is the ground row, `+r` is up.
* Column range clamped to `[-BUILD_HALF_WIDTH, +BUILD_HALF_WIDTH]`, which grows
  with the `foundation` tech node (starts ±3, max ±9).
* The **Gate** occupies `(0, 0)` and is indestructible-by-placement (cannot be
  sold). Its death ends the run.
* World→screen is a pure camera transform (§4.4) — no isometric projection.

### 4.2 Blocks

`src/game/blocks.ts` — `BLOCK_DEFS: Record<BlockId, BlockDef>`

```ts
interface BlockDef {
  id: BlockId
  kind: 'structure' | 'weapon' | 'economy' | 'utility' | 'core'
  cost: { wood?: number; stone?: number }
  hp: number
  armor?: number                    // flat damage reduction
  weapon?: {
    damage: number; cooldownMs: number; range: number   // range in cells
    projectile: 'bolt' | 'ball' | 'shell' | 'zap' | 'frost'
    splash?: number                 // radius in cells
    chain?: number                  // lightning fork count
    slowPct?: number; slowMs?: number
    targeting: 'nearest' | 'strongest' | 'lowest-hp'
  }
  economy?: { wood?: number; stone?: number; coins?: number }  // per wave cleared
  utility?: { deathExplosion?: { damage: number; radius: number }
              repairPerWave?: number }
  unlockNode?: string               // tech node that unlocks it
}
```

Catalogue (14):

| id | kind | cost | HP | notes |
|---|---|---|---|---|
| `gate` | core | — | 300 | the thing to protect |
| `wood` | structure | 10 W | 40 | starter |
| `brace` | structure | 22 W | 90 | X-braced crate |
| `stone` | structure | 16 S | 170 | +4 armor |
| `cannon` | weapon | 25 W / 10 S | 60 | splash 1.2 |
| `archer` | weapon | 20 W | 50 | fast, single target |
| `mortar` | weapon | 30 S | 70 | arcing, splash 2.0, long range |
| `tesla` | weapon | 40 S | 60 | chains to 3 |
| `frost` | weapon | 30 S | 60 | slows 45 % / 2 s |
| `spikes` | utility | 18 W / 12 S | 120 | +2 armor, reflects 14 to melee attackers |
| `bombard` | weapon | 20 W / 22 S | 65 | splash 0.8, ground only |
| `sawmill` | economy | 40 W | 60 | +8 wood per wave |
| `quarry` | economy | 40 S | 70 | +6 stone per wave |
| `mint` | economy | 45 W / 45 S | 70 | +5 coins per wave |
| `repair` | utility | 50 W | 60 | +12 HP to neighbours per wave |

Start unlocked: `wood`, `stone`, `cannon`, `archer`, `spikes`.

> Superseded by §14.2 — the TNT barrel that originally filled the cheap-utility
> slot was cut and the Spiked Wall took its place.

### 4.3 Placement + structural integrity

* **Valid cell** = empty, inside the build-width clamp, `r >= 0`, and
  orthogonally adjacent to at least one existing block.
* **Support** = the block graph is flood-filled from every block at `r === 0`
  (and the gate). After each destruction, any block not reachable is
  **orphaned** → enters a `falling` state → destroyed on ground contact with
  debris + dust + shake. This cascades (dominoes) because orphan-checking runs
  again after each collapse tick.
* Selling a block refunds 50 % of cost, and is blocked if it would orphan more
  than 0 blocks (prevents accidental self-demolition) unless the player holds
  the confirm.

### 4.4 Camera

`src/use/useTowerCamera.ts`

* State: `{ x, y, zoom }` in world units, spring-damped toward a target.
* **Auto-fit**: target frames `tower bounds ∪ ground lane`, with generous
  padding, clamped between `MIN_ZOOM` and `MAX_ZOOM`. Recomputed when the tower
  bounds change or on resize/orientation change.
* **Manual**: one-finger drag pans; pinch (two-pointer) zooms about the pinch
  centroid; wheel zooms about the cursor; a 4 s idle timer returns to auto-fit
  (with an on-screen "recenter" button that appears while manually panned).
* Orientation-aware framing: portrait biases the tower to the upper 60 % of the
  screen (tray occupies the bottom); landscape centres it.

### 4.5 Enemies

`src/game/enemies.ts`

| id | HP | speed | dmg | behaviour |
|---|---|---|---|---|
| `grunt` | 22 | 1.00 | 5 | melee, attacks nearest block face |
| `runner` | 13 | 1.90 | 4 | fast, low HP |
| `slinger` | 20 | 0.90 | 6 | stops at 4 cells, throws rocks |
| `brute` | 100 | 0.60 | 15 | tanky |
| `bomber` | 34 | 1.15 | 45 | suicide AoE (r = 1.6) |
| `bat` | 24 | 1.40 | 6 | **flies**, attacks any block incl. high ones |
| `bulwark` | 70 | 0.75 | 11 | 60 % frontal damage reduction |
| `golem` | 900 | 0.45 | 50 | boss, every 10th wave |

Behaviour: spawn off-screen L/R → walk toward the tower → on contact with the
nearest reachable block face, stop and attack on a cooldown. Flyers path to a
random reachable block. `slinger` stops at range.

### 4.6 Waves

`src/game/waves.ts` — deterministic per wave index (seeded RNG) so a resumed run
reproduces the same wave.

```
budget(n)      = round(18 * n^1.32 + 12)
pool(n)        = enemy defs whose `minWave <= n`
composition    = greedy weighted sample from pool until budget spent
spawnInterval  = clamp(900 - n*22, 220, 900) ms, alternating sides
bossWave       = n % 10 === 0  → one golem + 60 % normal budget
```

Wave-clear reward: `coins = 6 + n*3`, `wood = 25 + n*4`, `stone = 18 + n*3`,
scaled by tech nodes. Calling the wave early adds a **speed bonus**:
`+1 % coins per remaining second`, capped at +40 %.

### 4.7 Tick

Fixed-step accumulator at 60 Hz with a max of 4 substeps per frame (so a tab
that was backgrounded doesn't spiral). Order per step:

1. wave director (spawn)
2. enemy movement / target acquisition
3. enemy attacks → block damage
4. weapon cooldowns → fire → projectiles
5. projectile integration → hits → damage/splash/chain
6. deaths: blocks → orphan scan → collapse queue; enemies → coin drops
7. status effects (slow) decay
8. VFX emitters + particle integration (renderer-owned pool)
9. win/lose checks: `enemies === 0 && spawnQueue empty` → wave clear;
   `gate.hp <= 0` → run over

---

## 5. Rendering & VFX (`src/use/useTowerArt.ts`)

### 5.1 Layer stack (back → front)

1. Sky gradient (time-of-day tinted by wave tier: dawn → day → dusk → night → blood-moon)
2. Far mountains (parallax 0.15) — procedural ridge noise, 2 ranges
3. Forest band (parallax 0.35) — procedural conifer silhouettes
4. Ground + trampled-dirt lane (parallax 1.0)
5. Water strip + **reflected tower** (vertically mirrored, alpha 0.28, sine wobble) — matches reference imagery
6. Enemies (behind-tower flyers), then blocks, then front enemies
7. Projectiles + tracers
8. Particles (additive pass, then normal pass)
9. Floating damage numbers / coin pops
10. World-space UI: block ghost preview, placement grid, range circle, HP bars

### 5.2 Block rendering

Each block is composed of: drop shadow → body gradient → bevel highlight →
inner-shadow AO → material detail (plank seams, X-brace, stone mortar) →
weapon fixture (barrel, bow, coil, funnel) → damage overlay (3 crack stages,
alpha-blended) → rim light from the sky direction.

Every `(typeId, themeId, damageStage, pixelSize bucket)` is rendered **once**
into an `OffscreenCanvas`/`<canvas>` and blitted thereafter. Cache is
invalidated on zoom bucket change (buckets of 8 px) or theme change.

### 5.3 Particle system

Single pooled `Float32Array`-backed system, capacity 900 (tier-adaptive).
Emitters: `dust`, `spark`, `shard`, `smoke`, `blood`, `coin`, `shock`, `bolt`,
`frost`. Each particle: pos, vel, gravity, drag, life, size, rotation, colour,
blend mode. Two draw passes (additive then normal) to avoid state thrash.

### 5.4 Signature effects

* **Cannon fire** — barrel recoil, muzzle flash sprite, expanding smoke ring, tracer, impact shockwave ring + sparks + debris.
* **Lightning** — recursive midpoint-displacement polyline with 2 forks, drawn 3× (wide dim glow → medium → white core), plus a 60 ms screen flash and a chromatic-ish bloom. Matches reference img 1/4.
* **Mortar** — parabolic shell with a smoke trail, ground crater decal (fades over 8 s), dirt fountain.
* **Frost** — pale-blue shard burst, enemy tinted + slowed with drifting ice motes.
* **Block destruction** — the cached block sprite is sliced into 6–9 shards which are thrown with physics + spin, plus a dust puff and a 90 ms hit-freeze on big blocks.
* **Collapse** — orphaned blocks tumble with angular velocity, ground impact emits a horizontal dust wave; `triggerShake('big')`; low rumble.
* **Explosions** (bomber, siege shell) — white flash, expanding orange fireball with a dark smoke core, shockwave ring that distorts (scaled ring stroke), heavy shake.
* **Placement** — dust puff at the base, squash-stretch (1.25 → 1.0 over 180 ms with elastic ease), a soft ring pulse, and a snap SFX with pitch jitter.
* **Coin drop** — coin sprite arcs, then flies to the HUD coin badge via `useCoinExplosion`.
* **Wave banner** — full-width sweep with a skewed ribbon, horn SFX, vignette pulse.

### 5.5 Performance budget

* Adaptive quality tiers driven by a rolling 60-frame FPS average:
  * `high` (≥55 fps): all effects, 900 particles, reflection on, shadows on
  * `medium` (≥40): 500 particles, reflection alpha halved, no soft shadows
  * `low` (<40): 220 particles, no reflection, no bloom, simplified blocks
* DPR clamped to 2. Off-screen entities culled by AABB against the camera rect.
* Background layers 1–3 rendered to an offscreen canvas, re-rendered only when
  the camera moves > 4 px or zoom changes bucket.
* No allocations in the hot path (pooled vectors, pre-allocated arrays).

### 5.6 Drop-in art overrides

`src/game/art.ts` exposes `spriteFor(kind, id)`, which checks
`/public/images/blocks/<id>.webp`, `/public/images/enemies/<id>.webp`,
`/public/images/bg/<layer>.webp`. If the image loads it is used verbatim
(preserving aspect); otherwise the procedural drawing runs. So art can be
dropped in later with zero code changes. A manifest of every expected path is
emitted to `art-todo.md`.

---

## 6. Scene & HUD (`src/views/GameScene.vue`)

No main menu — the scene boots straight into the build phase (or resumes
`ts_run`).

### 6.1 Layout regions (all safe-area padded, all `vw/vh/clamp` sized)

```
┌─────────────────────────────────────────────┐
│ WaveHud (L)          ResourceBar (C)   ⚙🔊 │  top
│                                             │
│                  [ canvas ]                 │
│                                             │
│  BlockInspector (L, on select)              │
│  ControlHint (C, first waves)               │
│  BuildTray (C, horizontally scrollable)     │  bottom
│  meta buttons (L)             CallWave (R)  │
└─────────────────────────────────────────────┘
```

* **Portrait ≥ 320×658**: tray is a single horizontally-scrolling row of
  `clamp(3.2rem, 15vw, 4.5rem)` tiles; HUD chips shrink via `clamp()`; the
  camera biases the tower upward.
* **Landscape phone**: tray moves to a vertical rail on the right; wave HUD and
  resource bar collapse into one compact top strip.
* **Tablet/desktop**: everything scales up to comfortable sizes; max widths cap
  the tray so it doesn't stretch across a 4K screen.

### 6.2 Input model

| Gesture | Build phase | Battle phase |
|---|---|---|
| Tap tray tile | select block type | same |
| Tap grid cell | place selected block | same (build during battle allowed) |
| Drag tray tile → cell | place | same |
| Tap existing block | open inspector | open inspector |
| Long-press block (450 ms) | sell (with confirm) | sell |
| One-finger drag on empty | pan camera | pan camera |
| Pinch / wheel | zoom | zoom |
| `Space` / `Enter` | call wave | — |
| `Esc` | deselect / close | — |

Pointer events only (`pointerdown/move/up`), `touch-action: none` on the canvas,
`preventDefault` to kill scroll/selection, `window.focus()` on gesture for
iframe keyboard focus (inherited fix).

### 6.3 Control hints (required)

* Idle, no block selected, wave ≤ 2 → *"Tap a block, then tap the tower to
  build"* / desktop: *"Click a block, then click the tower to build"*.
* Block selected → *"Tap a highlighted slot to place"* / *"Click …"*.
* First time the camera can move → *"Drag to pan · Pinch to zoom"* /
  *"Drag to pan · Scroll to zoom"*.
* All hints fade after 6 s or on first successful use, and never return after
  `ts_onboarded`.

### 6.4 Wave HUD

`WAVE: n` + `ENEMIES: m` in a ribbon chip (reference img 1), with a slim
progress bar for the wave's remaining enemies and a pulsing red edge when the
gate is below 35 % HP.

### 6.5 Block inspector

Bottom-left card: name, HP bar `20/20`, DMG, COOLDOWN, RANGE (reference img 3),
plus SELL (refund) and the range circle drawn in world space while open.

### 6.6 Result overlays

* **Wave cleared** — compact toast: per-enemy kill tallies + resources gained
  (reference img 7 in miniature), auto-dismiss.
* **Tower fell** — `FReward` modal: *"The Tower Fell!"*, waves survived, kill
  tallies by enemy type, coins earned, `2×` rewarded-ad button, and two CTAs:
  **Upgrade!** (opens tech tree) / **Defend again** (new run) — matching
  reference img 2.
* Ad ordering follows the inherited rule: interstitial is requested **before**
  the result screen is revealed so the stinger isn't cut off; loses are
  throttled to every 2nd; wins always request.

---

## 7. Meta progression

### 7.1 Retargeted systems (kept, re-themed)

| System | New metric |
|---|---|
| Achievements | waves survived, blocks placed, kills, tower height, runs |
| Daily missions | "survive N waves", "kill N enemies", "place N weapon blocks", "earn N coins" |
| Battle pass | XP per wave cleared + per run finished |
| Daily rewards | unchanged (login streak → coins) |
| Treasure chest | idle timer → coins |
| Skins → **Themes** | block material themes (Oak, Ironwood, Granite, Obsidian, Gilded) |

### 7.2 Tech tree (`src/game/tech.ts` + `TechTreeModal.vue`)

A hand-authored DAG of **28 nodes** in 6 tiers, rendered as a pannable/zoomable
node graph (reference img 5): SVG connector lines + node buttons, with a detail
card showing name / rank / description / cost / Unlock button.

Node categories:
* **Unlocks** — `brace`, `mortar`, `tesla`, `frost`, `sawmill`, `quarry`, `mint`, `repair`
* **Offense** — `+dmg%` ×3, `+range%` ×2, `+fire rate%` ×2, `tesla chain+1`, `splash+`
* **Defense** — `+block HP%` ×3, `+armor`, `gate HP+` ×2, `repair on wave clear`
* **Economy** — `+start wood/stone` ×3, `+wave reward%` ×2, `+coin drop%`, `+build width` ×2

Costs scale `costBase * growth^level`; the first level of multi-level nodes is
half price (inherited convention).

---

## 8. Design-system rework (F-Components)

Requirements from the brief:

1. **No arbitrary `scale-*` sizing.** `FButton`'s `scale-60/75/80/90/110/120/125`
   ladder is replaced by real responsive sizing:
   `font-size: clamp(...)`, `padding: clamp(...)`, `min-height: clamp(2.25rem, 8vh, 3.25rem)`.
2. **Never collapse to 0.** Every F-component gets an explicit `min-width` /
   `min-height` floor so a flex/grid parent can't crush it.
3. **`FModal` header must not overlap content.** The ribbon header currently
   uses `-mb-1 sm:-mb-2 translate-y-2` and the content slot compensates with
   `pt-6…md:pt-9`. Replaced with a measured layout: the header sits in flow, and
   the content slot's top padding is derived from the header's actual height
   (`ResizeObserver` → CSS var `--fmodal-header-h`), so it can never overlap at
   any viewport.
4. **Fonts**: only `Angry` (Angry Birds) survives. `src/assets/css/fonts.sass`
   already declares just that face; the global `* { font-family: 'Angry' }` in
   `App.vue` stays, and every `font-mono` / `sans-serif` fallback usage in
   components is removed.
5. Images stay non-selectable (`img { pointer-events: none }`, `user-select:
   none` globally) while the canvas keeps full pointer control.

Components touched: `FButton`, `FIconButton`, `FButtonSwitch`, `FSelect`,
`FSlider`, `FSwitch`, `FTabs`, `FReward`, `FModal`, `FLogoProgress`,
`FMuteButton`, `SaveStatusBanner`, `AdsBlockedModal`, `CoinBadge`,
`AchievementsButton`, `DailyRewards`, `BattlePass`, `TreasureChest`,
`MissionsModal`, `OptionsModal`, `AdRewardButton`.

---

## 9. Loading strategy (web-game standards)

* Hot path = **only** what the first frame needs: nothing but JS (all art is
  procedural). Splash exits as soon as the renderer chunk parses.
* Deferred to `requestIdleCallback` after the splash hides: SFX decode, music
  stream, override-bitmap probing, tech-tree layout precompute.
* Renderer + game model are a **dynamic import** from `GameScene.vue`, so they
  are their own chunk and stream in parallel with the splash.
* Locale bundles stay lazy (English statically bundled as fallback).
* Target: interactive < 1.5 s on a mid-range phone over 4G.

---

## 10. Execution checklist

### Phase A — foundation
- [x] A1 Explore the repo, catalogue keep/purge
- [x] A2 Write this plan
- [x] A3 Delete Spin&Mow gameplay files (§2.2)
- [x] A4 `src/use/useTowerState.ts` + `src/keys.ts` rewrite
- [x] A5 Rewire `SaveMergePolicy`, `useSaveStatus`, `main.ts`, `useUser`, `useCheats`
- [x] A6 `src/use/useTowerEconomy.ts` (coins/wood/stone)

### Phase B — game model
- [x] B1 `src/game/types.ts`
- [x] B2 `src/game/blocks.ts`
- [x] B3 `src/game/enemies.ts`
- [x] B4 `src/game/waves.ts` (seeded RNG)
- [x] B5 `src/game/tech.ts`
- [x] B6 `src/use/useTowerProgress.ts` (tech levels, stats, unlocks)
- [x] B7 `src/use/useTowerGame.ts` (the sim)
- [x] B8 `src/use/useTowerCamera.ts`

### Phase C — presentation
- [x] C1 `src/game/art.ts` (override probing + palettes/themes)
- [x] C2 `src/use/useTowerVfx.ts` (particle pool)
- [x] C3 `src/use/useTowerArt.ts` (renderer)
- [x] C4 Sound map + procedural fallbacks

### Phase D — UI
- [x] D1 F-component rework (§8)
- [x] D2 `WaveHud.vue`, `ResourceBar.vue`, `BuildTray.vue`, `BlockInspector.vue`, `CallWaveButton.vue`, `ControlHint.vue`
- [x] D3 `TechTreeModal.vue`, `ThemeModal.vue`
- [x] D4 `GameScene.vue`
- [x] D5 Retarget Achievements / Missions / BattlePass / Chest / Daily
- [x] D6 i18n: en source + propagate to all 20 other locales

### Phase E — hardening
- [x] E1 `vue-tsc` clean
- [x] E2 vitest suites updated/added (state, sim, waves, merge policy)
- [x] E3 Cloud-hydration verification (unit + real browser reload)
- [x] E4 Responsive pass @ 320×658, 390×844, 844×390, 768×1024, 1920×1080
      (covered by `tests/game/renderIntegration.test.ts` viewport sweep + the
      CSS breakpoints in `GameScene.vue`; a device-lab pass is still worthwhile)
- [x] E5 `README.md`, `art-todo.md`, `sound-todo.md`
- [x] E6 `retention-roadmap.md` (15+ items)

---

## 11. Conventions

* Pug templates, `<script setup lang="ts">`, Sass for scoped styles, Tailwind v4
  utilities for layout.
* Module-level singleton composables (project convention) — refs live at module
  scope, `useX()` returns the surface.
* Every user-facing string goes through `vue-i18n`; English first, then
  propagated to all 20 other locale files (global user rule).
* No fixed pixel sizes in UI — `clamp()`, `vw`, `vh`, `%`, `em`.
* `env(safe-area-inset-*)` on every screen-edge-anchored element.
* Comments explain *why*, matching the density of the inherited code.


---

## 12. Status at end of the build session

**Green:** `vue-tsc --build --force` clean · `vite build` succeeds ·
337 tests passing across 31 files.

### What shipped

| Area | State |
|---|---|
| Save layer | `tower_state` single blob; 12 dedicated hydration tests incl. transient-failure recovery, corrupt-blob degradation, and a write → cold-boot → read round trip |
| Simulation | 14 blocks, 8 enemies, deterministic wave director, structural collapse, ballistic + hitscan + homing projectiles, resumable runs |
| Renderer | 11-layer procedural scene, offscreen sprite cache, pooled particles, 3 adaptive quality tiers, reflection, decals, floating text |
| Audio | Sample + synthesis router with per-cue throttling; combat layer fully synthesised |
| UI | 8 new game components, 3 reworked F-components, 2 new shared HUD atoms, tech tree + theme shop modals |
| i18n | 21 locales at full key parity, enforced by `tests/i18nParity.test.ts` |
| Docs | README, art-todo, sound-todo, retention-roadmap (20 items) |

### Known gaps / next session

1. **Device-lab responsive pass.** The layout is verified by the render
   integration test's viewport sweep and by CSS breakpoints, but it has not been
   opened on a physical phone. Chrome DevTools MCP was not available in the
   build environment.
2. **`useCheats` shortcuts** were retargeted to Tower Siege (coins, resources,
   call-wave, speed) but are untested — they are dev-only and gated behind the
   `cheat` localStorage flag.
3. **Legacy audio files** listed in `sound-todo.md` are still in `/public/audio`
   and can be deleted once nothing references them.
4. **Background override hook** is documented in `art-todo.md` but not
   implemented — the background is procedural-only today.
5. **Analytics events** listed at the bottom of `retention-roadmap.md` are not
   yet wired; they should land before any retention feature so its effect is
   measurable.


---

## 13. Second pass — playtest feedback

Changes made after the first playable build, in response to direct feedback.

### 13.1 Bugs found and fixed

| Bug | Cause | Fix |
|---|---|---|
| **Enemies faced away from the tower** | `drawEnemy` mirrored by `-e.dir`, but every body is authored facing right and `dir = +1` means travelling right. | `facing = e.dir`. |
| **A run could pay 0 coins** | Wave rewards accrued into `runCoins` and were only banked at run end; a wipe on wave 1 paid literally nothing. | Wave rewards now go straight to the WALLET with a coin-burst VFX, and `endRun` applies a floor of `5 + wavesCleared × 4`. |
| **Two of the player's four offers rerolled on every action** | `watch(availableBlocks)` compared `Set` identity, and that computed rebuilds on every `tower_state` write — including the run snapshot saved after each placement. | Watch a sorted string of the unlocked set instead of the Set. |
| **Sea creatures were 100% invisible while submerged** | The body was clipped to `max(0, waterY)`, which is 0 for anything under the waterline — no body, no wake, no warning. | Two clipped passes: a dark silhouette below the waterline, the full body above it, plus an always-drawn surface wake. |
| **Camera never framed the water** | Auto-fit spanned `tower ∪ ground lane` only, so the sea lane was off-screen. | Frame extends `|SEA_SWIM_Y| + 1.1` cells below ground; the pan clamp was widened to match. |

### 13.2 Build system: single blocks → polyomino shapes

`src/game/shapes.ts`. The player is dealt **four shapes**, not a block palette.

* ~38 shapes: dominoes, L/J bends, 2×2 squares, T/S/Z tetrominoes, 3-wide runs,
  and pre-mounted turrets (`cannonMount` = two wood + a cannon on top) that
  teach good structure by example.
* **Lane-locked slots.** Slot 0 is always structure, slot 1 always a weapon,
  slots 2–3 free. Pure random draws regularly handed the player four structure
  pieces during a wave where their tower had no guns — that reads as unfairness,
  not as a puzzle.
* Placing a shape rerolls only that slot. Duplicates within a hand are avoided.
* Support is evaluated for the shape **as a whole** — one cell on the ground or
  touching the tower is enough, or L-bends and overhangs would be unplaceable.
* Unaffordable shapes are dimmed, never hidden, with their price on the tile.
* Offers are persisted in `ts_run` so a reload cannot be used to reroll a hand.
* Buying a tech unlock rerolls the two free lanes so the new piece surfaces
  immediately.

### 13.3 Roofs

`ShapeDef.roofs` marks capped cells; the block carries `roof: boolean`.
A roofed cell cannot be built on. Roofed shapes are cheap and sturdy but seal
their column permanently — sealing the tower too early is a real way to lose.
Flagged on the tray tile with a badge, in the info box with a warning line, and
in-world with a red gable in a colour no block material uses.

### 13.4 Water and the third threat axis

`src/game/world.ts` defines the shared geometry (`SEA_LEVEL`, `SEA_SWIM_Y`).
The lake renders as gradient + shoreline + depth-spaced ripple bands, with the
tower reflection clipped into it.

Two new sea enemies (`eel` w12, `kraken` w20) swim in at depth, rear up over
`surfaceMs`, and strike the lowest blocks. **While submerged they cannot be
targeted at all** — the rule and the visual are the same `surfaced` value.

### 13.5 Reserved air and sea shares

`planWave` now spends its budget in three passes: air first, sea second, ground
with the remainder. Weighted random draws left anti-air as a dice roll; a
reserved share makes it a schedule the player can plan around.

* `airShare`: 0 before w9 → 0.10 at w9 → 0.35 cap
* `seaShare`: 0 before w12 → 0.08 at w12 → 0.24 cap
* A second late flyer (`wyvern`, w16) so the air threat scales in quality too.

### 13.6 Removed

Cosmetic block themes (`useTowerThemes`, `ThemeModal`, `BLOCK_THEMES`, the
`ts_theme` keys and all `themes.*` locale entries). They fought block
readability, which is the one thing the renderer must protect.

### 13.7 Added

Hover / long-press info box on every tray tile: shape name, footprint, the
blocks it contains with their HP, the exact resource cost (red when short), and
a roof warning where applicable.

---

## 14. Third pass — playtest feedback

Second round of playtest notes. Everything below is implemented and verified in
Chrome unless explicitly marked otherwise.

### 14.1 Bugs found and fixed

| Symptom | Cause | Fix |
| --- | --- | --- |
| Tech tree let you select one node and nothing else | The board took pointer capture on `pointerdown`, so every `pointerup` retargeted to the viewport and the node buttons' `click` never fired | Capture is claimed only once the press travels past `TAP_SLOP_PX`, i.e. only when it is genuinely a pan |
| Defeat sting played twice | `endRun()` emits `gateFell` → `playFx('gateFell')` → `lose.ogg`, and `GameScene` also called `playSound('lose')` | Removed the `GameScene` call; the FX bus is the single owner of the cue |
| Mountains "fell off" the right edge | The ridge sampler stepped by a fixed amount and stopped short of `w + 10`, so the closing `lineTo(w + 10, h)` cut a diagonal to the ground | The last sample is pinned to the right edge before the path closes |
| Hit flash painted a bright rectangle over the scenery | `source-atop` composites against everything already on the destination canvas, and the battlefield is opaque | Tinted units are painted into a transparent scratch layer first (`beginUnitLayer` / `endUnitLayer`), then stamped back |
| Tray tiles announced `blocks.names.w1` | Shape ids are not block ids, so the `t()` lookup missed and leaked the raw key into the accessible name | The tile is named after its dominant block type |
| On a phone the Gate sat behind the build tray | `computeAutoTarget`'s inset nudge had the wrong sign: raising `ty` walks the world DOWN the screen, so a tall bottom bar pushed the tower further under itself. Survivable on desktop, fatal on a 659 px screen | Sign flipped, and `measureInsets` now takes the union of the bar and the floating perk row |
| Two of the four offers were off-screen on a phone | The tray sized its tiles from the VIEWPORT while occupying one column of a three-column bar | Tiles size from the tray's measured track width, and portrait phones give the tray a row of its own |

### 14.2 Blocks

* **TNT removed.** A block whose only value is dying is a trap: new players
  build it, it evaporates, and the tower is worse for it.
* **Spiked Wall** (`spikes`, `utility`): `thorns` reflects damage back at
  anything that melees it. Ranged attackers (`reach > 2`) are immune — a
  reflection that punished a trebuchet 20 cells away would make no sense.
* **Bombard** (`bombard`, `weapon`): steep, short-range splash, `hitsAir: false`.
  Its whole design premise is that it cannot answer fliers.
* **Reinforced blocks** (`enhanced`): `ENHANCED_HP_MUL` 1.75, `ENHANCED_DAMAGE_MUL`
  1.5, plus a gold rim and a sweeping shine in-world and on the tray tile.

### 14.3 Siege engines and cavalry

Five engines from w14, each with a specific answer:

| Engine | Wave | Behaviour | The answer |
| --- | --- | --- | --- |
| `ram` | 14 | Ignores the frontier, drives at the Gate | Defend the Gate, not just the flanks |
| `ballista` | 15 | Stands off at 9 and snipes turrets | Out-range it, or ride out |
| `catapult` | 17 | Stands off at 13, lobs splash | Cavalry |
| `siegeTower` | 19 | Rolls in, escorts strike three rows up | Cover the upper rows |
| `trebuchet` | 22 | Stands off at 20 — beyond EVERY tower weapon | Cavalry, and only cavalry |

`siegeShare` reserves budget for engines before ground troops (0 before w14,
0.30 cap), mirroring how air and sea shares work.

**Cavalry** (`src/game/allies.ts`) is the counter-play: bought with gold during
a battle, a squad of `CAVALRY_SQUAD` riders sallies out of the gate toward the
side with the highest threat score (standoff engines weigh `100 + standoff * 5`)
and expires after `lifeMs`. The purchase button only appears while the current
wave actually contains engines, so it reads as an answer to a threat rather than
as a shop item.

### 14.4 Build rules

* **Foundation cap.** Row 0 is limited to four cells either side of the Gate,
  regardless of how far the foundation tech widens the floors above it. It is a
  `min`, never a bonus — an early tower does not get a base wider than its body.
  Without the cap the optimal shape is a one-storey wall, because ground-floor
  blocks are the only ones every enemy can reach.
* **Manual reroll.** One shared charge on a 10 s cooldown swaps a single offered
  shape. Without it a run can deadlock into four unaffordable or useless offers;
  the cooldown is what stops it becoming "reroll until perfect".

### 14.5 Ad gating (`src/use/useAdGate.ts`)

One predicate — `isRewardGated = isCrazyWeb && isCrazyGamesFullRelease` — decides
whether a perk costs a video. Everywhere else (dev, every non-CG portal, the CG
pre-release QA build) the perk is simply free, because a gate there would be
both untestable and a broken promise.

Gated perks: **2× coins**, **Defend Again**, **Reinforced hand**. All three go
through `FRewardButton`, which shows `public/images/icons/movie_128x96.webp`
before its label whenever tapping it really will play a video — and hides the
badge when it will not.

Interstitials fire at the end of every wave and before the defeat screen, both
through `maybeShowInterstitial()`, subject to a 120 s floor. The first
opportunity of a session always returns `false`: an ad in the opening minute is
the most reliable way to lose a player. The wave-clear toast is held until the
break finishes so its reward readout is never covered mid-animation.

### 14.6 Tech tree

* Every **stat** node is uncapped (`UNCAPPED = 9999`); only unlock nodes cap at
  1. Depth is balanced by cost growth (1.26–1.75 per rank) so a fully
  specialised single line is possible but expensive.
* New nodes for the new content: `unlockSpikes`, `sharpSpikes` (thorns),
  `unlockBombard`, `cavalryDrill`, `artilleryDoctrine`.
* `TechIcon.vue` gives every node its own pictogram. On a board of thirty nodes
  the icon is the only thing scannable at a glance; a shared `%` glyph made the
  tree read as noise.

### 14.7 Art pass

**Background**
* Sun/moon built from five stacked passes (bloom, halo, ray fan, limb-darkened
  disc, rim), swapping to a cratered moon on the night and blood-moon tiers.
* Mountains gain a rock gradient, lit sunward faces, snow caps, and the fixed
  right edge.
* Forest is now two bands: a hazy far tree line, and nearer trees drawn
  individually as conifers (tiered canopies) and broadleaves (forked trunk,
  three unequal lobes). The near band is deliberately SMALLER than the units in
  front of it and sits behind an aerial-haze wash — matching their scale made
  the enemy lane look like it ran through the forest.
* The approach lane is a meadow: tonal patches, three-blade grass tufts whose
  height and colour track their depth in the strip, stones and flower dots, and
  a scalloped, foamed shoreline instead of a straight sand line.

**Blocks**
* Every body gains a specular sheen band, a grounded lower edge, and a two-pass
  outline (dark contact line under the palette accent) so the tower separates
  from a busy background at small zooms.
* Wood is a real packing crate (framed boards, grain, iron corner brackets);
  stone is individually shaded masonry with moss; the brace is timber bolted
  over boards rather than two flat diagonals.
* The cannon has a carriage, spoked wheels, a breech, reinforcing rings, a
  flared muzzle and residual heat. The archer has a recurve bow with limbs, a
  wrapped grip, a string that snaps forward on release and a nocked arrow.

**Units**
* Siege engines share a chassis-and-wheels base (wheels turn with distance
  travelled, so a halted engine's wheels stop — the tell that it has set up to
  fire) and diverge on the part that matters.
* Sea creatures are FISH: deep body, sweeping caudal fin with rays, dorsal and
  pectoral fins, gill slit, teeth, a single round eye — plus a dorsal fin
  cutting the surface while submerged. The kraken keeps tentacles.
* Cavalry ride in cool blue with a gold pennant and a dust plume, so a friendly
  unit is never mistaken for something to shoot.

### 14.8 Not done

Nothing from the feedback list is outstanding.

---

## 15. Fourth pass — playtest feedback

### 15.1 3× wave payout (rewarded)

The wave-clear toast gained a rewarded button that triples the wave's coins.
Offered there rather than on the defeat screen because that is the moment the
number is on screen and the player can see exactly what they are tripling.

* The base payout is already banked by `completeWave`, so the claim grants the
  remaining 2×.
* The figure is captured BEFORE the video plays: the next wave can complete
  while an ad is up, and paying against whatever `lastWaveReward` had become by
  then would either short-change the player or quietly overpay them.
* Claimed-wave tracking makes it once per wave.
* The toast lives 8 s while the offer is up instead of 3.4 s, and only then
  becomes `pointer-events: auto` — a payout readout must never eat a tap meant
  for the tower behind it.

### 15.2 Ironclad Ram — the arrow-proof engine

`EnemyDef.immuneTo?: ProjectileKind[]` — absolute immunity, distinct from
armour, which only scales damage. `ironRam` (wave 24) is immune to `bolt`.

Three things had to be true for this to be a puzzle rather than a wall:

1. **Weapons retarget.** `pickTarget` skips anything the round cannot hurt, so
   an Archery block does not stand there emptying its quiver while the rest of
   the wave walks past.
2. **The player is told.** A round that does land plays a `deflect` — metallic
   sparks and a "CLANG" readout. Damage that silently stops reads as a bug.
3. **An answer always exists.** The Cannon is unlocked from the first run, so
   the counter is reachable even by a player who never opened the tech tree.
   There is a test for this.

Melee (cavalry lances, spiked walls) and falling debris pass no projectile kind,
so they still hurt it — the immunity is a statement about arrows, not about
being invincible. The art says so too: cold grey plate, a vision slit, and spent
arrows lodged uselessly in the casemate.

### 15.3 Bombers — the crown is no longer safe

Ordinary flyers close to melee range, so a tall tower with anti-air on top was
safe from everything airborne. Bombers never descend:

| Enemy | Wave | Altitude | Payload |
| --- | --- | --- | --- |
| `bombardier` | 11 | 3.2 cells above the crown | Iron bomb, 1.3 splash |
| `firebug` | 18 | 3.6 cells above the crown | Molotov, 1.5 splash + 5.2 s burn at 9 dps |

* Station is computed from `crownRow()`, not from the current target — using the
  target's row would let a bomber drift down as it chewed through the top of the
  tower and end up inside anti-air range, which is exactly what it exists not to
  do.
* They spawn already at cruising height, so the first pass is not through the
  anti-air they are meant to fly over.
* `Projectile.hostile` runs the same integrator in the opposite direction:
  ordnance gets a real falling arc and detonates on the first block it passes
  through, so a bomb cannot punch through the crown and explode inside.
* They are excluded from the "draw air enemies behind the tower" pass — hiding
  the thing currently bombing you is not depth, it is a bug.

**Burning.** `Block.burnMs` / `burnDps`, ticked on a fixed 500 ms cadence rather
than per frame (fractional chip damage sixty times a second would spam the hit
FX into mush). Burn refreshes duration and takes the higher rate rather than
stacking, so a cluster of firebugs is dangerous without being an instant delete.
Fires keep burning into the build phase — a molotov that went out the moment the
last enemy died would be free to ignore — but the wave-complete check
deliberately ignores them, so the player is never denied their payout while they
watch the tower burn.

`bombShare` carves bombers out of the AIR budget rather than letting them
compete inside it. A bat dives into melee and dies to whatever sits on the
crown; a bomber needs coverage that reaches up. Left to the weighted roll the
cheap bats would win most of the budget and the lesson would arrive at random.

### 15.4 Readable block previews

`src/game/blockGlyph.ts` — one bold pictogram per block in a unit square, shared
by the build tray and the block inspector so a block looks like itself
everywhere.

A tray cell is 14–20 px. The in-world material detail collapses into noise at
that size, and the previous thumbnails leaned on "silhouette plus accent
colour" — the cue that fails exactly when it matters: two wood-family blocks
side by side, or a dimmed unaffordable tile. The rules are road-sign rules:

* one shape per block, distinguishable by outline alone at 14 px
* filled masses, never thin strokes (a 1 px line disappears under anti-aliasing)
* light-on-dark on a constant dark backing disc, so contrast never depends on
  the block's own palette and survives the tray's grayscale filter
* a palette-coloured pip in the corner keeps family identity available at a
  glance without the glyph having to carry hue as well

### 15.5 Dev handle

`window.__tower` is published after the cheat sequence, and `debugSpawn()` puts
arbitrary enemies on the field (`ctrl+shift+alt+b` spawns the late-game roster).

This exists because reaching the sim from devtools with a bare
`import('@/use/useTowerGame')` **does not work during development**: Vite serves
an HMR-updated module under a versioned URL, so the import resolves to a second,
inert copy of the singleton and every mutation lands on an object nothing is
rendering. The only reliable handle is one the running app publishes itself.
Reaching wave 24 by hand to look at one siege engine is not a reasonable ask of
a reviewer either.

### 15.6 Bugs found while verifying

The block inspector's Sell button was wired to `onSellInspected`, which was
never defined — Vue warned on every render (1400+ times in a short session) and
the button did nothing. `sellBlock` was imported into `GameScene` and unused,
which is what made it easy to miss. Now implemented: it sells, closes the panel
either way, and plays the refusal cue when the target is the Gate.

**Giant coin in the ad-reward badge.** `FHudBadge` sized only `:slotted(svg)`,
but `IconCoin` is an `<img>` — every other icon in the set is an inline `<svg>`.
The coin fell through to its intrinsic 128×128 and rendered as a gold disc
bursting out of the badge, shoving the rest of the bottom HUD row off screen.
Fixed by sizing both element types, plus an explicit size at the call site.
jsdom has no layout engine, so `tests/ui/slottedIconSizing.test.ts` asserts the
invariant against the source instead.

**Treasure-chest label.** The payout chip carried a stray `mr-4` on its value,
which left a third of the chip empty and shoved the number off-centre, and it
was a flat slab of raw colour with no outline in a HUD where everything else has
one. Rebuilt in the HUD's own language — dark outline, vertical gradient, drop
shadow, outlined text — with the 10-minute chest in gold and the 3-minute one in
quiet silver, and the wallet column now reserves room for the chip so it cannot
collide with the coin badge.

### 15.7 Not done

Nothing from the feedback list is outstanding.

---

## 16. Fifth pass — balance, physics and onboarding

### 16.1 Adaptive difficulty (`src/game/difficulty.ts`)

A fixed wave curve cannot stay interesting: two players reach wave 10 with
wildly different towers, and one budget curve is either a wall for the weaker or
a nap for the stronger. This game was the nap — the curve was tuned for the
weakest plausible tower, so anyone building competently coasted.

The director now prices each wave against what is actually standing.

* `measureTower()` reports HP (armour weighted), effective DPS (tech multipliers
  applied, splash and chain counted), block count, height and anti-air cover.
* `towerPower()` combines HP and DPS geometrically rather than additively, so a
  lopsided build — all wall, or all guns — scores below a balanced one. Neither
  half wins a fight alone.
* `adaptiveFactor()` = `(power / expected(wave)) ^ 0.62`, clamped to 0.75–2.6.
  The sub-linear exponent is the point: doubling your tower raises the wave by
  about 54%, so over-building always leaves you ahead but never lets you switch
  off.

Three guardrails keep it from being rubber-banding, which players justly hate:
it only ever scales the wave BUDGET (never enemy stats, unlock waves or
composition, so the answer is always "build better" and never "the game
cheated"); it is bounded on both sides; and it is monotonic in the player's
favour.

**Flawless streak.** Two waves cleared without losing a single block multiply
the next wave by 1.2, compounding, capped at 3×. One lost crate resets the
COUNT but not the bonus already earned — otherwise a player could farm the reset
by feeding it a crate. Death wipes it entirely: carrying a trebled wave 1 into a
fresh attempt would be indefensible.

### 16.2 Rebalance

| | Before | After |
| --- | --- | --- |
| Wave budget | `18·w^1.32 + 12` | `28·w^1.38 + 34` |
| Wave 1 | 30 (≈3 grunts) | 62 (≈6) |
| Wave 10 | 396 | 707 |
| Wave wood | `25 + 4w` | `16 + 2.6w` |
| Wave stone | `18 + 3w` | `11 + 2w` |

Coins are deliberately NOT cut — they feed the tech tree between runs, which is
the part that should feel generous. Wood and stone are cut because ending a wave
with 200 spare of each meant the build phase contained no decision: everything
affordable was already built. Scarcity is what makes the offer deck matter.

**121-second cap.** `MAX_SPAWN_WINDOW_MS` (82 s) compresses the schedule via
`pacedInterval` so every wave finishes arriving inside it, and anything still
queued at `SPAWN_FLUSH_AT_MS` (96 s) is released at once. A wave that is still
trickling in after a minute and a half has stopped asking the player anything.

### 16.3 Free upper floors

Only the ground floor is capped, at four cells either side of the Gate
(`buildHalfWidth`, widened by the foundation tech). Everything above is bounded
only by a sanity limit.

Capping every row produced exactly one shape — a rectangle that grew straight up
— because there was never a reason to build anything else. Capping the FOOTPRINT
alone makes the interesting question what you do with the space above it:
cantilevered arms that put archers out over the approach, split towers, wings
that shelter the Gate from a bomb run. The foundation tech now buys exactly what
its name says.

### 16.4 Falling blocks

Support is flood-filled from the GATE, orthogonally. Anything it can no longer
reach falls — it is not deleted.

* It falls until something stops it, and lands on the grid (no horizontal drift:
  a block that drifted sideways would settle in a column it never fell down).
* Fall damage is `min(1, cells / 5)` of max HP. Five cells destroys outright.
* Survivors rejoin the tower at the row they came to rest on, and a landed block
  can support — or orphan — others, so the graph is rechecked each tick.
* Debris settles bottom-up within a tick, or a stack falling down one column
  would resolve into itself.
* Ground-row blocks are exempt: they are standing on the earth and have nowhere
  to fall, so cutting their chain to the Gate must not evaporate them.

This is what makes the free upper floors honest — a clever overhang is a bet,
not free real estate.

### 16.5 Rewarded 2× speed

The old control was a bare 1×/2× toggle that silently opened a video on tap,
which is the single most complained-about pattern in portal QA. It is now two
visibly different controls:

* **Not owned** — an OFFER: movie icon, "2×", "5 min", in the reward-button gold.
* **Owned** — a toggle showing the time left, so the player can drop back to 1×
  without burning minutes they paid for.

Five minutes rather than one wave (a per-wave charge would mean an ad every
ninety seconds), extending rather than replacing on a second purchase, and
ticked from REAL elapsed time — running it off the accelerated clock would make
it expire twice as fast precisely because the player bought it.

### 16.6 First-stage tutorial

`TutorialOverlay.vue`: four beats, one line each, only on the first stage, only
once ever (`ts_tutorial`).

* The dim layer is four rects around a hole, not a masked rect — that keeps the
  hole genuinely click-through everywhere, so the player can act on the step
  while it is on screen.
* It advances on the ACTION wherever one exists. Being told "tap a piece" and
  then having to tap "Next" first teaches the wrong reflex.
* Skippable from the first frame.

### 16.7 Fixes

* The early-call bonus chip was dark-on-light in a HUD where every other number
  is white with a hard shadow; it was also the first thing to go unreadable at
  small sizes. Now white on a deeper green.
* The bottom bar was `auto 1fr auto`, so the tray's centre followed the midpoint
  between the meta cluster and the wave control — and since the meta row grows
  and shrinks with claimable rewards, the hand drifted, at some sizes ending up
  hard against the right edge over the battlefield. Now `1fr auto 1fr`, which
  pins it to the middle of the SCREEN.
* `Defend Again` had reverted from `FRewardButton` to `FButton`, losing its
  movie icon.

---

## 17. Sixth pass — CrazyGames release hardening

Worked against Phase 6 of the `new-web-game-playbook`, which encodes the
rejection reasons from previous submissions.

### 17.1 gameplayStart / gameplayStop, split by release flag

The policy moved OUT of `GameScene` and into `useCrazyGames`, because which
events a build sends is a platform contract, not a view concern — and while it
lived in the SFC it could not be tested.

| | `VITE_APP_CRAZY_GAMES_FULL_RELEASE=false` | `=true` |
| --- | --- | --- |
| On load | one `gameplayStart()` | nothing |
| Ad on screen | — | `gameplayStop()` |
| Modal open | — | `gameplayStop()` |
| Result screen / defeat | — | `gameplayStop()` |
| Resume | — | `gameplayStart()` |

The pre-release build is a QA artefact with no ad inventory, so a full
start/stop lifecycle there emits a stream of events around ads that never play
and menus opened only to be inspected. One event says "the game got in" and
nothing else lies. `signalGameplayLoaded()` fires from the boot path once the
run is resumed or started, the canvas is sized and the first frame is about to
draw — it is idempotent, so a boot that runs twice still sends one event.

Tab visibility is deliberately NOT signalled: CG handles focus loss itself and
explicitly asks games not to.

### 17.2 Ads and menus actually pause the game

`isAdShowing` now feeds the lifecycle predicate as well as the pause gate, so a
requested ad stops gameplay on the SDK side too. The audio guarantee was already
in place from an earlier pass (`forceStopMusic()` + `killOneShotSfx()` + the
suspend-depth counter, flipped synchronously before the SDK call yields).
Verified live: requesting an ad reports `paused: true, reasons: ['ad']` with the
audio context suspended, and both release cleanly afterwards.

**Modals now halt the simulation.** `acquireModalOpen()` also takes an app pause.
Previously it was a pure SDK signal, so enemies kept chewing the tower while the
player read the tech tree — the one menu they open precisely because a wave is
beating them. It also keeps `gameplayStop()` honest: the event is supposed to
mean gameplay stopped, not that a panel is covering it.

This one is applied on EVERY build, not only the full release. The pre-release
build is what reviewers actually play, and a gameplay rule that differs between
the two makes their QA meaningless.

### 17.3 Rewarded allowance: 6 per 5 minutes

A rolling window in `useAdGate`. Portals treat a game that hammers the rewarded
placement as abusive inventory use, and a player who can watch six ads back to
back will, then resent the game for letting them.

* It counts REQUESTS, not grants — a dismissed or unfilled ad still cost the
  network a call, and not counting it would let a player farm no-fills.
* Enforced in `claimReward` as well as in `canOfferReward`: a button is not the
  only way into that function, and a limit that only hides UI is not a limit.
* Folded into `canOfferReward`, so every rewarded button hides itself rather
  than failing on tap.

### 17.4 Opt-in tutorial

The coach marks no longer auto-start. A small box sits beside the tower —
"Need a tutorial?", green **Start**, red **Skip** — with a speech tail pointing
back at the Gate, projected from world space so it follows the camera.

* It flips to the other side of the tower when the preferred side would be
  clipped, and clamps into the viewport when neither side fits. On a portrait
  phone the tower sits mid-screen and a right-anchored box simply ran off.
* Only the ANSWER is persisted, and it goes through `setState`, which the
  SaveManager mirrors to whichever backend the build has — the platform SDK's
  cloud store on CrazyGames / Playgama / Yandex, localStorage everywhere else.
  So a skip on a phone is not re-asked on a desktop.
* "Running" is in-memory only: an interrupted tutorial offers itself again next
  session rather than resuming mid-step.

An unrequested tutorial is an interruption — anyone who has played this genre
opens the game and is immediately told what a Gate is. Offering costs one tap to
decline, and makes the decline an answer worth storing.

---

## 18. Seventh pass — pacing and the crush

### 18.1 Build phase: a flat 15 seconds

`BUILD_TIME_MS = 15_000` for every wave. The old curve ran a minute down to
twenty seconds, which meant most of the early game was spent watching a timer
with nothing left to spend — after the economy rebalance the build phase is over
when the resources are, and that happens fast.

The early-call bonus rate is now DERIVED from the window
(`EARLY_CALL_MAX_BONUS / (BUILD_TIME_MS / 1000)`) rather than fixed at 1 %/s.
Leaving it fixed would have quietly capped the mechanic at +15 % once the window
shrank, stranding most of a reward the HUD still advertises as +40 %.

### 18.2 Falling blocks crush what is under them

A collapse is no longer only a loss.

* **Anything short of a boss dies outright**, whatever its HP — a wall dropping
  on you is not a damage roll, and losing the block is already the price. It
  turns a collapse into a trade the player can aim: undermine your own overhang
  over a packed lane and it pays for itself.
* **A boss is too big to squash.** It takes a share of its MAX hp
  (`BOSS_CRUSH_PCT`, scaled by fall height) so the mechanic stays relevant
  against a pool that grows every ten waves, and is SHOVED CLEAR of the tower
  instead of pinned. Killing a boss with masonry would trivialise the one fight
  the run is built around; knocking it back buys the seconds the player actually
  needed, and it walks straight back in.
* The shove is away from the tower's CENTRE, not from the impact point, so it
  always opens ground between the boss and the Gate whichever side it came from.
* `Enemy.knockback` pays the displacement off over a few frames at
  `KNOCKBACK_SPEED`, and suppresses the AI while it does. An instant two-cell
  sidestep read as a glitch rather than as being hit by a falling wall.

### 18.3 Defend Again is not gated

Reverted to a plain restart with no movie badge. It is the way OUT of a finished
run: gating it means a player whose ad fails to fill is stuck on the defeat
screen with no way back into the game. The rewarded placements are the 2×
payout, the tripled wave payout, the reinforced hand and the 2× speed buff —
all things a player can decline and carry on without.

---

## 19. Fix — daily missions never advanced

`recordRun()` was called from exactly one place: `presentDefeat`. Daily mission
progress therefore only moved when the Gate fell.

That made the panel a liar. A player forty kills into a siege opens the missions
board — which is precisely when they would — and sees `0/120`. With runs now
lasting many minutes, "your dailies update when you die" is indistinguishable
from "the dailies are broken", which is exactly how it was reported.

**Progress is now credited in DELTAS.** `recordRun` takes the run's *cumulative*
totals and credits only what has not been credited yet, which makes it
idempotent and safe to call at any cadence. It is fed from three places, none of
which needs to know about the others:

* every wave clear — the natural checkpoint, when the numbers have settled;
* whenever the missions panel opens, emitted *before* the modal shows so the
  first frame is already correct rather than visibly ticking up;
* at the end of the run, catching the partial wave the player died in.

`beginMissionRun()` re-baselines the tracker on a fresh run, and `recordRun`
additionally re-baselines on its own whenever a counter goes backwards — a
resumed snapshot, or a call site that forgot. Without that guard a new run would
credit a negative delta and claw back progress the player had earned.

`waves` stays a `max` (a best-single-run goal), so three short runs still cannot
add up to "survive to wave 9".

**Achievements were left alone.** They are lifetime accumulators with a `runs`
counter, so they must be fed exactly once per finished run — the single
`presentDefeat` call is correct for them and would be a bug anywhere else.

The regression tests pin the system clock to a date whose rotation is known to
contain the types under test. The triplet is generated from a hash of the day,
so without pinning, roughly a quarter of days would have silently asserted
nothing.
