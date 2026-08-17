<script setup lang="ts">
import { computed } from 'vue'
import { prependBaseUrl } from '@/utils/function'
import {
  isRewardGated, canOfferReward, adInFlight, REWARD_COIN_COST
} from '@/use/useAdGate'
import { coins as walletCoins } from '@/use/useTowerEconomy'
import IconCoin from '@/components/icons/IconCoin.vue'

/**
 * A button for a perk that MAY be paid for with a rewarded video.
 *
 * It always shows the movie icon on gated builds so the player knows the cost
 * before they tap — a reward button that silently opens a video is the single
 * most complained-about pattern in portal QA. On ungated builds (dev, non-CG
 * portals, CG pre-release) the perk is free and the icon is dropped, because
 * showing a video badge for something that never plays a video is a lie.
 *
 * Where no video plays the perk is priced in WALLET coins instead — see
 * `REWARD_COIN_COST`. A perk that is free and unlimited off-portal is not the
 * same perk, it stops being a decision, so the button shows a coin and an
 * amount in place of the video badge and disables itself when the player cannot
 * pay. On a gated build the video is the price and the coins are never touched,
 * so the two can never stack.
 */

interface Props {
  label: string
  tone?: 'gold' | 'green' | 'blue'
  size?: 'sm' | 'md'
  isDisabled?: boolean
  /** Force-hide the badge entirely: no video, no price (for a free retry). */
  free?: boolean
  /** Override the coin price. Defaults to the shared `REWARD_COIN_COST`. */
  coinCost?: number
  /** Override the balance the price is checked against. Defaults to the
   *  wallet, which is what the price is actually taken from. */
  coins?: number
}

const props = withDefaults(defineProps<Props>(), {
  tone: 'gold',
  size: 'md',
  isDisabled: false,
  free: false,
  coinCost: REWARD_COIN_COST,
  coins: undefined
})

const purse = computed(() => props.coins ?? walletCoins.value)

defineEmits(['click'])

const movieSrc = prependBaseUrl('images/icons/movie_128x96.webp')

/** Show the badge only when tapping this really will play a video. */
const showMovie = computed(() => isRewardGated && !props.free)

/** A coin price applies only where there is no video to charge instead. */
const showCoin = computed(() => !isRewardGated && !props.free && props.coinCost > 0)

const tooPoor = computed(() => showCoin.value && purse.value < props.coinCost)

/** A gated build with no ad ready cannot honour the perk, so the button is
 *  disabled rather than failing after the tap. */
const disabled = computed(() =>
  props.isDisabled || adInFlight.value || tooPoor.value || (!props.free && !canOfferReward.value)
)
</script>

<template lang="pug">
  button.f-reward-button(
    type="button"
    :class="[`tone-${tone}`, `size-${size}`, { 'is-disabled': disabled }]"
    :disabled="disabled"
    @click="!disabled && $emit('click')"
  )
    span.f-reward-button__shadow(aria-hidden="true")
    span.f-reward-button__body
      img.f-reward-button__movie(
        v-if="showMovie"
        :src="movieSrc"
        alt=""
        draggable="false"
      )
      IconCoin.f-reward-button__coin(v-else-if="showCoin")
      span.f-reward-button__label
        slot {{ label }}
      span.f-reward-button__price(v-if="showCoin") {{ coinCost }}
</template>

<style scoped lang="sass">
.f-reward-button__coin
  width: 1.05em
  height: 1.05em
  flex-shrink: 0

.f-reward-button__price
  font-weight: 900
  color: #ffe066
  font-variant-numeric: tabular-nums
  text-shadow: 2px 2px 0 #000

.f-reward-button
  position: relative
  display: inline-flex
  align-items: center
  justify-content: center
  // Floors so the control survives any parent layout and stays tappable.
  min-width: 5rem
  min-height: 2.75rem
  padding: 0
  border: 0
  background: none
  cursor: pointer
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  transition: transform 90ms ease-out, filter 90ms ease-out

  &:hover:not(.is-disabled)
    filter: brightness(1.08)

  &:active:not(.is-disabled)
    transform: translateY(2px) scale(0.97)

  &.is-disabled
    opacity: 0.5
    filter: grayscale(1)
    cursor: not-allowed

.f-reward-button__shadow
  position: absolute
  inset: 0
  transform: translateY(3px)
  border-radius: clamp(0.6rem, 2.6vw, 1.1rem)

.f-reward-button__body
  position: relative
  display: flex
  align-items: center
  justify-content: center
  gap: clamp(0.3rem, 1.6vw, 0.55rem)
  width: 100%
  min-height: 2.75rem
  padding: clamp(0.4rem, 1.8vw, 0.7rem) clamp(0.7rem, 3.4vw, 1.35rem)
  border: 2px solid #0f1a30
  border-radius: clamp(0.6rem, 2.6vw, 1.1rem)

.f-reward-button__movie
  flex: 0 0 auto
  width: clamp(1.1rem, 4.6vw, 1.6rem)
  height: auto
  // The icon is the price tag; it must not be dimmed into invisibility on the
  // gold body.
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))
  pointer-events: none

.f-reward-button__label
  color: #fff
  font-weight: 900
  text-transform: uppercase
  white-space: nowrap
  line-height: 1.15
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

.size-md .f-reward-button__label
  font-size: clamp(0.8rem, 3.4vw, 1.2rem)

.size-sm
  min-height: 2.25rem

  .f-reward-button__body
    min-height: 2.25rem
    padding: clamp(0.25rem, 1.2vw, 0.45rem) clamp(0.5rem, 2.6vw, 0.9rem)

  .f-reward-button__label
    font-size: clamp(0.68rem, 2.8vw, 0.95rem)

.tone-gold
  .f-reward-button__shadow
    background-color: #1a2b4b
  .f-reward-button__body
    background-image: linear-gradient(to bottom, #ffcd00, #f7a000)

.tone-green
  .f-reward-button__shadow
    background-color: #0e5c2c
  .f-reward-button__body
    background-image: linear-gradient(to bottom, #67e08a, #1f9d4d)

.tone-blue
  .f-reward-button__shadow
    background-color: #102e7a
  .f-reward-button__body
    background-image: linear-gradient(to bottom, #50aaff, #2266ff)
</style>
