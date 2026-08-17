import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The rewarded ad allowance.
 *
 * Portals reject a game that hammers the rewarded placement, and a player who
 * can watch six ads back to back will — then resent the game for letting them.
 * The ceiling has to hold whether the caller came through a button or not.
 */

const loadGate = async (opts: { crazy?: boolean; fullRelease?: boolean; granted?: boolean } = {}) => {
  vi.resetModules()
  localStorage.clear()
  vi.doMock('@/use/useUser', () => ({ isCrazyWeb: opts.crazy ?? true }))
  vi.doMock('@/use/useMatch', () => ({ isCrazyGamesFullRelease: opts.fullRelease ?? true }))
  const showRewardedAd = vi.fn(async () => opts.granted ?? true)
  vi.doMock('@/use/useAds', async () => {
    const { ref } = await import('vue')
    return { isRewardedReady: ref(true), showRewardedAd }
  })
  const mod = await import('@/use/useAdGate')
  mod.__resetRewardWindow()
  return { ...mod, showRewardedAd }
}

beforeEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('rewarded rate limit', () => {
  it('allows six requests in a window', async () => {
    const gate = await loadGate()
    for (let i = 0; i < 6; i++) {
      await expect(gate.claimReward(vi.fn()), `request ${i + 1}`).resolves.toBe(true)
    }
    expect(gate.showRewardedAd).toHaveBeenCalledTimes(6)
  })

  it('refuses the seventh without touching the provider', async () => {
    const gate = await loadGate()
    for (let i = 0; i < 6; i++) await gate.claimReward(vi.fn())
    const grant = vi.fn()
    await expect(gate.claimReward(grant)).resolves.toBe(false)
    expect(grant).not.toHaveBeenCalled()
    // The seventh must not reach the network at all.
    expect(gate.showRewardedAd).toHaveBeenCalledTimes(6)
  })

  it('counts requests, not grants — a no-fill still spends allowance', async () => {
    // Otherwise a player could farm dismissals to bypass the ceiling entirely.
    const gate = await loadGate({ granted: false })
    for (let i = 0; i < 6; i++) {
      await expect(gate.claimReward(vi.fn())).resolves.toBe(false)
    }
    expect(gate.isRewardRateLimited()).toBe(true)
  })

  it('hides every reward button once the allowance is gone', async () => {
    const gate = await loadGate()
    expect(gate.canOfferReward.value).toBe(true)
    for (let i = 0; i < 6; i++) await gate.claimReward(vi.fn())
    expect(gate.canOfferReward.value).toBe(false)
  })

  it('frees a slot once the oldest request ages out', async () => {
    vi.useFakeTimers()
    const gate = await loadGate()
    for (let i = 0; i < 6; i++) await gate.claimReward(vi.fn())
    expect(gate.isRewardRateLimited()).toBe(true)
    expect(gate.rewardCooldownLeft()).toBeGreaterThan(290)

    vi.advanceTimersByTime(4 * 60 * 1000)
    expect(gate.isRewardRateLimited()).toBe(true)

    vi.advanceTimersByTime(61 * 1000)
    expect(gate.isRewardRateLimited()).toBe(false)
    expect(gate.rewardCooldownLeft()).toBe(0)
  })

  it('does not limit an ungated build — nothing is being requested', async () => {
    // Off a gated build the ceiling is the WALLET, not the ad window: no video
    // is asked for, so the rolling allowance never fills.
    const gate = await loadGate({ crazy: false, fullRelease: false })
    const economy = await import('@/use/useTowerEconomy')
    economy.default().addCoins(20 * gate.REWARD_COIN_COST)

    for (let i = 0; i < 20; i++) {
      await expect(gate.claimReward(vi.fn())).resolves.toBe(true)
    }
    expect(gate.showRewardedAd).not.toHaveBeenCalled()
    expect(gate.canOfferReward.value).toBe(true)
  })
})
