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
  }
}

/** Every buildable block (the Gate is placed by the engine, never by hand). */
export const BUILDABLE_BLOCKS: ReadonlyArray<BlockDef> = Object.values(BLOCK_DEFS)
  .filter((d) => d.kind !== 'core')
  .sort((a, b) => a.order - b.order)

export const blockDef = (id: string): BlockDef => BLOCK_DEFS[id] ?? BLOCK_DEFS.wood!

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
