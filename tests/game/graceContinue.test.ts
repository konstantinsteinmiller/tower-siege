import { describe, expect, it, vi } from 'vitest'

// The simulation is a module-level singleton (project convention), so each test
// re-imports it fresh to get a clean tower.
const loadGame = async () => {
  vi.resetModules()
  localStorage.clear()
  return import('@/use/useTowerGame')
}

type Game = Awaited<ReturnType<typeof loadGame>>

/** Run waves until the gate falls, or give up. Returns the wave it died on. */
const playUntilDefeat = async (g: Game, maxWaves = 40): Promise<number> => {
  for (let w = 0; w < maxWaves; w++) {
    if (g.phase.value === 'defeat') break
    g.callWave()
    for (let i = 0; i < 6000 && g.phase.value === 'battle'; i++) g.step(50)
  }
  return g.wave.value
}

describe('grace continue', () => {
  it('rebuilds the tower that died and resumes the wave it died on', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 400
    g.stone.value = 400
    g.runCoins.value = 400
    // A tower deliberately thin enough to lose in a reasonable number of waves.
    for (const c of [-1, 1]) g.placeBlock('stone', c, 0)
    g.placeBlock('archer', 0, 1)

    await playUntilDefeat(g)
    expect(g.phase.value).toBe('defeat')
    expect(g.graceAvailable.value).toBe(true)

    const diedOnWave = g.wave.value
    expect(g.continueRun()).toBe(true)

    // Back in the build phase, on the wave that beat them, with a tower.
    expect(g.phase.value).toBe('build')
    expect(g.wave.value).toBeGreaterThan(0)
    expect(g.wave.value).toBeLessThanOrEqual(diedOnWave)
    expect(g.getBlocks().size).toBeGreaterThan(1)
    expect(g.gateHpPct.value).toBeGreaterThan(0)

    // One per run: the offer is spent, and a second call is refused.
    expect(g.graceAvailable.value).toBe(false)
    expect(g.continueRun()).toBe(false)
  })

  it('does not carry a used grace into the next run', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 400
    g.stone.value = 400
    for (const c of [-1, 1]) g.placeBlock('stone', c, 0)

    await playUntilDefeat(g)
    expect(g.continueRun()).toBe(true)
    expect(g.graceAvailable.value).toBe(false)

    // A fresh run starts with its own grace, and offers nothing before a death.
    g.startRun()
    expect(g.graceAvailable.value).toBe(false)
    await playUntilDefeat(g)
    expect(g.graceAvailable.value).toBe(true)
  })
})
