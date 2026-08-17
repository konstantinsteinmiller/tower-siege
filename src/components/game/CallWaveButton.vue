<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { prependBaseUrl } from '@/utils/function'
import {
  isRewardGated, canOfferReward, adInFlight, REWARD_COIN_COST
} from '@/use/useAdGate'
import { coins as walletCoins } from '@/use/useTowerEconomy'
import IconCoin from '@/components/icons/IconCoin.vue'

/**
 * The Call Wave button (reference image 1).
 *
 * During BUILD it shows the countdown to the automatic start and the bonus the
 * player would bank by calling now — turning "wait or go?" into a legible,
 * priced decision rather than a blind gamble.
 *
 * During BATTLE it becomes the 1× / 2× speed toggle (reference image 3), so the
 * corner never holds a dead control.
 */

interface Props {
  phase: 'build' | 'battle' | 'defeat'
  /** Milliseconds left in the build phase. */
  timeLeft: number
  /** Early-call coin bonus as a percentage (0 = none). */
  bonusPct: number
  speed: number
  bossIncoming: boolean
  /** Milliseconds of 2x buff remaining. 0 = not bought. */
  speedBuffLeft?: number
}

const props = withDefaults(defineProps<Props>(), { speedBuffLeft: 0 })
const emit = defineEmits<{
  (e: 'call'): void
  (e: 'toggle-speed'): void
  (e: 'buy-speed'): void
}>()

const { t } = useI18n()

const clock = computed(() => {
  const total = Math.max(0, Math.ceil(props.timeLeft / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

/** The last 10 seconds get an urgency pulse so the auto-start is never a
 *  surprise mid-placement. */
const urgent = computed(() => props.phase === 'build' && props.timeLeft <= 10_000)

// ─── 2x speed ───────────────────────────────────────────────────────────────
//
// Two distinct states, deliberately drawn as two different controls:
//
//   NOT OWNED — an OFFER. Movie icon, the word "2x", and the reward-button
//               colour, so it reads as "watch an ad, get double speed" and not
//               as a toggle that mysteriously does nothing.
//   OWNED     — a toggle with the time left on it, because once it is paid for
//               the player must be able to drop back to 1x without burning the
//               remaining minutes.
//
// The previous control was a bare "1x / 2x" toggle that silently opened a video
// on tap. That is the single most complained-about pattern in portal QA.
const movieSrc = prependBaseUrl('images/icons/movie_128x96.webp')

const buffOwned = computed(() => props.speedBuffLeft > 0)

/** m:ss remaining on the buff. */
const buffClock = computed(() => {
  const total = Math.max(0, Math.ceil(props.speedBuffLeft / 1000))
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${String(sec).padStart(2, '0')}`
})

/** Show the movie badge only when tapping really will play a video. */
const showMovie = computed(() => isRewardGated && !buffOwned.value)

/**
 * Where no video plays, the buff is priced in wallet coins like every other
 * perk — so the badge becomes a coin and a number rather than disappearing and
 * leaving an unlimited free button.
 */
const showPrice = computed(() => !isRewardGated && !buffOwned.value)
const tooPoor = computed(() => showPrice.value && walletCoins.value < REWARD_COIN_COST)

/** A gated build with no ad ready — or an empty wallet — cannot honour it. */
const offerDisabled = computed(
  () => adInFlight.value || tooPoor.value || !canOfferReward.value
)
</script>

<template lang="pug">
  div.call-wave
    //- BUILD: call the wave early for a bonus.
    button.call-wave__btn(
      v-if="phase === 'build'"
      type="button"
      :class="{ 'is-urgent': urgent, 'is-boss': bossIncoming }"
      @click="emit('call')"
    )
      span.call-wave__shadow(aria-hidden="true")
      span.call-wave__body
        span.call-wave__label {{ bossIncoming ? t('hud.callBoss') : t('hud.callWave') }}
        span.call-wave__meta
          span.call-wave__clock {{ clock }}
          span.call-wave__bonus(v-if="bonusPct > 0") +{{ bonusPct }}%

    //- BATTLE, buff not owned: the OFFER. Says what it gives and what it costs.
    button.call-wave__btn.is-speed.is-offer(
      v-else-if="phase === 'battle' && !buffOwned"
      type="button"
      :class="{ 'is-disabled': offerDisabled }"
      :disabled="offerDisabled"
      :aria-label="t('hud.speedOffer')"
      @click="!offerDisabled && emit('buy-speed')"
    )
      span.call-wave__shadow(aria-hidden="true")
      span.call-wave__body
        img.call-wave__movie(v-if="showMovie" :src="movieSrc" alt="" draggable="false")
        svg.call-wave__speed-icon(viewBox="0 0 24 24" fill="currentColor" aria-hidden="true")
          path(d="M4 5 L13 12 L4 19 Z")
          path(d="M12 5 L21 12 L12 19 Z")
        span.call-wave__stack
          span.call-wave__label 2×
          span.call-wave__sub {{ t('hud.speedFor', { n: 5 }) }}
        span.call-wave__price(v-if="showPrice")
          IconCoin.call-wave__price-icon
          | {{ REWARD_COIN_COST }}

    //- BATTLE, buff owned: a plain toggle with the time left on it.
    button.call-wave__btn.is-speed(
      v-else-if="phase === 'battle'"
      type="button"
      :class="{ 'is-fast': speed > 1 }"
      :aria-label="t('hud.speed', { n: speed })"
      @click="emit('toggle-speed')"
    )
      span.call-wave__shadow(aria-hidden="true")
      span.call-wave__body
        svg.call-wave__speed-icon(viewBox="0 0 24 24" fill="currentColor" aria-hidden="true")
          path(d="M4 5 L13 12 L4 19 Z")
          path(v-if="speed > 1" d="M12 5 L21 12 L12 19 Z")
        span.call-wave__stack
          span.call-wave__label {{ speed }}×
          span.call-wave__sub.is-timer {{ buffClock }}
</template>

<style scoped lang="sass">
.call-wave
  pointer-events: auto

.call-wave__btn
  position: relative
  display: inline-flex
  // Floors so the primary action of the build phase can never be crushed.
  min-width: 5.5rem
  min-height: 2.75rem
  padding: 0
  border: 0
  background: none
  cursor: pointer
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  transition: transform 90ms ease-out, filter 90ms ease-out

  &:hover
    filter: brightness(1.08)

  &:active
    transform: translateY(2px) scale(0.96)

.call-wave__shadow
  position: absolute
  inset: 0
  transform: translateY(4px)
  border-radius: clamp(0.5rem, 2.4vw, 0.9rem)
  background-color: #102e7a

.call-wave__body
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 0.1rem
  width: 100%
  padding: clamp(0.28rem, 1.5vw, 0.5rem) clamp(0.6rem, 3.2vw, 1.15rem)
  border: 2px solid #0f1a30
  border-radius: clamp(0.5rem, 2.4vw, 0.9rem)
  background-image: linear-gradient(to bottom, #6ab4ff, #2266ff)

.call-wave__label
  color: #fff
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.05em
  line-height: 1.05
  white-space: nowrap
  font-size: clamp(0.7rem, 3.2vw, 1.05rem)
  text-shadow: 2px 2px 0 #000

.call-wave__meta
  display: flex
  align-items: center
  gap: 0.35em

.call-wave__clock
  color: #cfe4ff
  font-weight: 900
  font-variant-numeric: tabular-nums
  font-size: clamp(0.55rem, 2.4vw, 0.75rem)
  text-shadow: 1px 1px 0 #000

.call-wave__bonus
  // White on a deeper green: the dark-on-light version was the odd one out in a
  // HUD where every other number is white with a hard shadow, and it was the
  // first thing to become unreadable at a small size.
  color: #fff
  background-color: #1f9d4d
  border: 1px solid rgba(8, 40, 20, 0.7)
  border-radius: 999px
  padding: 0 0.4em
  font-weight: 900
  font-size: clamp(0.5rem, 2.2vw, 0.68rem)
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.65)

.call-wave__speed-icon
  width: clamp(0.8rem, 3.4vw, 1.1rem)
  height: clamp(0.8rem, 3.4vw, 1.1rem)
  color: #fff
  flex: 0 0 auto

.call-wave__movie
  flex: 0 0 auto
  width: clamp(1rem, 4.2vw, 1.45rem)
  height: auto
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))
  pointer-events: none

.call-wave__stack
  display: flex
  flex-direction: column
  align-items: center
  line-height: 1

// The price sits AFTER the label, reading "2× for five minutes — 30 coins".
.call-wave__price
  display: inline-flex
  align-items: center
  gap: 0.15em
  color: #ffe066
  font-weight: 900
  font-variant-numeric: tabular-nums
  font-size: clamp(0.62rem, 2.6vw, 0.85rem)
  text-shadow: 2px 2px 0 #000

.call-wave__price-icon
  width: 1.05em
  height: 1.05em
  flex-shrink: 0

.call-wave__sub
  color: #ffeec0
  font-weight: 900
  font-size: clamp(0.42rem, 1.9vw, 0.6rem)
  letter-spacing: 0.02em
  white-space: nowrap
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.7)

  &.is-timer
    color: #cfe4ff
    font-variant-numeric: tabular-nums

// The offer: gold, like every other rewarded affordance in the game.
.call-wave__btn.is-speed.is-offer
  min-width: 5rem

  .call-wave__body
    background-image: linear-gradient(to bottom, #ffcd00, #f7a000)

  .call-wave__shadow
    background-color: #7a4a00

  &.is-disabled
    opacity: 0.5
    filter: grayscale(1)
    cursor: not-allowed

.call-wave__btn.is-speed
  min-width: 3.5rem

  .call-wave__body
    flex-direction: row
    gap: 0.3em
    background-image: linear-gradient(to bottom, #7b8aa8, #3a4560)

  .call-wave__shadow
    background-color: #1c2436

  &.is-fast .call-wave__body
    background-image: linear-gradient(to bottom, #ffb03a, #e06a10)

  &.is-fast .call-wave__shadow
    background-color: #7a3200

// The wave is about to start on its own.
.call-wave__btn.is-urgent .call-wave__body
  animation: cw-urgent 0.7s ease-in-out infinite

// A boss wave is next — recolour so nobody calls it by reflex.
.call-wave__btn.is-boss
  .call-wave__body
    background-image: linear-gradient(to bottom, #ff7a5a, #b3251b)
  .call-wave__shadow
    background-color: #6b1212

@keyframes cw-urgent
  0%, 100%
    box-shadow: 0 0 0 0 rgba(255, 210, 60, 0)
  50%
    box-shadow: 0 0 0 4px rgba(255, 210, 60, 0.55)

// ─── Portrait phone ─────────────────────────────────────────────────────────
//
// It shares its row with the meta cluster and the tech-tree button, and it is
// the widest thing in it. The floors above exist so the primary build-phase
// action can never be crushed — but 5.5 rem plus 1.15 rem of side padding is
// more than "not crushed" needs on a 390 px screen, and the slack was coming
// out of the buttons next to it.
@media (max-width: 30rem) and (orientation: portrait)
  .call-wave__btn
    min-width: 4.6rem

  .call-wave__body
    padding-inline: 0.45rem
    padding-block: 0.24rem

</style>
