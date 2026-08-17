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
    economy: { wood: 8 },
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
    economy: { stone: 6 },
    unlockNode: 'unlockQuarry',
    order: 12,
    palette: 'quarry'
  },
  mint: {
    id: 'mint',
    kind: 'economy',
    cost: { wood: 45, stone: 45, coins: 40 },
    hp: 70,
    economy: { coins: 5 },
    unlockNode: 'unlockMint',
    order: 13,
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

/** Coin/resource refund for selling a placed block: half the build cost,
 *  rounded down, so demolishing and rebuilding is never free churn. */
export const sellRefund = (id: string): { wood: number; stone: number; coins: number } => {
  const def = blockDef(id)
  return {
    wood: Math.floor((def.cost.wood ?? 0) * 0.5),
    stone: Math.floor((def.cost.stone ?? 0) * 0.5),
    coins: Math.floor((def.cost.coins ?? 0) * 0.5)
  }
}
