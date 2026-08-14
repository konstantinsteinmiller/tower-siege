import { describe, expect, it, vi } from 'vitest'
import { firstRunBudgetScale, planWave } from '@/game/waves'

/**
 * ─── The first-session scripted opening ─────────────────────────────────────
 *
 * A brand-new player used to meet wave 1 as an empty foundation under a
 * fifteen-second timer, having never been shown what a tower looks like. Two
 * things answer that, and both are only ever on while `ts_onboarded` is false:
 *
 *   1. a free starter fort, seeded onto the foundation, and
 *   2. waves 1-2 priced under the curve.
 *
 * The load-bearing claim is the last test in this file: a player who does
 * NOTHING but call the wave survives it. That is the "one guaranteed win" the
 * whole feature exists to deliver, and it is the only way to know the two
 * numbers above are actually sized for each other.
 */

const loadGame = async () => {
  vi.resetModules()
  localStorage.clear()
  return import('@/use/useTowerGame')
}

/** Mark the player as onboarded BEFORE the module is imported, so the sim's
 *  first-session reads see a veteran. */
const loadVeteranGame = async () => {
  vi.resetModules()
  localStorage.clear()
  localStorage.setItem('tower_state', JSON.stringify({ ts_onboarded: true }))
  return import('@/use/useTowerGame')
}

/** Run one wave and stop the moment it is over. Returns false if the run died. */
const playWave = (g: any): boolean => {
  g.callWave()
  for (let t = 0; t < 200_000; t += 16) {
    g.step(16)
    if (g.phase.value === 'defeat') return false
    if (g.phase.value === 'build' && t > 1_000) return true
  }
  return g.phase.value !== 'defeat'
}

describe('first-session budget scale', () => {
  it('discounts wave 1 to 60% and eases back to full by wave 3', () => {
    expect(firstRunBudgetScale(1)).toBeCloseTo(0.6)
    expect(firstRunBudgetScale(2)).toBeCloseTo(0.8)
    expect(firstRunBudgetScale(3)).toBe(1)
    expect(firstRunBudgetScale(12)).toBe(1)
  })

  it('sends fewer enemies on the opening waves', () => {
    expect(planWave(1, 1, true).total).toBeLessThan(planWave(1, 1, false).total)
    expect(planWave(2, 1, true).total).toBeLessThan(planWave(2, 1, false).total)
  })

  it('leaves everything from wave 3 on exactly as it was', () => {
    for (const w of [3, 5, 9, 12, 20]) {
      expect(planWave(w, 1, true).orders).toEqual(planWave(w, 1, false).orders)
    }
  })

  it('stays deterministic — the discounted wave is still the same wave twice', () => {
    expect(planWave(1, 1, true).orders).toEqual(planWave(1, 1, true).orders)
  })

  it('is off by default, so nothing outside the first session sees it', () => {
    expect(planWave(1).orders).toEqual(planWave(1, 1, false).orders)
  })
})

describe('the free starter fort', () => {
  it('puts a wall either side of the Gate and a cannon on top of it', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.seedScriptedOpening()).toBe(true)

    const blocks = g.getBlocks()
    expect(blocks.size).toBe(4)
    expect(blocks.get('-1,0')?.typeId).toBe('wood')
    expect(blocks.get('1,0')?.typeId).toBe('wood')
    expect(blocks.get('0,1')?.typeId).toBe('cannon')
  })

  it('is free — it costs the player no resources', async () => {
    const g = await loadGame()
    g.startRun()
    const woodBefore = g.wood.value
    const stoneBefore = g.stone.value
    g.seedScriptedOpening()
    expect(g.wood.value).toBe(woodBefore)
    expect(g.stone.value).toBe(stoneBefore)
  })

  it('does not count towards blocks the PLAYER placed', async () => {
    const g = await loadGame()
    g.startRun()
    g.seedScriptedOpening()
    // Missions and lifetime achievements read this; the player placed nothing.
    expect(g.runSummary().blocksPlaced).toBe(0)
  })

  it('refuses to seed anything but a bare foundation', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.seedScriptedOpening()).toBe(true)
    // A second call would drop blocks into cells the player may have built on.
    expect(g.seedScriptedOpening()).toBe(false)
    expect(g.getBlocks().size).toBe(4)
  })

  it('survives a reload — the fort is in the run snapshot', async () => {
    const g = await loadGame()
    g.startRun()
    g.seedScriptedOpening()

    const g2 = await import('@/use/useTowerGame')
    expect(g2.resumeRun()).toBe(true)
    expect(g2.getBlocks().get('0,1')?.typeId).toBe('cannon')
    expect(g2.getBlocks().size).toBe(4)
  })
})

describe('the guaranteed opening win', () => {
  it('a first-session player who only calls the wave survives wave 1', async () => {
    const g = await loadGame()
    g.startRun()
    g.seedScriptedOpening()

    expect(playWave(g)).toBe(true)
    expect(g.wave.value).toBe(1)
    // Not merely alive — the Gate should still be worth defending afterwards.
    expect(g.gateHpPct.value).toBeGreaterThan(0.5)
  })

  it('softens wave 1 for a first-session player and not for a veteran', async () => {
    const fresh = await loadGame()
    fresh.startRun()
    fresh.callWave()
    const softened = fresh.enemiesTotal.value

    const veteran = await loadVeteranGame()
    veteran.startRun()
    veteran.callWave()

    expect(softened).toBeLessThan(veteran.enemiesTotal.value)
  })
})
