import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  waveBudget, planWave, pacedInterval, waveReward,
  MAX_WAVE_MS, MAX_SPAWN_WINDOW_MS, SPAWN_FLUSH_AT_MS
} from '@/game/waves'
import {
  FlawlessTracker, adaptiveFactor, towerPower, expectedPower,
  MIN_ADAPTIVE, MAX_ADAPTIVE, FLAWLESS_STREAK_LENGTH, EMPTY_STRENGTH
} from '@/game/difficulty'
import { ENEMY_DEFS } from '@/game/enemies'

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

describe('wave size', () => {
  it('gives the opening waves a real fight', () => {
    // The complaint was that the first ten waves were three or four grunts. A
    // grunt costs 10, so this asserts wave 1 is at least a half-dozen bodies.
    const grunt = ENEMY_DEFS.grunt!.cost
    expect(waveBudget(1) / grunt).toBeGreaterThanOrEqual(6)
    expect(planWave(1).orders.length).toBeGreaterThanOrEqual(5)
    expect(planWave(5).orders.length).toBeGreaterThanOrEqual(15)
  })

  it('keeps climbing after the opening', () => {
    for (let w = 2; w <= 40; w++) {
      expect(waveBudget(w), `w${w}`).toBeGreaterThan(waveBudget(w - 1))
    }
  })

  it('scales with the difficulty multiplier it is handed', () => {
    expect(waveBudget(10, 2)).toBeCloseTo(waveBudget(10, 1) * 2, -1)
  })
})

describe('wave pacing', () => {
  it('finishes spawning inside the window at every wave', () => {
    for (let w = 1; w <= 60; w++) {
      const plan = planWave(w)
      const last = plan.orders.reduce((m, o) => Math.max(m, o.atMs), 0)
      expect(last, `wave ${w} spawns until ${last}ms`).toBeLessThanOrEqual(MAX_SPAWN_WINDOW_MS + 2000)
    }
  })

  it('flushes before the hard cap so a wave cannot outlive it', () => {
    expect(SPAWN_FLUSH_AT_MS).toBeLessThan(MAX_WAVE_MS)
    expect(MAX_SPAWN_WINDOW_MS).toBeLessThan(SPAWN_FLUSH_AT_MS)
    expect(MAX_WAVE_MS).toBeLessThanOrEqual(121_000)
  })

  it('compresses the cadence rather than letting big waves run long', () => {
    // 200 orders at the base cadence would take minutes; paced, they fit.
    expect(pacedInterval(30, 200) * 199).toBeLessThanOrEqual(MAX_SPAWN_WINDOW_MS + 1)
  })
})

describe('resource income', () => {
  it('no longer outruns what the player can spend', () => {
    // The report was 200 spare wood AND 200 spare stone at wave 7 while still
    // finding the enemies easy. A wave now pays well under a full hand of
    // pieces, so the offer deck is a real constraint.
    const r = waveReward(7)
    expect(r.wood).toBeLessThan(40)
    expect(r.stone).toBeLessThan(30)
  })

  it('leaves coins generous — they are the meta currency', () => {
    expect(waveReward(7).coins).toBeGreaterThanOrEqual(27)
  })
})

describe('adaptive difficulty', () => {
  it('is bounded on both sides', () => {
    expect(adaptiveFactor(10, 0)).toBe(MIN_ADAPTIVE)
    expect(adaptiveFactor(10, 1e9)).toBe(MAX_ADAPTIVE)
  })

  it('prices an on-track tower at about 1x', () => {
    for (const w of [1, 5, 10, 20]) {
      const f = adaptiveFactor(w, expectedPower(w))
      expect(f, `w${w}`).toBeGreaterThan(0.95)
      expect(f, `w${w}`).toBeLessThan(1.05)
    }
  })

  it('asks more of a stronger tower', () => {
    const weak = adaptiveFactor(10, expectedPower(10) * 0.5)
    const strong = adaptiveFactor(10, expectedPower(10) * 2)
    expect(strong).toBeGreaterThan(weak)
  })

  it('still rewards over-building — the wave grows slower than the tower', () => {
    // Doubling your power must not double the wave, or building is pointless.
    const base = adaptiveFactor(10, expectedPower(10))
    const doubled = adaptiveFactor(10, expectedPower(10) * 2)
    expect(doubled / base).toBeLessThan(2)
  })

  it('punishes a lopsided build', () => {
    // Same totals, split differently: all-HP and all-DPS are both worse than a
    // balanced tower, because neither wins a fight on its own.
    const balanced = towerPower({ ...EMPTY_STRENGTH, hp: 1000, dps: 50 })
    const allHp = towerPower({ ...EMPTY_STRENGTH, hp: 2000, dps: 0 })
    const allDps = towerPower({ ...EMPTY_STRENGTH, hp: 0, dps: 100 })
    expect(balanced).toBeGreaterThan(allHp)
    expect(balanced).toBeGreaterThan(allDps)
  })
})

describe('the flawless streak', () => {
  it('does nothing until two clean waves in a row', () => {
    const f = new FlawlessTracker()
    expect(f.multiplier).toBe(1)
    f.recordWave(false)
    expect(f.multiplier).toBe(1)
    f.recordWave(false)
    expect(f.multiplier).toBeCloseTo(1.2, 5)
  })

  it('compounds every further pair', () => {
    const f = new FlawlessTracker()
    for (let i = 0; i < FLAWLESS_STREAK_LENGTH * 3; i++) f.recordWave(false)
    expect(f.multiplier).toBeCloseTo(1.2 ** 3, 5)
  })

  it('bleeds the bonus back down when a wave costs blocks', () => {
    const f = new FlawlessTracker()
    f.recordWave(false)
    f.recordWave(false)
    expect(f.multiplier).toBeCloseTo(1.2, 5)
    f.recordWave(true)
    // Decays rather than ratcheting. As a one-way ratchet the bonus survived
    // every setback, so a player who banked a long clean streak carried it into
    // the collapse — and the adaptive FLOOR for them stopped being 0.75.
    expect(f.multiplier).toBeCloseTo(1.2 / 1.1, 5)
    f.recordWave(false)
    expect(f.multiplier).toBeCloseTo(1.2 / 1.1, 5) // count restarted, not at 2 yet
  })

  it('decays slower than it grows, so feeding a block is never a good trade', () => {
    const f = new FlawlessTracker()
    for (let i = 0; i < FLAWLESS_STREAK_LENGTH; i++) f.recordWave(false)
    const earned = f.multiplier - 1
    f.recordWave(true)
    const givenBack = 1.2 - f.multiplier
    expect(givenBack).toBeLessThan(earned)
  })

  it('never decays below neutral', () => {
    const f = new FlawlessTracker()
    for (let i = 0; i < 12; i++) f.recordWave(true)
    expect(f.multiplier).toBe(1)
  })

  it('wipes completely on death', () => {
    const f = new FlawlessTracker()
    for (let i = 0; i < 6; i++) f.recordWave(false)
    expect(f.multiplier).toBeGreaterThan(1)
    f.reset()
    expect(f.multiplier).toBe(1)
    expect(f.progress).toBe(0)
  })
})

describe('build width', () => {
  it('caps only the ground floor', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.halfWidthAt(0)).toBe(4)
    // Upper floors are free, so a branching tower is possible at all.
    expect(g.halfWidthAt(1)).toBeGreaterThan(10)
    expect(g.halfWidthAt(5)).toBeGreaterThan(10)
  })

  it('refuses a fifth cell either side of the Gate on the ground', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.canPlaceAt(4, 0)).toBe(true)
    expect(g.canPlaceAt(5, 0)).toBe(false)
    expect(g.canPlaceAt(-5, 0)).toBe(false)
  })

  it('lets an upper floor reach out past the foundation', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 99_999
    g.stone.value = 99_999
    // Build a shelf out along row 1, well past the ground-floor limit.
    for (let c = 1; c <= 8; c++) expect(g.placeBlock('wood', c, 0) || c > 4).toBe(true)
    for (let c = 1; c <= 6; c++) {
      expect(g.canPlaceAt(c, 1), `cell ${c},1`).toBe(true)
      expect(g.placeBlock('wood', c, 1)).toBe(true)
    }
    expect(g.getBlocks().get('6,1')).toBeDefined()
  })
})

describe('falling blocks', () => {
  it('drops what the Gate can no longer reach instead of deleting it', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 99_999
    g.stone.value = 99_999

    // A four-storey stem with a cap on top.
    for (let r = 1; r <= 4; r++) expect(g.placeBlock('stone', 0, r)).toBe(true)
    const capBefore = g.getBlocks().get('0,4')!
    const capHp = capBefore.hp

    // Knock the stem out from under it.
    const stem = g.getBlocks().get('0,2')!
    stem.hp = 1
    g.damageBlockForTest?.(stem, 999)

    advance(g, 3000)

    // Something is still standing in that column: the cap fell rather than
    // being deleted, and landed on what was left.
    const remaining = [...g.getBlocks().values()].filter((b) => b.c === 0)
    expect(remaining.length).toBeGreaterThan(1)
    void capHp
  })

  it('destroys a block that falls the lethal distance', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 99_999
    g.stone.value = 99_999
    for (let r = 1; r <= 7; r++) expect(g.placeBlock('stone', 0, r)).toBe(true)
    const before = g.getBlocks().size

    // Cut it at row 1, so everything above falls five or more cells.
    const stem = g.getBlocks().get('0,1')!
    g.damageBlockForTest?.(stem, 99_999)
    advance(g, 4000)

    expect(g.getBlocks().size).toBeLessThan(before)
  })

  it('leaves a ground-row block alone when its chain to the Gate is cut', async () => {
    const g = await loadGame()
    g.startRun()
    g.wood.value = 99_999
    g.stone.value = 99_999
    expect(g.placeBlock('wood', 1, 0)).toBe(true)
    expect(g.placeBlock('wood', 2, 0)).toBe(true)

    // Remove the middle: (2,0) is now disconnected from the Gate, but it is
    // standing on the earth, so it must not evaporate.
    const mid = g.getBlocks().get('1,0')!
    g.damageBlockForTest?.(mid, 99_999)
    advance(g, 2000)

    expect(g.getBlocks().get('2,0')).toBeDefined()
  })
})

describe('the 2x speed buff', () => {
  it('is not free — the default state is 1x with no buff', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.speedBuffLeft.value).toBe(0)
    expect(g.gameSpeed.value).toBe(1)
  })

  it('grants five minutes and turns 2x on', async () => {
    const g = await loadGame()
    g.startRun()
    g.grantSpeedBuff()
    expect(g.speedBuffLeft.value).toBe(g.SPEED_BUFF_MS)
    expect(g.gameSpeed.value).toBe(2)
  })

  it('extends rather than replaces, so a second video never loses time', async () => {
    const g = await loadGame()
    g.startRun()
    g.grantSpeedBuff()
    advance(g, 1000)
    const afterOne = g.speedBuffLeft.value
    g.grantSpeedBuff()
    expect(g.speedBuffLeft.value).toBeGreaterThan(afterOne)
  })

  it('expires on real time and drops back to 1x', async () => {
    const g = await loadGame()
    g.startRun()
    g.grantSpeedBuff()
    g.speedBuffLeft.value = 500
    advance(g, 1500)
    expect(g.speedBuffLeft.value).toBe(0)
    expect(g.gameSpeed.value).toBe(1)
  })

  it('cannot be toggled to 2x without owning the buff', async () => {
    const g = await loadGame()
    g.startRun()
    g.toggleSpeed()
    expect(g.gameSpeed.value).toBe(1)
  })
})

describe('falling blocks crush what is under them', () => {
  /** Put an enemy on the ground at `x` and return it. */
  const spawnAt = async (
    g: Awaited<ReturnType<typeof loadGame>>, typeId: string, x: number
  ) => {
    const d = ENEMY_DEFS[typeId]!
    const e = {
      uid: 70_000 + Math.floor(Math.random() * 1000),
      typeId, x, y: d.scale / 2, hp: d.hp, maxHp: d.hp, dir: 1 as 1 | -1,
      cd: 999_999, targetUid: -1, slowMs: 0, slowPct: 0, flash: 0,
      phase: 0, dying: 0
    }
    g.getEnemies().push(e)
    return e
  }

  /**
   * Drop a column onto ground level in `c`.
   *
   * The stem hangs off a one-block arm at (0,1) rather than standing on its own
   * ground cell — cutting the arm is what leaves the column with nothing under
   * it, so it falls all the way to the floor and lands on whatever is standing
   * there. A stem with its own foundation would just settle one row down.
   */
  const collapseOnto = (g: Awaited<ReturnType<typeof loadGame>>, c: number): void => {
    g.wood.value = 99_999
    g.stone.value = 99_999
    expect(g.placeBlock('stone', 0, 1)).toBe(true)
    for (let r = 1; r <= 3; r++) {
      expect(g.placeBlock('stone', c, r), `stem ${c},${r}`).toBe(true)
    }
    g.damageBlockForTest(g.getBlocks().get('0,1')!, 99_999)
  }

  it('kills an ordinary enemy outright, however much HP it had', async () => {
    const g = await loadGame()
    g.startRun()
    g.callWave()
    g.getEnemies().length = 0
    // The tankiest non-boss in the game — a damage roll would never finish it.
    const e = await spawnAt(g, 'ironRam', 1)
    expect(e.hp).toBeGreaterThan(500)

    collapseOnto(g, 1)
    advance(g, 3000)

    expect(e.hp).toBeLessThanOrEqual(0)
    // Dead and reaped: the death animation has already run out by now.
    expect(g.getEnemies().some((x) => x.uid === e.uid)).toBe(false)
  })

  it('does not kill a boss — it dents and shoves it', async () => {
    const g = await loadGame()
    g.startRun()
    g.callWave()
    g.getEnemies().length = 0
    const boss = await spawnAt(g, 'golem', 1)
    const startHp = boss.hp
    const startX = boss.x

    collapseOnto(g, 1)
    advance(g, 3000)

    expect(boss.dying).toBe(0)
    expect(boss.hp).toBeLessThan(startHp)
    // Shoved AWAY from the tower's centre column, so ground opens up.
    expect(boss.x).toBeGreaterThan(startX)
  })

  it('takes a share of the boss max HP, so it scales with the fight', async () => {
    const g = await loadGame()
    g.startRun()
    g.callWave()
    g.getEnemies().length = 0
    const boss = await spawnAt(g, 'golem', 1)

    collapseOnto(g, 1)
    advance(g, 3000)

    const lost = boss.maxHp - boss.hp
    expect(lost / boss.maxHp).toBeGreaterThan(0.05)
    expect(lost / boss.maxHp).toBeLessThan(0.25)
  })

  it('shoves a boss on the left side further left', async () => {
    // The push is away from the tower's CENTRE, not away from the impact point,
    // so it always opens ground between the boss and the Gate whichever side it
    // came from.
    const g = await loadGame()
    g.startRun()
    g.callWave()
    g.getEnemies().length = 0
    const boss = await spawnAt(g, 'golem', -1)
    const startX = boss.x

    collapseOnto(g, -1)
    advance(g, 3000)

    expect(boss.dying).toBe(0)
    expect(boss.x).toBeLessThan(startX)
  })

  it('leaves an enemy outside the impact radius untouched', async () => {
    const g = await loadGame()
    g.startRun()
    g.callWave()
    g.getEnemies().length = 0
    const far = await spawnAt(g, 'grunt', 6)
    const hp = far.hp

    collapseOnto(g, 1)
    advance(g, 3000)

    expect(far.dying).toBe(0)
    expect(far.hp).toBe(hp)
  })
})
