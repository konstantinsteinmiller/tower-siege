<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * First-run coach marks.
 *
 * Shown ONLY during the first stage, and only once ever. Four beats, each a
 * dimmed screen with a hole cut over the thing being talked about and one short
 * line of text.
 *
 * Design rules, in order of importance:
 *
 *   1. **Never block the thing it is pointing at.** The cut-out is a real hole:
 *      pointer events pass through it, so the player can act on the step while
 *      it is on screen instead of dismissing a modal and then trying to
 *      remember what it said.
 *   2. **One line each.** A tutorial nobody reads is worse than no tutorial;
 *      four short lines get read, four paragraphs do not.
 *   3. **It advances on the ACTION, not on a button** wherever an action
 *      exists. Being told "tap a piece" and then having to tap "Next" first
 *      teaches the wrong reflex.
 *   4. It is skippable from the first frame.
 */

export type TutorialStep = 'gate' | 'pick' | 'place' | 'call'

interface Props {
  /** Which step is live, or null when the tutorial is finished/never started. */
  step: TutorialStep | null
  /** Screen-space rect to cut out of the dim layer. */
  target: { x: number; y: number; w: number; h: number } | null
  /** The scripted opening put a free starter fort on the foundation. */
  seeded?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'next'): void; (e: 'skip'): void }>()

const { t } = useI18n()

/**
 * Beats whose line changes when the player did not start from bare ground.
 *
 * "Place it next to the Gate" is a lie once those cells hold the free starter
 * wall, and a tutorial that describes a board other than the one on screen is
 * worse than no tutorial — the player concludes they misread it and stops
 * reading.
 */
const SEEDED_VARIANTS: ReadonlyArray<TutorialStep> = ['gate', 'place']

const textKey = computed(() => {
  const step = props.step
  if (!step) return ''
  return props.seeded && SEEDED_VARIANTS.includes(step)
    ? `tutorial.${step}Seeded`
    : `tutorial.${step}`
})

/** Padding around the highlighted element, so the hole never crops it. */
const PAD = 10

const hole = computed(() => {
  const r = props.target
  if (!r) return null
  return {
    x: Math.round(r.x - PAD),
    y: Math.round(r.y - PAD),
    w: Math.round(r.w + PAD * 2),
    h: Math.round(r.h + PAD * 2)
  }
})

/**
 * Which side of the hole the card sits on.
 *
 * Always the side with more room, so the card never lands on top of the thing
 * it is describing.
 */
const cardStyle = computed(() => {
  const h = hole.value
  if (!h) return { top: '50%', left: '50%', translate: '-50% -50%' }
  const below = window.innerHeight - (h.y + h.h)
  if (below > 170) {
    return { top: `${h.y + h.h + 14}px`, left: '50%', translate: '-50% 0' }
  }
  if (h.y > 170) {
    return { top: `${h.y - 14}px`, left: '50%', translate: '-50% -100%' }
  }
  return { top: '50%', left: '50%', translate: '-50% -50%' }
})

/** The `gate` beat has nothing to tap, so it advances on its own. */
const autoAdvance = computed(() => props.step === 'gate')
let autoTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.step, (s) => {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null }
  if (s && autoAdvance.value) autoTimer = setTimeout(() => emit('next'), 2600)
}, { immediate: true })

onUnmounted(() => { if (autoTimer) clearTimeout(autoTimer) })

// Re-measure on resize: the overlay is positioned in screen space, so a rotate
// or a keyboard opening would otherwise leave the hole somewhere arbitrary.
const tick = ref(0)
const onResize = (): void => { tick.value++ }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))
</script>

<template lang="pug">
  Transition(name="tut")
    div.tutorial(v-if="step")
      //- The dim layer is four rects around the hole rather than one rect with
      //- a mask: it keeps the hole genuinely click-through on every browser,
      //- which `mask-image` does not.
      template(v-if="hole")
        div.tutorial__dim(:style="{ left: 0, top: 0, width: '100%', height: hole.y + 'px' }")
        div.tutorial__dim(:style="{ left: 0, top: (hole.y + hole.h) + 'px', width: '100%', bottom: 0 }")
        div.tutorial__dim(:style="{ left: 0, top: hole.y + 'px', width: hole.x + 'px', height: hole.h + 'px' }")
        div.tutorial__dim(:style="{ left: (hole.x + hole.w) + 'px', top: hole.y + 'px', right: 0, height: hole.h + 'px' }")
        div.tutorial__ring(:style="{ left: hole.x + 'px', top: hole.y + 'px', width: hole.w + 'px', height: hole.h + 'px' }")
      div.tutorial__dim.is-full(v-else)

      div.tutorial__card(:style="cardStyle")
        span.tutorial__text {{ t(textKey) }}
        div.tutorial__actions
          button.tutorial__skip(type="button" @click="emit('skip')") {{ t('tutorial.skip') }}
          button.tutorial__next(v-if="!autoAdvance" type="button" @click="emit('next')") {{ t('tutorial.next') }}
</template>

<style scoped lang="sass">
.tutorial
  position: fixed
  inset: 0
  z-index: 40
  // The layer itself is inert; only the card takes pointer events, so the
  // highlighted control stays live through the hole.
  pointer-events: none

.tutorial__dim
  position: absolute
  background-color: rgba(6, 10, 20, 0.72)
  pointer-events: auto

  &.is-full
    inset: 0

.tutorial__ring
  position: absolute
  border: 2px solid rgba(255, 214, 80, 0.9)
  border-radius: clamp(0.5rem, 2.4vw, 0.9rem)
  box-shadow: 0 0 0 3px rgba(255, 214, 80, 0.25), 0 0 22px rgba(255, 200, 60, 0.5)
  animation: tut-pulse 1.5s ease-in-out infinite
  pointer-events: none

@keyframes tut-pulse
  0%, 100%
    box-shadow: 0 0 0 3px rgba(255, 214, 80, 0.2), 0 0 18px rgba(255, 200, 60, 0.35)
  50%
    box-shadow: 0 0 0 5px rgba(255, 214, 80, 0.35), 0 0 28px rgba(255, 200, 60, 0.65)

.tutorial__card
  position: absolute
  display: flex
  flex-direction: column
  align-items: center
  gap: clamp(0.4rem, 2vw, 0.7rem)
  width: max-content
  max-width: min(88vw, 22rem)
  padding: clamp(0.6rem, 3vw, 1rem) clamp(0.8rem, 4vw, 1.4rem)
  border: 2px solid #ffd64a
  border-radius: clamp(0.6rem, 3vw, 1rem)
  background-image: linear-gradient(to bottom, rgba(30, 48, 88, 0.98), rgba(14, 24, 48, 0.98))
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6)
  pointer-events: auto

.tutorial__text
  color: #fff
  font-weight: 900
  text-align: center
  line-height: 1.25
  font-size: clamp(0.85rem, 4vw, 1.15rem)
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.7)

.tutorial__actions
  display: flex
  align-items: center
  gap: clamp(0.4rem, 2vw, 0.7rem)

.tutorial__skip, .tutorial__next
  min-height: 2.25rem
  padding: 0.3em 1em
  border: 2px solid #0f1a30
  border-radius: 999px
  font-weight: 900
  text-transform: uppercase
  font-size: clamp(0.65rem, 3vw, 0.85rem)
  cursor: pointer
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.6)

.tutorial__skip
  background-image: linear-gradient(to bottom, #6b7690, #414c66)
  color: #e6edf8

.tutorial__next
  background-image: linear-gradient(to bottom, #ffcd00, #f7a000)
  color: #fff

.tut-enter-active, .tut-leave-active
  transition: opacity 180ms ease-out

.tut-enter-from, .tut-leave-to
  opacity: 0
</style>
