import { describe, expect, it } from 'vitest'
import {
  SHAPE_DEFS, SHAPE_BY_ID, OFFER_SLOTS, shapeCost, shapeBounds,
  shapeBlockTypes, shapeHasRoof, eligibleShapes, rollOffer, rollOffers
} from '@/game/shapes'
import { BLOCK_DEFS } from '@/game/blocks'
import { makeRng } from '@/game/waves'

const ALL_BLOCKS = new Set(Object.keys(BLOCK_DEFS))

describe('shape catalogue integrity', () => {
  it('every cell references a real block type', () => {
    for (const s of SHAPE_DEFS) {
      for (const [, , typeId] of s.cells) {
        expect(ALL_BLOCKS.has(typeId), `${s.id} → ${typeId}`).toBe(true)
      }
    }
  })

  it('never contains the Gate — it is placed by the engine, not the player', () => {
    for (const s of SHAPE_DEFS) {
      expect(s.cells.some(([, , t]) => t === 'gate'), s.id).toBe(false)
    }
  })

  it('is normalised so the bottom-left cell is the (0,0) anchor', () => {
    for (const s of SHAPE_DEFS) {
      expect(Math.min(...s.cells.map(([dx]) => dx)), `${s.id} dx`).toBe(0)
      expect(Math.min(...s.cells.map(([, dy]) => dy)), `${s.id} dy`).toBe(0)
    }
  })

  it('has no duplicate cells within a shape', () => {
    for (const s of SHAPE_DEFS) {
      const seen = new Set(s.cells.map(([dx, dy]) => `${dx},${dy}`))
      expect(seen.size, s.id).toBe(s.cells.length)
    }
  })

  it('is edge-connected — a polyomino, not scattered cells', () => {
    // A disconnected shape would place blocks with nothing joining them, and
    // the collapse rule would immediately drop the orphaned half.
    for (const s of SHAPE_DEFS) {
      const cells = new Set(s.cells.map(([dx, dy]) => `${dx},${dy}`))
      const stack = [s.cells[0]!]
      const seen = new Set([`${s.cells[0]![0]},${s.cells[0]![1]}`])
      while (stack.length) {
        const [dx, dy] = stack.pop()!
        for (const [nx, ny] of [[dx - 1, dy], [dx + 1, dy], [dx, dy - 1], [dx, dy + 1]]) {
          const k = `${nx},${ny}`
          if (cells.has(k) && !seen.has(k)) { seen.add(k); stack.push([nx, ny, '']) }
        }
      }
      expect(seen.size, `${s.id} is disconnected`).toBe(s.cells.length)
    }
  })

  it('roof indices point at real cells', () => {
    for (const s of SHAPE_DEFS) {
      for (const i of s.roofs ?? []) {
        expect(i, s.id).toBeGreaterThanOrEqual(0)
        expect(i, s.id).toBeLessThan(s.cells.length)
      }
    }
  })

  it('only roofs the TOP cell of its column — a roof under a block is nonsense', () => {
    for (const s of SHAPE_DEFS) {
      for (const i of s.roofs ?? []) {
        const [dx, dy] = s.cells[i]!
        const above = s.cells.some(([ox, oy]) => ox === dx && oy === dy + 1)
        expect(above, `${s.id} roofs a cell with another cell above it`).toBe(false)
      }
    }
  })

  it('has unique ids', () => {
    expect(new Set(SHAPE_DEFS.map((s) => s.id)).size).toBe(SHAPE_DEFS.length)
  })
})

describe('shape maths', () => {
  it('costs the sum of its blocks', () => {
    // wO is four wood crates at 10 each.
    expect(shapeCost('wO')).toEqual({ wood: 40, stone: 0, coins: 0 })
    // cannonMount is two wood (20) plus a cannon (25 wood / 10 stone).
    expect(shapeCost('cannonMount')).toEqual({ wood: 45, stone: 10, coins: 0 })
    // mortarPit is two stone (32) plus a mortar (30 stone / 22 gold) — the
    // tech-gated pieces are the only ones that reach into the run's gold.
    expect(shapeCost('mortarPit')).toEqual({ wood: 0, stone: 62, coins: 22 })
  })

  it('reports the bounding box', () => {
    expect(shapeBounds('w1')).toEqual({ w: 1, h: 1 })
    expect(shapeBounds('w3h')).toEqual({ w: 3, h: 1 })
    expect(shapeBounds('wO')).toEqual({ w: 2, h: 2 })
    expect(shapeBounds('archerPerch')).toEqual({ w: 1, h: 2 })
  })

  it('lists distinct block types in first-appearance order', () => {
    expect(shapeBlockTypes('wO')).toEqual(['wood'])
    expect(shapeBlockTypes('cannonMount')).toEqual(['wood', 'cannon'])
  })

  it('flags roofed shapes', () => {
    expect(shapeHasRoof('wRoof2')).toBe(true)
    expect(shapeHasRoof('w2h')).toBe(false)
  })
})

describe('the offer deck', () => {
  const starter = new Set(['wood', 'stone', 'cannon', 'archer', 'spikes'])

  it('only offers shapes whose every block the player has unlocked', () => {
    const pool = eligibleShapes(50, starter)
    for (const s of pool) {
      for (const [, , typeId] of s.cells) expect(starter.has(typeId), s.id).toBe(true)
    }
    // The Mortar is tech-gated, so `mortarPit` must not appear.
    expect(pool.some((s) => s.id === 'mortarPit')).toBe(false)
  })

  it('respects minWave', () => {
    const early = eligibleShapes(1, ALL_BLOCKS).map((s) => s.id)
    expect(early).not.toContain('wRoof3')
    const later = eligibleShapes(10, ALL_BLOCKS).map((s) => s.id)
    expect(later).toContain('wRoof3')
  })

  it('always fills every slot, even for a brand-new player', () => {
    const hand = rollOffers(1, starter, makeRng(7))
    expect(hand).toHaveLength(OFFER_SLOTS)
    for (const id of hand) expect(SHAPE_BY_ID[id], id).toBeDefined()
  })

  it('guarantees a structure option in lane 0 and a weapon in lane 1', () => {
    // Without lane locking, a pure random draw regularly hands the player four
    // structure pieces during a wave where their tower has no guns.
    for (let seed = 0; seed < 40; seed++) {
      const rng = makeRng(seed * 7919 + 1)
      const hand = rollOffers(3, starter, rng)
      expect(SHAPE_BY_ID[hand[0]!]!.lane, `seed ${seed}`).toBe('structure')
      expect(SHAPE_BY_ID[hand[1]!]!.lane, `seed ${seed}`).toBe('weapon')
    }
  })

  it('never deals the same shape twice in one hand', () => {
    for (let seed = 0; seed < 40; seed++) {
      const hand = rollOffers(12, ALL_BLOCKS, makeRng(seed * 104729 + 3))
      expect(new Set(hand).size, `seed ${seed}: ${hand.join(',')}`).toBe(OFFER_SLOTS)
    }
  })

  it('rerolling a slot avoids the other three', () => {
    const hand = rollOffers(6, ALL_BLOCKS, makeRng(99))
    for (let i = 0; i < OFFER_SLOTS; i++) {
      const others = hand.filter((_, k) => k !== i)
      const next = rollOffer(i, 6, ALL_BLOCKS, others, makeRng(1234 + i))
      expect(others).not.toContain(next)
    }
  })

  it('falls back gracefully when a lane has no eligible shapes', () => {
    // A player with only wood unlocked has an EMPTY weapon lane; the deck must
    // still hand them something rather than an undefined slot.
    const woodOnly = new Set(['wood'])
    const hand = rollOffers(1, woodOnly, makeRng(5))
    expect(hand).toHaveLength(OFFER_SLOTS)
    for (const id of hand) expect(SHAPE_BY_ID[id], id).toBeDefined()
  })
})
