import { describe, expect, it } from 'vitest'
import {
  planWave, waveBudget, isBossWave, earlyCallBonus, buildTimeMs, waveReward, makeRng,
  BUILD_TIME_MS, EARLY_CALL_MAX_BONUS,
  airShare, seaShare, countAir, countSea, previewsFor
} from '@/game/waves'
import { ENEMY_DEFS } from '@/game/enemies'

describe('wave director determinism', () => {
  // Determinism is a design requirement, not an implementation detail: the
  // resumable run (`ts_run`) stores only the wave INDEX, so a reload must
  // reproduce the identical wave, and "wave 9 wrecked me, let me rebuild"
  // is only a fair lesson if wave 9 is the same wave twice.
  it('produces an identical plan for the same wave index', () => {
    const a = planWave(7)
    const b = planWave(7)
    expect(a.orders).toEqual(b.orders)
    expect(a.total).toBe(b.total)
  })

  it('produces different plans for different waves', () => {
    const a = planWave(7)
    const b = planWave(8)
    expect(a.orders).not.toEqual(b.orders)
  })

  it('seeded rng is reproducible and stays in [0, 1)', () => {
    const a = makeRng(12345)
    const b = makeRng(12345)
    for (let i = 0; i < 50; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('wave composition', () => {
  it('never ROLLS an enemy before its introduction wave', () => {
    // The gate governs the director's random pool. Scripted previews are the
    // declared exception — they exist precisely to show a threat before it
    // unlocks — so they are subtracted before the invariant is checked rather
    // than weakening it for everything else.
    for (let w = 1; w <= 30; w++) {
      const budgeted = new Map<string, number>()
      for (const [typeId, count] of previewsFor(w)) budgeted.set(typeId, count)
      for (const order of planWave(w).orders) {
        const left = budgeted.get(order.typeId) ?? 0
        if (left > 0) { budgeted.set(order.typeId, left - 1); continue }
        const def = ENEMY_DEFS[order.typeId]!
        expect(def.minWave, `wave ${w}: ${order.typeId}`).toBeLessThanOrEqual(w)
      }
      // Every previewed unit actually made it into the plan.
      for (const [typeId, left] of budgeted) {
        expect(left, `wave ${w}: missing ${typeId} previews`).toBe(0)
      }
    }
  })

  it('always produces at least one enemy', () => {
    for (let w = 1; w <= 30; w++) {
      expect(planWave(w).total).toBeGreaterThan(0)
    }
  })

  it('schedules spawns in non-decreasing time order', () => {
    const orders = planWave(14).orders
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!.atMs).toBeGreaterThanOrEqual(orders[i - 1]!.atMs)
    }
  })

  it('spawns from both sides so pressure is symmetric', () => {
    const sides = new Set(planWave(9).orders.map((o) => o.side))
    expect(sides.size).toBe(2)
  })

  it('puts the boss first on a boss wave, alone at t=0', () => {
    const plan = planWave(10)
    expect(plan.boss).toBe(true)
    expect(plan.orders[0]!.typeId).toBe('golem')
    expect(plan.orders[0]!.atMs).toBe(0)
    // The escort is deliberately delayed so the banner lands on an empty field.
    expect(plan.orders[1]!.atMs).toBeGreaterThan(0)
  })

  it('marks every 10th wave — and only those — as a boss wave', () => {
    for (let w = 1; w <= 40; w++) {
      expect(isBossWave(w)).toBe(w % 10 === 0)
    }
  })
})

describe('difficulty curve', () => {
  it('budget grows strictly with the wave index', () => {
    for (let w = 1; w < 40; w++) {
      expect(waveBudget(w + 1)).toBeGreaterThan(waveBudget(w))
    }
  })

  it('difficulty scales the budget proportionally', () => {
    expect(waveBudget(10, 0.8)).toBeLessThan(waveBudget(10, 1))
    expect(waveBudget(10, 1.25)).toBeGreaterThan(waveBudget(10, 1))
  })

  it('gives every wave the same fifteen-second build window', () => {
    for (let w = 1; w <= 100; w++) {
      expect(buildTimeMs(w), `wave ${w}`).toBe(BUILD_TIME_MS)
    }
    expect(BUILD_TIME_MS).toBe(15_000)
  })

  it('keeps the full early-call bonus reachable inside that window', () => {
    // The rate is derived from the window, so calling the instant the phase
    // opens must still be worth the advertised maximum — a cap the player can
    // never reach is a lie in the HUD.
    expect(earlyCallBonus(BUILD_TIME_MS)).toBeCloseTo(1 + EARLY_CALL_MAX_BONUS, 5)
    expect(earlyCallBonus(BUILD_TIME_MS * 2)).toBeCloseTo(1 + EARLY_CALL_MAX_BONUS, 5)
    expect(earlyCallBonus(0)).toBe(1)
    expect(earlyCallBonus(BUILD_TIME_MS / 2)).toBeCloseTo(1 + EARLY_CALL_MAX_BONUS / 2, 5)
  })

  it('wave rewards grow with the wave', () => {
    const a = waveReward(1)
    const b = waveReward(10)
    expect(b.coins).toBeGreaterThan(a.coins)
    expect(b.wood).toBeGreaterThan(a.wood)
    expect(b.stone).toBeGreaterThan(a.stone)
  })
})

describe('early-call bonus', () => {
  it('pays nothing when the timer has run out', () => {
    expect(earlyCallBonus(0)).toBe(1)
  })

  it('pays a linear share of the cap per remaining second', () => {
    // The rate is derived from the build window, so two thirds of the window
    // left is two thirds of the cap.
    expect(earlyCallBonus(BUILD_TIME_MS * (2 / 3)))
      .toBeCloseTo(1 + EARLY_CALL_MAX_BONUS * (2 / 3), 5)
  })

  it('caps at +40% so a huge build timer cannot be farmed', () => {
    expect(earlyCallBonus(600_000)).toBe(1.4)
  })

  it('never goes negative on a garbage input', () => {
    expect(earlyCallBonus(-5000)).toBe(1)
  })
})

describe('air and sea pressure ramps', () => {
  it('sends no flyers before they are introduced, except the scripted preview', () => {
    // Waves 4-6 each carry two bats on purpose: air arrives in force at 9, and
    // a player who has never seen a flyer by then has built the wrong tower
    // without ever being told. Everything else before 9 stays clean.
    for (let w = 1; w < 9; w++) {
      const expected = w >= 4 && w <= 6 ? 2 : 0
      expect(countAir(planWave(w)), `wave ${w}`).toBe(expected)
    }
  })

  it('reliably sends flyers once they are introduced', () => {
    // The whole point of reserving an air budget is that anti-air stops being a
    // dice roll — a mortar-only tower must be punished on a schedule.
    for (let w = 10; w <= 30; w++) {
      expect(countAir(planWave(w)), `wave ${w}`).toBeGreaterThan(0)
    }
  })

  it('grows the flyer share with the wave index', () => {
    const early = countAir(planWave(10)) / planWave(10).total
    const late = countAir(planWave(26)) / planWave(26).total
    expect(late).toBeGreaterThan(early)
    expect(airShare(9)).toBeLessThan(airShare(20))
    expect(airShare(60)).toBeLessThanOrEqual(0.35)
  })

  it('sends no sea creatures before wave 12, bar the single wave-5 preview', () => {
    for (let w = 1; w < 12; w++) {
      expect(countSea(planWave(w)), `wave ${w}`).toBe(w === 5 ? 1 : 0)
    }
    for (let w = 13; w <= 30; w++) expect(countSea(planWave(w)), `wave ${w}`).toBeGreaterThan(0)
  })

  it('charges previews to the wave budget instead of stacking them on top', () => {
    // A preview is a TRADE — the new thing replaces chaff. If it were additive,
    // waves 4-6 would spike above their neighbours and the introduction would
    // read as a difficulty wall rather than as information.
    for (const w of [4, 5, 6]) {
      const plan = planWave(w)
      const previewed = previewsFor(w).reduce((n, [, count]) => n + count, 0)
      const ground = plan.total - countAir(plan) - countSea(plan)
      expect(previewed, `wave ${w} previews`).toBeGreaterThan(0)
      // Ground pressure survives, and the wave stays in family with its
      // neighbours rather than ballooning.
      expect(ground, `wave ${w} ground`).toBeGreaterThan(0)
      expect(plan.total, `wave ${w} total`).toBeLessThanOrEqual(planWave(7).total + previewed)
    }
  })

  it('keeps the previews deterministic, like every other part of a wave', () => {
    for (const w of [4, 5, 6]) {
      expect(countAir(planWave(w)), `wave ${w}`).toBe(countAir(planWave(w)))
      expect(planWave(w).orders).toEqual(planWave(w).orders)
    }
  })

  it('caps both shares so ground pressure never disappears', () => {
    expect(seaShare(100)).toBeLessThanOrEqual(0.24)
    for (let w = 12; w <= 40; w++) {
      const plan = planWave(w)
      const ground = plan.total - countAir(plan) - countSea(plan)
      expect(ground, `wave ${w}`).toBeGreaterThan(0)
    }
  })

  it('is still fully deterministic with the reserved shares', () => {
    for (const w of [9, 12, 18, 25]) {
      expect(planWave(w).orders).toEqual(planWave(w).orders)
    }
  })
})
