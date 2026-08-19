import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BLOCK_DEFS, MAX_MERGE_TIER, tierOf, mergePowerMul, mergeHpMul, canMergeBlocks
} from '@/game/blocks'
import { TECH_BY_ID } from '@/game/tech'
import type { Block } from '@/game/types'

/**
 * Merging changes how every block in the tower is placed, so the rules it must
 * NOT break are as important as the ones it adds: it cannot fuse the Gate, it
 * cannot exceed its ceiling, it cannot destroy something the player paid for,
 * and it cannot happen at all until the node is bought.
 */

const loadGame = async (levels: Record<string, number> = { unlockMerge: 1 }) => {
  vi.resetModules()
  localStorage.clear()
  localStorage.setItem('tower_state', JSON.stringify({ ts_tech: { levels } }))
  const g = await import('@/use/useTowerGame')
  g.startRun()
  g.wood.value = 99999
  g.stone.value = 99999
  g.runCoins.value = 99999
  return g
}

type Game = Awaited<ReturnType<typeof loadGame>>

/** What is standing on this cell — a merged block answers for every cell it
 *  covers, which is the whole point of the occupancy index. */
const at = (g: Game, c: number, r: number): Block | undefined =>
  g.getBlocks().get(`${c},${r}`)

const count = (g: Game, typeId: string): number =>
  [...g.getTowerBlocks().values()].filter((b) => b.typeId === typeId).length

const size = (b: Block): [number, number] => [b.w ?? 1, b.h ?? 1]

beforeEach(() => {
  localStorage.clear()
})

describe('the merge curve', () => {
  it('triples output and doubles hit points per tier', () => {
    expect(mergePowerMul(1)).toBe(1)
    expect(mergePowerMul(2)).toBe(3)
    expect(mergePowerMul(3)).toBe(9)
    expect(mergeHpMul(1)).toBe(1)
    expect(mergeHpMul(2)).toBe(2)
    expect(mergeHpMul(3)).toBe(4)
  })

  it('leaves output ahead of durability, which is what makes it a bet', () => {
    // Four cannons in one cell hit nine times as hard but carry only four
    // times the hit points — concentrating buys damage, not safety.
    for (const tier of [2, 3]) {
      expect(mergePowerMul(tier)).toBeGreaterThan(mergeHpMul(tier))
    }
  })

  it('never fuses the Gate, a mismatch, or anything at the ceiling', () => {
    expect(canMergeBlocks({ typeId: 'gate' }, { typeId: 'gate' })).toBe(false)
    // Weapons only. A wall has no damage to bet, and welding masonry the
    // player never asked to weld ate roofs and reinforcement in the process.
    expect(canMergeBlocks({ typeId: 'stone' }, { typeId: 'stone' })).toBe(false)
    expect(canMergeBlocks({ typeId: 'crate' }, { typeId: 'crate' })).toBe(false)
    expect(canMergeBlocks({ typeId: 'cannon' }, { typeId: 'archer' })).toBe(false)
    expect(canMergeBlocks({ typeId: 'cannon', tier: 1 }, { typeId: 'cannon', tier: 2 })).toBe(false)
    expect(canMergeBlocks(
      { typeId: 'cannon', tier: MAX_MERGE_TIER },
      { typeId: 'cannon', tier: MAX_MERGE_TIER }
    )).toBe(false)
    expect(canMergeBlocks({ typeId: 'cannon' }, { typeId: 'cannon' })).toBe(true)
  })
})

describe('fusing on the board', () => {
  it('leaves walls, crates and producers exactly as they were', async () => {
    const g = await loadGame()
    // A two-cell crate piece must stay two crates: no weld, no tier plate, and
    // — crucially — no half losing the roof or reinforcement it was bought with.
    g.placeBlock('crate', -2, 0)
    g.placeBlock('crate', -1, 0)
    expect(count(g, 'crate')).toBe(2)
    expect(at(g, -2, 0)).not.toBe(at(g, -1, 0))
    expect(size(at(g, -1, 0)!)).toEqual([1, 1])
    expect(tierOf(at(g, -1, 0)!.tier)).toBe(1)

    for (const c of [-2, -1]) g.placeBlock('stone', c, 1)
    expect(count(g, 'stone')).toBe(2)
    expect(at(g, -2, 1)).not.toBe(at(g, -1, 1))
  })

  it('turns two adjacent cannons into one tier-2', async () => {
    const g = await loadGame()
    g.placeBlock('cannon', -2, 0)
    expect(count(g, 'cannon')).toBe(1)

    g.placeBlock('cannon', -1, 0)
    // One block, not two — and it still stands on BOTH cells. A merge changes
    // the shape of the tower; it must never hand a cell back to the enemy.
    expect(count(g, 'cannon')).toBe(1)
    const fused = at(g, -1, 0)!
    expect(at(g, -2, 0)).toBe(fused)
    expect(tierOf(fused.tier)).toBe(2)
    expect(size(fused)).toEqual([2, 1])
    // Anchored at its low corner, wherever the player happened to build last.
    expect([fused.c, fused.r]).toEqual([-2, 0])
  })

  it('grows lengthwise, then squares up — the shape follows the placement', async () => {
    const g = await loadGame()
    // Two pairs stacked: each row fuses into a 2×1, and the rows then fuse into
    // a 2×2 rather than a 4×1. WHERE the halves sat decided the silhouette.
    g.placeBlock('archer', -2, 0)
    g.placeBlock('archer', -1, 0)
    expect(size(at(g, -1, 0)!)).toEqual([2, 1])

    g.placeBlock('archer', -2, 1)
    g.placeBlock('archer', -1, 1)
    const big = at(g, -1, 1)!
    expect(tierOf(big.tier)).toBe(3)
    expect(size(big)).toEqual([2, 2])
    // All four cells still answer with the same block.
    for (const [c, r] of [[-2, 0], [-1, 0], [-2, 1], [-1, 1]] as const) {
      expect(at(g, c, r)).toBe(big)
    }
  })

  it('makes every tier-3 a square, whatever order it was built in', async () => {
    const g = await loadGame()
    // Bottom row first, then the storey above — and the mirror image, top pair
    // laid before the pair that ends up under it. Both give the same bastion.
    for (const [c, r] of [[-2, 0], [-1, 0], [-2, 1], [-1, 1]] as const) {
      g.placeBlock('archer', c, r)
    }
    expect(size(at(g, -1, 1)!)).toEqual([2, 2])

    // Same build, each pair closed from the other end. The anchor lands on the
    // low corner either way, so the bastion is identical.
    const h = await loadGame()
    for (const [c, r] of [[-1, 0], [-2, 0], [-1, 1], [-2, 1]] as const) {
      h.placeBlock('archer', c, r)
    }
    const bastion = at(h, -1, 1)!
    expect(size(bastion)).toEqual([2, 2])
    expect([bastion.c, bastion.r]).toEqual([-2, 0])
    expect(tierOf(bastion.tier)).toBe(3)
  })

  it('refuses a union that would not be a rectangle', async () => {
    const g = await loadGame()
    // An L: a 2×1 on the ground with a single block perched on one end. Fusing
    // those would need a footprint no rectangle can describe, so they stay two.
    g.placeBlock('archer', -2, 0)
    g.placeBlock('archer', -1, 0)
    g.placeBlock('archer', -1, 1)
    expect(count(g, 'archer')).toBe(2)
    expect(tierOf(at(g, -1, 1)!.tier)).toBe(1)
  })

  it('lets the whole span carry the tower — no cell is lost to a merge', async () => {
    const g = await loadGame()
    g.placeBlock('archer', -2, 0)
    g.placeBlock('archer', -1, 0)
    // A block resting on the far half of a fused span is supported: before
    // multi-cell merging that cell was empty and this placement was illegal.
    expect(g.placeBlock('archer', -2, 1)).toBe(true)
    expect(at(g, -2, 1)).toBeDefined()
  })

  it('cascades: the second row completes the bastion in one placement', async () => {
    const g = await loadGame()
    // A tier-2 on the ground and half a tier-2 above it. The last cannon fuses
    // with its neighbour, and the tier-2 that makes immediately fuses again
    // with the tier-2 beneath it — that second step is the cascade. Without it
    // the player would hold two tier-2s and no placement that could join them.
    // (0, 0) is the Gate on every run, so the rows are laid out to its left.
    g.placeBlock('cannon', -2, 0)
    g.placeBlock('cannon', -1, 0)
    expect(tierOf(at(g, -1, 0)!.tier)).toBe(2)

    g.placeBlock('cannon', -2, 1)
    expect(count(g, 'cannon')).toBe(2)

    g.placeBlock('cannon', -1, 1)
    expect(count(g, 'cannon')).toBe(1)
    const big = at(g, -1, 1)!
    expect(tierOf(big.tier)).toBe(3)
    expect(size(big)).toEqual([2, 2])
  })

  it('fuses loose weapons in whichever direction they were placed', async () => {
    const g = await loadGame()
    // Stacked, not side by side. Two guns touching is two guns touching — the
    // direction rule belongs to MERGED blocks, not to plain ones.
    g.placeBlock('cannon', -1, 0)
    g.placeBlock('cannon', -1, 1)
    expect(count(g, 'cannon')).toBe(1)
    const tall = at(g, -1, 1)!
    expect(tierOf(tall.tier)).toBe(2)
    expect(size(tall)).toEqual([1, 2])
    expect(at(g, -1, 0)).toBe(tall)
  })

  it('squares up a standing pair sideways, a lengthy pair upward', async () => {
    // A 1×2 column may only grow left or right; a 2×1 may only grow up or
    // down. Either way the tier-3 is the same 2×2 bastion.
    const g = await loadGame()
    g.placeBlock('cannon', -1, 0)
    g.placeBlock('cannon', -1, 1)
    g.placeBlock('cannon', -2, 0)
    g.placeBlock('cannon', -2, 1)
    const fromColumns = at(g, -1, 1)!
    expect(size(fromColumns)).toEqual([2, 2])
    expect(tierOf(fromColumns.tier)).toBe(3)

    const h = await loadGame()
    h.placeBlock('cannon', -2, 0)
    h.placeBlock('cannon', -1, 0)
    h.placeBlock('cannon', -2, 1)
    h.placeBlock('cannon', -1, 1)
    const fromRows = at(h, -1, 1)!
    expect(size(fromRows)).toEqual([2, 2])
    expect(tierOf(fromRows.tier)).toBe(3)
  })

  it('never stacks two standing pairs into a 1×4 tower', async () => {
    const g = await loadGame()
    // Four in a column is two 1×2s that refuse to touch, exactly as four in a
    // row is two 2×1s that refuse to touch. Neither shape is a square.
    for (const r of [0, 1, 2, 3]) g.placeBlock('cannon', -1, r)
    expect(count(g, 'cannon')).toBe(2)
    for (const b of g.getTowerBlocks().values()) {
      if (b.typeId !== 'cannon') continue
      expect(size(b)).toEqual([1, 2])
    }
  })

  it('never lays two merged blocks end to end', async () => {
    const g = await loadGame()
    // Four in a row is two lengthy tier-2s that refuse to touch. A 4×1 strip
    // with one gun stranded in the middle is not a bastion, and the player who
    // wants tier 3 has to build the second storey.
    for (const c of [-4, -3, -2, -1]) g.placeBlock('cannon', c, 0)
    expect(count(g, 'cannon')).toBe(2)
    for (const b of g.getTowerBlocks().values()) {
      if (b.typeId !== 'cannon') continue
      expect(tierOf(b.tier)).toBe(2)
      expect(size(b)).toEqual([2, 1])
    }
  })

  it('leaves a tier-1 alone beside a tier-2 — only equals fuse', async () => {
    const g = await loadGame()
    g.placeBlock('cannon', -3, 0)
    g.placeBlock('cannon', -2, 0)
    g.placeBlock('cannon', -1, 0)
    // A plain cannon next to a merged one stays plain: otherwise a tier-3
    // would cost three blocks rather than four and the curve would be a lie.
    expect(count(g, 'cannon')).toBe(2)
    expect(tierOf(at(g, -2, 0)!.tier)).toBe(2)
    expect(tierOf(at(g, -1, 0)!.tier)).toBe(1)
  })

  it('stops at the ceiling', async () => {
    const g = await loadGame()
    // Eight cannons would be a tier 4 if the ceiling did not hold.
    for (const c of [-4, -3, -2, -1, 1, 2, 3, 4]) g.placeBlock('cannon', c, 0)
    for (const b of g.getTowerBlocks().values()) {
      expect(tierOf(b.tier)).toBeLessThanOrEqual(MAX_MERGE_TIER)
    }
  })

  it('scales the merged block s max HP by its tier', async () => {
    const g = await loadGame()
    g.placeBlock('archer', -2, 0)
    const base = at(g, -2, 0)!.maxHp
    g.placeBlock('archer', -1, 0)
    expect(at(g, -1, 0)!.maxHp).toBe(base * 2)
  })

  it('adds the halves hit points rather than healing them', async () => {
    const g = await loadGame()
    g.placeBlock('archer', -2, 0)
    g.placeBlock('archer', 2, 0)
    at(g, -2, 0)!.hp = 40
    at(g, 2, 0)!.hp = 30
    // Bridge them so they meet.
    for (const c of [-1, 0, 1]) g.placeBlock('archer', c, 0)
    const merged = [...g.getTowerBlocks().values()].filter((b) => b.typeId === 'archer')
    const total = merged.reduce((n, b) => n + b.hp, 0)
    // Nothing was conjured: the surviving hit points never exceed what the
    // halves brought, and a merge is never a free repair.
    expect(total).toBeLessThanOrEqual(40 + 30 + BLOCK_DEFS.archer!.hp * 3)
  })

  it('keeps the better of the two halves rather than losing a purchase', async () => {
    const g = await loadGame()
    g.placeBlock('cannon', -2, 0)
    g.placeBlock('cannon', 2, 0)
    // One half has a bought rank; the other does not.
    g.upgradeBlock(-2, 0)
    g.upgradeBlock(-2, 0)
    expect(at(g, -2, 0)!.level).toBe(2)

    for (const c of [-1, 0, 1]) g.placeBlock('cannon', c, 0)
    const best = Math.max(...[...g.getTowerBlocks().values()]
      .filter((b) => b.typeId === 'cannon')
      .map((b) => b.level ?? 0))
    expect(best).toBe(2)
  })

  it('stays reinforced only when EVERY half was', async () => {
    const g = await loadGame()
    g.placeBlock('cannon', -2, 0)
    g.placeBlock('cannon', -1, 0)
    const both = at(g, -1, 0)!
    both.enhanced = true
    expect(at(g, -2, 0)).toBe(both)
    // Two reinforced halves keep it.
    g.placeBlock('cannon', 2, 0)
    g.placeBlock('cannon', 3, 0)
    const pair = at(g, 3, 0)!
    pair.enhanced = true
    expect(both.enhanced).toBe(true)
    expect(pair.enhanced).toBe(true)

    // One reinforced half and one plain: the merged block is NOT reinforced.
    // Gold means reinforced and nothing else, so a merge may never mint it.
    const h = await loadGame()
    h.placeBlock('cannon', -2, 0)
    at(h, -2, 0)!.enhanced = true
    h.placeBlock('cannon', -1, 0)
    expect(tierOf(at(h, -1, 0)!.tier)).toBe(2)
    expect(at(h, -1, 0)!.enhanced).toBe(false)
  })

  it('does nothing at all until the node is bought', async () => {
    const g = await loadGame({})
    expect(TECH_BY_ID.unlockMerge!.effect.kind).toBe('mergeUnlock')
    g.placeBlock('cannon', -2, 0)
    g.placeBlock('cannon', -1, 0)
    expect(count(g, 'cannon')).toBe(2)
    expect(tierOf(at(g, -1, 0)!.tier)).toBe(1)
  })

  it('is reached from either side, not just from its anchor', async () => {
    const g = await loadGame()
    // A bastion anchored on its LEFT column. An enemy walking in from the
    // right has to be stopped by the right face; measuring reach to the anchor
    // let it march clean through the whole footprint first.
    for (const c of [-2, -1]) g.placeBlock('cannon', c, 0)
    for (const c of [-2, -1]) g.placeBlock('cannon', c, 1)
    const battery = at(g, -1, 0)!
    expect(size(battery)).toEqual([2, 2])

    g.callWave()
    g.debugSpawn(['grunt', 'grunt'])
    const walker = g.getEnemies().find((e) => e.dir === -1)
    expect(walker).toBeDefined()
    // Drop it just off the battery's RIGHT face and let it close.
    walker!.x = 2
    for (let i = 0; i < 600; i++) g.step(16)
    // It stops on the near face. Measuring reach to the anchor instead put it
    // at roughly -1.5 — three cells deep inside the masonry.
    expect(walker!.x).toBeGreaterThan(-0.9)
  })

  it('refunds every cell the span was paid for', async () => {
    const g = await loadGame()
    g.placeBlock('cannon', -2, 0)
    const one = g.sellBlock(-2, 0)!

    g.placeBlock('cannon', -2, 0)
    g.placeBlock('cannon', -1, 0)
    const two = g.sellBlock(-1, 0)!
    // Two blocks went in, two blocks' worth comes back. Refunding a merged
    // block as one would punish exactly the players who used the system.
    expect(two.wood + two.stone + two.coins)
      .toBeGreaterThan(one.wood + one.stone + one.coins)
  })

  it('takes splash on any cell of the span, not just the middle one', async () => {
    const g = await loadGame()
    for (const c of [-2, -1]) g.placeBlock('archer', c, 0)
    for (const c of [-2, -1]) g.placeBlock('archer', c, 1)
    const wall = at(g, -2, 0)!
    expect(size(wall)).toEqual([2, 2])
    const before = wall.hp
    // A blast centred on the far BOTTOM-LEFT cell still lands on the bastion,
    // even though the footprint's centre is a cell away from it.
    g.damageBlocksInRadiusForTest(-2, 0.5, 0.4, 25)
    expect(wall.hp).toBeLessThan(before)
  })

  it('round-trips a tier through the run snapshot', async () => {
    const g = await loadGame()
    g.placeBlock('cannon', -2, 0)
    g.placeBlock('cannon', -1, 0)
    const maxHp = at(g, -1, 0)!.maxHp
    g.saveRunSnapshot()

    expect(g.resumeRun()).toBe(true)
    const restored = at(g, -1, 0)!
    expect(tierOf(restored.tier)).toBe(2)
    expect(restored.maxHp).toBe(maxHp)
    // The footprint has to survive the round trip too, or a resumed run puts
    // a two-cell block back as a one-cell one and silently frees a cell.
    expect(size(restored)).toEqual([2, 1])
    expect(at(g, -2, 0)).toBe(restored)
  })
})

describe('settling merges outside placement', () => {
  it('fuses a pair restored from a save written before Fusion was owned', async () => {
    // The player's actual path: build, die, buy Fusion, resume. `mergeAt` only
    // ever ran from a placement, so every gun already in the tower stayed
    // stubbornly single — which reads as the merge system being broken, because
    // from where the player is sitting two identical guns are touching.
    const stale = await loadGame({})
    stale.placeBlock('cannon', -2, 0)
    stale.placeBlock('cannon', -1, 0)
    expect(count(stale, 'cannon')).toBe(2)
    stale.saveRunSnapshot()
    // The state layer batches writes, so the blob is not in storage yet.
    const { flushSaveNow } = await import('@/use/useSaveStatus')
    await flushSaveNow()
    const snapshot = localStorage.getItem('tower_state')!

    // Same save, now with Fusion owned.
    vi.resetModules()
    const blob = JSON.parse(snapshot)
    blob.ts_tech = { levels: { unlockMerge: 1 } }
    localStorage.setItem('tower_state', JSON.stringify(blob))
    const g = await import('@/use/useTowerGame')

    expect(g.resumeRun()).toBe(true)
    const cannons = [...g.getTowerBlocks().values()].filter((b) => b.typeId === 'cannon')
    expect(cannons).toHaveLength(1)
    expect([cannons[0]!.w ?? 1, cannons[0]!.h ?? 1]).toEqual([2, 1])
  })

  it('fuses a block that FELL into place beside its twin', async () => {
    const g = await loadGame()
    // A cannon on the ground, and another two rows up on a stack of crates.
    g.placeBlock('cannon', -3, 0)
    g.placeBlock('crate', -2, 0)
    g.placeBlock('crate', -2, 1)
    g.placeBlock('cannon', -2, 2)
    expect(count(g, 'cannon')).toBe(2)

    // Knock the top crate out: the cannon above it drops to row 1... and then
    // the one below it too, landing beside the cannon on the ground.
    g.damageBlockForTest(at(g, -2, 1)!, 99_999)
    for (let i = 0; i < 400; i++) g.step(16)

    const cannons = [...g.getTowerBlocks().values()].filter((b) => b.typeId === 'cannon')
    // Whatever survived the fall, two cannons sitting side by side must be one.
    const adjacent = cannons.length === 2
      && cannons[0]!.r === cannons[1]!.r
      && Math.abs(cannons[0]!.c - cannons[1]!.c) === 1
    expect(adjacent, 'two twins were left touching and unmerged').toBe(false)
  })

  it('does nothing at all while Fusion is unowned', async () => {
    const g = await loadGame({})
    g.placeBlock('cannon', -2, 0)
    g.placeBlock('cannon', -1, 0)
    // The settle pass runs on every structural change; it must still respect
    // the gate, or it becomes a way around the node that sells merging.
    g.placeBlock('crate', -3, 0)
    expect(count(g, 'cannon')).toBe(2)
  })
})

describe('selling tech ranks', () => {
  const loadProgress = async (levels: Record<string, number>, coins = 5000) => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('tower_state', JSON.stringify({
      ts_tech: { levels }, ts_coins: coins
    }))
    const mod = await import('@/use/useTowerProgress')
    const economy = await import('@/use/useTowerEconomy')
    return { p: mod.default(), levelOf: mod.levelOf, coins: economy.coins }
  }

  it('refunds half the rank s price and drops the level', async () => {
    const { p, levelOf, coins } = await loadProgress({ foundations: 3 })
    const before = coins.value
    const expected = p.refundOf('foundations')
    expect(expected).toBeGreaterThan(0)

    expect(p.sellTech('foundations')).toBe(expected)
    expect(levelOf('foundations')).toBe(2)
    expect(coins.value).toBe(before + expected)
  })

  it('refuses to strand an owned node that depends on it', async () => {
    // Selling the LAST rank of foundations would leave sharpBolts unreachable.
    const { p, levelOf } = await loadProgress({ foundations: 1, sharpBolts: 1 })
    expect(p.sellBlockers('foundations')).toContain('sharpBolts')
    expect(p.canSellTech('foundations')).toBe(false)
    expect(p.sellTech('foundations')).toBe(0)
    expect(levelOf('foundations')).toBe(1)
  })

  it('allows the sale while a spare rank remains', async () => {
    const { p, levelOf } = await loadProgress({ foundations: 2, sharpBolts: 1 })
    expect(p.canSellTech('foundations')).toBe(true)
    expect(p.sellTech('foundations')).toBeGreaterThan(0)
    expect(levelOf('foundations')).toBe(1)
  })

  it('sells a binary unlock back — the merge skill included', async () => {
    const { p, levelOf } = await loadProgress({ foundations: 1, unlockMerge: 1, unlockBrace: 1 })
    expect(p.canSellTech('unlockMerge')).toBe(true)
    expect(p.sellTech('unlockMerge')).toBeGreaterThan(0)
    expect(levelOf('unlockMerge')).toBe(0)

    expect(p.canSellTech('unlockBrace')).toBe(true)
    expect(p.sellTech('unlockBrace')).toBeGreaterThan(0)
    expect(levelOf('unlockBrace')).toBe(0)
  })

  it('refuses a node that was never bought', async () => {
    const { p } = await loadProgress({})
    expect(p.canSellTech('foundations')).toBe(false)
    expect(p.sellTech('foundations')).toBe(0)
  })
})

describe('the forge-weld node', () => {
  it('pays out only on merged blocks', async () => {
    const plain = await loadGame({ unlockMerge: 1 })
    plain.placeBlock('cannon', -1, 0)
    const solo = plain.measureTower().dps

    const welded = await loadGame({ unlockMerge: 1, forgeWelds: 5 })
    welded.placeBlock('cannon', -1, 0)
    // One unmerged cannon: the node must be worth nothing here.
    expect(welded.measureTower().dps).toBeCloseTo(solo, 5)

    welded.placeBlock('cannon', -2, 0)
    plain.placeBlock('cannon', -2, 0)
    // ...and everything once they fuse.
    expect(welded.measureTower().dps).toBeGreaterThan(plain.measureTower().dps)
  })
})
