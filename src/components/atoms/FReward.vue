<template lang="pug">
  Transition(name="fade")
    //- Ensure classes with special characters are in parentheses
    div.fixed.inset-0.flex.flex-col.items-center.justify-center.backdrop-blur-md.touch-none.cursor-pointer(
      v-if="modelValue"
      class="bg-black/60"
      :class="[isAdShowing ? 'z-0' : 'z-[100]', isCompact ? 'p-2' : 'p-4']"
      :style="{\
        paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',\
        paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',\
        paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',\
        paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))'\
      }"
      @click="handleOverlayClick"
    )
      //- Parchment-ribbon header. Bitmap background scales to fit the
      //- responsive wrap; the slot content (or a fallback "Rewards"
      //- label) renders on top of the ribbon, centred horizontally and
      //- biased above the bottom curl so the tails stay visible.
      div.ribbon-wrap.relative.mb-10.shrink-0(
        v-if="$slots.ribbon"
        :class="{ 'is-compact': isCompact, 'is-desktop': !isCompact && !isMobilePortrait }"
      )
        div.ribbon-banner
          div.ribbon-content
            slot(name="ribbon")
              span.text-white.font-black.uppercase.italic.game-text {{ t('rewards') }}

      //- Content area — centred when it fits, scrollable when it does not.
      //-
      //- It used to be `justify-center` with `h-full` outside compact mode,
      //- which centres beautifully right up until the content is taller than
      //- the box and then clips it with no way to reach the rest. Flexbox
      //- centring overflows in BOTH directions, so the top of a tall panel goes
      //- off the screen and is unreachable — and the defeat screen is exactly
      //- the panel that grows, because it gains a record line, a rank, a
      //- rewarded offer, a continue offer and a tip depending on the run.
      //-
      //- `margin: auto` on the inner wrapper does what `justify-center` was
      //- meant to: it centres while there is slack and collapses to zero when
      //- there is not, leaving the scroll to do the rest.
      div.f-reward__body.relative.w-full.flex.flex-col.items-center.flex-1.min-h-0(
        :class="isCompact ? 'py-1' : ''"
      )
        div.f-reward__center
          slot

      //- Tap-to-continue hint. In landscape it sits INLINE in the flow (shrink-0)
      //- so it can never overlap the centred reward content; otherwise it floats
      //- at the bottom of the viewport as before.
      Transition(name="fade")
        div.flex.justify-center.animate-pulse.pointer-events-none(
          v-if="showContinue"
          :class="isCompact ? 'shrink-0 pt-1 pb-1' : 'absolute bottom-8 left-0 right-0 sm:bottom-12'"
        )
          div.text-white.font-black.uppercase.italic.tracking-widest.brawl-text(
            :class="isCompact ? 'text-xs' : 'text-sm md:text-2xl'"
          )
            | {{ isMobile ? t('tapToContinue') : t('clickToContinue') }}
</template>

<script setup lang="ts">
import { computed, useSlots, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { isMobileLandscape, isMobilePortrait, isShortViewport } from '@/use/useUser'

// "Compact" layout = the short-viewport treatment: mobile landscape OR any
// short embed (≤500px tall, e.g. a CG iframe on a Chromebook). In both cases
// the centred desktop layout overflows, so the ribbon shrinks and the
// tap/click-to-continue hint flows INLINE below the content (shrink-0) instead
// of floating absolutely at the bottom — where it otherwise overlapped the
// reward button.
const isCompact = computed(() => isMobileLandscape.value || isShortViewport.value)
// Sink the reward overlay below the ad layer whenever an interstitial/rewarded
// is on screen. GameMonetize (and several other portals) inject their ad
// container at a z-index lower than this modal's z-[100], so without this the
// modal — including its backdrop-blur — paints OVER the playing ad.
import { isAdShowing } from '@/use/useGamePause'

const props = defineProps<{
  modelValue: boolean
  showContinue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'continue'): void
}>()

const { t } = useI18n()
const slots = useSlots()

const isMobile = computed(() => {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
})

const handleOverlayClick = () => {
  if (props.showContinue) emit('continue')
}

// Desktop shortcut: Space / Enter triggers the same "continue" action
// the overlay click does, but only while the reward is up AND in
// continue-mode. Listener is attached only when the modal becomes
// visible so background views aren't intercepting these keys.
const onContinueKey = (e: KeyboardEvent) => {
  if (!props.modelValue || !props.showContinue) return
  if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return
  // Skip when focus is on a typing target — players might be editing
  // toolbar inputs in the background.
  const t = e.target
  if (t instanceof HTMLElement) {
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
    if (t.isContentEditable) return
  }
  e.preventDefault()
  emit('continue')
}

watch(() => props.modelValue, (open) => {
  if (open) window.addEventListener('keydown', onContinueKey)
  else window.removeEventListener('keydown', onContinueKey)
}, { immediate: true })

onUnmounted(() => {
  window.removeEventListener('keydown', onContinueKey)
})
</script>

<style scoped lang="sass">
.fade-enter-active, .fade-leave-active
  transition: opacity 0.4s ease

.fade-enter-from, .fade-leave-to
  opacity: 0

.brawl-text
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

// ─── Content area ───────────────────────────────────────────────────────────

.f-reward__body
  overflow-y: auto
  overflow-x: hidden
  // A dialog that has to scroll should say so with its own scrollbar rather
  // than by handing the gesture to the page behind it.
  overscroll-behavior: contain
  // iOS keeps momentum scrolling inside a `touch-none` ancestor only if the
  // scrollable child opts back in.
  touch-action: pan-y

.f-reward__center
  display: flex
  flex-direction: column
  align-items: center
  width: 100%
  // The centring. Collapses to 0 the moment the content is taller than the
  // body, which is what keeps the top reachable — see the template note.
  margin-block: auto

// ─── Parchment ribbon ────────────────────────────────────────────────────────

.ribbon-wrap
  position: relative
  width: 80vw
  max-width: 480px

  // Short-viewport treatment. Replaces the old `scale-90` utility, which
  // shrank the ribbon's PAINT but not its layout box, leaving a dead band of
  // margin exactly where vertical room was scarcest.
  &.is-compact
    width: 62vw
    max-width: 340px
    margin-top: -0.25rem
    margin-bottom: 0.25rem

  &.is-desktop
    @media (min-height: 501px)
      width: 70vw
      max-width: 360px

// Parchment ribbon bitmap (553×188 source). The aspect ratio is built
// into the wrap's `aspect-ratio` so the image scales without distorting
// the curled tails. We use `background-image` rather than an `<img>`
// so the slot content can layer cleanly on top without z-index gymnastics.
.ribbon-banner
  position: relative
  aspect-ratio: 553 / 188
  width: 100%
  background-image: url('/images/bg/parchment-ribbon_553x188.webp')
  background-repeat: no-repeat
  background-position: center
  background-size: contain
  display: flex
  align-items: center
  justify-content: center
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))

.ribbon-content
  position: relative
  // The ribbon art's flat parchment panel sits ABOVE the bottom curl,
  // so the content lifts ~14% of the banner height to land visually
  // centred on that panel.
  margin-top: -14%
  display: flex
  align-items: center
  justify-content: center
  text-align: center
  // Leave generous horizontal room on each side so wider labels don't
  // crash into the tail folds.
  padding: 0 18%

// Landscape phone: 30% smaller than the compact treatment above (62vw/340px
// → 43vw/238px). The banner is decoration and the short axis is the scarce
// one — at 340px wide it stood 116px tall, nearly a third of a 390px-high
// viewport spent on a title, and the CTAs below it fell off the bottom.
//
// `.is-compact` is always on in mobile landscape and is a compound selector,
// so it outranks a bare `.ribbon-wrap` here however far down the file it sits.
// This has to match the compound form too or it loses silently.
@media (orientation: landscape) and (max-height: 500px)
  .ribbon-wrap,
  .ribbon-wrap.is-compact
    width: 43vw
    max-width: 238px

// Short but not landscape-mobile (e.g. CG iframe in landscape with the
// portal chrome bar visible — ~700–860 px viewport). The default desktop
// ribbon (max 400 px wide → ~136 px tall) eats too much vertical room
// here, leaving no space for the result text + wheel + spin-again
// buttons. Cap it tighter so the roulette overlay's chrome fits the
// viewport. CG QA caught the overflow 2026-05-05.
@media (orientation: landscape) and (min-height: 501px) and (max-height: 860px)
  .ribbon-wrap.is-desktop
    width: 50vw
    max-width: 320px

</style>
