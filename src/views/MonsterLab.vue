<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { MONSTERS, type MonsterDef } from '@/game/monsters'
import { grain } from '@/game/inkArt'

/**
 * `/monsters` — the design bench.
 *
 * Not a game screen: a place to look at the cast large, side by side, in
 * isolation, so the art direction can be judged and revised without playing to
 * wave 20 to see one of them. Deliberately plain chrome — anything decorative
 * here competes with the thing being reviewed.
 *
 * Each portrait is its own canvas on its own RAF-driven clock so the idle
 * animations do not lock-step, which would read as a screensaver rather than as
 * five separate characters.
 */

const canvases = ref<HTMLCanvasElement[]>([])
const paused = ref(false)
const showInk = ref(true)
const zoom = ref(1)
const solo = ref<string | null>(null)

const shown = computed<MonsterDef[]>(() =>
  solo.value ? MONSTERS.filter((m) => m.id === solo.value) : MONSTERS
)

let raf = 0
let clock = 0
let last = 0

const paint = (canvas: HTMLCanvasElement, def: MonsterDef, t: number): void => {
  // Render at up to 3× so the ink edges stay crisp when a design is inspected
  // closely — this is a review surface, not the hot path.
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  // Backdrop: a soft pool of light so the character has something to sit in.
  const bg = ctx.createRadialGradient(w / 2, h * 0.52, 0, w / 2, h * 0.52, Math.max(w, h) * 0.72)
  bg.addColorStop(0, def.backdrop[0])
  bg.addColorStop(1, def.backdrop[1])
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.translate(w / 2, h * 0.54)
  // Characters occupy y ∈ [−1.05, 1.05] and up to ±0.95 wide, so fit against
  // BOTH axes — sizing off `min(w, h)` alone left half the card empty.
  const S = Math.min(w / 2.0, h / 2.5) * zoom.value
  if (!showInk.value) ctx.globalAlpha = 0.999 // no-op hook, kept for parity
  def.draw(ctx, S, t)
  ctx.restore()

  grain(ctx, w, h, 0.05, 3)

  // Vignette, last, so it sits over the grain.
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.45)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)
}

const frame = (now: number): void => {
  raf = requestAnimationFrame(frame)
  const dt = last ? now - last : 16
  last = now
  if (!paused.value) clock += dt
  const list = shown.value
  for (let i = 0; i < canvases.value.length; i++) {
    const c = canvases.value[i]
    const def = list[i]
    if (!c || !def) continue
    // Each character offset on the shared clock, so five idles do not breathe
    // in unison.
    paint(c, def, clock + i * 617)
  }
}

const onResize = (): void => { last = 0 }

onMounted(() => {
  raf = requestAnimationFrame(frame)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
})

const setRef = (el: Element | ComponentPublicInstance | null, i: number): void => {
  if (el instanceof HTMLCanvasElement) canvases.value[i] = el
}
</script>

<script lang="ts">
import type { ComponentPublicInstance } from 'vue'
export default { name: 'MonsterLab' }
</script>

<template lang="pug">
  div.lab
    header.lab__bar
      h1.lab__title Monster designs
      div.lab__controls
        button.lab__btn(type="button" :class="{ 'is-on': !paused }" @click="paused = !paused")
          | {{ paused ? 'Play' : 'Pause' }}
        button.lab__btn(type="button" @click="zoom = Math.max(0.6, zoom - 0.15)") −
        span.lab__zoom {{ Math.round(zoom * 100) }}%
        button.lab__btn(type="button" @click="zoom = Math.min(2.2, zoom + 0.15)") +
        button.lab__btn(v-if="solo" type="button" @click="solo = null") Show all

    div.lab__grid(:class="{ 'is-solo': !!solo }")
      figure.lab__card(v-for="(m, i) in shown" :key="m.id")
        canvas.lab__canvas(:ref="(el) => setRef(el, i)" @click="solo = solo ? null : m.id")
        figcaption.lab__caption
          span.lab__name {{ m.name }}
          span.lab__tagline {{ m.tagline }}
</template>

<style scoped lang="sass">
.lab
  min-height: 100vh
  min-height: 100dvh
  background-color: #0d0f14
  color: #e8eef7
  padding: clamp(0.6rem, 2.5vw, 1.4rem)
  padding-top: calc(clamp(0.6rem, 2.5vw, 1.4rem) + env(safe-area-inset-top, 0px))

.lab__bar
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: space-between
  gap: 0.6rem
  margin-bottom: clamp(0.6rem, 2vw, 1.1rem)

.lab__title
  margin: 0
  font-weight: 900
  letter-spacing: 0.02em
  font-size: clamp(1rem, 4vw, 1.5rem)

.lab__controls
  display: flex
  align-items: center
  gap: 0.35rem

.lab__btn
  min-height: 2.25rem
  padding: 0.3em 0.9em
  border: 2px solid #2b3444
  border-radius: 0.6rem
  background-color: #171d27
  color: #cfdcef
  font-weight: 800
  font-size: clamp(0.7rem, 3vw, 0.85rem)
  cursor: pointer

  &:hover
    background-color: #1f2733

  &.is-on
    border-color: #3f7fd0

.lab__zoom
  min-width: 3.2rem
  text-align: center
  font-variant-numeric: tabular-nums
  color: #92a3ba
  font-size: 0.8rem

.lab__grid
  display: grid
  gap: clamp(0.5rem, 2vw, 1rem)
  // Narrow enough that all five land on one row on a desktop — a cast split
  // across two rows is a cast you compare in two passes.
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr))

  &.is-solo
    grid-template-columns: 1fr

.lab__card
  margin: 0
  border: 1px solid #222b38
  border-radius: 0.9rem
  overflow: hidden
  background-color: #10141b

.lab__canvas
  display: block
  width: 100%
  // Portrait aspect: these are characters, not scenes.
  aspect-ratio: 4 / 5
  cursor: zoom-in

// Solo keeps the portrait crop and is bounded by the VIEWPORT, not the column
// width — a review surface you have to scroll is a review surface you misjudge.
.is-solo .lab__card
  display: flex
  flex-direction: column
  align-items: center

.is-solo .lab__canvas
  width: auto
  height: min(calc(100dvh - 11rem), 80vw)
  max-width: 100%
  cursor: zoom-out

.lab__caption
  display: flex
  flex-direction: column
  gap: 0.15rem
  padding: 0.55rem 0.75rem 0.7rem

.lab__name
  font-weight: 900
  font-size: clamp(0.85rem, 3.4vw, 1.05rem)

.lab__tagline
  color: #8fa0b8
  font-size: clamp(0.68rem, 2.8vw, 0.8rem)
  line-height: 1.35
</style>
