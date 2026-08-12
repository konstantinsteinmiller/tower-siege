<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * Top-centre resource readout: wood, stone and the run's banked coins
 * (reference image 1).
 *
 * Each figure pops when it increases, which is what makes a wave-clear payout
 * feel like a payout rather than a silent number change.
 */

interface Props {
  wood: number
  stone: number
  coins: number
}

const props = defineProps<Props>()

const woodPop = ref(false)
const stonePop = ref(false)
const coinPop = ref(false)

/** Retrigger a CSS animation by dropping the class for one frame. */
const pop = (flag: { value: boolean }): void => {
  flag.value = false
  requestAnimationFrame(() => { flag.value = true })
}

watch(() => props.wood, (n, o) => { if (n > o) pop(woodPop) })
watch(() => props.stone, (n, o) => { if (n > o) pop(stonePop) })
watch(() => props.coins, (n, o) => { if (n > o) pop(coinPop) })
</script>

<template lang="pug">
  div.resource-bar
    span.resource-bar__shadow(aria-hidden="true")
    div.resource-bar__body
      div.resource-bar__item
        //- Log glyph.
        svg.resource-bar__icon(viewBox="0 0 24 24" aria-hidden="true")
          ellipse(cx="6" cy="12" rx="3" ry="6" fill="#8a5a2b")
          rect(x="6" y="6" width="12" height="12" fill="#a9682f")
          ellipse(cx="18" cy="12" rx="3" ry="6" fill="#d99a53")
          ellipse(cx="18" cy="12" rx="1.7" ry="3.4" fill="none" stroke="#7a4a20" stroke-width="1")
        span.resource-bar__value(:class="{ pop: woodPop }") {{ wood }}

      div.resource-bar__item
        //- Stone glyph.
        svg.resource-bar__icon(viewBox="0 0 24 24" aria-hidden="true")
          path(d="M4 16 L7 7 L17 6 L20 15 L13 19 Z" fill="#767e88" stroke="#4a5058" stroke-width="1.4" stroke-linejoin="round")
          path(d="M7 7 L13 11 L20 15" fill="none" stroke="#a8b2bd" stroke-width="1.2")
        span.resource-bar__value(:class="{ pop: stonePop }") {{ stone }}

      div.resource-bar__item.resource-bar__item--coins
        //- Coin glyph.
        svg.resource-bar__icon(viewBox="0 0 24 24" aria-hidden="true")
          circle(cx="12" cy="12" r="9" fill="#e0a81c" stroke="#8a6410" stroke-width="1.6")
          circle(cx="12" cy="12" r="5.5" fill="none" stroke="#ffe066" stroke-width="1.6")
          path(d="M12 8.5 v7 M10 10.5 h4 M10 13.5 h4" stroke="#8a6410" stroke-width="1.4" stroke-linecap="round")
        span.resource-bar__value(class="is-gold" :class="{ pop: coinPop }") {{ coins }}
</template>

<style scoped lang="sass">
.resource-bar
  position: relative
  pointer-events: none
  max-width: 92vw

.resource-bar__shadow
  position: absolute
  inset: 0
  transform: translateY(3px)
  border-radius: clamp(0.5rem, 2.4vw, 0.9rem)
  background-color: #0d1830

.resource-bar__body
  position: relative
  display: flex
  align-items: center
  gap: clamp(0.4rem, 2.4vw, 1rem)
  // A floor so the bar keeps its shape even with single-digit values.
  min-height: 1.9rem
  padding: clamp(0.2rem, 1.2vw, 0.4rem) clamp(0.5rem, 2.8vw, 1rem)
  border: 2px solid #0f1a30
  border-radius: clamp(0.5rem, 2.4vw, 0.9rem)
  background-image: linear-gradient(to bottom, rgba(38, 56, 96, 0.94), rgba(20, 32, 60, 0.94))

.resource-bar__item
  display: flex
  align-items: center
  gap: clamp(0.15rem, 0.9vw, 0.3rem)

.resource-bar__icon
  flex: 0 0 auto
  width: clamp(0.9rem, 4vw, 1.35rem)
  height: clamp(0.9rem, 4vw, 1.35rem)

.resource-bar__value
  color: #fff
  font-weight: 900
  line-height: 1
  font-variant-numeric: tabular-nums
  font-size: clamp(0.7rem, 3.2vw, 1.1rem)
  text-shadow: 2px 2px 0 #000
  display: inline-block

  &.is-gold
    color: #ffd93c

  &.pop
    animation: res-pop 0.34s cubic-bezier(0.34, 1.56, 0.64, 1)

@keyframes res-pop
  0%
    scale: 1
  35%
    scale: 1.32
  100%
    scale: 1

// ─── Portrait phone ─────────────────────────────────────────────────────────
//
// The top row runs wave-status | resources | wallet across the full width, and
// on a 390 px screen those three already consume 360 px of it — before the
// numbers reach four digits. Coins are the natural thing to move: wood and
// stone are the materials being spent right now, while coins are the run's
// banked currency, so splitting them off separates two different kinds of
// number as well as buying the row back ~50 px.
@media (max-width: 30rem) and (orientation: portrait)
  // Grid, not a wrapping flex row. `flex-basis: 100%` on the coin item makes it
  // contribute a full container width to max-content, so the pill stayed as
  // wide as it was before and only got taller. A grid sizes its columns from
  // the content that actually sits in them, and a spanning item does not drag
  // that width up with it.
  .resource-bar__body
    display: grid
    grid-template-columns: auto auto
    justify-content: center
    align-items: center
    row-gap: 0.06rem
    column-gap: clamp(0.4rem, 3vw, 0.8rem)

  .resource-bar__item--coins
    grid-column: 1 / -1
    justify-content: center
    padding-top: 0.12rem
    border-top: 1px solid rgba(255, 255, 255, 0.14)

</style>
