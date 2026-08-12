import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionRun } from '@/use/useMissions'

/**
 * Daily mission progress.
 *
 * The bug this guards: `recordRun` was called exactly once per run, when the
 * Gate fell. A player forty kills into a siege who opened the panel — which is
 * precisely when they would — saw 0/120, and concluded the missions were
 * broken. Progress is now credited in deltas so it can be fed continuously.
 */

/**
 * A date whose rotation contains coins, waves AND kills.
 *
 * The triplet is generated from a hash of the day, so without pinning the clock
 * these tests would silently assert nothing on roughly a quarter of days —
 * whichever ones happen to drop the type under test.
 */
const PINNED_DAY = '2026-01-05T12:00:00.000Z'

const load = async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(PINNED_DAY))
  vi.resetModules()
  localStorage.clear()
  // Imported AFTER the clock is pinned: the module generates the day's missions
  // during its own evaluation.
  const mod = await import('@/use/useMissions')
  mod.beginMissionRun()
  const api = mod.default()
  const types = api.missions.value.map((x) => x.type)
  expect(types, 'pinned day should contain the types these tests assert on')
    .toEqual(expect.arrayContaining(['coins', 'waves', 'kills']))
  return { ...mod, ...api }
}

/** Progress on the mission of a given type, or null when today lacks it. */
const progressOf = (missions: { value: Array<{ type: string; progress: number }> }, type: string) =>
  missions.value.find((m) => m.type === type)?.progress ?? null

const run = (o: Partial<MissionRun>): MissionRun => ({
  waves: 0, kills: 0, coins: 0, blocks: 0, height: 0, ...o
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('mission progress is credited in deltas', () => {
  it('advances mid-run, not only when the run ends', async () => {
    const m = await load()
    m.recordRun(run({ kills: 12, coins: 30, blocks: 4 }))

    // Whichever three types today rolled, at least one of them moved.
    const moved = m.missions.value.some((x) => x.progress > 0)
    expect(moved).toBe(true)
  })

  it('never double-counts when called repeatedly with the same totals', async () => {
    const m = await load()
    m.recordRun(run({ kills: 50, coins: 100, blocks: 10 }))
    const snapshot = m.missions.value.map((x) => x.progress)

    // The wave-clear feed, the panel-open feed and the end-of-run feed can all
    // land on the same state; none of them may credit it again.
    m.recordRun(run({ kills: 50, coins: 100, blocks: 10 }))
    m.recordRun(run({ kills: 50, coins: 100, blocks: 10 }))

    expect(m.missions.value.map((x) => x.progress)).toEqual(snapshot)
  })

  it('credits only the increment as a run continues', async () => {
    const m = await load()
    const kills = () => progressOf(m.missions, 'kills')

    m.recordRun(run({ kills: 10 }))
    expect(kills()).toBe(10)
    m.recordRun(run({ kills: 25 }))
    expect(kills()).toBe(25)
    m.recordRun(run({ kills: 26 }))
    expect(kills()).toBe(26)
  })

  it('accumulates across runs rather than restarting', async () => {
    const m = await load()
    const kills = () => progressOf(m.missions, 'kills')

    m.recordRun(run({ kills: 30 }))
    m.beginMissionRun()
    m.recordRun(run({ kills: 20 }))
    // A daily total is the day's total, not the last run's.
    expect(kills()).toBe(50)
  })

  it('re-baselines on its own when a counter goes backwards', async () => {
    // A new run without anyone calling `beginMissionRun` — a resumed snapshot,
    // or a call site that forgot. Crediting a negative delta would claw back
    // progress the player earned.
    const m = await load()
    const kills = () => progressOf(m.missions, 'kills')

    m.recordRun(run({ kills: 40 }))
    expect(kills()).toBe(40)
    m.recordRun(run({ kills: 5 }))
    expect(kills()).toBe(45)
  })

  it('treats waves as a best-single-run goal, so it cannot be farmed', async () => {
    const m = await load()
    const waves = () => progressOf(m.missions, 'waves')

    m.recordRun(run({ waves: 6 }))
    expect(waves()).toBe(6)
    m.beginMissionRun()
    // Three short runs must not add up to a "survive to wave 9".
    m.recordRun(run({ waves: 3 }))
    m.beginMissionRun()
    m.recordRun(run({ waves: 3 }))
    expect(waves()).toBe(6)
  })

  it('stops crediting a mission once it has been claimed', async () => {
    const m = await load()
    const idx = m.missions.value.findIndex((x) => x.type === 'kills')

    m.recordRun(run({ kills: m.missions.value[idx]!.target }))
    expect(m.claim(idx)).toBe(true)
    const after = m.missions.value[idx]!.progress
    m.beginMissionRun()
    m.recordRun(run({ kills: 500 }))
    expect(m.missions.value[idx]!.progress).toBe(after)
  })

  it('survives a NaN that crept into the persisted blob', async () => {
    const m = await load()
    const idx = m.missions.value.findIndex((x) => x.type === 'kills')
    ;(m.missions.value[idx] as { progress: number }).progress = Number.NaN

    m.recordRun(run({ kills: 7 }))
    expect(Number.isFinite(m.missions.value[idx]!.progress)).toBe(true)
    expect(m.missions.value[idx]!.progress).toBe(7)
  })
})
