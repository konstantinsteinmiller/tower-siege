import { blockDef } from './blocks'

// ─── Build shapes ───────────────────────────────────────────────────────────
//
// The player does not place single blocks — they place POLYOMINOES, the way the
// reference towers are built: dominoes, L-bends, 2×2 squares, a cannon already
// mounted on its plinth. Four shapes are offered at a time; placing one rerolls
// that slot.
//
// Why this is better than a flat block palette:
//   • Every placement is a small spatial puzzle instead of a single tap.
//   • The offer deck creates scarcity — you build with what you're dealt, so no
//     two towers look alike and "what do I do with THIS piece" is a real
//     question every few seconds.
//   • Shapes that arrive pre-assembled (cannon-on-plinth) teach good structure
//     by example: the player learns that turrets want a base under them.
//
// ROOFS. Some shapes are capped with a gable. A roofed cell cannot be built on
// top of, which makes roofed pieces a genuine trade: they are cheap and sturdy,
// but they permanently close that column to further growth. Sealing your tower
// too early is a real way to lose.

export interface ShapeDef {
  id: string
  /** Cells as `[dx, dy, blockTypeId]`, normalised so min dx = min dy = 0.
   *  `dy` grows UPWARD, matching world space. */
  cells: Array<[number, number, string]>
  /** Indices into `cells` that carry a roof. Nothing may be placed directly
   *  above a roofed cell. */
  roofs?: number[]
  /** Which offer lane this shape can be drawn into. */
  lane: 'structure' | 'weapon' | 'support' | 'naval'
  /** Relative draw weight within its lane. */
  weight: number
  /** Earliest wave the shape enters the deck (keeps wave 1 simple). */
  minWave?: number
}

/** Shorthand for a rectangular run of one block type. */
const row = (n: number, type: string, y = 0): Array<[number, number, string]> =>
  Array.from({ length: n }, (_, i) => [i, y, type] as [number, number, string])

export const SHAPE_DEFS: ReadonlyArray<ShapeDef> = [
  // ── Structure: wood ───────────────────────────────────────────────────────
  { id: 'w1', lane: 'structure', weight: 10, cells: [[0, 0, 'wood']] },
  { id: 'w2h', lane: 'structure', weight: 14, cells: row(2, 'wood') },
  { id: 'w2v', lane: 'structure', weight: 10, cells: [[0, 0, 'wood'], [0, 1, 'wood']] },
  { id: 'w3h', lane: 'structure', weight: 9, cells: row(3, 'wood') },
  // L / J bends — the pieces that let you build outward overhangs.
  { id: 'wL', lane: 'structure', weight: 9, cells: [[0, 0, 'wood'], [0, 1, 'wood'], [1, 1, 'wood']] },
  { id: 'wJ', lane: 'structure', weight: 9, cells: [[1, 0, 'wood'], [0, 1, 'wood'], [1, 1, 'wood']] },
  { id: 'wO', lane: 'structure', weight: 8, cells: [[0, 0, 'wood'], [1, 0, 'wood'], [0, 1, 'wood'], [1, 1, 'wood']] },
  { id: 'wT', lane: 'structure', weight: 7, cells: [[0, 0, 'wood'], [1, 0, 'wood'], [2, 0, 'wood'], [1, 1, 'wood']] },
  { id: 'wS', lane: 'structure', weight: 6, cells: [[0, 0, 'wood'], [1, 0, 'wood'], [1, 1, 'wood'], [2, 1, 'wood']] },
  { id: 'wZ', lane: 'structure', weight: 6, cells: [[1, 0, 'wood'], [2, 0, 'wood'], [0, 1, 'wood'], [1, 1, 'wood']] },
  // Roofed gable — cheap and solid, but caps the column for good.
  { id: 'wRoof2', lane: 'structure', weight: 7, cells: row(2, 'wood'), roofs: [0, 1] },
  { id: 'wRoof3', lane: 'structure', weight: 5, cells: row(3, 'wood'), roofs: [0, 1, 2], minWave: 2 },

  // ── Structure: braced (tech-gated by the blocks it contains) ─────────────
  { id: 'b2h', lane: 'structure', weight: 8, cells: row(2, 'brace') },
  { id: 'bL', lane: 'structure', weight: 6, cells: [[0, 0, 'brace'], [0, 1, 'brace'], [1, 1, 'brace']] },
  { id: 'bO', lane: 'structure', weight: 5, cells: [[0, 0, 'brace'], [1, 0, 'brace'], [0, 1, 'brace'], [1, 1, 'brace']] },

  // ── Structure: stone ─────────────────────────────────────────────────────
  { id: 's1', lane: 'structure', weight: 9, cells: [[0, 0, 'stone']] },
  { id: 's2h', lane: 'structure', weight: 10, cells: row(2, 'stone') },
  { id: 's2v', lane: 'structure', weight: 7, cells: [[0, 0, 'stone'], [0, 1, 'stone']] },
  { id: 'sL', lane: 'structure', weight: 6, cells: [[0, 0, 'stone'], [0, 1, 'stone'], [1, 1, 'stone']] },
  { id: 'sO', lane: 'structure', weight: 5, cells: [[0, 0, 'stone'], [1, 0, 'stone'], [0, 1, 'stone'], [1, 1, 'stone']] },
  { id: 'sRoof2', lane: 'structure', weight: 5, cells: row(2, 'stone'), roofs: [0, 1], minWave: 2 },

  // ── Weapons ──────────────────────────────────────────────────────────────
  { id: 'archer1', lane: 'weapon', weight: 12, cells: [[0, 0, 'archer']] },
  // Pre-mounted turrets: the shape itself teaches "put a base under the gun".
  { id: 'archerPerch', lane: 'weapon', weight: 9, cells: [[0, 0, 'wood'], [0, 1, 'archer']] },
  { id: 'cannon1', lane: 'weapon', weight: 11, cells: [[0, 0, 'cannon']] },
  { id: 'cannonMount', lane: 'weapon', weight: 8, cells: [[0, 0, 'wood'], [1, 0, 'wood'], [0, 1, 'cannon']] },
  { id: 'mortar1', lane: 'weapon', weight: 9, cells: [[0, 0, 'mortar']] },
  { id: 'bombard1', lane: 'weapon', weight: 10, cells: [[0, 0, 'bombard']] },
  { id: 'bombardPit', lane: 'weapon', weight: 6, cells: [[0, 0, 'stone'], [0, 1, 'bombard']] },
  { id: 'mortarPit', lane: 'weapon', weight: 6, cells: [[0, 0, 'stone'], [1, 0, 'stone'], [0, 1, 'mortar']] },
  { id: 'tesla1', lane: 'weapon', weight: 9, cells: [[0, 0, 'tesla']] },
  { id: 'teslaSpire', lane: 'weapon', weight: 5, cells: [[0, 0, 'stone'], [0, 1, 'tesla']] },
  { id: 'frost1', lane: 'weapon', weight: 8, cells: [[0, 0, 'frost']] },
  { id: 'archerPair', lane: 'weapon', weight: 5, cells: [[0, 0, 'archer'], [1, 0, 'archer']], minWave: 4 },

  // ── Support: utility + economy ───────────────────────────────────────────
  { id: 'spikes1', lane: 'support', weight: 11, cells: [[0, 0, 'spikes']] },
  { id: 'spikes2v', lane: 'support', weight: 8, cells: [[0, 0, 'spikes'], [0, 1, 'spikes']], minWave: 3 },
  { id: 'spikeWall', lane: 'support', weight: 6, cells: row(2, 'spikes'), minWave: 5 },
  { id: 'sawmill1', lane: 'support', weight: 10, cells: [[0, 0, 'sawmill']] },
  { id: 'quarry1', lane: 'support', weight: 10, cells: [[0, 0, 'quarry']] },
  { id: 'mint1', lane: 'support', weight: 8, cells: [[0, 0, 'mint']] },
  { id: 'repair1', lane: 'support', weight: 8, cells: [[0, 0, 'repair']] },
  { id: 'sawmillPair', lane: 'support', weight: 4, cells: row(2, 'sawmill'), minWave: 5 },

  // ── Naval ────────────────────────────────────────────────────────────────
  //
  // Hulls are always 1x1 and always alone: a ship is moored in a berth, not
  // assembled out of polyominoes, and a two-cell "shape" made of boats would
  // be nonsense the moment the player tried to read it.
  //
  // `naval` is its own lane, and NO slot is locked to it — so ships only ever
  // turn up in the two free slots. A harbour is a second front, not a
  // replacement for the hand, and the structure and weapon lanes must keep
  // doing their jobs whatever the player has unlocked.
  { id: 'skiff1', lane: 'naval', weight: 10, cells: [[0, 0, 'skiff']] },
  { id: 'longship1', lane: 'naval', weight: 8, cells: [[0, 0, 'longship']] },
  { id: 'galley1', lane: 'naval', weight: 6, cells: [[0, 0, 'galley']] }
]

export const SHAPE_BY_ID: Record<string, ShapeDef> = Object.fromEntries(
  SHAPE_DEFS.map((s) => [s.id, s])
)

export const shapeDef = (id: string): ShapeDef => SHAPE_BY_ID[id] ?? SHAPE_DEFS[0]!

/** Total build cost — the sum of every constituent block. */
export const shapeCost = (id: string): { wood: number; stone: number; coins: number } => {
  const def = SHAPE_BY_ID[id]
  if (!def) return { wood: 0, stone: 0, coins: 0 }
  let wood = 0
  let stone = 0
  let coins = 0
  for (const [, , typeId] of def.cells) {
    const b = blockDef(typeId)
    wood += b.cost.wood ?? 0
    stone += b.cost.stone ?? 0
    coins += b.cost.coins ?? 0
  }
  return { wood, stone, coins }
}

/** Bounding box in cells — the tray uses it to scale the thumbnail. */
export const shapeBounds = (id: string): { w: number; h: number } => {
  const def = SHAPE_BY_ID[id]
  if (!def) return { w: 1, h: 1 }
  let w = 1
  let h = 1
  for (const [dx, dy] of def.cells) {
    if (dx + 1 > w) w = dx + 1
    if (dy + 1 > h) h = dy + 1
  }
  return { w, h }
}

/** Distinct block types in a shape, in first-appearance order. Drives the
 *  tooltip's "what am I actually placing" line. */
export const shapeBlockTypes = (id: string): string[] => {
  const def = SHAPE_BY_ID[id]
  if (!def) return []
  const seen: string[] = []
  for (const [, , typeId] of def.cells) if (!seen.includes(typeId)) seen.push(typeId)
  return seen
}

export const shapeHasRoof = (id: string): boolean => (SHAPE_BY_ID[id]?.roofs?.length ?? 0) > 0

// ─── The offer deck ─────────────────────────────────────────────────────────
//
// Four slots, each with a FIXED LANE. Pure random draws would regularly hand
// the player four structure pieces during a wave where their tower has no guns,
// which reads as the game being unfair rather than as a puzzle. Locking lane 1
// to weapons guarantees a defensive option is always on the table; the two free
// lanes supply the variety.

export const OFFER_SLOTS = 4

const SLOT_LANES: ReadonlyArray<ShapeDef['lane'] | 'any'> = [
  'structure', // always something to build WITH
  'weapon',    // always something to shoot WITH
  'any',
  'any'
]

/** The slot whose lane is locked to weapons — the one the affordability net
 *  below is allowed to overwrite. */
export const WEAPON_SLOT = 1

/** Total build cost collapsed to one comparable number. Gold is the scarcest
 *  of the three within a run and stone the next, so they weigh more. */
const costWeight = (id: string): number => {
  const c = shapeCost(id)
  return c.wood + c.stone * 1.3 + c.coins * 2.5
}

/**
 * A gun the player can actually pay for right now.
 *
 * Locking slot 1 to the weapon lane guarantees a gun is on the table, but not
 * that the player can BUY it — and an unaffordable gun is the same as no gun.
 * A tesla (40 stone + 32 gold) rolled into the weapon lane on a wave where the
 * player has spent down to nothing leaves them watching a wave arrive with a
 * hand of four pieces they cannot place, which is a loss they were given no way
 * to prevent.
 *
 * Among affordable guns the pick is RANDOM, not cheapest: always falling back
 * to the archer would turn the safety net into a rut. Only when nothing is
 * affordable does it hand over the cheapest one, so the player is at least
 * looking at the gun they will be able to afford first.
 */
export const pickAffordableWeapon = (
  wave: number,
  unlockedBlocks: Set<string>,
  canAfford: (shapeId: string) => boolean,
  rand: () => number = Math.random
): string | null => {
  const guns = eligibleShapes(wave, unlockedBlocks).filter((s) => s.lane === 'weapon')
  if (guns.length === 0) return null
  const payable = guns.filter((s) => canAfford(s.id))
  if (payable.length === 0) {
    return guns.reduce((best, s) => (costWeight(s.id) < costWeight(best.id) ? s : best)).id
  }
  return payable[Math.min(payable.length - 1, Math.floor(rand() * payable.length))]!.id
}

/** Shapes whose every block type the player has unlocked, and whose `minWave`
 *  has been reached. */
export const eligibleShapes = (wave: number, unlockedBlocks: Set<string>): ShapeDef[] =>
  SHAPE_DEFS.filter((s) =>
    (s.minWave ?? 0) <= wave &&
    s.cells.every(([, , typeId]) => unlockedBlocks.has(typeId))
  )

/**
 * Draw one shape for `slot`. `exclude` holds the ids currently on offer so the
 * tray never shows the same piece twice — four identical dominoes would be a
 * non-choice.
 */
export const rollOffer = (
  slot: number,
  wave: number,
  unlockedBlocks: Set<string>,
  exclude: ReadonlyArray<string> = [],
  rand: () => number = Math.random
): string => {
  const lane = SLOT_LANES[slot % OFFER_SLOTS] ?? 'any'
  const all = eligibleShapes(wave, unlockedBlocks)

  const inLane = lane === 'any' ? all : all.filter((s) => s.lane === lane)
  // Fall back through: lane → any → the whole catalogue. A brand-new player has
  // no economy blocks unlocked, so the `support` lane can legitimately be empty.
  let pool = inLane.filter((s) => !exclude.includes(s.id))
  if (pool.length === 0) pool = all.filter((s) => !exclude.includes(s.id))
  if (pool.length === 0) pool = all
  if (pool.length === 0) return 'w1'

  let total = 0
  for (const s of pool) total += s.weight
  let pick = rand() * total
  for (const s of pool) {
    pick -= s.weight
    if (pick <= 0) return s.id
  }
  return pool[pool.length - 1]!.id
}

/** A full set of four offers — used at run start and after a tech unlock. */
export const rollOffers = (
  wave: number,
  unlockedBlocks: Set<string>,
  rand: () => number = Math.random
): string[] => {
  const out: string[] = []
  for (let i = 0; i < OFFER_SLOTS; i++) {
    out.push(rollOffer(i, wave, unlockedBlocks, out, rand))
  }
  return out
}
