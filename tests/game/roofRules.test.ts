import { describe, expect, it, vi } from 'vitest'
import { SHAPE_BY_ID } from '@/game/shapes'
import type { Block } from '@/game/types'

// The simulation is a module-level singleton (project convention), so each test
// re-imports it fresh to get a clean tower.
const loadGame = async () => {
  vi.resetModules()
  localStorage.clear()
  const g = await import('@/use/useTowerGame')
  g.startRun()
  g.wood.value = 999
  g.stone.value = 999
  g.runCoins.value = 999
  return g
}

type Game = Awaited<ReturnType<typeof loadGame>>

/** Both cells of this piece carry a gable. */
const ROOFED = 'wRoof2'
/** The same footprint without one — the control for every placement case. */
const PLAIN = 'w2h'

/** Drop a shape by id, bypassing the four-slot hand. */
const put = (g: Game, shapeId: string, c: number, r: number): boolean => {
  g.offers.value = [shapeId, shapeId, shapeId, shapeId]
  return g.placeShape(0, c, r)
}

const at = (g: Game, c: number, r: number): Block | undefined =>
  [...g.getBlocks().values()].find((b) => b.c === c && b.r === r)

describe('roofed placement', () => {
  it('the fixtures are what the tests assume', () => {
    expect(SHAPE_BY_ID[ROOFED]?.roofs?.length).toBe(2)
    expect(SHAPE_BY_ID[PLAIN]?.roofs ?? []).toHaveLength(0)
    expect(SHAPE_BY_ID[PLAIN]?.cells).toHaveLength(2)
  })

  it('refuses a gable that would end up under an existing block', async () => {
    const g = await loadGame()
    // An overhang: (1,1) juts out over the empty ground cell (1,0). The Gate
    // occupies (0,0) on every run, so it is the base everything else hangs off.
    g.placeBlock('wood', 0, 1)
    g.placeBlock('wood', 1, 1)
    expect(at(g, 1, 1)).toBeTruthy()
    expect(at(g, 1, 0)).toBeUndefined()

    // The same footprint is legal without gables, so the refusal is about the
    // roof and not about the slot.
    expect(g.canPlaceShapeAt(PLAIN, 1, 0)).toBe(true)
    expect(g.canPlaceShapeAt(ROOFED, 1, 0)).toBe(false)
    expect(put(g, ROOFED, 1, 0)).toBe(false)
  })

  it('allows a gable with open sky above it', async () => {
    const g = await loadGame()
    expect(g.canPlaceShapeAt(ROOFED, 1, 0)).toBe(true)
    expect(put(g, ROOFED, 1, 0)).toBe(true)
  })

  it('still refuses anything built ON a roof', async () => {
    const g = await loadGame()
    expect(put(g, ROOFED, 1, 0)).toBe(true)
    expect(g.canPlaceAt(1, 1)).toBe(false)
    expect(g.canPlaceAt(2, 1)).toBe(false)
  })
})

describe('roofed durability', () => {
  it('doubles the HP of a roofed cell', async () => {
    const g = await loadGame()
    expect(put(g, PLAIN, -3, 0)).toBe(true)
    expect(put(g, ROOFED, 1, 0)).toBe(true)

    const plain = at(g, -3, 0)!
    const roofed = at(g, 1, 0)!
    expect(roofed.roof).toBe(true)
    expect(plain.roof).toBe(false)
    expect(roofed.maxHp).toBe(plain.maxHp * 2)
    expect(roofed.hp).toBe(roofed.maxHp)
  })

  it('divides damage landing on the roof, but not damage from the side', async () => {
    const g = await loadGame()
    expect(put(g, ROOFED, 1, 0)).toBe(true)
    const target = at(g, 1, 0)!
    expect(target.roof).toBe(true)

    // The same blow, from two directions.
    const before = target.hp
    g.damageBlockForTest(target, 30, 0.2) // a grunt swinging at ground level
    const fromSide = before - target.hp

    const mid = target.hp
    g.damageBlockForTest(target, 30, 2.4) // ordnance coming down on it
    const fromAbove = mid - target.hp

    expect(fromSide).toBeGreaterThan(0)
    expect(fromAbove).toBeCloseTo(fromSide / 3, 5)
  })

  it('gives an unroofed block no protection from above', async () => {
    const g = await loadGame()
    expect(put(g, PLAIN, 1, 0)).toBe(true)
    const target = at(g, 1, 0)!

    const before = target.hp
    g.damageBlockForTest(target, 30, 0.2)
    const fromSide = before - target.hp

    const mid = target.hp
    g.damageBlockForTest(target, 30, 2.4)
    expect(mid - target.hp).toBe(fromSide)
  })
})
