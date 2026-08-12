<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ShapeTile from '@/components/game/ShapeTile.vue'
import { shapeDef, shapeCost, shapeBlockTypes, shapeHasRoof, shapeBounds } from '@/game/shapes'
import { blockDef } from '@/game/blocks'
import { isMobileLandscape, windowWidth } from '@/use/useUser'

/**
 * The build hand (reference images 1 / 3).
 *
 * Four offered SHAPES rather than a full block palette. The player builds with
 * what they are dealt, which turns every placement into a small spatial puzzle
 * and stops the optimal tower from being the same tower every run.
 *
 * A shape the player cannot afford is dimmed but never hidden — "what am I
 * saving for, and how close am I" is the question the tray exists to answer.
 *
 * Layout: horizontal strip on portrait/desktop, vertical rail on a landscape
 * phone so it never eats the short axis.
 */

interface Props {
  /** Offer slot index currently armed, or null. */
  selected: number | null
  /** The four offered shape ids. */
  offers: string[]
  /** Per-slot reinforced flag — parallel to `offers`. */
  enhanced?: boolean[]
  wood: number
  stone: number
  /** Run gold — the third build currency, spent by the tech-gated pieces. */
  coins: number
  /** Whether the shared reroll charge is off cooldown. */
  rerollReady?: boolean
  /** Whole seconds until the reroll charge returns. */
  rerollSeconds?: number
}

const props = withDefaults(defineProps<Props>(), {
  enhanced: () => [],
  rerollReady: true,
  rerollSeconds: 0
})

const emit = defineEmits<{
  (e: 'select', slot: number | null): void
  (e: 'reroll', slot: number): void
}>()

const { t } = useI18n()

/**
 * Thumbnail size, derived from the width the tray ACTUALLY gets.
 *
 * Sizing off the viewport was wrong: the tray is one column of a three-column
 * bottom bar, so on a 500 px phone it receives about 230 px while the viewport
 * formula sized its tiles for 500. Two of the four offers then sat outside the
 * scroll area — invisible, with nothing to suggest they were there. The hand is
 * the core decision of the build phase, so it has to fit.
 *
 * Measured rather than estimated, because the meta cluster beside it wraps and
 * changes width as buttons appear.
 */
const scrollEl = ref<HTMLElement | null>(null)
const trackW = ref(0)
let ro: ResizeObserver | null = null

onMounted(() => {
  if (!scrollEl.value || typeof ResizeObserver === 'undefined') return
  ro = new ResizeObserver(([entry]) => {
    trackW.value = entry?.contentRect.width ?? 0
  })
  ro.observe(scrollEl.value)
})

onUnmounted(() => {
  ro?.disconnect()
  ro = null
})

const tileSize = computed(() => {
  // A 44 px floor is the tap-target minimum; below that the tile stops being
  // reliably hittable and horizontal scrolling is the lesser evil.
  const viewportCap = Math.min(64, windowWidth.value * 0.125)
  if (isMobileLandscape.value || trackW.value <= 0) {
    return Math.round(Math.max(44, viewportCap))
  }
  const gaps = 3 * 10 + 8
  const perSlot = (trackW.value - gaps) / props.offers.length
  return Math.round(Math.max(44, Math.min(viewportCap, perSlot)))
})

interface Entry {
  slot: number
  shapeId: string
  wood: number
  stone: number
  coins: number
  affordable: boolean
  roof: boolean
  enhanced: boolean
  /** Translated display name, derived from the piece's dominant block type. */
  name: string
}

const entries = computed<Entry[]>(() =>
  props.offers.map((shapeId, slot) => {
    const cost = shapeCost(shapeId)
    return {
      slot,
      shapeId,
      wood: cost.wood,
      stone: cost.stone,
      coins: cost.coins,
      affordable:
        props.wood >= cost.wood && props.stone >= cost.stone && props.coins >= cost.coins,
      roof: shapeHasRoof(shapeId),
      enhanced: props.enhanced[slot] === true,
      // Shape ids (`w1`, `cannonMount`, `sL`) are NOT block ids, so they have
      // no `blocks.names.*` entry — feeding one straight to `t()` leaked the
      // raw key into the button's accessible name. The dominant block type is
      // what the piece is actually made of, and it does have a translation.
      name: t(`blocks.names.${shapeBlockTypes(shapeId)[0] ?? 'wood'}`)
    }
  })
)

const onTile = (slot: number): void => {
  // Tapping the armed tile again disarms it — the escape hatch that stops a
  // player from being stuck in placement mode with no obvious way out.
  emit('select', props.selected === slot ? null : slot)
}

/**
 * Reroll one offer.
 *
 * The button sits ON the tile rather than beside the tray, because "swap THIS
 * piece" is the question the player is actually asking. `stop` keeps the tap
 * from also arming the tile underneath it.
 */
const onReroll = (slot: number): void => {
  if (!props.rerollReady) return
  emit('reroll', slot)
}

// ─── Info box ───────────────────────────────────────────────────────────────
//
// Hover on a pointer device, long-press on touch. It reports the exact resource
// requirement and what the piece is made of, because the thumbnail alone can't
// say "this costs 45 wood AND 45 stone".

const infoSlot = ref<number | null>(null)
let pressTimer: ReturnType<typeof setTimeout> | null = null

const openInfo = (slot: number): void => { infoSlot.value = slot }
const closeInfo = (): void => { infoSlot.value = null }

const onPressStart = (slot: number): void => {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = setTimeout(() => { pressTimer = null; openInfo(slot) }, 380)
}
const onPressEnd = (): void => {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
}

const infoEntry = computed(() => {
  if (infoSlot.value == null) return null
  const e = entries.value[infoSlot.value]
  if (!e) return null
  const { w, h } = shapeBounds(e.shapeId)
  return {
    ...e,
    // Named after its dominant block, plus the footprint — "Wood Crate 2×2"
    // is far more useful than a made-up piece name nobody will learn.
    footprint: `${w}×${h}`,
    parts: shapeBlockTypes(e.shapeId).map((id) => ({
      id,
      name: t(`blocks.names.${id}`),
      count: shapeDef(e.shapeId).cells.filter(([, , tId]) => tId === id).length,
      hp: blockDef(id).hp
    }))
  }
})
</script>

<template lang="pug">
  div.build-tray(:class="{ 'is-rail': isMobileLandscape }")
    //- ── Info box ────────────────────────────────────────────────────────
    Transition(name="info")
      div.build-tray__info(v-if="infoEntry")
        div.build-tray__info-head
          span.build-tray__info-name {{ infoEntry.name }}
          span.build-tray__info-size {{ infoEntry.footprint }}
        ul.build-tray__parts
          li(v-for="part in infoEntry.parts" :key="part.id")
            span.build-tray__part-n ×{{ part.count }}
            span.build-tray__part-name {{ part.name }}
            span.build-tray__part-hp {{ part.hp }} {{ t('blocks.stats.hp') }}
        div.build-tray__info-cost
          span.build-tray__cost-item(v-if="infoEntry.wood > 0" :class="{ 'is-short': wood < infoEntry.wood }")
            i.build-tray__dot.is-wood
            | {{ infoEntry.wood }} {{ t('resources.wood') }}
          span.build-tray__cost-item(v-if="infoEntry.stone > 0" :class="{ 'is-short': stone < infoEntry.stone }")
            i.build-tray__dot.is-stone
            | {{ infoEntry.stone }} {{ t('resources.stone') }}
          span.build-tray__cost-item(v-if="infoEntry.coins > 0" :class="{ 'is-short': coins < infoEntry.coins }")
            i.build-tray__dot.is-gold
            | {{ infoEntry.coins }} {{ t('resources.coins') }}
        div.build-tray__roof-note(v-if="infoEntry.roof") {{ t('blocks.roofNote') }}
        div.build-tray__enhanced-note(v-if="infoEntry.enhanced") {{ t('blocks.enhancedNote') }}

    div.build-tray__scroll(ref="scrollEl")
      div.build-tray__slot(v-for="e in entries" :key="e.slot")
        button.build-tray__tile(
          type="button"
          :class="{ 'is-selected': selected === e.slot, 'is-poor': !e.affordable, 'is-enhanced': e.enhanced }"
          :style="{ '--tile-w': tileSize + 'px' }"
          :aria-label="e.name"
          @click="onTile(e.slot)"
          @pointerenter="openInfo(e.slot)"
          @pointerleave="closeInfo"
          @pointerdown="onPressStart(e.slot)"
          @pointerup="onPressEnd"
          @pointercancel="onPressEnd"
        )
          span.build-tray__shadow(aria-hidden="true")
          span.build-tray__body
            //- Reinforced pieces get a slow sweep of light so they read as
            //- "better" at a glance without needing a legend.
            span.build-tray__shine(v-if="e.enhanced" aria-hidden="true")
            ShapeTile(:shape-id="e.shapeId" :size="tileSize")
            //- Roofed pieces cap their column for good, so they are flagged on
            //- the tile itself rather than only in the info box.
            span.build-tray__roof-badge(v-if="e.roof") ⌂
          //- Price chips. Only the resources the shape actually costs are shown,
          //- so a wood-only piece never displays a misleading "0 stone". A piece
          //- can carry all three at once, which is why the row is width-capped
          //- to the thumbnail below rather than allowed to widen the tile.
          span.build-tray__cost
            span.build-tray__cost-item(v-if="e.wood > 0" :class="{ 'is-short': wood < e.wood }")
              i.build-tray__dot.is-wood
              | {{ e.wood }}
            span.build-tray__cost-item(v-if="e.stone > 0" :class="{ 'is-short': stone < e.stone }")
              i.build-tray__dot.is-stone
              | {{ e.stone }}
            span.build-tray__cost-item(v-if="e.coins > 0" :class="{ 'is-short': coins < e.coins }")
              i.build-tray__dot.is-gold
              | {{ e.coins }}

        //- Swap this piece for a fresh draw. One charge is shared across all
        //- four slots, so the countdown is the same everywhere — it is drawn
        //- per tile only so the player can aim it.
        button.build-tray__reroll(
          type="button"
          :class="{ 'is-cooling': !rerollReady }"
          :disabled="!rerollReady"
          :aria-label="t('blocks.reroll')"
          @click.stop="onReroll(e.slot)"
          @pointerdown.stop
          @pointerenter.stop
        )
          svg(v-if="rerollReady" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round")
            path(d="M20 11a8 8 0 1 0-2.3 6.3")
            path(d="M20 4v7h-7")
          span.build-tray__reroll-timer(v-else) {{ rerollSeconds }}
</template>

<style scoped lang="sass">
.build-tray
  position: relative
  pointer-events: auto
  max-width: 100%

.build-tray__scroll
  display: flex
  flex-direction: row
  align-items: flex-end
  gap: clamp(0.25rem, 1.6vw, 0.6rem)
  padding: clamp(0.3rem, 1.6vw, 0.6rem)
  border: 2px solid #0f1a30
  border-radius: clamp(0.6rem, 3vw, 1.1rem)
  background-image: linear-gradient(to bottom, rgba(38, 56, 96, 0.92), rgba(18, 30, 56, 0.92))
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45)
  overflow-x: auto
  overflow-y: hidden
  overscroll-behavior-x: contain
  scrollbar-width: none
  -webkit-overflow-scrolling: touch

  &::-webkit-scrollbar
    display: none

// Landscape phone: become a vertical rail so the tray never eats the short axis.
.build-tray.is-rail .build-tray__scroll
  flex-direction: column
  align-items: center
  overflow-x: hidden
  overflow-y: auto
  max-height: 100%

.build-tray__slot
  position: relative
  flex: 0 0 auto
  display: flex
  flex-direction: column
  align-items: center
  // Room for the reroll pip, which overhangs the tile's top-right corner.
  padding-top: 0.35rem

.build-tray__tile
  position: relative
  flex: 0 0 auto
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.15rem
  // Floors so a tile can never be squeezed into an untappable sliver.
  min-width: 2.75rem
  min-height: 2.75rem
  padding: 0
  border: 0
  background: none
  cursor: pointer
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  transition: transform 110ms ease-out, filter 110ms ease-out

  &:active
    transform: translateY(2px) scale(0.94)

  &.is-poor
    // Dimmed, NOT hidden: the player should always see what they're saving for.
    filter: grayscale(0.7) brightness(0.62)

  &.is-selected
    transform: translateY(-4px)

    .build-tray__body
      border-color: #7fe0ff
      box-shadow: 0 0 0 2px rgba(127, 224, 255, 0.55), 0 0 14px rgba(127, 224, 255, 0.6)

.build-tray__shadow
  position: absolute
  inset-inline: 0
  top: 0
  height: 100%
  transform: translateY(3px)
  border-radius: clamp(0.4rem, 2vw, 0.65rem)
  background-color: #0d1830
  pointer-events: none

.build-tray__body
  position: relative
  display: flex
  align-items: center
  justify-content: center
  padding: clamp(0.12rem, 0.8vw, 0.25rem)
  border: 2px solid #24345a
  border-radius: clamp(0.4rem, 2vw, 0.65rem)
  background-color: rgba(10, 18, 36, 0.85)
  transition: border-color 110ms ease-out, box-shadow 110ms ease-out

// ─── Reinforced shine ───────────────────────────────────────────────────────
//
// A single translated gradient rather than a filter animation: it composites on
// the GPU and costs nothing per frame, which matters because up to four of
// these can sit on screen for the whole build phase.
.build-tray__tile.is-enhanced .build-tray__body
  border-color: #ffd54a
  box-shadow: 0 0 0 1px rgba(255, 213, 74, 0.5), 0 0 10px rgba(255, 190, 40, 0.45)

.build-tray__shine
  position: absolute
  inset: 0
  border-radius: inherit
  overflow: hidden
  pointer-events: none

  &::after
    content: ''
    position: absolute
    top: -50%
    left: -60%
    width: 45%
    height: 200%
    background-image: linear-gradient(to right, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0))
    rotate: 18deg
    animation: tray-shine 2.4s ease-in-out infinite

@keyframes tray-shine
  0%
    translate: 0 0
  55%, 100%
    translate: 380% 0

@media (prefers-reduced-motion: reduce)
  .build-tray__shine::after
    animation: none
    opacity: 0.35
    translate: 190% 0

// ─── Reroll pip ─────────────────────────────────────────────────────────────

.build-tray__reroll
  position: absolute
  top: 0
  right: 0
  z-index: 2
  display: flex
  align-items: center
  justify-content: center
  width: clamp(1.15rem, 4.6vw, 1.5rem)
  height: clamp(1.15rem, 4.6vw, 1.5rem)
  padding: 0.15rem
  border: 2px solid #0f1a30
  border-radius: 999px
  background-image: linear-gradient(to bottom, #6fd3ff, #2f8fe0)
  color: #04203a
  cursor: pointer
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  transition: transform 110ms ease-out, filter 110ms ease-out

  &:active:not(.is-cooling)
    transform: scale(0.88)

  &.is-cooling
    background-image: linear-gradient(to bottom, #4a5a7d, #2b3654)
    color: #c8d6f2
    cursor: not-allowed

  svg
    width: 100%
    height: 100%

.build-tray__reroll-timer
  font-weight: 900
  font-size: clamp(0.5rem, 2.1vw, 0.68rem)
  line-height: 1

.build-tray__roof-badge
  position: absolute
  top: 0
  right: 0
  translate: 25% -25%
  display: flex
  align-items: center
  justify-content: center
  min-width: 1rem
  height: 1rem
  padding-inline: 0.15em
  border: 1px solid rgba(0, 0, 0, 0.6)
  border-radius: 999px
  background-color: #b8332c
  color: #fff
  font-weight: 900
  font-size: 0.6rem
  line-height: 1

// Capped to the thumbnail width, and allowed to wrap.
//
// The tile is a shrink-to-fit column, so its WIDEST child sets its width. With
// a third price chip the row overtook the body and every tile grew past the
// width `tileSize` budgeted for it — enough to push the 4th offer outside the
// scroll viewport, with nothing on screen to suggest it was there.
//
// The cap restores the invariant that a tile is sized by its body alone, so a
// three-chip piece lays out exactly like a one-chip piece. A row too long for
// the cap wraps to a second line instead, which costs a few pixels of height
// the tray has to spare rather than width it does not. This is deliberately
// unconditional: the squeeze depends on the track the tray is dealt (one
// column of the bottom bar, ~230 px on a 500 px phone), not on the viewport,
// so a media query alone would miss it.
.build-tray__cost
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  max-width: var(--tile-w, 2.75rem)
  gap: 0.15em 0.2em
  line-height: 1

.build-tray__cost-item
  display: inline-flex
  align-items: center
  gap: 0.15em
  color: #dbe6ff
  font-weight: 900
  font-size: clamp(0.5rem, 2.2vw, 0.7rem)
  text-shadow: 1px 1px 0 #000

  &.is-short
    color: #ff8f8f

.build-tray__dot
  display: inline-block
  width: 0.5em
  height: 0.5em
  border-radius: 999px

  &.is-wood
    background-color: #a9682f
  &.is-stone
    background-color: #8b939d
  &.is-gold
    background-color: #ffd93c

// ─── Narrow screens ─────────────────────────────────────────────────────────
//
// At 320 px the tile is pinned to its 44 px tap-target floor, so the only
// slack left is chrome. Shrinking the dot and gaps keeps the common two-digit
// three-chip row on ONE line (≈43 px against the 44 px cap) instead of wrapping
// every gold-costed piece to two.
//
// The tray padding and body padding come down for a second reason: `perSlot`
// budgets the THUMBNAIL, but each tile also spends body padding and a 2 px
// border, so 4 × chrome + 3 × gap ran ~14 px past the measured track before the
// 44 px floor was even reached. Trimming both brings that back inside it.
@media (max-width: 24rem)
  .build-tray__cost
    gap: 0.1em 0.15em

  .build-tray__cost-item
    gap: 0.1em

  .build-tray__dot
    width: 0.4em
    height: 0.4em

  .build-tray__scroll
    gap: 0.2rem
    padding: 0.25rem

  .build-tray__body
    padding: 0.05rem

// ─── Info box ───────────────────────────────────────────────────────────────

.build-tray__info
  position: absolute
  bottom: calc(100% + 0.4rem)
  left: 50%
  translate: -50% 0
  z-index: 5
  display: flex
  flex-direction: column
  gap: 0.15rem
  width: max-content
  max-width: min(88vw, 17rem)
  padding: clamp(0.35rem, 1.8vw, 0.6rem) clamp(0.5rem, 2.4vw, 0.85rem)
  border: 2px solid #7fe0ff
  border-radius: clamp(0.5rem, 2.4vw, 0.9rem)
  background-image: linear-gradient(to bottom, rgba(28, 44, 82, 0.98), rgba(14, 24, 46, 0.98))
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.55)
  pointer-events: none
  text-align: left

.build-tray__info-head
  display: flex
  align-items: baseline
  justify-content: space-between
  gap: 0.6rem

.build-tray__info-name
  color: #fff
  font-weight: 900
  text-transform: uppercase
  font-size: clamp(0.65rem, 3vw, 0.9rem)
  text-shadow: 2px 2px 0 #000

.build-tray__info-size
  color: #9fb6de
  font-weight: 900
  font-size: clamp(0.55rem, 2.4vw, 0.72rem)

.build-tray__parts
  display: flex
  flex-direction: column
  gap: 0.05rem
  margin: 0
  padding: 0
  list-style: none

  li
    display: flex
    align-items: baseline
    gap: 0.35em
    font-size: clamp(0.55rem, 2.4vw, 0.72rem)

.build-tray__part-n
  color: #ffd93c
  font-weight: 900

.build-tray__part-name
  color: #dbe6ff
  flex: 1

.build-tray__part-hp
  color: #9fb6de

// Wraps because this row spells the resources out in words — three of them in
// a locale with long nouns would otherwise stretch the box past its max-width.
.build-tray__info-cost
  display: flex
  flex-wrap: wrap
  align-items: center
  gap: 0.15rem 0.6rem
  margin-top: 0.15rem
  padding-top: 0.2rem
  border-top: 1px solid rgba(255, 255, 255, 0.14)

.build-tray__roof-note
  color: #ff9d9d
  font-size: clamp(0.5rem, 2.2vw, 0.68rem)
  line-height: 1.2

.build-tray__enhanced-note
  color: #ffd54a
  font-weight: 900
  font-size: clamp(0.5rem, 2.2vw, 0.68rem)
  line-height: 1.2

.info-enter-active, .info-leave-active
  transition: opacity 130ms ease-out, translate 130ms ease-out

.info-enter-from, .info-leave-to
  opacity: 0
  translate: -50% 0.35rem
</style>
