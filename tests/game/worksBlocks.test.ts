import { describe, expect, it, vi } from 'vitest'
import { BLOCK_DEFS, canFortifyType, fortifyCost, FORTIFY_FEE } from '@/game/blocks'
import {
  SHAPE_BY_ID, SHAPE_DEFS, OFFER_SLOTS, SUPPORT_SLOT, rollOffer, isWorksShape
} from '@/game/shapes'
import { TECH_BY_ID } from '@/game/tech'

/**
 * Buff blocks and the economy tier — "The Works".
 *
 * Two ideas share these tests because they share a lane, a tech root and an
 * offer slot: producers answer attrition, buffs answer the fact that WHERE a
 * block goes never used to matter.
 */

const loadGame = async (levels: Record<string, number> = {}) => {
  vi.resetModules()
  localStorage.clear()
  localStorage.setItem('tower_state', JSON.stringify({ ts_tech: { levels } }))
  const g = await import('@/use/useTowerGame')
  g.startRun()
  g.wood.value = 9999
  g.stone.value = 9999
  g.runCoins.value = 9999
  return g
}

type Game = Awaited<ReturnType<typeof loadGame>>
const at = (g: Game, c: number, r: number) => g.getBlocks().get(`${c},${r}`)

/** Enough guns that wave 1 actually dies, so the payout is reached. */
const armFor = (g: Game): void => {
  for (const c of [-4, -3, 3, 4]) g.placeBlock('cannon', c, 0)
}

/** Run one whole wave and hand back its payout. */
const clearWave = (g: Game) => {
  g.callWave()
  for (let i = 0; i < 20_000 && g.phase.value === 'battle'; i++) g.step(16)
  return g.lastWaveReward.value
}

describe('buff auras', () => {
  it('multiplies across neighbours instead of adding', async () => {
    const g = await loadGame()
    // A cannon with a banner either side. Additive stacking would give 1.50;
    // the product gives 1.5625, and that gap is the whole reason placement is
    // a decision — surrounding one block beats spreading the same banners out.
    g.placeBlock('cannon', -2, 0)
    g.placeBlock('banner', -3, 0)
    g.placeBlock('banner', -1, 0)
    const mul = BLOCK_DEFS.banner!.buff!.statMul
    expect(at(g, -2, 0)!.buffMul).toBeCloseTo(mul * mul, 5)
    expect(at(g, -2, 0)!.buffMul).toBeGreaterThan(1 + (mul - 1) * 2)
  })

  it('raises max HP, damage and armour together', async () => {
    const plain = await loadGame()
    plain.placeBlock('cannon', -2, 0)
    const baseHp = at(plain, -2, 0)!.maxHp
    const baseDps = plain.measureTower().dps

    const buffed = await loadGame()
    buffed.placeBlock('cannon', -2, 0)
    buffed.placeBlock('banner', -1, 0)
    const b = at(buffed, -2, 0)!
    expect(b.maxHp).toBeGreaterThan(baseHp)
    expect(b.buffArmor).toBe(BLOCK_DEFS.banner!.buff!.armor)
    // Damage is counted by `measureTower`, which is also what the difficulty
    // director prices the next wave against — a buff the director cannot see
    // would hand a strengthened tower a wave it has already out-grown.
    expect(buffed.measureTower().dps).toBeGreaterThan(baseDps)
  })

  it('keeps the damage FRACTION when an aura appears or disappears', async () => {
    const g = await loadGame()
    g.placeBlock('cannon', -2, 0)
    g.placeBlock('banner', -1, 0)
    const b = at(g, -2, 0)!
    b.hp = b.maxHp * 0.5

    g.sellBlock(-1, 0)
    // Losing the banner that was holding a block up must not kill it, and
    // gaining one is not a repair.
    expect(b.hp / b.maxHp).toBeCloseTo(0.5, 2)
    expect(b.hp).toBeGreaterThan(0)
    expect(b.buffMul ?? 1).toBe(1)
  })

  it('counts one aura once, however many cells a merged neighbour touches', async () => {
    const g = await loadGame({ unlockMerge: 1 })
    // A 2x1 merged cannon with a single banner beside it touches that banner
    // along one cell; a naive per-cell walk would still have counted it twice.
    g.placeBlock('cannon', -3, 0)
    g.placeBlock('cannon', -2, 0)
    g.placeBlock('banner', -1, 0)
    const merged = at(g, -2, 0)!
    expect(merged.w).toBe(2)
    expect(merged.buffMul).toBeCloseTo(BLOCK_DEFS.banner!.buff!.statMul, 5)
  })

  it('does not buff itself', async () => {
    const g = await loadGame()
    g.placeBlock('banner', -2, 0)
    g.placeBlock('banner', -1, 0)
    // Two banners side by side DO feed each other — that is consistent — but
    // neither may count its own aura.
    expect(at(g, -2, 0)!.buffMul).toBeCloseTo(BLOCK_DEFS.banner!.buff!.statMul, 5)
  })

  it('scales the aura with the rally-cry node, not the reach', async () => {
    const base = await loadGame()
    base.placeBlock('cannon', -2, 0)
    base.placeBlock('banner', -1, 0)
    const plain = at(base, -2, 0)!.buffMul!

    const rallied = await loadGame({ logistics: 1, unlockCoffer: 1, yields: 1, unlockObelisk: 1, rallyCry: 5 })
    rallied.placeBlock('cannon', -2, 0)
    rallied.placeBlock('banner', -1, 0)
    expect(at(rallied, -2, 0)!.buffMul!).toBeGreaterThan(plain)
  })
})

describe('economy blocks', () => {
  it('mints run gold — the only block in the game that does', async () => {
    const g = await loadGame({ logistics: 1, unlockCoffer: 1 })
    const producers = Object.values(BLOCK_DEFS).filter((d) => d.economy?.gold)
    expect(producers.map((d) => d.id)).toEqual(['coffer'])

    armFor(g)
    g.placeBlock('coffer', -2, 0)
    g.runCoins.value = 0
    const reward = clearWave(g)
    expect(reward).not.toBeNull()
    expect(reward!.gold).toBeGreaterThan(0)
  })

  it('scales every yield with the tech, and NOT with a neighbouring buff', async () => {
    const plain = await loadGame()
    armFor(plain)
    plain.placeBlock('lumberHut', -2, 0)
    const base = clearWave(plain)!.wood

    const teched = await loadGame({ logistics: 1, yields: 6 })
    armFor(teched)
    teched.placeBlock('lumberHut', -2, 0)
    expect(clearWave(teched)!.wood).toBeGreaterThan(base)

    // A banner raises hit points, damage and armour. Letting it also print
    // resources would make the buff block the answer to every question.
    const bannered = await loadGame()
    armFor(bannered)
    bannered.placeBlock('lumberHut', -2, 0)
    bannered.placeBlock('banner', -1, 0)
    expect(clearWave(bannered)!.wood).toBe(base)
  })

  it('prices the early tier against a wave of income, not a run of it', async () => {
    // A producer is a cell that neither shoots nor soaks. It has to pay back
    // inside the run that bought it or nobody will ever build one.
    for (const id of ['lumberHut', 'stonepit', 'coffer'] as const) {
      const d = BLOCK_DEFS[id]!
      const cost = (d.cost.wood ?? 0) + (d.cost.stone ?? 0) + (d.cost.coins ?? 0)
      const perWave = (d.economy!.wood ?? 0) + (d.economy!.stone ?? 0) + (d.economy!.gold ?? 0)
      expect(perWave).toBeGreaterThan(0)
      // Pays for itself within about a dozen waves.
      expect(cost / perWave).toBeLessThan(14)
    }
  })
})

describe('the support offer slot', () => {
  const unlocked = new Set(
    Object.values(BLOCK_DEFS).filter((d) => !d.unlockNode).map((d) => d.id)
  )

  it('exists, and is the fifth slot', () => {
    expect(OFFER_SLOTS).toBe(5)
    expect(SUPPORT_SLOT).toBe(4)
  })

  it('deals ONLY producers and buffs — no wall, no gun, no utility', () => {
    // Checked per BLOCK, not per lane. The `support` lane also carries the
    // spiked wall and the repair bay, which fight; and several pieces mix a
    // crate in as a plinth. Neither belongs in this slot.
    const everything = new Set(Object.keys(BLOCK_DEFS))
    for (const pool of [unlocked, everything]) {
      for (let i = 0; i < 400; i++) {
        const id = rollOffer(SUPPORT_SLOT, 1 + (i % 25), pool)
        for (const [, , typeId] of SHAPE_BY_ID[id]!.cells) {
          expect(['economy', 'buff'], `${id} → ${typeId}`).toContain(BLOCK_DEFS[typeId]!.kind)
        }
      }
    }
  })

  it('holds its pool rather than falling through to the catalogue', () => {
    // A works slot that falls back is just a third "any" slot, and the two
    // families that never win a straight fight against a cannon stop appearing.
    // Exclude every works shape and it must still refuse to deal a wall.
    const works = SHAPE_DEFS.filter(isWorksShape).map((s) => s.id)
    const id = rollOffer(SUPPORT_SLOT, 20, new Set(Object.keys(BLOCK_DEFS)), works)
    expect(works).toContain(id)
  })

  it('is never empty for a player with no tech at all', () => {
    const free = SHAPE_DEFS.filter(
      (s) => isWorksShape(s) && s.cells.every(([, , t]) => unlocked.has(t))
    )
    expect(free.length).toBeGreaterThan(0)
    // ...and it carries BOTH families, so a fresh player meets each of them.
    const kinds = new Set(free.flatMap((s) => s.cells.map(([, , t]) => BLOCK_DEFS[t]!.kind)))
    expect(kinds.has('buff')).toBe(true)
    expect(kinds.has('economy')).toBe(true)
  })
})

describe('fortifying a wall', () => {
  it('offers itself on plain walls only', () => {
    for (const d of Object.values(BLOCK_DEFS)) {
      expect(canFortifyType(d.id), d.id).toBe(d.kind === 'structure')
    }
    // Not the Gate, not a gun, not a producer — and not a spiked wall already.
    expect(canFortifyType('gate')).toBe(false)
    expect(canFortifyType('cannon')).toBe(false)
    expect(canFortifyType('spikes')).toBe(false)
  })

  it('charges the material SHORTFALL, never material already in the tower', () => {
    const spikes = BLOCK_DEFS.spikes!.cost
    // A braced crate already cost more wood than a spiked wall does, so it pays
    // only the stone; a stone block pays only the wood.
    expect(fortifyCost('brace').wood).toBe(0)
    expect(fortifyCost('brace').stone).toBe(spikes.stone)
    expect(fortifyCost('stone').stone).toBe(0)
    expect(fortifyCost('stone').wood).toBe(spikes.wood)
    // And every conversion carries the same small gold premium.
    for (const id of ['wood', 'brace', 'stone'] as const) {
      expect(fortifyCost(id).coins).toBe(FORTIFY_FEE)
    }
  })

  it('is refused until the spiked wall itself is unlocked', async () => {
    const locked = await loadGame()
    locked.placeBlock('wood', -2, 0)
    expect(locked.canFortifyBlock(-2, 0)).toBe(false)
    expect(locked.fortifyBlock(-2, 0)).toBe(false)
    expect(at(locked, -2, 0)!.typeId).toBe('wood')

    const open = await loadGame({ foundations: 1, unlockSpikes: 1 })
    open.placeBlock('wood', -2, 0)
    expect(open.canFortifyBlock(-2, 0)).toBe(true)
    expect(open.fortifyBlock(-2, 0)).toBe(true)
    expect(at(open, -2, 0)!.typeId).toBe('spikes')
  })

  it('keeps the ranks, the gable and the reinforcement the player paid for', async () => {
    const g = await loadGame({ foundations: 1, unlockSpikes: 1 })
    g.placeBlock('wood', -2, 0)
    const b = at(g, -2, 0)!
    b.roof = true
    b.enhanced = true
    g.upgradeBlock(-2, 0)
    g.upgradeBlock(-2, 0)

    expect(g.fortifyBlock(-2, 0)).toBe(true)
    expect(b.typeId).toBe('spikes')
    expect(b.level).toBe(2)
    expect(b.roof).toBe(true)
    expect(b.enhanced).toBe(true)
  })

  it('carries the WOUND across, so it is neither a heal nor a demolition', async () => {
    const g = await loadGame({ foundations: 1, unlockSpikes: 1 })
    g.placeBlock('wood', -2, 0)
    const b = at(g, -2, 0)!
    const missing = 15
    b.hp = b.maxHp - missing

    expect(g.fortifyBlock(-2, 0)).toBe(true)
    // A spiked wall has three times a crate's ceiling: preserving the FRACTION
    // would have made this a cheap heal, and preserving raw hit points would
    // leave a fresh conversion looking badly damaged.
    expect(b.maxHp - b.hp).toBe(missing)
    expect(b.maxHp).toBeGreaterThan(BLOCK_DEFS.wood!.hp)
  })

  it('charges the purse and refuses when it cannot', async () => {
    const g = await loadGame({ foundations: 1, unlockSpikes: 1 })
    g.placeBlock('wood', -2, 0)
    const cost = fortifyCost('wood')
    const before = { w: g.wood.value, s: g.stone.value, c: g.runCoins.value }
    expect(g.fortifyBlock(-2, 0)).toBe(true)
    expect(g.wood.value).toBe(before.w - cost.wood)
    expect(g.stone.value).toBe(before.s - cost.stone)
    expect(g.runCoins.value).toBe(before.c - cost.coins)

    g.placeBlock('wood', -1, 0)
    g.stone.value = 0
    expect(g.canFortifyBlock(-1, 0)).toBe(false)
    expect(g.fortifyBlock(-1, 0)).toBe(false)
  })
})

describe('the Works tech branch', () => {
  it('is a root of its own, like the harbour', () => {
    expect(TECH_BY_ID.logistics!.requires).toEqual([])
    expect(TECH_BY_ID.logistics!.tier).toBe(0)
  })

  it('gates every block it is responsible for', () => {
    const works = ['logistics', 'unlockCoffer', 'yields', 'unlockObelisk', 'rallyCry', 'stockpiles']
    for (const id of works) expect(TECH_BY_ID[id], id).toBeDefined()
    expect(BLOCK_DEFS.stonepit!.unlockNode).toBe('logistics')
    expect(BLOCK_DEFS.coffer!.unlockNode).toBe('unlockCoffer')
    expect(BLOCK_DEFS.obelisk!.unlockNode).toBe('unlockObelisk')
    // The two that carry the support slot for an untech'd player stay free.
    expect(BLOCK_DEFS.banner!.unlockNode).toBeUndefined()
    expect(BLOCK_DEFS.lumberHut!.unlockNode).toBeUndefined()
  })

  it('makes the heavy buff worth its price through the product, not the number', () => {
    const banner = BLOCK_DEFS.banner!.buff!.statMul
    const obelisk = BLOCK_DEFS.obelisk!.buff!.statMul
    expect(obelisk).toBeGreaterThan(banner)
    // Two obelisks beat two banners by more than one obelisk beats one banner —
    // which is what a multiplicative aura buys and an additive one would not.
    expect(obelisk ** 2 - banner ** 2).toBeGreaterThan(obelisk - banner)
  })
})
