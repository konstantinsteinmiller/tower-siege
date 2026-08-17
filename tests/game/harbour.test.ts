import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BLOCK_DEFS, isShip } from '@/game/blocks'
import { SHAPE_BY_ID, eligibleShapes } from '@/game/shapes'
import { TECH_BY_ID, TECH_NODES, unlockedBlocks } from '@/game/tech'
import type { Block } from '@/game/types'

/**
 * The harbour is a second place to build, bought from a second tree, and it
 * breaks nearly every structural rule the tower runs on: hulls float, hold
 * nothing up, sit on a row that is otherwise unbuildable, and are the only
 * thing on the board that can shoot something underwater. Each of those is a
 * chance to leak into the tower's rules, so each is pinned here.
 */

/** Boot the sim with a given set of tech levels already owned. */
const loadGame = async (levels: Record<string, number> = {}) => {
  vi.resetModules()
  localStorage.clear()
  if (Object.keys(levels).length > 0) {
    localStorage.setItem('tower_state', JSON.stringify({ ts_tech: { levels } }))
  }
  const g = await import('@/use/useTowerGame')
  g.startRun()
  g.wood.value = 9999
  g.stone.value = 9999
  g.runCoins.value = 9999
  return g
}

type Game = Awaited<ReturnType<typeof loadGame>>

const at = (g: Game, c: number, r: number): Block | undefined =>
  [...g.getBlocks().values()].find((b) => b.c === c && b.r === r)

/** Every rank in the harbour line, so ships are fully unlocked. */
const FULL_HARBOUR = {
  harbour: 1, unlockLongship: 1, seasonedHulls: 1, navalGunnery: 1,
  dockWorks: 1, unlockGalley: 1
}

beforeEach(() => {
  localStorage.clear()
})

describe('the harbour tree', () => {
  it('is a second ROOT — it needs nothing from the tower line', () => {
    // The whole point of a separate tree: a player can commit to the lake
    // without first buying foundations they do not want.
    expect(TECH_BY_ID.harbour!.requires).toEqual([])
    expect(TECH_BY_ID.foundations!.requires).toEqual([])
  })

  it('never connects back into the tower tree', () => {
    const naval = new Set([
      'harbour', 'dockWorks', 'unlockLongship', 'seasonedHulls',
      'navalGunnery', 'unlockGalley', 'admiralty'
    ])
    for (const node of TECH_NODES) {
      if (!naval.has(node.id)) {
        // ...and nothing in the tower tree may depend on the harbour either.
        expect(node.requires.some((r) => naval.has(r))).toBe(false)
        continue
      }
      for (const req of node.requires) expect(naval.has(req)).toBe(true)
    }
  })

  it('sits in its own columns, with a gutter between the two trees', () => {
    const towerMax = Math.max(...TECH_NODES.filter((n) => n.col < 4).map((n) => n.col))
    const navalMin = Math.min(...TECH_NODES.filter((n) => n.col > 4).map((n) => n.col))
    expect(navalMin - towerMax).toBeGreaterThan(1)
  })

  it('unlocks the three hulls and nothing else', () => {
    const unlocked = unlockedBlocks(FULL_HARBOUR)
    expect([...unlocked].sort()).toEqual(['galley', 'longship', 'skiff'])
  })
})

describe('mooring', () => {
  it('refuses a hull anywhere but the water row', async () => {
    const g = await loadGame(FULL_HARBOUR)
    expect(g.WATER_ROW).toBe(-1)
    expect(g.canPlaceAt(2, g.WATER_ROW, 'skiff')).toBe(true)
    expect(g.canPlaceAt(2, 0, 'skiff')).toBe(false)
    expect(g.canPlaceAt(2, 1, 'skiff')).toBe(false)
  })

  it('refuses a CRATE on the water', async () => {
    const g = await loadGame(FULL_HARBOUR)
    expect(g.canPlaceAt(2, g.WATER_ROW, 'wood')).toBe(false)
    expect(g.canPlaceAt(2, 0, 'wood')).toBe(true)
  })

  it('needs no support — a hull floats where nothing touches it', async () => {
    const g = await loadGame(FULL_HARBOUR)
    // Far out in open water, nowhere near the tower.
    expect(g.canPlaceAt(3, g.WATER_ROW, 'skiff')).toBe(true)
    expect(g.placeBlock('skiff', 3, g.WATER_ROW)).toBe(true)
    expect(at(g, 3, g.WATER_ROW)!.typeId).toBe('skiff')
  })

  it('is bounded by the dock width, which its own node widens', async () => {
    const g = await loadGame({ harbour: 1 })
    expect(g.halfWidthAt(g.WATER_ROW)).toBe(3)
    expect(g.canPlaceAt(4, g.WATER_ROW, 'skiff')).toBe(false)

    const wide = await loadGame({ harbour: 1, dockWorks: 2 })
    expect(wide.halfWidthAt(wide.WATER_ROW)).toBe(5)
    expect(wide.canPlaceAt(4, wide.WATER_ROW, 'skiff')).toBe(true)
  })

  it('never lets one berth take two hulls', async () => {
    const g = await loadGame(FULL_HARBOUR)
    expect(g.placeBlock('skiff', 1, g.WATER_ROW)).toBe(true)
    expect(g.canPlaceAt(1, g.WATER_ROW, 'longship')).toBe(false)
  })
})

describe('hulls are not structure', () => {
  it('never falls, whatever happens to the tower', async () => {
    const g = await loadGame(FULL_HARBOUR)
    g.placeBlock('skiff', 2, g.WATER_ROW)
    // Wipe every land block, which is the harshest possible collapse.
    for (const b of [...g.getBlocks().values()]) {
      if (b.r >= 0 && b.typeId !== 'gate') g.sellBlock(b.c, b.r)
    }
    expect(at(g, 2, g.WATER_ROW)).toBeTruthy()
    expect(at(g, 2, g.WATER_ROW)!.falling).toBeUndefined()
  })

  it('holds nothing up: a tower cannot be moored to a boat', async () => {
    const g = await loadGame(FULL_HARBOUR)
    // A hull at (3, −1) and an overhang at (3, 1) reaching out from the tower.
    g.placeBlock('skiff', 3, g.WATER_ROW)
    for (const c of [1, 2, 3]) g.placeBlock('wood', c, 1)
    // Cut the overhang's link to the Gate. The hull below must not save it.
    g.sellBlock(1, 1)
    expect(at(g, 3, 1)).toBeUndefined()
  })
})

describe('what a hull is for', () => {
  it('is the only thing that can shoot a submerged enemy', async () => {
    for (const id of ['skiff', 'longship', 'galley']) {
      expect(BLOCK_DEFS[id]!.weapon?.hitsSubmerged).toBe(true)
      expect(isShip(id)).toBe(true)
    }
    // ...and nothing on land may carry that, or the harbour buys nothing.
    for (const def of Object.values(BLOCK_DEFS)) {
      if (def.waterOnly) continue
      expect(def.weapon?.hitsSubmerged ?? false).toBe(false)
    }
  })

  it('cannot answer the air, so a harbour is never the whole defence', () => {
    for (const id of ['skiff', 'longship', 'galley']) {
      expect(BLOCK_DEFS[id]!.weapon?.hitsAir).toBe(false)
    }
  })

  it('scales on its own tech, not the tower s', async () => {
    const plain = await loadGame({ harbour: 1 })
    plain.placeBlock('skiff', 1, plain.WATER_ROW)
    const base = at(plain, 1, plain.WATER_ROW)!.maxHp

    // Tower HP tech must do nothing for a hull...
    const towered = await loadGame({ harbour: 1, foundations: 10 })
    towered.placeBlock('skiff', 1, towered.WATER_ROW)
    expect(at(towered, 1, towered.WATER_ROW)!.maxHp).toBe(base)

    // ...and the harbour's own line must.
    const salted = await loadGame({ harbour: 1, seasonedHulls: 3 })
    salted.placeBlock('skiff', 1, salted.WATER_ROW)
    expect(at(salted, 1, salted.WATER_ROW)!.maxHp).toBeGreaterThan(base)
  })
})

describe('the offer deck', () => {
  it('keeps hulls out of the structure and weapon lanes', () => {
    for (const id of ['skiff1', 'longship1', 'galley1']) {
      expect(SHAPE_BY_ID[id]!.lane).toBe('naval')
    }
  })

  it('offers no hull until the harbour is bought', () => {
    const none = eligibleShapes(20, new Set(['wood', 'stone', 'archer']))
    expect(none.some((s) => s.lane === 'naval')).toBe(false)

    const owned = eligibleShapes(20, new Set(['wood', 'stone', 'archer', 'skiff']))
    expect(owned.filter((s) => s.lane === 'naval').map((s) => s.id)).toEqual(['skiff1'])
  })
})
