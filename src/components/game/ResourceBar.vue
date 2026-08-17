<script setup lang="ts">
import { ref, watch } from 'vue'
import IconGold from '@/components/icons/IconGold.vue'

/**
 * Top-centre resource readout: wood, stone and the run's gold (reference
 * image 1).
 *
 * Each figure pops when it increases, which is what makes a wave-clear payout
 * feel like a payout rather than a silent number change.
 *
 * The third figure is GOLD — the run currency that kills drop and that blocks,
 * upgrades and hulls are priced in. It is not the wallet in the corner, which
 * is COINS and buys tech. They were drawn with the same coin and called the
 * same thing while being two balances the player holds simultaneously, which
 * is why the ingot is here and the coin is not.
 *
 * The icons are drawn large on purpose. This bar is the only readout of the
 * three numbers the whole build phase is spent spending, and at the size it
 * started it lost to the wave banner beside it.
 */

interface Props {
  wood: number
  stone: number
  /** Run gold. */
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
        //- ── Wood ──
        //- A stacked cord seen end-on: two logs under one, with growth rings
        //- and bark. A single log read as a brown pill at this size; the
        //- stack and the rings are what make it unmistakably timber.
        svg.resource-bar__icon(viewBox="0 0 24 24" aria-hidden="true")
          //- Back log, a tone down so the pile has depth.
          g
            rect(x="4" y="13.4" width="12" height="7.2" rx="1" fill="#8a5a2b")
            ellipse(cx="16" cy="17" rx="3.1" ry="3.6" fill="#a9682f" stroke="#5e3a17" stroke-width="1")
            ellipse(cx="16" cy="17" rx="1.7" ry="2" fill="none" stroke="#7a4a20" stroke-width="0.9")
            ellipse(cx="16" cy="17" rx="0.5" ry="0.7" fill="#7a4a20")
          //- Second log of the bottom course, tucked left.
          g
            rect(x="2" y="13.8" width="7" height="6.6" rx="1" fill="#7d5127")
            ellipse(cx="9" cy="17.1" rx="2.7" ry="3.2" fill="#9a5f2b" stroke="#5e3a17" stroke-width="0.9")
            ellipse(cx="9" cy="17.1" rx="1.4" ry="1.7" fill="none" stroke="#6e4219" stroke-width="0.8")
          //- Top log, lit: the brightest thing in the glyph.
          g
            rect(x="5.5" y="5.6" width="11" height="7" rx="1" fill="#c2853f")
            path(d="M5.5 6.6 h11" stroke="#e2ab63" stroke-width="1.1" stroke-linecap="round")
            path(d="M6.4 11.4 h9.5" stroke="#8a5a2b" stroke-width="0.9" stroke-linecap="round")
            ellipse(cx="16.5" cy="9.1" rx="3.3" ry="3.8" fill="#d99a53" stroke="#5e3a17" stroke-width="1.1")
            ellipse(cx="16.5" cy="9.1" rx="2" ry="2.4" fill="none" stroke="#a06a2c" stroke-width="1")
            ellipse(cx="16.5" cy="9.1" rx="0.9" ry="1.1" fill="none" stroke="#a06a2c" stroke-width="0.9")
            ellipse(cx="16.5" cy="9.1" rx="0.35" ry="0.45" fill="#8a5a2b")
        span.resource-bar__value(:class="{ pop: woodPop }") {{ wood }}

      div.resource-bar__item
        //- ── Stone ──
        //- Two faceted blocks, each cut into a lit top plane and a shadowed
        //- face. One flat pentagon read as a grey smudge; the plane break is
        //- what makes it read as cut rock.
        svg.resource-bar__icon(viewBox="0 0 24 24" aria-hidden="true")
          //- Back block.
          g(stroke="#39404a" stroke-width="1" stroke-linejoin="round")
            path(d="M2.6 12.4 L7 9.6 L12.4 11.4 L11.6 17.6 L4.4 18.6 Z" fill="#6a727d")
            path(d="M2.6 12.4 L7 9.6 L12.4 11.4 L7.6 13.4 Z" fill="#8d97a3")
          //- Front block, larger and a step lighter — the one the eye lands on.
          g(stroke="#39404a" stroke-width="1.2" stroke-linejoin="round")
            path(d="M9.4 13 L15.2 8.8 L21.4 11.8 L20.4 19.4 L11.4 20.4 Z" fill="#78818d")
            path(d="M9.4 13 L15.2 8.8 L21.4 11.8 L15.6 14.6 Z" fill="#a7b2bf")
            path(d="M15.6 14.6 L21.4 11.8 L20.4 19.4 Z" fill="#5f6772")
          //- Two chips of quartz catching the light.
          path(d="M13.2 11.4 L15 10.6 L14.4 12 Z" fill="#dfe7f0")
          path(d="M4.8 12.2 L6.4 11.4 L5.9 12.7 Z" fill="#c9d3de")
        span.resource-bar__value(:class="{ pop: stonePop }") {{ stone }}

      div.resource-bar__item.resource-bar__item--coins
        IconGold.resource-bar__icon
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
  gap: clamp(0.6rem, 3.4vw, 1.5rem)
  // A floor so the bar keeps its shape even with single-digit values.
  min-height: 3rem
  padding: clamp(0.3rem, 1.7vw, 0.6rem) clamp(0.7rem, 3.6vw, 1.35rem)
  border: 2px solid #0f1a30
  border-radius: clamp(0.5rem, 2.4vw, 0.9rem)
  background-image: linear-gradient(to bottom, rgba(38, 56, 96, 0.94), rgba(20, 32, 60, 0.94))

.resource-bar__item
  display: flex
  align-items: center
  gap: clamp(0.25rem, 1.3vw, 0.45rem)

.resource-bar__icon
  flex: 0 0 auto
  width: clamp(1.45rem, 6.4vw, 2.15rem)
  height: clamp(1.45rem, 6.4vw, 2.15rem)
  // The glyphs are drawn to fill their box, so a drop shadow is what separates
  // them from whatever sky happens to be behind the bar.
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45))

.resource-bar__value
  color: #fff
  font-weight: 900
  line-height: 1
  font-variant-numeric: tabular-nums
  font-size: clamp(1.12rem, 5.1vw, 1.75rem)
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
    row-gap: 0.1rem
    column-gap: clamp(0.6rem, 4vw, 1.2rem)

  .resource-bar__item--coins
    grid-column: 1 / -1
    justify-content: center
    padding-top: 0.12rem
    border-top: 1px solid rgba(255, 255, 255, 0.14)

</style>
