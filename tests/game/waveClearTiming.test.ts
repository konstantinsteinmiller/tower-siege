import { describe, expect, it, vi } from 'vitest'

// The simulation is a module-level singleton (project convention), so each test
// re-imports it fresh to get a clean tower.
const loadGame = async () => {
  vi.resetModules()
  localStorage.clear()
  return import('@/use/useTowerGame')
}

describe('wave completion', () => {
  /**
   * The wave used to close as soon as every enemy was *dying*, rather than
   * gone. A dying enemy is still on screen for the length of its death
   * animation, so the wave-clear toast landed on top of a corpse that was still
   * fading out.
   *
   * The fix is a one-word change and correspondingly easy to undo by accident,
   * which is why the invariant is pinned here rather than left to review.
   */
  it('closes only once every corpse has cleared the field', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 9999
    g.stone.value = 9999
    g.runCoins.value = 9999
    // A sane little tower: ground row walled, weapons above it. An all-turret
    // build folds on its own and would never reach the assertion.
    for (let c = -3; c <= 3; c++) if (c !== 0) g.placeBlock('stone', c, 0)
    for (let c = -3; c <= 3; c++) g.placeBlock('archer', c, 1)

    g.callWave()
    let enemiesWhenClosed = -1
    // Generous ceiling — this also fails loudly if holding the wave open for
    // the death animation ever deadlocks it.
    for (let i = 0; i < 6000; i++) {
      g.step(50)
      if (g.phase.value !== 'battle') {
        enemiesWhenClosed = g.getEnemies().length
        break
      }
    }

    expect(g.phase.value).toBe('build')
    expect(enemiesWhenClosed).toBe(0)
  })
})
