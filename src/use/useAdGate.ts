import { ref, computed } from 'vue'
import { isCrazyWeb } from '@/use/useUser'
import { isCrazyGamesFullRelease } from '@/use/useMatch'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import useTowerEconomy, { coins } from '@/use/useTowerEconomy'

/**
 * ─── Reward gating ──────────────────────────────────────────────────────────
 *
 * Some perks (double coins, rebuild-and-continue, a reinforced hand of blocks)
 * are paid for with a rewarded video — but ONLY on the CrazyGames full release.
 *
 * Everywhere else they are simply free. That covers local dev, every non-CG
 * portal, and the CG pre-release build used for QA: on those, a gate would
 * either be untestable (no ad inventory) or would degrade a build the player
 * never agreed to watch ads on. One predicate, checked in one place, so a
 * perk can never accidentally ship gated on a build that has no ads.
 */
export const isRewardGated = isCrazyWeb && isCrazyGamesFullRelease

// ─── The price where there is no video ──────────────────────────────────────
//
// "Free" was the wrong fallback. On every build that is not the CG full release
// — the CG pre-release QA build most of all — a perk with no video behind it
// became an unlimited button: triple the wave, reinforce the hand, rebuild the
// tower, again and again, for nothing. That is not the same perk balanced
// differently, it is the decision removed, and it makes the build QA plays
// unrepresentative of the one players get.
//
// So these builds charge WALLET coins instead: the same currency the tech tree
// spends, taken from the badge in the corner, so every claim costs the player
// something they wanted for something else.

/** Wallet coins a perk costs on a build where no rewarded video plays. */
export const REWARD_COIN_COST = 30

/** True where perks are paid for in coins rather than with a video. */
export const isRewardCoinPriced = !isRewardGated

/** Can the player pay the coin price right now? Always true on a gated build,
 *  where the video is the price and the wallet is not touched. */
export const canPayRewardPrice = computed(
  () => isRewardGated || coins.value >= REWARD_COIN_COST
)

// ─── Rewarded rate limit ────────────────────────────────────────────────────
//
// A hard ceiling on how many rewarded videos may be REQUESTED in a rolling
// window, independent of what the provider's own readiness API says.
//
// Two reasons this has to live on our side. Portals treat a game that hammers
// the rewarded placement as abusive inventory use and reject it; and a player
// who can watch ads back to back will, then resent the game for letting them.
// The limit counts REQUESTS, not grants: a dismissed or unfilled ad still cost
// the network a call, and not counting it would let a player farm no-fills.

/** Rolling window length, ms. */
const REWARD_WINDOW_MS = 5 * 60 * 1000
/** Requests allowed inside one window. */
const REWARD_WINDOW_MAX = 6

/** Timestamps of rewarded requests inside the current window, oldest first. */
let rewardRequests: number[] = []
/** Bumped on every change so the `canOfferReward` computed re-evaluates. */
const rewardTick = ref(0)

const pruneRewardWindow = (now: number): void => {
  const cutoff = now - REWARD_WINDOW_MS
  if (rewardRequests.length > 0 && rewardRequests[0]! <= cutoff) {
    rewardRequests = rewardRequests.filter((t) => t > cutoff)
    rewardTick.value++
  }
}

/** True while the player has spent their rewarded allowance for this window. */
export const isRewardRateLimited = (): boolean => {
  void rewardTick.value
  pruneRewardWindow(Date.now())
  return rewardRequests.length >= REWARD_WINDOW_MAX
}

/** Seconds until the next rewarded slot frees up. 0 when one is available. */
export const rewardCooldownLeft = (): number => {
  const now = Date.now()
  pruneRewardWindow(now)
  if (rewardRequests.length < REWARD_WINDOW_MAX) return 0
  const oldest = rewardRequests[0]!
  return Math.max(0, Math.ceil((oldest + REWARD_WINDOW_MS - now) / 1000))
}

const recordRewardRequest = (): void => {
  rewardRequests.push(Date.now())
  rewardTick.value++
}

/** Test seam: forget every recorded request. */
export const __resetRewardWindow = (): void => {
  rewardRequests = []
  rewardTick.value++
}

/**
 * Run `grant` behind a rewarded video where the build calls for it.
 *
 * Returns whether the perk was granted. On a gated build a no-fill, a dismissed
 * ad or a blocked ad all resolve to `false` and grant nothing — the caller is
 * responsible for leaving its UI in a sane state, which is why `inFlight` is
 * exposed rather than each call site inventing its own busy flag.
 *
 * The rate limit is enforced here as well as in `canOfferReward`, because a
 * button is not the only way into this function and a limit that only hides UI
 * is not a limit.
 */
export const claimReward = async (
  grant: () => void,
  opts: { free?: boolean } = {}
): Promise<boolean> => {
  if (!isRewardGated) {
    // No video to charge, so the wallet is the price. `free` is for the perks
    // that must never be gated at all — the way OUT of a finished run.
    if (!opts.free && !useTowerEconomy().spendCoins(REWARD_COIN_COST)) return false
    grant()
    return true
  }
  if (adInFlight.value) return false
  if (isRewardRateLimited()) return false
  adInFlight.value = true
  recordRewardRequest()
  try {
    const ok = await showRewardedAd()
    if (ok) grant()
    return ok
  } finally {
    adInFlight.value = false
  }
}

/** True while a gated reward is waiting on its video. */
export const adInFlight = ref(false)

/**
 * Can this perk be offered right now?
 *
 * On an ungated build: always. On a gated build: only when the provider
 * actually has a rewarded ad ready AND the player has rewarded allowance left
 * in the current window. Offering a button that then fails reads as the game
 * being broken, which is exactly as true for a rate-limited refusal as for a
 * no-fill.
 */
export const canOfferReward = computed(
  () => !isRewardGated || (isRewardedReady.value && !isRewardRateLimited())
)

// ─── Interstitial pacing ────────────────────────────────────────────────────

/** Minimum gap between interstitials, ms. */
const INTERSTITIAL_MIN_GAP_MS = 120_000

let lastInterstitialAt = 0

/**
 * True when enough time has passed to show another interstitial.
 *
 * The first call of a session returns false: an interstitial in the opening
 * seconds — before the player has seen the game work — is the single most
 * reliable way to lose them.
 */
export const canShowInterstitial = (): boolean => {
  if (lastInterstitialAt === 0) {
    lastInterstitialAt = Date.now()
    return false
  }
  return Date.now() - lastInterstitialAt >= INTERSTITIAL_MIN_GAP_MS
}

/** Record that an interstitial was just shown, restarting the 120 s clock. */
export const markInterstitialShown = (): void => {
  lastInterstitialAt = Date.now()
}

/** Seconds until the next interstitial is allowed — debug/telemetry only. */
export const interstitialCooldownLeft = (): number =>
  Math.max(0, INTERSTITIAL_MIN_GAP_MS - (Date.now() - lastInterstitialAt)) / 1000

/** Test seam: reset the pacing clock. */
export const __resetInterstitialClock = (): void => { lastInterstitialAt = 0 }
