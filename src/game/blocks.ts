import type { BlockDef } from './types'

// ─── Block catalogue ────────────────────────────────────────────────────────
//
// Balance intent:
//   • Structure blocks are the cheap filler that soaks damage. Wood is the
//     workhorse, brace is the "same footprint, twice the beef" upgrade, stone
//     is the expensive armour wall you reserve for the base.
//   • Weapon blocks are strictly worse as structure (low HP) so a tower that is
//     ALL turrets folds instantly — the tension that makes building interesting.
//   • Economy blocks pay out per cleared wave, so they compound: planting a
//     sawmill on wave 3 is a real strategic bet against the wave-8 spike.
//   • Spikes are pure punishment: no gun, no reach, but anything that bites
//     them bleeds. They make the front face of a tower expensive to chew.
//   • The Bombard is the anti-infantry scalpel — a near-vertical lob with a
//     tight blast, so it deletes the unit it lands on instead of scattering
//     chip damage across a crowd like the Mortar does.
//
// The Gate is the win condition. It is placed automatically at (0, 0) at run
// start, cannot be sold, and its death ends the run.

export const GATE_ID = 'gate'

export const BLOCK_DEFS: Record<string, BlockDef> = {
  gate: {
    id: 'gate',
    kind: 'core',
    cost: {},
    hp: 300,
    armor: 3,
    order: -1,
    palette: 'gate'
  },

  // ── Structure ────────────────────────────────────────────────────────────
  wood: {
    id: 'wood',
    kind: 'structure',
    cost: { wood: 10 },
    hp: 40,
    order: 0,
    palette: 'wood'
  },
  brace: {
    id: 'brace',
    kind: 'structure',
    cost: { wood: 22 },
    hp: 90,
    armor: 1,
    unlockNode: 'unlockBrace',
    order: 1,
    palette: 'brace'
  },
  stone: {
    id: 'stone',
    kind: 'structure',
    cost: { stone: 16 },
    hp: 170,
    armor: 4,
    order: 2,
    palette: 'stone'
  },

  // ── Weapons ──────────────────────────────────────────────────────────────
  archer: {
    id: 'archer',
    kind: 'weapon',
    cost: { wood: 20 },
    hp: 50,
    weapon: {
      damage: 7,
      cooldownMs: 620,
      range: 7.5,
      projectile: 'bolt',
      speed: 17,
      targeting: 'nearest',
      hitsAir: true
    },
    order: 3,
    palette: 'archer'
  },
  cannon: {
    id: 'cannon',
    kind: 'weapon',
    cost: { wood: 25, stone: 10 },
    hp: 60,
    weapon: {
      damage: 16,
      cooldownMs: 1400,
      range: 8.5,
      projectile: 'ball',
      speed: 12,
      splash: 1.2,
      targeting: 'strongest',
      hitsAir: true
    },
    order: 4,
    palette: 'cannon'
  },
  bombard: {
    id: 'bombard',
    kind: 'weapon',
    cost: { wood: 20, stone: 22, coins: 26 },
    hp: 65,
    weapon: {
      damage: 42,
      cooldownMs: 1900,
      range: 9,
      projectile: 'shell',
      speed: 0, // ballistic — the launch solution derives the velocity
      // A tight blast: this is a scalpel for the single unit it lands on, not
      // the Mortar's crowd-clearing shockwave.
      splash: 0.8,
      targeting: 'strongest',
      hitsAir: false
    },
    unlockNode: 'unlockBombard',
    order: 6,
    palette: 'bombard'
  },
  mortar: {
    id: 'mortar',
    kind: 'weapon',
    cost: { stone: 30, coins: 22 },
    hp: 70,
    armor: 2,
    weapon: {
      damage: 30,
      cooldownMs: 2600,
      range: 15,
      projectile: 'shell',
      speed: 0, // ballistic — the launch solution derives the velocity
      splash: 2.1,
      targeting: 'strongest',
      // Arcs to a ground impact point, so it simply cannot hit flyers.
      hitsAir: false
    },
    unlockNode: 'unlockMortar',
    order: 5,
    palette: 'mortar'
  },
  tesla: {
    id: 'tesla',
    kind: 'weapon',
    cost: { stone: 40, coins: 32 },
    hp: 60,
    weapon: {
      damage: 13,
      cooldownMs: 1500,
      range: 8,
      projectile: 'zap',
      speed: 0, // hitscan — the bolt is drawn, damage lands the same frame
      chain: 3,
      targeting: 'nearest',
      hitsAir: true
    },
    unlockNode: 'unlockTesla',
    order: 7,
    palette: 'tesla'
  },
  frost: {
    id: 'frost',
    kind: 'weapon',
    cost: { stone: 30, coins: 24 },
    hp: 60,
    weapon: {
      damage: 4,
      cooldownMs: 1100,
      range: 6.5,
      projectile: 'frost',
      speed: 13,
      splash: 1.4,
      slowPct: 0.45,
      slowMs: 2000,
      targeting: 'nearest',
      hitsAir: true
    },
    unlockNode: 'unlockFrost',
    order: 8,
    palette: 'frost'
  },

  // ── Utility ──────────────────────────────────────────────────────────────
  spikes: {
    id: 'spikes',
    kind: 'utility',
    cost: { wood: 18, stone: 12 },
    hp: 120,
    armor: 2,
    // Reflected damage is not reduced by enemy armour — it is the wall, not a
    // weapon, so a Bulwark's frontal plating does nothing against it.
    utility: { thorns: 14 },
    unlockNode: 'unlockSpikes',
    order: 9,
    palette: 'spikes'
  },
  repair: {
    id: 'repair',
    kind: 'utility',
    cost: { wood: 50, coins: 20 },
    hp: 60,
    utility: { repairPerWave: 12 },
    unlockNode: 'unlockRepair',
    order: 10,
    palette: 'repair'
  },

  // ── Economy ──────────────────────────────────────────────────────────────
  sawmill: {
    id: 'sawmill',
    kind: 'economy',
    cost: { wood: 40 },
    hp: 60,
    economy: { wood: 10 },
    unlockNode: 'unlockSawmill',
    order: 11,
    palette: 'sawmill'
  },
  quarry: {
    id: 'quarry',
    kind: 'economy',
    cost: { stone: 40 },
    hp: 70,
    armor: 1,
    economy: { stone: 7 },
    unlockNode: 'unlockQuarry',
    order: 12,
    palette: 'quarry'
  },
  mint: {
    id: 'mint',
    kind: 'economy',
    cost: { wood: 45, stone: 45, coins: 40 },
    hp: 70,
    economy: { coins: 6 },
    unlockNode: 'unlockMint',
    order: 13,
    palette: 'mint'
  },

  // ── Buffs ────────────────────────────────────────────────────────────────
  //
  // A banner does nothing by itself. It has no gun, its hit points are ordinary
  // and it produces nothing — everything it is worth lives in the four cells
  // around it, and the multiplier stacks, so a cannon with a banner on each
  // side is worth more than two cannons each with one.
  //
  // That is the whole design intent: until now the optimal tower was a pile of
  // the best block the player could afford, and WHERE anything went mattered
  // only for reach. A buff turns the tower into a shape with a middle.
  banner: {
    id: 'banner',
    kind: 'buff',
    // Deliberately un-gated. The support lane was empty for a player with no
    // tech, which is the whole reason the fifth offer slot could not exist.
    cost: { wood: 28 },
    hp: 55,
    buff: { statMul: 1.25, armor: 1 },
    order: 14,
    palette: 'banner'
  },
  obelisk: {
    id: 'obelisk',
    kind: 'buff',
    cost: { stone: 46, coins: 16 },
    hp: 120,
    armor: 2,
    // 1.4 against the banner's 1.25 — but the real jump is that two obelisks
    // give 1.96 where two banners give 1.56, because the curve is a product.
    buff: { statMul: 1.4, armor: 2 },
    unlockNode: 'unlockObelisk',
    order: 15,
    palette: 'obelisk'
  },

  // ── Early economy ────────────────────────────────────────────────────────
  //
  // The deep economy blocks (sawmill / quarry / mint) sit behind 160-640 coins
  // of tech, which puts them out of reach for exactly the player whose income
  // cannot pay for their own attrition. These are the affordable tier: smaller
  // yields, but buildable in the run where they would matter.
  //
  // Every yield in the game carries a +20 % pass over its first tuning. A
  // producer is a cell that neither shoots nor soaks, so it competes with a gun
  // for space AND for the resources that would have bought the gun — at the
  // original rates the trade was close enough that building one was mostly a
  // gesture.
  //
  // Yields are priced against `waveReward` — about a third of a wave's income
  // each, so three of them roughly double it, at the cost of three cells that
  // neither shoot nor soak.
  lumberHut: {
    id: 'lumberHut',
    kind: 'economy',
    cost: { wood: 30 },
    hp: 50,
    economy: { wood: 6 },
    order: 16,
    palette: 'sawmill'
  },
  stonepit: {
    id: 'stonepit',
    kind: 'economy',
    cost: { wood: 18, stone: 22 },
    hp: 65,
    armor: 1,
    economy: { stone: 5 },
    unlockNode: 'logistics',
    order: 17,
    palette: 'quarry'
  },
  coffer: {
    id: 'coffer',
    kind: 'economy',
    cost: { wood: 26, stone: 24 },
    hp: 60,
    // The first and only producer of RUN gold. Every other source is a kill
    // drop, which is why a player who built a wall that never let anything
    // close also never had gold to upgrade it with.
    economy: { gold: 5 },
    unlockNode: 'unlockCoffer',
    order: 18,
    palette: 'mint'
  },

  // ── Ships ────────────────────────────────────────────────────────────────
  //
  // The harbour is a SECOND tower, built sideways into the lake, and it exists
  // to answer the one lane a stone tower is bad at.
  //
  // Sea creatures are untouchable while submerged — that is their whole threat,
  // and until now the only answer was to out-heal the damage they did on the
  // way in. A hull sitting on the water is the one platform with anything
  // pointed downward, so ships alone carry `hitsSubmerged`: they kill an eel in
  // the approach instead of waiting for it to bite.
  //
  // What they deliberately CANNOT do is shoot air. A harbour must never be the
  // answer to everything — it buys the sea lane and a flanking angle on the
  // ground, and the crown still needs guns of its own.
  skiff: {
    id: 'skiff',
    kind: 'ship',
    cost: { wood: 34 },
    hp: 75,
    weapon: {
      damage: 9,
      cooldownMs: 700,
      range: 8,
      projectile: 'bolt',
      speed: 17,
      targeting: 'nearest',
      hitsAir: false,
      hitsSubmerged: true
    },
    unlockNode: 'harbour',
    waterOnly: true,
    order: 20,
    palette: 'skiff'
  },
  longship: {
    id: 'longship',
    kind: 'ship',
    cost: { wood: 48, stone: 18, coins: 20 },
    hp: 140,
    armor: 1,
    weapon: {
      damage: 24,
      cooldownMs: 1500,
      range: 11,
      projectile: 'bolt',
      speed: 20,
      splash: 0.9,
      targeting: 'strongest',
      hitsAir: false,
      hitsSubmerged: true
    },
    unlockNode: 'unlockLongship',
    waterOnly: true,
    order: 21,
    palette: 'longship'
  },
  galley: {
    id: 'galley',
    kind: 'ship',
    cost: { wood: 62, stone: 46, coins: 44 },
    hp: 210,
    armor: 2,
    weapon: {
      damage: 42,
      cooldownMs: 2400,
      range: 13,
      projectile: 'ball',
      speed: 13,
      splash: 1.8,
      targeting: 'strongest',
      hitsAir: false,
      hitsSubmerged: true
    },
    unlockNode: 'unlockGalley',
    waterOnly: true,
    order: 22,
    palette: 'galley'
  }
}


/** Every buildable block (the Gate is placed by the engine, never by hand). */
export const BUILDABLE_BLOCKS: ReadonlyArray<BlockDef> = Object.values(BLOCK_DEFS)
  .filter((d) => d.kind !== 'core')
  .sort((a, b) => a.order - b.order)

export const blockDef = (id: string): BlockDef => BLOCK_DEFS[id] ?? BLOCK_DEFS.wood!

/** True for a hull: water row only, floats, holds nothing up. */
export const isShip = (id: string): boolean => blockDef(id).waterOnly === true

// ─── Merging ────────────────────────────────────────────────────────────────
//
// Two adjacent blocks of the same type and the same tier fuse into ONE of the
// next tier. The trade is the whole design: four cannons' worth of material
// ends up in a single cell doing nine times a cannon's damage, and the three
// cells it vacates are yours to build on — but every point of that damage now
// lives behind one block's worth of frontage, and one bomber run can take all
// of it. Concentrating is a bet, not a free upgrade.
//
// Output triples per tier while hit points only double, and that gap is what
// keeps the bet honest: a merged tower out-damages a flat one long before it
// out-lasts it.

/** Tiers a block can reach. Tier 1 is a plain block. */
export const MAX_MERGE_TIER = 3

/** A block's tier, treating the absent field as a plain block. */
export const tierOf = (tier: number | undefined): number => tier ?? 1

/** Output multiplier — damage, thorns, blast, per-wave yield. */
export const mergePowerMul = (tier: number | undefined): number =>
  Math.pow(3, tierOf(tier) - 1)

/** Max-HP multiplier. Deliberately below the output curve; see above. */
export const mergeHpMul = (tier: number | undefined): number =>
  Math.pow(2, tierOf(tier) - 1)

/** Only armed blocks fuse. */
export const canMergeType = (typeId: string): boolean =>
  typeId !== GATE_ID && blockDef(typeId).weapon !== undefined

/**
 * Can these two blocks fuse?
 *
 * WEAPONS ONLY, and only with the same weapon: same type, same tier, below the
 * ceiling, never the Gate.
 *
 * Walls, crates, roofs and producers are excluded on purpose. Merging is a
 * damage bet — trade frontage for one bigger gun — and a wall has no damage to
 * bet. Letting masonry fuse also made ordinary building feel booby-trapped:
 * placing a two-cell crate piece silently welded it into one block the player
 * never asked for, and any roof or reinforcement that only one half carried was
 * lost in the weld. Everything unarmed now behaves exactly as it did before
 * merging existed.
 */
export const canMergeBlocks = (
  a: { typeId: string; tier?: number },
  b: { typeId: string; tier?: number }
): boolean =>
  a.typeId === b.typeId
  && canMergeType(a.typeId)
  && tierOf(a.tier) === tierOf(b.tier)
  && tierOf(a.tier) < MAX_MERGE_TIER

// ─── Enhanced blocks ────────────────────────────────────────────────────────
//
// The rewarded-ad hand deals REINFORCED versions of ordinary shapes. They are
// mechanically the same block with better numbers, so the player never has to
// learn a second catalogue — and the renderer gives them a moving sheen so it
// is obvious at a glance which parts of a tower are the good parts.

/** HP multiplier applied to an enhanced block. */
export const ENHANCED_HP_MUL = 1.75
/** Damage multiplier applied to an enhanced block's weapon. */
export const ENHANCED_DAMAGE_MUL = 1.5

// ─── Roofed blocks ──────────────────────────────────────────────────────────
//
// Live here rather than in the simulation so the build tray and the inspector
// can PRINT what a gable is worth. A rule the player can only discover by
// dying to it is not a trade-off, it is a trap.

/** A gable is structure, not decoration: a roofed block is twice the block. */
export const ROOF_HP_MUL = 2

/**
 * Damage divisor for hits that land on the roof itself.
 *
 * Expressed as a divisor rather than as triple flat armour on purpose. Armour
 * is SUBTRACTED, and the wooden roofed shapes carry none at all — tripling zero
 * would have given the player a roof that does nothing against the one thing a
 * roof is for, which is bombers.
 */
export const ROOF_TOP_DEFENSE_DIV = 3

// ─── In-run block upgrades ──────────────────────────────────────────────────
//
// Run gold has one other job besides paying for the tech-gated pieces: making
// the tower you ALREADY have better. Selling and rebuilding was the only way to
// improve a cell, and it is the worst one — it throws away the block's damage
// history and its position in the support tree for a strictly worse footprint.
//
// An upgrade is per-BLOCK, dies with the run, and touches every number the
// block has: hit points, weapon damage, thorns, death blast, per-wave yield and
// flat armour. One button, one price, everything on the card goes up — which is
// the only version of this a player reads correctly at a glance mid-siege.

/** Ranks a single block may buy. Past this the inspector shows "Max". */
export const MAX_BLOCK_LEVEL = 5
/** Max-HP gained per rank, as a fraction of the block's base. */
export const UPGRADE_HP_PER_LEVEL = 0.3
/** Output gained per rank — damage, thorns, blast and economy yield alike. */
export const UPGRADE_POWER_PER_LEVEL = 0.22
/** Flat armour gained per rank. Armour is SUBTRACTED from each hit, so this is
 *  deliberately small: it is the strongest of the four effects by far. */
export const UPGRADE_ARMOR_PER_LEVEL = 1

export const upgradeHpMul = (level = 0): number => 1 + UPGRADE_HP_PER_LEVEL * level
export const upgradePowerMul = (level = 0): number => 1 + UPGRADE_POWER_PER_LEVEL * level
export const upgradeArmorBonus = (level = 0): number => UPGRADE_ARMOR_PER_LEVEL * level

/**
 * Gold price of the rank `level → level + 1`, or `Infinity` at the ceiling.
 *
 * Priced off the block's own build cost rather than a flat table, so upgrading
 * a wood crate stays a small, casual decision while a Bombard rank is a real
 * commitment — the same relationship the build costs already establish.
 */
export const blockUpgradeCost = (typeId: string, level: number): number => {
  if (level >= MAX_BLOCK_LEVEL) return Infinity
  const { wood = 0, stone = 0, coins = 0 } = blockDef(typeId).cost
  const base = 8 + wood * 0.4 + stone * 0.6 + coins * 1.1
  return Math.max(5, Math.round(base * Math.pow(1.55, level)))
}

// ─── Fortifying ─────────────────────────────────────────────────────────────
//
// Any wall already standing can be converted, in place, into a spiked one.
//
// Spikes were reachable only through the offer deck, which meant "I want a
// thorned wall along the front" was a wish rather than a plan: the piece had to
// be drawn, and drawn in a shape that happened to fit where the wall wanted it.
// Converting turns a random hope into a decision the player can act on with
// what is already built.
//
// It is deliberately NOT free, and deliberately not a discount either — the
// player pays the difference in materials, exactly as if they had built the
// spiked wall instead, plus a small gold fee for doing it to a block that is
// already in the wall.

/** What a wall becomes. */
export const FORTIFY_TARGET = 'spikes'

/** The gold premium for converting in place rather than building fresh. */
export const FORTIFY_FEE = 6

/** Only plain walls. Not the Gate, not a gun, not a producer or a buff. */
export const canFortifyType = (typeId: string): boolean =>
  typeId !== FORTIFY_TARGET && blockDef(typeId).kind === 'structure'

/**
 * What converting one wall cell costs.
 *
 * The material half is the SHORTFALL against the spiked wall's own build cost,
 * so a braced crate — which already cost more wood than spikes do — pays only
 * the stone, and a stone block pays only the wood. Nobody is charged twice for
 * material they already put in the tower.
 */
export const fortifyCost = (
  typeId: string, cells = 1
): { wood: number; stone: number; coins: number } => {
  const from = blockDef(typeId).cost
  const to = blockDef(FORTIFY_TARGET).cost
  const n = Math.max(1, cells)
  return {
    wood: Math.max(0, (to.wood ?? 0) - (from.wood ?? 0)) * n,
    stone: Math.max(0, (to.stone ?? 0) - (from.stone ?? 0)) * n,
    coins: FORTIFY_FEE * n
  }
}

/**
 * Coin/resource refund for selling a placed block: half the build cost, rounded
 * down, so demolishing and rebuilding is never free churn.
 *
 * `cells` is the footprint a merged block occupies. A tier-3 battery was four
 * blocks bought and four blocks paid for; refunding it as one would make the
 * sell button a trap for exactly the players who used the merge system.
 */
export const sellRefund = (
  id: string, cells = 1, level = 0
): { wood: number; stone: number; coins: number } => {
  const def = blockDef(id)
  const n = Math.max(1, cells)
  // Ranks bought with run gold come back as run gold, at the same half rate as
  // the build cost. `sellRefund` used to read `def.cost` alone, so every coin a
  // player invested in a block was destroyed the moment they sold it — which
  // made upgrading a tower you might ever want to rearrange a trap.
  let ranks = 0
  for (let l = 0; l < Math.max(0, level); l++) ranks += blockUpgradeCost(id, l)
  return {
    wood: Math.floor((def.cost.wood ?? 0) * 0.5 * n),
    stone: Math.floor((def.cost.stone ?? 0) * 0.5 * n),
    coins: Math.floor((def.cost.coins ?? 0) * 0.5 * n + ranks * 0.5)
  }
}
