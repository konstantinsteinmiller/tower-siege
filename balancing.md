# Tower Siege — first-time-player balance audit

**Status: APPLIED.** Groups A–E were signed off and are implemented; §6 records
what shipped and §8 how it was verified. The findings in §1–§5 are kept as the
evidence the changes were made against.

Scope: what a brand-new player experiences — empty save, zero tech tree, zero
meta coins — from their first wave to roughly their fifth run. Four parallel
read-only audits (wave curve, in-run economy, tech tree, onboarding), each
re-executing the real `planWave` / `waveBudget` / `ENEMY_DEFS` code rather than
estimating, cross-checked against the running game.

Severity: **P0** = a new player probably quits here · **P1** = clearly wrong,
survivable · **P2** = worth fixing, not urgent.

---

## 0. The headline

A competent new player is fought at a **permanent +60 % difficulty surcharge**
they cannot see or escape, hits **three unannounced mechanic walls** (waves 8,
12, 16), and is then handed a meta-progression screen whose three cheapest
purchases are all imperceptible. The systems meant to rescue them — adaptive
difficulty, the affordable-weapon guarantee, the incoming-threat warnings — are
each either miscalibrated, silently failing, or not wired up at all.

---

## 1. Difficulty calibration is wrong by ~2×  *(P0)*

`expectedPower(w) = 22·w^1.65 + 600` (`src/game/difficulty.ts:79`) is documented
as fitted to *"~620 at wave 1, ~1600 by wave 10, ~3600 by wave 20"*. A player who
simply spends their starting 120 wood / 40 stone actually measures
**1285 / 3483 / 8403** — and the ratio stays flat at **2.07–2.31 for all 25
waves**.

Consequences:

- `adaptiveFactor` sits at **1.57 → 1.68 permanently** and never approaches the
  neutral 1.0. From the player's seat this is not adaptive difficulty at all, it
  is a constant **+60 % budget tax** on competent play.
- The only way to reach 1.0 is to build *badly*.
- `waves.ts:40` documents a budget curve (`w3→164, w5→292, w10→707, w20→1755`)
  that is **1.9–2.3× the actual output** of `waveBudget` (`waves.ts:42-43`:
  60 / 126 / 195 / 374 / 748). One of the two is stale; the numbers were tuned
  against a curve that is not the one shipping.

### 1a. The flawless streak is a one-way ratchet *(P0)*

`FlawlessTracker.recordWave` (`difficulty.ts:136-147`) only ever does
`mul = min(2.2, mul × 1.2)`. Losing a block resets the *streak* but **never
decrements `mul`** — deliberately, per the comment, to stop farming the reset.
The effect is that a player who plays ten clean waves banks ×2.2 permanently,
and the adaptive **floor** for them stops being 0.75 and becomes
**0.75 × 2.2 = 1.65**. The system that exists to rescue a struggling player
cannot price a wave below +65 % for the player most likely to need it.

### 1b. The real ceiling is 5.72×, not the documented 2.6× *(P1)*

`mul = adaptive × flawlessMul ≤ 2.6 × 2.2 = 5.72` on Medium (**7.15** on Hard).
`difficulty.ts:82-85` documents `MAX_ADAPTIVE = 2.6` as "narrow enough that a
wave is never unrecognisable from its number" — that bound is not the one
applied. And because `mul` raises head count *and* divides the spawn interval by
`√mul` (`waves.ts:211`), the ceiling is ~3.5× the units arriving ~2.4× faster —
about **8× density** — on top of 2.16× per-unit HP.

### 1c. Repairing raises the difficulty of the wave it was meant to survive *(P1)*

`measureTower` reads **current** HP (`useTowerGame.ts:279`), and the tech heal
`waveRepairPct` runs in `completeWave` — i.e. *before* the next `callWave`
measurement. So `fieldRepairs` directly and immediately inflates the wave it
just healed you for. Going into a build phase damaged is a difficulty discount.

Related: `measureTower` counts economy and pure-HP blocks in `hp` with no DPS,
and `towerPower` uses `√(hp × dps)`, so a wall-only or economy expansion raises
next wave's budget while adding nothing that kills.

---

## 2. Three unannounced mechanic walls *(P0)*

| Wave | What lands | Warning? |
|---|---|---|
| **8** | **8 suicide bombers at once.** 45 damage in a 1.7-cell radius (`enemies.ts:110`). Wood is 40 HP / 0 armour (`blocks.ts:39-42`) and `damageBlocksInRadius` hits *every* block in the blast — so **one bomber deletes 3–7 wood cells outright**. | **none** |
| **12** | **Three new rules on one wave**: armoured `bulwark` (60 % frontal reduction), the sea lane re-opening after a 7-wave gap, and bomb-run `bombardier`. | **none** |
| **16** | **`ballista`, standoff 9 cells.** Archer reaches 7.5, cannon 8.5 — the first enemy in the game that **neither available weapon can touch**. | **none** |

Wave 8 is invisible to any HP/DPS-based tuning pass because the aggregate
numbers *fall* that wave (HP −5 %, DPS −29 %): a bomber has `damage: 0` and all
of its output is in `suicide`. Wave-8 income is **4.96 cells**; a single bomber
connecting costs more than the entire wave's income.

### 2a. The warnings exist in code and are not wired up *(P0, cheap fix)*

`countAir`, `countSea`, `countBombers` are exported from `waves.ts:419-432`,
explicitly documented as feeding *"the HUD's incoming air warning"* — and have
**no caller anywhere in `src/`**. The warning does not exist.

`blocks.descriptions.*` — 18 strings including `archer: "Hits fliers."` —
is shipped and translated into 22 locales and **never rendered**. So is
`hints.inspect`, the one line that would teach the block inspector.

### 2b. The one warning that does exist reads the wrong wave *(P1)*

`GameScene.vue:1114` calls `countSiege(planWave(wave.value))` with the **default
`difficulty = 1`**, not the `mul` the wave was actually built with. The HUD and
the battlefield disagree on **12 of the 14 waves from 14 to 25** — including
wave 14, where the cavalry button is hidden while a ram is chewing the wall.

---

## 3. Income cannot pay for attrition *(P0)*

`waveReward.coins` goes to the **meta** wallet, not the run
(`useTowerGame.ts:2444`). In-run gold comes **only** from kill drops.

Per-wave income, expressed as buildable cells:

| Wave | 1 | 4 | 8 | 12 | 16 | 20 |
|---|---|---|---|---|---|---|
| cells income buys | 2.45 | 3.56 | 4.96 | 6.40 | 7.80 | 9.24 |
| % of one four-card hand | 27 % | 40 % | 55 % | 71 % | 87 % | 103 % |

Income never funds a second hand before wave 20 and funds **less than half a
hand until wave 7**.

`waves.ts:83-88` records the authors' own simulation: *"waves 12-15 cost 14-17
blocks each against ~4 rebuilt, and the run died to attrition every time from
full health."* The shipped rates give **6.4 / 6.7 / 7.2 / 7.5** cells per wave —
still roughly **half** what those waves destroy, and a fresh player has none of
the mitigations that were meant to close the gap (`repair`, `fieldRepairs`,
`sawmill`, `quarry` are all tech-gated).

### 3a. The affordable-weapon guarantee silently fails below 20 wood *(P0)*

`pickAffordableWeapon` (`shapes.ts:203-216`) returns the *cheapest* gun and
installs it even when nothing is payable. The cheapest gun a fresh player has is
`archer1` at **20 wood**, so the guarantee is binary at exactly that number.

Monte-Carlo over 120 000 faithful hands:

| Wallet | P(no affordable weapon) | P(no affordable piece **at all**) |
|---|---|---|
| 17 w / 12 s — **wave-1 income** | **100 %** | **81.6 %** |
| 19 w / 15 s | 100 % | 81.6 % |
| 20 w / 0 s | 0 % | 0 % |

Wave-1 income is 17 wood — *below the floor*. A player who spends down during
any build phase enters the next one staring at four unplayable cards ~82 % of
the time, with a 5 s per-slot reroll cooldown against a 15 s build phase.

### 3b. Run gold has no sink a new player can find *(P1)*

Every block a fresh player can build is coins-free; every gold-priced block is
tech-gated; cavalry spends **meta** coins. So `upgradeBlock` is the only in-run
sink that exists — and it lives behind a long-press on the block inspector,
whose teaching hint is one of the strings that is never emitted (§2a). The
715 gold earned by wave 20 does nothing.

When they *do* find it, the maths is stark and undocumented:

- **Wide beats deep by 5.75×.** `1.55^4` — an archer's 5th rank costs 92 gold
  for the identical +2.48 DPS the 1st rank buys for 16.
- **The Gate is the best purchase in the game and is not a DPS purchase.** It has
  `cost: {}`, so rank 1 is **8 gold for +90 max HP and +1 armour**. Full L5 =
  115 gold for +450 HP and armour 3 → 8, which puts every grunt hit on the
  1-damage floor.
- **Upgrade gold is destroyed on sale or death** — `sellRefund` reads `def.cost`
  and never `b.level`.

---

## 4. The tech tree's incentives point the wrong way *(P1)*

### 4a. `harbour` is accidentally the strongest node in the game *(P1)*

140 coins, tier 0, **no prerequisites** (`tech.ts:338-345`). It opens 7 berths,
and:

- **Ground infantry cannot attack hulls at all** — `groundFrontier` only scans
  row 0 (`useTowerGame.ts:1240`), which is documented behaviour.
- **There are no sea enemies before wave 12** (`seaShare` = 0, `waves.ts:148`).

So for waves 1–11 a skiff is an **invulnerable, free-firing turret platform that
consumes no foundation footprint**: 34 wood for 12.9 DPS, seven of them for 90
DPS. Compare `sharpBolts` — 30 coins for +7 % of a far smaller base.

### 4b. The three cheapest nodes are all imperceptible *(P1)*

The economy funnels the first purchase to `foundations` (20), `lumberStock` (28)
and `sharpBolts` (30) — the three cheapest in the tree. What they buy:

| Purchase | Observable change |
|---|---|
| `foundations` r1 | wood crate 40 → **42.4 HP**. Invisible. |
| `sharpBolts` r1 | archer 7 → **7.49** damage. Invisible. |
| `lumberStock` r1 | 120 → 140 starting wood = exactly one more archer. Visible. |

The tech spotlight fires as soon as `affordableCount > 0`, i.e. at **20 coins** —
before any legible purchase exists. The first *visible* purchase (`harbour` 140,
`unlockSpikes` 150) is out of reach until run 2.

### 4c. Nodes that can buy literally nothing *(P1)*

- **`forgeWelds`** (130, +350 prereqs): `mergeOutputMul` returns 1 for tier ≤ 1.
  A player who buys it and never merges gets **zero effect, with no signal**.
- **`cavalryDrill`** (250, +1 790 prereqs): the cavalry button only renders when
  siege engines are inbound, and `siegeShare` is 0 below wave 14. Inert for the
  first ~13 waves — and each sortie spends 40 **meta** coins, competing with the
  tree it sits in.
- **`rapidFire` r1** is strictly dominated by `sharpBolts` r1: identical +7 % DPS
  (enemy armour is percentage-based), 70 coins vs 30, one tier deeper.

### 4d. Idle faucets out-earn playing *(P2)*

The treasure chest pays **25 coins / 3 min and 100 / 10 min, uncapped, no ad**
(`TreasureChest.vue:25-28`) — **600 coins/hour of wall-clock idling**. A run
reaching wave 8 takes several minutes of active play and pays ~250. Day-one
total is roughly 1 150–1 500 coins, of which the runs themselves are ~400.

### 4e. `resumeRun` eats the consolation payout *(P2)*

`useTowerGame.ts:2681` resets `wavesClearedThisRun = 0`, which zeroes the
`5 + wavesCleared·4` floor and the battle-pass / mission wave credit. Reloading
mid-run silently costs the player that payout.

---

## 5. Onboarding & comprehension *(P0)*

Not number problems — but they are why a number problem *feels* unfair: the
player cannot see the lever that would have solved it.

### 5a. The defeat screen never says the words "tech tree"

The only route to meta progression is a button labelled `result.upgrade` =
**"Upgrade!"** — a word the game already uses for the *run-scoped* block upgrade
(`blocks.upgrade`). It is also the **weaker** CTA: "Defend again" is the bright
`FRewardButton`, "Upgrade!" is a plain button. The loud button restarts the loop
that just killed them.

### 5b. Backing out of the tech tree silently restarts the run

`GameScene.vue:719-721` — closing the tech modal while `phase === 'defeat'`
immediately calls `startFreshRun()`. An exploratory tap costs the player their
whole orientation.

### 5c. The "Spend!" callout is structurally guaranteed to miss the first death

It is gated on `&& !showResult.value`, so it is suppressed on the exact screen
where coins were just awarded. During run 1 the player has 0 coins, so it cannot
fire then either. It first appears in **run 2's build phase**.

### 5d. The defeat payout uses the wrong currency glyph

`GameScene.vue:1490` prints a round `IconCoin` beside `summary.coins`, which is
the leftover **run gold**. The two currencies the codebase works hard to keep
distinct are merged, unlabelled, on the one screen where they convert.

### 5e. Mechanics never explained anywhere reachable

Roof **sealing** (a permanent column cap), block upgrades with run gold,
merging, ships, run gold vs meta coins, and anti-air. See §2a for the shipped
strings that would have taught three of them and are never rendered.

---

## 6. What was applied

All five groups, signed off together. Each change carries its reasoning in a
code comment at the site, so the next tuning pass can see what it is undoing.

### Group A — wiring fixes

| # | Change |
|---|---|
| A1 | **Incoming-threat warnings now exist.** `countAir` / `countSea` / `countSiege` plus a new `countBlast` feed colour-coded chips above Call Wave during the build phase. They describe the wave being CALLED — `previewNextWave()` re-runs the director's own derivation without mutating state, because `wavePlan()` still holds the wave just fought. |
| A1b | `countBlast` counts suicide bombers as well as bomb-runners. `countBombers` filtered on `bombRun` alone and so stayed silent through wave 8, the sharpest wall in the early game. |
| A2 | The cavalry counter reads the director's real plan instead of re-planning at `difficulty = 1`. It disagreed with the battlefield on 12 of the 14 waves from 14 to 25. |
| A3 | The 18 shipped-and-translated `blocks.descriptions.*` strings now render in the build-tray info box — including `archer: "Hits fliers."`, the only place the game ever explained anti-air. |
| A4 | The `hints.inspect` control hint is emitted. It was written and translated into 22 locales and never once shown, which is why no player was told the block inspector — and therefore run-gold upgrades — exists. |
| A5 | The defeat payout uses the gold ingot. `summary.coins` is run gold; printing the wallet's round coin merged the two currencies on the one screen where they convert. |
| A6 | `resumeRun` restores `wavesClearedThisRun` from the snapshot instead of zeroing it, so reloading mid-run no longer silently costs the consolation floor and the battle-pass credit. |
| A7 | Closing the tech tree after a defeat returns to the result screen instead of starting a fresh run. |

### Group B — difficulty calibration

| # | Change |
|---|---|
| B1 | `expectedPower` refitted from `22·w^1.65 + 600` to **`62·w^1.52 + 980`**, against the replay harness rather than by hand. |
| B2 | The flawless streak **decays** on a wave that costs blocks (÷1.1) instead of ratcheting. Decay is slower than growth (×1.2) so feeding a crate is still a losing trade. |
| B3 | `clampDifficulty` bounds the **combined** `adaptive × flawless`. The documented 2.6 ceiling was reachable at 5.72. |
| B4 | The tower is measured **minus whatever was healed** since the last wave (`repairedSinceMeasure`). Building still counts; repairing no longer inflates the wave it healed for. |
| B5 | The stale budget-curve comment in `waves.ts` replaced with the numbers the function actually returns. |

### Group C — the three walls

| # | Change |
|---|---|
| C1 | One bomber previewed at wave 6. |
| C2 | `bulwark` previewed at wave 10, `bombardier` at 11 — wave 12 no longer debuts three rules at once. |
| C3 | The standoff engines now **ladder** across the roster: ballista 9 → **8** (a cannon answers it), catapult 13 → **12** (a mortar does), trebuchet 20 → **15** (a mortar exactly reaches). Nothing out-ranges the whole arsenal; all three still out-range the free guns, so cavalry keeps its job. |
| C4 | Bomber blast 45 → **34**, below a wood crate's 40 HP. One blast still guts a wall; it no longer deletes every cell it touches. Ballista previewed at wave 14. |

### Group D — economy

| # | Change |
|---|---|
| D1 | **The affordable-weapon guarantee is real.** If the entire hand is unaffordable, the purse is floored at the price of one gun — once per build phase, capped at that price, and inert for a player who can already afford anything. |
| D2 | `waveReward` gains a second slope from wave 10 (`+2.0` wood / `+1.5` stone per wave above 9), reaching ≈ +35 % by wave 20. The early game keeps its scarcity. |
| D3 | `sellRefund` returns half the gold sunk into a block's ranks. |
| D4 | Addressed by A4 — the inspector, and therefore the only in-run gold sink a fresh player has, is now discoverable. |

### Group E — tech tree

| # | Change |
|---|---|
| E1 | `harbour` 140 → **210**, and **ranged ground attackers can now target moored hulls** (`groundFrontier`). Melee still cannot, which keeps the deliberate asymmetry; what is gone is eleven waves of hulls shooting the ground lane with nothing able to shoot back. |
| E2 | `unlockBrace` 90 → **60** and `unlockSpikes` 150 → **90**, putting a *visible* purchase — a whole new block, and the only node that fills the empty support lane — inside a first run's 60–115 coin budget. |
| E3 | `cavalryDrill` 500 → **360**; it buys nothing for the first thirteen waves of every run. |
| E4 | `rapidFire` 140 → **80**. At +7 % fire rate against `sharpBolts`' +7 % damage it was arithmetically identical, one tier deeper and 2.3× the price. |
| E5 | The treasure chest gains a **300-coin daily cap**. Uncapped it paid 600/hour of idling against ~250 for a wave-8 run — the faucet out-earned the game. |

---

## 7. Comprehension work (shipped alongside)

- A three-beat **tech-tree intro** on the first defeat: *"Everything you buy here
  is permanent…"* → *"Coins come from every siege…"* (spotlighting the wallet) →
  *"Gold nodes you can afford now…"*. Once per save, persisted to
  `ts_tech_intro`.
- The tech tree now shows the **player's coin balance**, which it never did.
- The sell button moved to the left edge of the detail row, so it no longer
  slides under the tap that just bought a rank.

---

## 7b. Follow-up feature: The Works

Added after the pass, and it closes two of its findings directly:

- **§3 (income cannot pay for attrition)** — an early economy tier (`lumberHut`,
  `stonepit`, `coffer`) that a player can afford in the run where it matters,
  rather than the 160–640-coin deep tier they cannot. `coffer` is the first and
  only producer of RUN gold; every other source is a kill drop, which is why a
  player whose wall held perfectly finished with nothing to upgrade it with.
- **§4b / the empty support lane** — buff blocks (`banner`, `obelisk`) whose
  auras multiply across neighbours, and a fifth, strictly-support offer slot
  that always has something in it. Both carriers are un-gated so the slot is
  never empty for a player with no tech.

A third tech root, **The Works**, holds the rest.

---

## 8. Verification

`tools/balance-replay.ts` walks a scripted player through the real director,
enemy table and difficulty curve and prints the wave-by-wave columns. Run it
with:

```
node --import ./tools/ts-resolve.mjs tools/balance-replay.ts --waves 25 --policy greedy
```

| | before | after |
|---|---|---|
| competent player (`greedy`) | died wave 7 | **survived all 25** |
| — mean difficulty multiplier | 1.55 | **1.03** (target 1.00) |
| — mean power / expected ratio | 1.64 | **1.02** (target 1.00) |
| wall-heavy player (`naive`) | died wave 11 | **died wave 21** |
| — mean difficulty multiplier | 1.18 | **0.86** |
| — blocks lost vs rebuilt | 48 / 39 | **139 / 135** |

In-game, an auto-played run with no tech and no strategy now sees the
difficulty scalar oscillate between **0.75 and 1.12** across waves 2–11, where
it previously sat pinned at 1.4–1.7 for the whole run — the adaptive term moves
in both directions for the first time.

16 new regression tests in `tests/game/balancePass.test.ts` pin each contract:
the calibration band, the two-directional adaptive response, the combined
clamp, streak decay, every preview, the blast ceiling against a wood crate, the
standoff ladder, the second income slope, rank refunds, the tech-tree price
band, and the no-soft-lock guarantee (including that the relief fires once per
build phase and never for a solvent player).

**Full suite: 671 passing, 57 files. Type-check clean.**

---

## 9. Follow-up: the hoarding surcharge

### The hole the eco branch opened

The adaptive director prices each wave against `towerPower`, which measures what
is **standing**. The Works branch added a way to accumulate value that is *not*
standing: a player who fills the tower with sawmills and quarries and simply
banks the yield reads as a weak tower, is handed a discounted wave, and sits on
enough wood and stone to rebuild everything twice over. The eco branch was meant
to reward planning, not to buy an easier game.

`FlawlessTracker` does not catch this either — it only fires on waves cleared
without losing a block, and a coasting eco player usually is losing blocks.

### The rule

`hoardFactor(wood, stone, coins)` in `src/game/difficulty.ts`. A ladder, not a
stack — the highest matching band applies and the rest are ignored:

| reserve | factor | measured wave size |
|---|---|---|
| under the lines | ×1.0 | 35 |
| over 200 wood **and** over 200 stone | ×1.25 | 44 |
| 500+ wood **or** 500+ stone | ×1.5 | 53 |
| over 1000 wood, stone **or** coins | ×2.0 | 71 |

The first band needs **both** piles, because holding 300 wood and no stone is
mid-build rather than hoarding. The upper bands take either, because by then the
size of the pile is the point regardless of which pile it is. Coins enter only
at the top band: run gold is spent in lumps on ranks and is legitimately banked
between purchases, so taxing it earlier would punish saving up for one upgrade.

### Where it is applied

Both to the wave **budget** and to per-enemy **HP**, at full strength in each —
"tougher monsters" is the point, and a player sitting on a war chest can pay a
head-count tax without changing anything about how they play.

It multiplies **outside** `clampDifficulty`. The clamp exists so a wave stays
recognisable from its number against terms the player cannot see; this term is
the opposite — it is announced on the HUD and can be cleared at will. Folding it
inside the clamp would let a tower already at the 2.6 ceiling hoard for free,
which is exactly the player it is meant to reach.

### It is never silent

`previewNextWave()` applies the same factor, so the build-phase banner promises
what Call Wave delivers, and a gold `Hoard +25/50/100%` chip leads the warning
row (`warnings.hoard`, shipped in all 21 locales). Unlike every other lane
warning — which says *brace* — this one says *spend*, and it is the only
difficulty term in the game the player can switch off at any moment.

**Contracts:** `tests/game/hoardAndPooling.test.ts` pins every band boundary
(200 vs 201, 499 vs 500, 1000 vs 1001 coins), that the bands do not compound,
that negative reserves do not invert the tax, that the preview agrees with the
call, and that spending clears it.
