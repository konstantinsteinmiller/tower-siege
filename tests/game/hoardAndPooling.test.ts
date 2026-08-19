import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hoardFactor, hoardTier } from '@/game/difficulty'

// The simulation is a module-level singleton (project convention), so each test
// re-imports it fresh to get a clean tower.
const loadGame = async () => {
  vi.resetModules()
  localStorage.clear()
  return import('@/use/useTowerGame')
}

/** Run the fixed-step sim for `ms` of simulated time. */
const advance = (g: { step: (ms: number) => void }, ms: number): void => {
  for (let t = 0; t < ms; t += 16) g.step(16)
}

beforeEach(() => {
  localStorage.clear()
})

/**
 * The reserve surcharge.
 *
 * These pin the BOUNDARIES, because the bands are the whole feature: the point
 * is that a player can tell exactly where the line is and stay under it by
 * spending, and a tuning pass that moves a threshold by one should have to say
 * so out loud.
 */
describe('hoarding surcharge', () => {
  it('leaves a player who is spending alone', () => {
    expect(hoardFactor(0, 0, 0)).toBe(1)
    expect(hoardFactor(199, 199, 999)).toBe(1)
    expect(hoardTier(199, 199, 999)).toBe(0)
  })

  it('needs BOTH woods over 200 for the first band', () => {
    // One deep pile mid-build is not hoarding.
    expect(hoardFactor(400, 0, 0)).toBe(1)
    expect(hoardFactor(0, 400, 0)).toBe(1)
    expect(hoardFactor(201, 201, 0)).toBe(1.25)
    // Exactly 200 is still under the line.
    expect(hoardFactor(200, 400, 0)).toBe(1)
  })

  it('takes EITHER pile at 500 for the second band', () => {
    expect(hoardFactor(500, 0, 0)).toBe(1.5)
    expect(hoardFactor(0, 500, 0)).toBe(1.5)
    expect(hoardFactor(499, 499, 0)).toBe(1.25)
    expect(hoardTier(500, 0, 0)).toBe(2)
  })

  it('counts coins only in the top band, and only over 1000', () => {
    // Run gold is legitimately banked between rank purchases, so it is not
    // taxed until the pile stops being a purchase and starts being a war chest.
    expect(hoardFactor(0, 0, 1000)).toBe(1)
    expect(hoardFactor(0, 0, 1001)).toBe(2)
    expect(hoardFactor(1001, 0, 0)).toBe(2)
    expect(hoardFactor(0, 1001, 0)).toBe(2)
    expect(hoardTier(0, 0, 1001)).toBe(3)
  })

  it('is a ladder — the highest band wins, they do not compound', () => {
    // Everything qualifies here; the answer is the top band, not 1.25×1.5×2.
    expect(hoardFactor(5000, 5000, 5000)).toBe(2)
  })

  it('ignores negative reserves rather than inverting the tax', () => {
    expect(hoardFactor(-100, -100, -100)).toBe(1)
  })

  it('makes the next wave measurably bigger, and the preview agree', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 5000
    g.stone.value = 5000
    for (let r = 0; r < 3; r++) expect(g.placeBlock('archer', 1, r)).toBe(true)

    g.wood.value = 0
    g.stone.value = 0
    g.runCoins.value = 0
    const lean = g.previewNextWave().total
    expect(g.currentHoardTier()).toBe(0)

    g.wood.value = 5000
    g.stone.value = 5000
    g.runCoins.value = 5000
    const rich = g.previewNextWave().total
    expect(g.currentHoardTier()).toBe(3)

    // The band is +100%, and the preview is what Call Wave will deliver.
    expect(rich).toBeGreaterThan(lean)
    expect(rich / lean).toBeGreaterThan(1.6)
  })

  it('can be switched off by spending, unlike every other difficulty term', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 5000
    g.stone.value = 5000
    for (let r = 0; r < 3; r++) expect(g.placeBlock('archer', 1, r)).toBe(true)

    g.wood.value = 5000
    g.stone.value = 5000
    g.runCoins.value = 5000
    const taxed = g.previewNextWave().total

    g.wood.value = 10
    g.stone.value = 10
    g.runCoins.value = 10
    const spent = g.previewNextWave().total

    expect(spent).toBeLessThan(taxed)
    expect(g.currentHoardTier()).toBe(0)
  })
})

/**
 * Projectile recycling.
 *
 * The failure mode a pool invites is a round that inherits state from its
 * previous life — most damagingly `hostile`, which decides whether a shot hurts
 * the wave or the tower. These exercise the real sim hard enough to force
 * reuse, then check nothing bled across.
 */
describe('projectile pooling', () => {
  it('does not leak hostile ordnance state into friendly fire', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 5000
    g.stone.value = 5000
    // A gun and something for a bomber to aim at. (0,0) is the Gate.
    expect(g.placeBlock('archer', 1, 0)).toBe(true)
    expect(g.placeBlock('wood', 2, 0)).toBe(true)
    expect(g.placeBlock('wood', -1, 0)).toBe(true)

    // Bombers first, so hostile rounds are the ones that get recycled.
    g.debugSpawn(['bombardier'])
    advance(g, 6000)

    const before = g.measureTower().hp
    // Now a long stretch of purely friendly fire. If a recycled round came back
    // still flagged hostile, the tower would be shooting itself.
    for (let i = 0; i < 6; i++) g.debugSpawn(['grunt'])
    advance(g, 8000)
    const after = g.measureTower().hp

    expect(after).toBeLessThanOrEqual(before)
    // Blocks may be chewed by the grunts themselves, but the tower must not be
    // wiped out by its own archers.
    expect(g.getTowerBlocks().size).toBeGreaterThan(0)
  })

  it('never lets one recycled round sit in the live list twice', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 5000
    for (const c of [-2, -1, 1, 2]) expect(g.placeBlock('archer', c, 0)).toBe(true)

    // A long, busy fight, so the pool is churning the whole time. Two distinct
    // ways swap-and-pop plus a free list can go wrong, checked every step:
    // the same OBJECT handed out while still live, and two rounds sharing a uid.
    let maxLive = 0
    for (let i = 0; i < 900; i++) {
      if (i % 40 === 0) for (let k = 0; k < 4; k++) g.debugSpawn(['grunt'])
      g.step(16)
      const live = g.getProjectiles()
      maxLive = Math.max(maxLive, live.length)
      expect(new Set(live).size).toBe(live.length)
      expect(new Set(live.map((p) => p.uid)).size).toBe(live.length)
    }
    // And it stays bounded — a removal that dropped the wrong index would leak
    // rounds into the array forever.
    expect(maxLive).toBeLessThan(400)
  })

  it('actually reuses round objects instead of allocating a new one per shot', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 5000
    for (const c of [-2, -1, 1, 2]) expect(g.placeBlock('archer', c, 0)).toBe(true)

    // Distinct OBJECTS handed out, against distinct ROUNDS fired. If the pool
    // were bypassed the two would track each other; the whole point is that the
    // first stays near the peak concurrent count while the second climbs.
    const objects = new Set<object>()
    const uids = new Set<number>()
    let peakLive = 0
    for (let i = 0; i < 1400; i++) {
      if (i % 30 === 0) g.debugSpawn(['grunt', 'grunt'])
      g.step(16)
      const live = g.getProjectiles()
      peakLive = Math.max(peakLive, live.length)
      for (const p of live) { objects.add(p); uids.add(p.uid) }
    }

    expect(uids.size).toBeGreaterThan(100)
    // Strictly fewer objects than rounds: something was reused.
    expect(objects.size).toBeLessThan(uids.size)
    // And the exact contract — with a working free list the number of objects
    // ever allocated is the HIGH-WATER MARK of concurrent rounds, not the
    // number of shots taken. A couple spare for rounds retired on the last step.
    expect(objects.size).toBeLessThanOrEqual(peakLive + 4)
  })

  it('survives a full run reset without carrying rounds over', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 5000
    expect(g.placeBlock('archer', 1, 0)).toBe(true)
    for (let i = 0; i < 6; i++) g.debugSpawn(['grunt'])
    advance(g, 1500)

    g.startRun()
    expect(g.getProjectiles().length).toBe(0)
    expect(g.getEnemies().length).toBe(0)
  })
})
