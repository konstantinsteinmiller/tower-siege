import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OFFER_SLOTS } from '@/game/shapes'

// The simulation is a module-level singleton (project convention), so each test
// re-imports it fresh to get a clean tower.
const loadGame = async () => {
  vi.resetModules()
  localStorage.clear()
  return import('@/use/useTowerGame')
}

describe('placement rules', () => {
  it('starts with only the Gate, at the origin', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.getBlocks().size).toBe(1)
    expect(g.getBlocks().get('0,0')?.typeId).toBe('gate')
  })

  it('allows any ground-row cell inside the build width — the ground supports it', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.canPlaceAt(2, 0)).toBe(true)
    expect(g.canPlaceAt(-2, 0)).toBe(true)
  })

  it('rejects cells outside the buildable column range', async () => {
    const g = await loadGame()
    g.startRun()
    // The foundation is four cells either side of the Gate before any tech.
    expect(g.canPlaceAt(4, 0)).toBe(true)
    expect(g.canPlaceAt(5, 0)).toBe(false)
    expect(g.canPlaceAt(-5, 0)).toBe(false)
  })

  it('rejects a floating cell with no orthogonal neighbour', async () => {
    const g = await loadGame()
    g.startRun()
    // (2, 3) is in the air, touching nothing.
    expect(g.canPlaceAt(2, 3)).toBe(false)
  })

  it('accepts a cell that touches an existing block orthogonally', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.canPlaceAt(0, 1)).toBe(true) // directly on the Gate
    g.placeBlock('wood', 0, 1)
    expect(g.canPlaceAt(0, 2)).toBe(true)
    expect(g.canPlaceAt(1, 1)).toBe(true)
  })

  it('rejects diagonal-only contact so nobody draws a staircase into the sky', async () => {
    const g = await loadGame()
    g.startRun()
    g.placeBlock('wood', 0, 1)
    // (1, 2) touches (0, 1) only at a corner.
    expect(g.canPlaceAt(1, 2)).toBe(false)
  })

  it('rejects an occupied cell', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.canPlaceAt(0, 0)).toBe(false)
  })

  it('rejects negative rows (underground)', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.canPlaceAt(0, -1)).toBe(false)
  })
})

describe('build economy', () => {
  it('charges the block cost and refuses a placement it cannot pay for', async () => {
    const g = await loadGame()
    g.startRun()
    const woodBefore = g.wood.value
    expect(g.placeBlock('wood', 1, 0)).toBe(true)
    expect(g.wood.value).toBe(woodBefore - 10)

    g.wood.value = 0
    expect(g.placeBlock('wood', 2, 0)).toBe(false)
    // A rejected placement must not partially charge.
    expect(g.wood.value).toBe(0)
  })

  it('refunds half the cost on sale', async () => {
    const g = await loadGame()
    g.startRun()
    g.placeBlock('wood', 1, 0)
    const woodBefore = g.wood.value
    const refund = g.sellBlock(1, 0)
    expect(refund).toEqual({ wood: 5, stone: 0, coins: 0 })
    expect(g.wood.value).toBe(woodBefore + 5)
    expect(g.getBlocks().has('1,0')).toBe(false)
  })

  it('never sells the Gate', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.sellBlock(0, 0)).toBeNull()
    expect(g.getBlocks().get('0,0')?.typeId).toBe('gate')
  })
})

describe('structural collapse', () => {
  it('drops blocks that lose their connection to the ground', async () => {
    const g = await loadGame()
    g.startRun()
    // A column: (1,0) on the ground, (1,1) and (1,2) stacked above it.
    g.placeBlock('wood', 1, 0)
    g.placeBlock('wood', 1, 1)
    g.placeBlock('wood', 1, 2)
    expect(g.getBlocks().size).toBe(4)

    // Selling the base orphans the two above it.
    g.sellBlock(1, 0)
    expect(g.getBlocks().has('1,1')).toBe(false)
    expect(g.getBlocks().has('1,2')).toBe(false)
    expect(g.getDebris().length).toBe(2)
    // The Gate is untouched — it has its own ground contact.
    expect(g.getBlocks().has('0,0')).toBe(true)
  })

  it('keeps blocks that remain connected through a sideways path', async () => {
    const g = await loadGame()
    g.startRun()
    // (0,1) sits on the Gate; (1,1) hangs off it sideways with no ground below.
    g.placeBlock('wood', 0, 1)
    g.placeBlock('wood', 1, 1)
    expect(g.getBlocks().has('1,1')).toBe(true)
    // Still connected via (0,1) → the Gate → the ground.
    expect(g.getDebris().length).toBe(0)
  })
})

describe('wave lifecycle', () => {
  it('starts in the build phase with a build timer', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.phase.value).toBe('build')
    expect(g.buildTimeLeft.value).toBeGreaterThan(0)
    expect(g.wave.value).toBe(0)
  })

  it('calling a wave advances the counter and enters battle', async () => {
    const g = await loadGame()
    g.startRun()
    g.callWave()
    expect(g.phase.value).toBe('battle')
    expect(g.wave.value).toBe(1)
    expect(g.enemiesTotal.value).toBeGreaterThan(0)
  })

  it('auto-starts the wave when the build timer expires', async () => {
    const g = await loadGame()
    g.startRun()
    // Step past the whole build window in fixed-step-sized chunks.
    for (let i = 0; i < 4000 && g.phase.value === 'build'; i++) g.step(16.67)
    expect(g.phase.value).toBe('battle')
  })

  it('clears the wave and returns to build once the field empties', async () => {
    const g = await loadGame()
    g.startRun()
    // A wall of stone so wave 1 cannot reach the Gate before it dies.
    g.stone.value = 999
    g.wood.value = 999
    for (const c of [-3, -2, -1, 1, 2, 3]) g.placeBlock('stone', c, 0)
    g.placeBlock('cannon', 0, 1)
    g.placeBlock('archer', 1, 1)

    g.callWave()
    // Simulate up to two minutes of battle.
    for (let i = 0; i < 7200 && g.phase.value === 'battle'; i++) g.step(16.67)

    expect(g.phase.value).toBe('build')
    expect(g.lastWaveReward.value?.wave).toBe(1)
    expect(g.kills.value).toBeGreaterThan(0)
  })
})

describe('run persistence', () => {
  it('round-trips the tower through a snapshot', async () => {
    const g = await loadGame()
    g.startRun()
    g.placeBlock('wood', 1, 0)
    g.placeBlock('wood', 1, 1)
    g.placeBlock('archer', -1, 0)
    const blocksBefore = g.getBlocks().size
    const woodBefore = g.wood.value
    g.saveRunSnapshot()

    // A fresh module instance = a cold boot with the same storage.
    const g2 = await import('@/use/useTowerGame')
    void g2
    expect(g.hasSavedRun()).toBe(true)
    expect(g.resumeRun()).toBe(true)
    expect(g.getBlocks().size).toBe(blocksBefore)
    expect(g.wood.value).toBe(woodBefore)
    expect(g.getBlocks().get('-1,0')?.typeId).toBe('archer')
  })

  it('reports no saved run on a clean install', async () => {
    const g = await loadGame()
    expect(g.hasSavedRun()).toBe(false)
    expect(g.resumeRun()).toBe(false)
  })

  it('rebuilds a missing Gate rather than booting an unwinnable run', async () => {
    const g = await loadGame()
    const { setState } = await import('@/use/useTowerState')
    const { RUN_KEY } = await import('@/keys')
    setState(RUN_KEY, {
      wave: 3, wood: 50, stone: 20, runCoins: 5, kills: 9, killsByType: {},
      blocks: [[1, 0, 'wood', 40]],
      offers: ['w1', 'archer1', 'w2h', 'spikes1'],
      startedAt: Date.now()
    })
    expect(g.resumeRun()).toBe(true)
    expect(g.getBlocks().get('0,0')?.typeId).toBe('gate')
  })

  it('drops unknown block ids from a corrupt snapshot instead of throwing', async () => {
    const g = await loadGame()
    const { setState } = await import('@/use/useTowerState')
    const { RUN_KEY } = await import('@/keys')
    setState(RUN_KEY, {
      wave: 2, wood: 10, stone: 10, runCoins: 0, kills: 0, killsByType: {},
      blocks: [[0, 0, 'gate', 300], [1, 0, 'not_a_block', 40]],
      offers: ['w1', 'archer1', 'w2h', 'spikes1'],
      startedAt: Date.now()
    })
    expect(g.resumeRun()).toBe(true)
    expect(g.getBlocks().has('1,0')).toBe(false)
  })
})

describe('shape placement', () => {
  const armAll = async (g: Awaited<ReturnType<typeof loadGame>>, ids: string[]) => {
    // Offers are rolled randomly; overwrite them so the test is deterministic.
    // Padded to the real slot count so a test that only cares about the first
    // few does not have to be rewritten every time a lane is added.
    g.offers.value = Array.from({ length: OFFER_SLOTS }, (_, i) => ids[i] ?? 'w1')
  }

  it('places every cell of a multi-cell shape and charges the whole cost', async () => {
    const g = await loadGame()
    g.startRun()
    await armAll(g, ['wO', 'archer1', 'w1', 'spikes1'])
    const woodBefore = g.wood.value

    expect(g.placeShape(0, 1, 0)).toBe(true)
    // 2×2 square of wood: four cells, 40 wood.
    expect(g.wood.value).toBe(woodBefore - 40)
    for (const k of ['1,0', '2,0', '1,1', '2,1']) {
      expect(g.getBlocks().has(k), k).toBe(true)
    }
  })

  it('rerolls the placed slot so the hand stays four live choices', async () => {
    const g = await loadGame()
    g.startRun()
    await armAll(g, ['w1', 'archer1', 'w2h', 'spikes1', 'banner1'])
    g.placeShape(0, 1, 0)
    expect(g.offers.value).toHaveLength(OFFER_SLOTS)
    // Every other slot is untouched.
    expect(g.offers.value.slice(1)).toEqual(['archer1', 'w2h', 'spikes1', 'banner1'])
  })

  it('refuses a shape the player cannot fully afford — and charges nothing', async () => {
    const g = await loadGame()
    g.startRun()
    await armAll(g, ['wO', 'archer1', 'w1', 'spikes1'])
    g.wood.value = 30 // wO costs 40
    expect(g.placeShape(0, 1, 0)).toBe(false)
    expect(g.wood.value).toBe(30)
    expect(g.getBlocks().size).toBe(1) // just the gate
  })

  it('supports the shape as a whole — an overhang cell needs no support of its own', async () => {
    const g = await loadGame()
    g.startRun()
    // wL is (0,0) (0,1) (1,1): the top-right cell floats, held by its own column.
    expect(g.canPlaceShapeAt('wL', 2, 0)).toBe(true)
  })

  it('rejects a shape that touches nothing', async () => {
    const g = await loadGame()
    g.startRun()
    // Floating at row 4 with no tower under it.
    expect(g.canPlaceShapeAt('w2h', 2, 4)).toBe(false)
  })

  it('rejects a shape whose footprint leaves the buildable width', async () => {
    const g = await loadGame()
    g.startRun()
    // The foundation reaches c=4, so a 3-wide piece anchored at c=3 would
    // reach c=5 and must be refused; anchored at c=2 it just fits.
    expect(g.canPlaceShapeAt('w3h', 3, 0)).toBe(false)
    expect(g.canPlaceShapeAt('w3h', 2, 0)).toBe(true)
  })

  it('rejects a shape that overlaps an existing block', async () => {
    const g = await loadGame()
    g.startRun()
    g.placeBlock('wood', 1, 0)
    // A 2-wide piece anchored at (0,0) would land on the gate and on (1,0).
    expect(g.canPlaceShapeAt('w2h', 1, 0)).toBe(false)
  })
})

describe('roofs', () => {
  it('marks the roofed cells of a placed shape', async () => {
    const g = await loadGame()
    g.startRun()
    g.offers.value = ['wRoof2', 'archer1', 'w1', 'spikes1']
    expect(g.placeShape(0, 1, 0)).toBe(true)
    expect(g.getBlocks().get('1,0')?.roof).toBe(true)
    expect(g.getBlocks().get('2,0')?.roof).toBe(true)
  })

  it('seals the column — nothing may be built on a roofed block', async () => {
    const g = await loadGame()
    g.startRun()
    g.offers.value = ['wRoof2', 'archer1', 'w1', 'spikes1']
    g.placeShape(0, 1, 0)
    // Directly above a roofed cell is forbidden...
    expect(g.canPlaceAt(1, 1)).toBe(false)
    expect(g.canPlaceShapeAt('w1', 1, 1)).toBe(false)
    // ...but the cell beside it is still fair game.
    expect(g.canPlaceAt(3, 0)).toBe(true)
  })

  it('survives a snapshot round-trip', async () => {
    const g = await loadGame()
    g.startRun()
    g.offers.value = ['wRoof2', 'archer1', 'w1', 'spikes1']
    g.placeShape(0, 1, 0)
    g.saveRunSnapshot()
    expect(g.resumeRun()).toBe(true)
    expect(g.getBlocks().get('1,0')?.roof).toBe(true)
    expect(g.canPlaceAt(1, 1)).toBe(false)
  })
})

describe('coin payouts', () => {
  it('banks the wave reward to the wallet as soon as a wave is held', async () => {
    const g = await loadGame()
    const { default: useTowerEconomy } = await import('@/use/useTowerEconomy')
    const wallet = useTowerEconomy()
    g.startRun()
    const before = wallet.coins.value

    g.stone.value = 999
    g.wood.value = 999
    for (const c of [-3, -2, -1, 1, 2, 3]) g.placeBlock('stone', c, 0)
    g.placeBlock('cannon', 0, 1)
    g.placeBlock('archer', 1, 1)

    g.callWave()
    for (let i = 0; i < 7200 && g.phase.value === 'battle'; i++) g.step(16.67)

    expect(g.phase.value).toBe('build')
    // Surviving must pay NOW, not only at the end of the run.
    expect(wallet.coins.value).toBeGreaterThan(before)
  })

  it('guarantees a floor reward so a wipe never pays literally nothing', async () => {
    const g = await loadGame()
    g.startRun()
    // No tower beyond the gate — wave 1 walks straight in.
    g.callWave()
    for (let i = 0; i < 20000 && g.phase.value !== 'defeat'; i++) g.step(16.67)

    expect(g.phase.value).toBe('defeat')
    expect(g.runSummary().coins).toBeGreaterThan(0)
  })
})
