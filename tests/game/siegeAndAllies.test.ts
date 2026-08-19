import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ENEMY_DEFS, isSiege, siegePool } from '@/game/enemies'
import { BLOCK_DEFS, ENHANCED_DAMAGE_MUL, ENHANCED_HP_MUL } from '@/game/blocks'
import { ALLY_DEFS, CAVALRY_SQUAD } from '@/game/allies'
import { countSiege, planWave, siegeShare } from '@/game/waves'
import { OFFER_SLOTS } from '@/game/shapes'
import { TECH_NODES, isUnlockNode, techCost } from '@/game/tech'

// The simulation is a module-level singleton (project convention), so each test
// re-imports it fresh to get a clean tower.
const loadGame = async () => {
  vi.resetModules()
  localStorage.clear()
  return import('@/use/useTowerGame')
}

beforeEach(() => {
  localStorage.clear()
})

describe('the block catalogue after the TNT removal', () => {
  it('no longer ships a TNT barrel', () => {
    // TNT was cut because a block whose whole value is dying is a trap for new
    // players — they build it, it evaporates, and the tower is worse.
    expect(BLOCK_DEFS.tnt).toBeUndefined()
  })

  it('gives the Spiked Wall thorns and no weapon', () => {
    const d = BLOCK_DEFS.spikes!
    expect(d.kind).toBe('utility')
    expect(d.utility?.thorns).toBeGreaterThan(0)
    expect(d.weapon).toBeUndefined()
  })

  it('locks the Bombard to ground targets', () => {
    // The Bombard's entire design premise is that it cannot answer fliers, so
    // that an air wave still punishes a tower built only out of Bombards.
    expect(BLOCK_DEFS.bombard!.weapon?.hitsAir).toBe(false)
    expect(BLOCK_DEFS.bombard!.weapon?.splash).toBeGreaterThan(0)
  })

  it('makes reinforced blocks strictly better on both axes', () => {
    expect(ENHANCED_HP_MUL).toBeGreaterThan(1)
    expect(ENHANCED_DAMAGE_MUL).toBeGreaterThan(1)
  })
})

describe('siege engines', () => {
  it('flags every engine as siege and nothing else', () => {
    const siege = Object.values(ENEMY_DEFS).filter((d) => isSiege(d.id)).map((d) => d.id).sort()
    expect(siege).toEqual(['ballista', 'catapult', 'ironRam', 'ram', 'siegeTower', 'trebuchet'])
  })

  it('ladders the standoff engines across the weapon roster', () => {
    // Each engine asks for a specific piece of reach. Previously all three sat
    // past the end of the arsenal, which made them one threat wearing three
    // costumes and left cavalry — a META-coin purchase — as the only answer.
    const rangeOf = (id: string): number => BLOCK_DEFS[id]!.weapon!.range
    const longestWeapon = Math.max(
      ...Object.values(BLOCK_DEFS).map((b) => b.weapon?.range ?? 0)
    )
    const ballista = ENEMY_DEFS.ballista!.siege!.standoff!
    const catapult = ENEMY_DEFS.catapult!.siege!.standoff!
    const trebuchet = ENEMY_DEFS.trebuchet!.siege!.standoff!

    expect(ballista).toBeLessThan(catapult)
    expect(catapult).toBeLessThan(trebuchet)
    // The ballista is answerable by a starting weapon; it arrives long before a
    // longer gun is realistically owned.
    expect(ballista).toBeLessThanOrEqual(rangeOf('cannon'))
    expect(ballista).toBeGreaterThan(rangeOf('archer'))
    // Nothing out-ranges the whole arsenal any more — the longest weapon in the
    // game exactly reaches the deepest engine, so reach stays a real purchase.
    expect(trebuchet).toBeLessThanOrEqual(longestWeapon)
    expect(catapult).toBeGreaterThan(rangeOf('cannon'))
  })

  it('still leaves cavalry a job — every engine out-ranges the free guns', () => {
    // A player who has bought no reach tech has archer and cannon only, and
    // must ride out. That is the pressure siege engines exist to apply.
    const free = Math.max(BLOCK_DEFS.archer!.weapon!.range, BLOCK_DEFS.cannon!.weapon!.range)
    for (const id of ['catapult', 'trebuchet'] as const) {
      expect(ENEMY_DEFS[id]!.siege!.standoff!).toBeGreaterThan(free)
    }
  })

  it('keeps siege engines out of the early game entirely', () => {
    expect(siegeShare(1)).toBe(0)
    expect(siegePool(5)).toHaveLength(0)
    for (let w = 1; w < 14; w++) expect(countSiege(planWave(w))).toBe(0)
  })

  it('introduces engines once the waves are deep enough', () => {
    // Scan a band rather than a single wave: the director's budget is
    // deterministic but a single wave can legitimately spend it elsewhere.
    let seen = 0
    for (let w = 14; w <= 30; w++) seen += countSiege(planWave(w))
    expect(seen).toBeGreaterThan(0)
  })

  it('caps how much of a wave can be siege', () => {
    for (let w = 14; w <= 60; w++) expect(siegeShare(w)).toBeLessThanOrEqual(0.3)
  })
})

describe('cavalry', () => {
  it('costs gold and expires on its own', async () => {
    const def = ALLY_DEFS.cavalry!
    expect(def.cost).toBeGreaterThan(0)
    expect(def.lifeMs).toBeGreaterThan(0)
    expect(CAVALRY_SQUAD).toBeGreaterThan(1)
  })

  it('rides out as a squad and reports its own headcount', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.getAllies()).toHaveLength(0)
    expect(g.summonCavalry()).toBe(true)
    expect(g.getAllies()).toHaveLength(CAVALRY_SQUAD)
    expect(g.allyCount.value).toBe(CAVALRY_SQUAD)
  })

  it('is faster than every ground enemy it is meant to chase down', () => {
    // A counter-unit that cannot reach the thing it counters is decoration.
    const slowest = Math.max(
      ...Object.values(ENEMY_DEFS).filter((d) => isSiege(d.id)).map((d) => d.speed)
    )
    expect(ALLY_DEFS.cavalry!.speed).toBeGreaterThan(slowest)
  })
})

describe('the build hand', () => {
  it('starts the foundation at four cells either side of the Gate', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.halfWidthAt(0)).toBe(4)
  })

  it('widens the foundation a column per foundation rank', async () => {
    // Regression: the ground floor was `min(4, buildHalfWidth)`, so both the
    // Wide and the Great Foundation nodes were bought and did nothing at all.
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('tower_state', JSON.stringify({
      ts_tech: { levels: { wideFoundation: 2, greatFoundation: 1 } }
    }))
    const g = await import('@/use/useTowerGame')
    g.startRun()
    expect(g.halfWidthAt(0)).toBe(7)
    // ...and the widened footing is actually buildable, not merely reported.
    expect(g.canPlaceAt(7, 0)).toBe(true)
    expect(g.canPlaceAt(8, 0)).toBe(false)
  })

  it('never gives the foundation a wider span than the floors above it', async () => {
    const g = await loadGame()
    g.startRun()
    // The ground floor is a ceiling, not a bonus — otherwise an early tower
    // would get a base wider than anything it could stack on top.
    expect(g.halfWidthAt(0)).toBeLessThanOrEqual(g.halfWidthAt(1))
  })

  it('starts every slot ready and cools down only the slot that was used', async () => {
    const g = await loadGame()
    g.startRun()
    expect([0, 1, 2, 3].every((i) => g.canManualReroll(i))).toBe(true)

    const before = [...g.offers.value]
    expect(g.manualReroll(0)).toBe(true)
    expect(g.canManualReroll(0)).toBe(false)
    expect(g.rerollReadyIn.value[0]).toBeGreaterThan(0)

    // Only the targeted slot changes; the rest of the hand is untouched.
    expect(g.offers.value.slice(1)).toEqual(before.slice(1))

    // A second attempt on the SAME slot is refused rather than silently
    // consuming the charge...
    expect(g.manualReroll(0)).toBe(false)
    // ...but the other three are still theirs to spend. A shared charge meant
    // fixing one bad piece froze the whole hand.
    expect(g.canManualReroll(1)).toBe(true)
    expect(g.manualReroll(1)).toBe(true)
    expect(g.rerollReadyIn.value[2]).toBe(0)
  })

  it('recharges a slot after its five seconds elapse', async () => {
    const g = await loadGame()
    g.startRun()
    g.manualReroll(0)
    expect(g.canManualReroll(0)).toBe(false)
    // Four seconds in: still cooling.
    for (let i = 0; i < 240; i++) g.step(16.67)
    expect(g.canManualReroll(0)).toBe(false)
    // Past five: ready again.
    for (let i = 0; i < 120; i++) g.step(16.67)
    expect(g.canManualReroll(0)).toBe(true)
    expect(g.rerollReadyIn.value[0]).toBe(0)
  })

  it('deals a full hand of reinforced shapes', async () => {
    const g = await loadGame()
    g.startRun()
    expect(g.offerEnhanced.value.some(Boolean)).toBe(false)
    g.dealEnhancedOffers()
    expect(g.offerEnhanced.value.every(Boolean)).toBe(true)
    expect(g.offers.value).toHaveLength(OFFER_SLOTS)
  })
})

describe('the tech tree', () => {
  it('leaves every stat node uncapped so one line can be specialised into', () => {
    for (const n of TECH_NODES) {
      if (isUnlockNode(n.id)) continue
      expect(n.maxLevel, n.id).toBeGreaterThan(50)
    }
  })

  it('caps every unlock node at one purchase', () => {
    for (const n of TECH_NODES) {
      if (!isUnlockNode(n.id)) continue
      expect(n.maxLevel, n.id).toBe(1)
    }
  })

  it('prices repeat ranks so specialising costs more each time', () => {
    // Depth is balanced by cost, not by a ceiling — so every repeatable node
    // must actually get more expensive, or "uncapped" becomes "free".
    for (const n of TECH_NODES) {
      if (isUnlockNode(n.id)) continue
      expect(techCost(n.id, 5), n.id).toBeGreaterThan(techCost(n.id, 0))
    }
  })

  it('has an unlock node for each of the new blocks', () => {
    const ids = new Set(TECH_NODES.map((n) => n.id))
    expect(ids.has('unlockSpikes')).toBe(true)
    expect(ids.has('unlockBombard')).toBe(true)
    expect(BLOCK_DEFS.spikes!.unlockNode).toBe('unlockSpikes')
    expect(BLOCK_DEFS.bombard!.unlockNode).toBe('unlockBombard')
  })

  it('does not reference a block that no longer exists', () => {
    for (const n of TECH_NODES) {
      if (n.effect.kind !== 'unlock') continue
      expect(BLOCK_DEFS[n.effect.blockId], n.id).toBeDefined()
    }
  })
})
