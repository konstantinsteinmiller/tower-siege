import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ─── The opening waves stay winnable ────────────────────────────────────────
 *
 * Waves 4-6 carry scripted PREVIEWS — two bats each, plus a sea serpent at 5 —
 * so a player meets air and water long before either arrives in force. That is
 * a deliberate difficulty bump at the exact point in a run where a player is
 * most likely to quit, which makes it worth proving rather than assuming: a
 * preview that kills an ordinary early tower is not an introduction, it is a
 * wall, and the retention cost lands on the waves that matter most.
 *
 * The tower below is deliberately unexceptional — the kind of thing a first-time
 * player has by wave 3, built from blocks available with no tech at all.
 */

const loadGame = async () => {
  vi.resetModules()
  localStorage.clear()
  return import('@/use/useTowerGame')
}

/**
 * Play ONE wave and stop the moment it is over.
 *
 * The build phase auto-calls the next wave when its timer runs out
 * (`if (buildDeadline <= 0) callWave()`), so advancing a fixed span runs
 * several waves against a tower the test only rebuilt once — which is how the
 * first version of this test "proved" the game unwinnable at wave 2.
 * Returns false if the run ended.
 */
const playWave = (g: any): boolean => {
  g.callWave()
  for (let t = 0; t < 200_000; t += 16) {
    g.step(16)
    if (g.phase.value === 'defeat') return false
    // Back to building = the wave was cleared.
    if (g.phase.value === 'build' && t > 1_000) return true
  }
  return g.phase.value !== 'defeat'
}

/**
 * An ordinary early tower, maintained AND grown between waves.
 *
 * Both halves matter. Wave 1 alone costs this tower two blocks and half the
 * Gate, and the wave reward is sized as a REPLACEMENT rate rather than surplus
 * — so a player who builds once and never again is not a weak player, they are
 * a player the economy was never designed for. Earlier versions of this test
 * modelled exactly that and "proved" the game unwinnable at wave 2.
 *
 * The growth below is modest on purpose: two guns by wave 3, four by wave 5,
 * all from blocks available with no tech at all. If the scripted previews at
 * waves 4-6 were a wall, this is the tower they would stop.
 */
const PLAN: [number, string, number, number][] = [
  [1, 'wood', -1, 0], [1, 'wood', 0, 0], [1, 'wood', 1, 0],
  [1, 'archer', -1, 1], [1, 'cannon', 1, 1], [1, 'wood', 0, 1],
  [2, 'wood', -2, 0], [2, 'wood', 2, 0],
  [3, 'archer', 2, 1], [3, 'wood', 0, 2],
  [4, 'wood', -3, 0], [4, 'wood', 3, 0],
  [5, 'cannon', -2, 1], [5, 'wood', 1, 2]
]

const maintain = (g: any, wave: number): void => {
  // Stand in for the wave reward the player would be spending.
  g.wood.value = Math.max(g.wood.value, 260)
  g.stone.value = Math.max(g.stone.value, 260)
  for (const [from, id, c, r] of PLAN) {
    // Occupied cells refuse, so this both repairs losses and extends.
    if (wave >= from) g.placeBlock(id, c, r)
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('the preview waves are survivable', () => {
  it('carries an ordinary starter tower through wave 6 with the Gate standing', async () => {
    const g = await loadGame()
    g.startRun()

    for (let wave = 1; wave <= 6; wave++) {
      // The player spends the wave reward before calling the next wave.
      maintain(g, wave)
      const survived = playWave(g)
      expect(survived, `run ended during wave ${wave}`).toBe(true)
      expect(g.gateHp.value, `gate died during wave ${wave}`).toBeGreaterThan(0)
    }
  })

  it('lets the preview waves actually be FOUGHT — they are not free', async () => {
    // The other half of the playbook's rule: winnable, but not un-losable. A
    // wave that cannot touch the tower teaches nothing and is worth nothing.
    const g = await loadGame()
    g.startRun()
    // No guns at all: a wall, and nothing that shoots. The previews should get
    // through this.
    g.wood.value = 400
    g.placeBlock('wood', -1, 0)
    g.placeBlock('wood', 0, 0)
    g.placeBlock('wood', 1, 0)

    const before = g.gateHp.value + [...g.getBlocks().values()]
      .reduce((n: number, b: any) => n + b.hp, 0)

    for (let wave = 1; wave <= 6; wave++) {
      if (!playWave(g)) break
    }

    const after = g.gateHp.value + [...g.getBlocks().values()]
      .reduce((n: number, b: any) => n + b.hp, 0)
    expect(after).toBeLessThan(before)
  })
})
