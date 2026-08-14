import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

/**
 * Who gets to tell the player their ad blocker is on.
 *
 * CrazyGames renders its own ad-blocker notice, so the shared in-game
 * `AdsBlockedModal` must stay down on those builds — two stacked popups is a
 * CG QA rejection. Every other platform relies on ours, so it must still fire
 * there.
 *
 * The whole behaviour hangs on one provider flag and one `!` in `useAds`, and
 * nothing exercised it: dropping `ownsAdBlockUi` from the CrazyGames provider,
 * or inverting that guard, changes nothing visible in play and surfaces only
 * as a review rejection weeks later.
 */

const mockProvider = {
  name: 'mock-test',
  isReady: ref(true),
  isRewardedReady: ref(true),
  isInterstitialReady: ref(true),
  isAdsBlocked: ref(true),
  // Reassigned per test; `undefined` means "we do not own the UI".
  ownsAdBlockUi: undefined as boolean | undefined,
  init: vi.fn(async () => {}),
  // A blocked rewarded resolves false — that is the path that surfaces the modal.
  showRewardedAd: vi.fn(async () => false),
  showMidgameAd: vi.fn(async () => {})
}

vi.mock('@/platforms/resolveAdProvider', () => ({
  resolveAdProvider: () => mockProvider
}))

const loadAds = async () => {
  vi.resetModules()
  return import('@/use/useAds')
}

beforeEach(() => {
  localStorage.clear()
  mockProvider.isAdsBlocked.value = true
  mockProvider.ownsAdBlockUi = undefined
})

describe('ad-blocker modal ownership', () => {
  it('stays down when the platform shows its own notice', async () => {
    mockProvider.ownsAdBlockUi = true
    const ads = await loadAds()

    await ads.showRewardedAd()

    expect(ads.isAdsBlockedModalShown.value).toBe(false)
  })

  it('fires on platforms that have no notice of their own', async () => {
    mockProvider.ownsAdBlockUi = undefined
    const ads = await loadAds()

    await ads.showRewardedAd()

    expect(ads.isAdsBlockedModalShown.value).toBe(true)
    ads.dismissAdsBlockedModal()
    expect(ads.isAdsBlockedModalShown.value).toBe(false)
  })

  it('stays down when nothing is blocked at all', async () => {
    mockProvider.isAdsBlocked.value = false
    mockProvider.showRewardedAd = vi.fn(async () => true)
    const ads = await loadAds()

    await ads.showRewardedAd()

    expect(ads.isAdsBlockedModalShown.value).toBe(false)
    mockProvider.showRewardedAd = vi.fn(async () => false)
  })
})

describe('the CrazyGames provider claims that ownership', () => {
  it('declares ownsAdBlockUi, which is what suppresses the shared modal', async () => {
    vi.resetModules()
    vi.doMock('@/use/useCrazyGames', () => ({
      isSdkActive: ref(true),
      isCrazyAdsBlocked: ref(true),
      showRewardedAd: async () => false,
      showMidgameAd: async () => {}
    }))
    vi.doMock('@/use/useMatch', () => ({ isCrazyGamesFullRelease: true }))

    const { createCrazyGamesProvider } = await import('@/use/ads/CrazyGamesProvider')
    expect(createCrazyGamesProvider().ownsAdBlockUi).toBe(true)
  })
})
