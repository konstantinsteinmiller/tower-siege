import { describe, expect, it, vi } from 'vitest'
import {
  BLOCK_DEFS, MAX_BLOCK_LEVEL, blockUpgradeCost,
  upgradeHpMul, upgradePowerMul, upgradeArmorBonus
} from '@/game/blocks'
import type { Block } from '@/game/types'

// The simulation is a module-level singleton (project convention), so each test
// re-imports it fresh to get a clean tower.
const loadGame = async () => {
  vi.resetModules()
  localStorage.clear()
  const g = await import('@/use/useTowerGame')
  g.startRun()
  g.wood.value = 9999
  g.stone.value = 9999
  g.runCoins.value = 9999
  return g
}

type Game = Awaited<ReturnType<typeof loadGame>>

const at = (g: Game, c: number, r: number): Block | undefined =>
  [...g.getBlocks().values()].find((b) => b.c === c && b.r === r)

describe('the upgrade price curve', () => {
  it('gets steeper with every rank and stops at the ceiling', () => {
    let prev = 0
    for (let lvl = 0; lvl < MAX_BLOCK_LEVEL; lvl++) {
      const cost = blockUpgradeCost('cannon', lvl)
      expect(cost).toBeGreaterThan(prev)
      prev = cost
    }
    expect(blockUpgradeCost('cannon', MAX_BLOCK_LEVEL)).toBe(Infinity)
  })

  it('prices an expensive block above a cheap one', () => {
    // Upgrading a wood crate has to stay a casual decision; a Bombard rank is
    // meant to be a real commitment of the run's gold.
    expect(blockUpgradeCost('bombard', 0)).toBeGreaterThan(blockUpgradeCost('wood', 0))
  })
})

describe('buying a rank', () => {
  it('charges run gold and raises the rank by one', async () => {
    const g = await loadGame()
    g.placeBlock('wood', 1, 0)
    const b = at(g, 1, 0)!
    expect(b.level ?? 0).toBe(0)

    const cost = g.upgradeCostAt(1, 0)
    const before = g.runCoins.value
    expect(g.upgradeBlock(1, 0)).toBe(true)
    expect(b.level).toBe(1)
    expect(g.runCoins.value).toBe(before - cost)
  })

  it('raises max HP and grants the gained hit points immediately', async () => {
    const g = await loadGame()
    g.placeBlock('wood', 1, 0)
    const b = at(g, 1, 0)!
    // A block that has already taken a beating must not read as MORE damaged
    // after the player pays to reinforce it.
    b.hp = Math.round(b.maxHp * 0.5)
    const baseMax = b.maxHp
    const wounded = b.hp

    expect(g.upgradeBlock(1, 0)).toBe(true)
    expect(b.maxHp).toBe(Math.round(BLOCK_DEFS.wood!.hp * upgradeHpMul(1)))
    expect(b.maxHp).toBeGreaterThan(baseMax)
    expect(b.hp).toBe(wounded + (b.maxHp - baseMax))
    expect(b.hp).toBeLessThan(b.maxHp)
  })

  it('adds flat armour, so an upgraded wall takes visibly less per hit', async () => {
    const g = await loadGame()
    g.placeBlock('wood', 1, 0)
    const b = at(g, 1, 0)!
    expect(BLOCK_DEFS.wood!.armor ?? 0).toBe(0)

    const before = b.hp
    g.damageBlockForTest(b, 20, 0.2)
    const plainHit = before - b.hp

    expect(g.upgradeBlock(1, 0)).toBe(true)
    const mid = b.hp
    g.damageBlockForTest(b, 20, 0.2)
    const upgradedHit = mid - b.hp

    expect(upgradedHit).toBe(plainHit - upgradeArmorBonus(1))
  })

  it('refuses once the block is at the ceiling', async () => {
    const g = await loadGame()
    g.placeBlock('wood', 1, 0)
    for (let i = 0; i < MAX_BLOCK_LEVEL; i++) {
      expect(g.upgradeBlock(1, 0)).toBe(true)
    }
    expect(at(g, 1, 0)!.level).toBe(MAX_BLOCK_LEVEL)
    expect(g.canUpgradeBlock(1, 0)).toBe(false)
    expect(g.upgradeBlock(1, 0)).toBe(false)
  })

  it('refuses when the player cannot pay, and takes nothing', async () => {
    const g = await loadGame()
    g.placeBlock('wood', 1, 0)
    g.runCoins.value = g.upgradeCostAt(1, 0) - 1
    const purse = g.runCoins.value

    expect(g.canUpgradeBlock(1, 0)).toBe(false)
    expect(g.upgradeBlock(1, 0)).toBe(false)
    expect(g.runCoins.value).toBe(purse)
    expect(at(g, 1, 0)!.level ?? 0).toBe(0)
  })

  it('upgrades the Gate, which is the one block that cannot be replaced', async () => {
    const g = await loadGame()
    const before = g.gateMaxHp.value
    expect(g.upgradeBlock(0, 0)).toBe(true)
    expect(g.gateMaxHp.value).toBeGreaterThan(before)
  })
})

describe('what a rank is worth to output', () => {
  it('scales weapon damage above the block s printed base', async () => {
    const g = await loadGame()
    g.placeBlock('archer', 1, 0)
    const b = at(g, 1, 0)!
    expect(g.upgradeBlock(1, 0)).toBe(true)

    // The simulation reads `upgradePowerMul(b.level)` into every damage figure;
    // this pins the contract the inspector prints on the card.
    const base = BLOCK_DEFS.archer!.weapon!.damage
    expect(Math.round(base * upgradePowerMul(b.level))).toBeGreaterThan(base)
  })

  it('rounds an economy yield up to at least one extra unit per rank', async () => {
    // A rank that pays +0.8 wood and rounds to +0 would be a purchase with no
    // observable effect, which is the one thing an upgrade may never be.
    for (const id of ['sawmill', 'quarry', 'mint'] as const) {
      const base = BLOCK_DEFS[id]!.economy!
      const amount = base.wood ?? base.stone ?? base.coins ?? 0
      expect(Math.round(amount * upgradePowerMul(1))).toBeGreaterThan(amount)
    }
  })
})

describe('persistence', () => {
  it('round-trips a block rank through the run snapshot', async () => {
    const g = await loadGame()
    g.placeBlock('wood', 1, 0)
    expect(g.upgradeBlock(1, 0)).toBe(true)
    expect(g.upgradeBlock(1, 0)).toBe(true)
    const maxHp = at(g, 1, 0)!.maxHp
    g.saveRunSnapshot()

    expect(g.resumeRun()).toBe(true)
    const restored = at(g, 1, 0)!
    expect(restored.level).toBe(2)
    expect(restored.maxHp).toBe(maxHp)
  })

  it('treats a snapshot written before ranks existed as rank zero', async () => {
    const g = await loadGame()
    const state = await import('@/use/useTowerState')
    g.placeBlock('wood', 1, 0)
    g.saveRunSnapshot()

    // Strip the trailing rank field, exactly as an older client would have.
    const snap = state.getState<{ blocks: unknown[][] }>('ts_run')
    state.setState('ts_run', { ...snap, blocks: snap.blocks.map((t) => t.slice(0, 6)) })

    expect(g.resumeRun()).toBe(true)
    expect(at(g, 1, 0)!.level).toBe(0)
  })
})
