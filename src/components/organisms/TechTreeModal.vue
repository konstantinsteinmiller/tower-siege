<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import TechIcon from '@/components/game/TechIcon.vue'
import { TECH_NODES, TECH_BOUNDS, TECH_BY_ID, isUnlockNode } from '@/game/tech'
import useTowerProgress from '@/use/useTowerProgress'
import useSounds from '@/use/useSound'

/**
 * The tech tree (reference image 5).
 *
 * Layout: nodes sit on the authored `(tier, col)` grid; SVG connectors are
 * drawn from each node's prerequisites. The board is pan/zoomable because on a
 * 320 px phone the whole graph cannot be legible at once, and shrinking it to
 * fit would make every node an unreadable dot.
 *
 * Node states, in priority order:
 *   maxed      — fully invested (green, checked)
 *   affordable — buyable right now (gold, pulsing)
 *   available  — prerequisites met but too expensive (blue)
 *   locked     — prerequisites unmet (dim, chained)
 */

const model = defineModel<boolean>({ required: true })

const { t } = useI18n()
const { playSound } = useSounds()
const progress = useTowerProgress()

// ─── Board geometry ─────────────────────────────────────────────────────────

const CELL_X = 92
const CELL_Y = 96
const NODE = 56

const cols = TECH_BOUNDS.maxCol - TECH_BOUNDS.minCol + 1
const tiers = TECH_BOUNDS.maxTier - TECH_BOUNDS.minTier + 1
const boardW = cols * CELL_X + NODE
const boardH = tiers * CELL_Y + NODE

const nodeX = (col: number): number => (col - TECH_BOUNDS.minCol) * CELL_X + NODE / 2
const nodeY = (tier: number): number => (tier - TECH_BOUNDS.minTier) * CELL_Y + NODE / 2

interface Edge { x1: number; y1: number; x2: number; y2: number; active: boolean }

const edges = computed<Edge[]>(() => {
  const out: Edge[] = []
  for (const node of TECH_NODES) {
    for (const reqId of node.requires) {
      const req = TECH_BY_ID[reqId]
      if (!req) continue
      out.push({
        x1: nodeX(req.col), y1: nodeY(req.tier),
        x2: nodeX(node.col), y2: nodeY(node.tier),
        // A lit connector means "this path is open" — the clearest way to show
        // where the player can spend next.
        active: progress.levelOf(reqId) > 0
      })
    }
  }
  return out
})

// ─── Pan / zoom ─────────────────────────────────────────────────────────────

const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
let dragging = false
let lastX = 0
let lastY = 0
let downX = 0
let downY = 0
let moved = false
let pinchDist = 0
let pinchZoom = 1
const pointers = new Map<number, { x: number; y: number }>()

/** A press must travel this far before it counts as a pan rather than a tap. */
const TAP_SLOP_PX = 8

const onPointerDown = (e: PointerEvent): void => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    pinchZoom = zoom.value
    dragging = false
    return
  }
  dragging = true
  moved = false
  downX = lastX = e.clientX
  downY = lastY = e.clientY
  // NOTE: pointer capture is deliberately NOT taken here.
  //
  // Capturing on the board meant every `pointerup` was retargeted to the
  // viewport, so the `click` event on a node button never fired and the tree
  // was effectively read-only — you could select the node you started on and
  // nothing else. Capture is now claimed only once a drag actually begins.
}

const onPointerMove = (e: PointerEvent): void => {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pointers.size === 2 && pinchDist > 0) {
    const [a, b] = [...pointers.values()]
    const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    zoom.value = Math.max(0.45, Math.min(1.8, pinchZoom * (dist / pinchDist)))
    return
  }
  if (!dragging) return

  if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_SLOP_PX) {
    moved = true
    // Now it is unambiguously a pan — take the pointer so the drag keeps
    // tracking even if it leaves the viewport.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  if (!moved) return

  panX.value += e.clientX - lastX
  panY.value += e.clientY - lastY
  lastX = e.clientX
  lastY = e.clientY
}

const onPointerUp = (e: PointerEvent): void => {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinchDist = 0
  if (pointers.size === 0) dragging = false
}

const onWheel = (e: WheelEvent): void => {
  e.preventDefault()
  zoom.value = Math.max(0.45, Math.min(1.8, zoom.value * (e.deltaY < 0 ? 1.12 : 0.89)))
}

/** Select a node — but only if the press was a tap, not the end of a pan. */
const onNodeClick = (id: string): void => {
  if (moved) return
  selected.value = id
}

/** Frame the tree on open: centre it and pick a zoom that fits the width. */
/** Widest the viewport ever gets, so the fit below never overshoots. */
const VIEWPORT_HINT_PX = 640

/**
 * Open on a view that shows BOTH roots.
 *
 * The board is pan/zoomable, and at 1× it opens on the tower's root with the
 * harbour entirely off the right edge — a whole second tree the player has no
 * reason to suspect exists. Fitting the board's width on open is the cheapest
 * possible fix: the two roots are visible together, and the relationship
 * between them (there isn't one) is the first thing the layout says.
 *
 * Floored at 0.62 so a wide tree never shrinks the nodes into unreadable dots;
 * past that the player pans, which they already know how to do.
 */
const resetView = (): void => {
  panX.value = 0
  panY.value = 0
  zoom.value = Math.max(0.62, Math.min(1, VIEWPORT_HINT_PX / boardW))
}

watch(model, (open) => { if (open) { resetView(); selected.value = 'foundations' } })
onUnmounted(() => pointers.clear())

// ─── Selection / purchase ───────────────────────────────────────────────────

const selected = ref<string>('foundations')

const selectedNode = computed(() => TECH_BY_ID[selected.value] ?? null)

const stateOf = (id: string): 'maxed' | 'affordable' | 'available' | 'locked' => {
  const node = TECH_BY_ID[id]
  if (!node) return 'locked'
  if (!progress.isUnlocked(id)) return 'locked'
  if (progress.levelOf(id) >= node.maxLevel) return 'maxed'
  return progress.canBuy(id) ? 'affordable' : 'available'
}

const selectedDetail = computed(() => {
  const node = selectedNode.value
  if (!node) return null
  const level = progress.levelOf(node.id)
  return {
    id: node.id,
    level,
    maxLevel: node.maxLevel,
    capped: isUnlockNode(node.id),
    cost: progress.costOf(node.id),
    state: stateOf(node.id),
    /** Prerequisite names, for the locked explanation line. */
    missing: node.requires.filter((r) => progress.levelOf(r) === 0)
  }
})

const buy = (): void => {
  const node = selectedNode.value
  if (!node) return
  if (progress.buyTech(node.id)) {
    playSound('level-up', 0.07)
  }
}

const nodeLabel = (id: string): string => t(`tech.names.${id}`)

/**
 * What one rank of a node is worth, read from the node itself.
 *
 * The descriptions used to carry this number as prose, and every one of them
 * had drifted away from the data by a rebalance or two — the Stone Stockpile
 * advertised +18 while the tree granted +14. Feeding the real figure through
 * `{n}` means the copy cannot lie again, in any language.
 */
const perRank = (id: string): { n: number; pct: boolean } | null => {
  const e = TECH_BY_ID[id]?.effect as { pct?: number; add?: number } | undefined
  if (!e) return null
  if (e.pct !== undefined) return { n: e.pct, pct: true }
  if (e.add !== undefined) return { n: e.add, pct: false }
  return null
}

const nodeDesc = (id: string): string => {
  const per = perRank(id)
  return t(`tech.descriptions.${id}`, per ? { n: per.n } : {})
}

/**
 * The running total the player has actually bought.
 *
 * Without it a repeatable node reads as inert: the description says "per rank"
 * and never changes, so rank 5 looks exactly like rank 1 and the coins feel
 * spent on nothing.
 */
const nodeTotal = (id: string, level: number): string | null => {
  const per = perRank(id)
  if (!per || level <= 0) return null
  const total = Math.round(per.n * level * 100) / 100
  return per.pct ? `+${total}%` : `+${total}`
}
</script>

<template lang="pug">
  FModal(v-model="model" :title="t('tech.title')")
    div.tech
      //- ── Board ────────────────────────────────────────────────────────────
      div.tech__viewport(
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel="onWheel"
      )
        div.tech__board(
          :style="{\
            width: boardW + 'px',\
            height: boardH + 'px',\
            transform: `translate(calc(-50% + ${panX}px), ${panY}px) scale(${zoom})`\
          }"
        )
          svg.tech__edges(:viewBox="`0 0 ${boardW} ${boardH}`" :width="boardW" :height="boardH")
            line(
              v-for="(e, i) in edges"
              :key="i"
              :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
              :class="e.active ? 'is-active' : 'is-dim'"
            )

          button.tech__node(
            v-for="node in TECH_NODES"
            :key="node.id"
            type="button"
            :class="[`is-${stateOf(node.id)}`, { 'is-selected': selected === node.id }]"
            :style="{ left: nodeX(node.col) + 'px', top: nodeY(node.tier) + 'px' }"
            :aria-label="nodeLabel(node.id)"
            @click="onNodeClick(node.id)"
          )
            span.tech__node-body
              span.tech__node-glyph
                TechIcon(:icon="node.icon")
              //- Repeatable nodes show their current rank; unlocks just show a
              //- tick once bought, because "1/1" tells the player nothing.
              span.tech__node-rank(v-if="!isUnlockNode(node.id)") {{ progress.levelOf(node.id) }}
              span.tech__node-check(v-else-if="progress.levelOf(node.id) > 0") ✓

      //- ── Detail card ──────────────────────────────────────────────────────
      div.tech__detail(v-if="selectedDetail")
        div.tech__detail-head
          span.tech__detail-name {{ nodeLabel(selectedDetail.id) }}
          //- Repeatable nodes have no ceiling, so showing "3 / 9999" would be
          //- absurd — they report the rank they are at instead.
          span.tech__detail-rank(v-if="!selectedDetail.capped") {{ t('tech.rankOpen', { n: selectedDetail.level }) }}
          span.tech__detail-rank(v-else-if="selectedDetail.level > 0") {{ t('tech.owned') }}
        p.tech__detail-desc {{ nodeDesc(selectedDetail.id) }}
        //- What the ranks already bought add up to, so buying another one is
        //- visibly worth something.
        p.tech__detail-total(v-if="nodeTotal(selectedDetail.id, selectedDetail.level)")
          | {{ t('tech.atRank', { r: selectedDetail.level, n: nodeTotal(selectedDetail.id, selectedDetail.level) }) }}

        div.tech__detail-foot
          span.tech__detail-status(v-if="selectedDetail.state === 'maxed'") {{ t('tech.maxed') }}
          span.tech__detail-status.is-locked(v-else-if="selectedDetail.state === 'locked'")
            | {{ t('tech.requires', { n: selectedDetail.missing.map(nodeLabel).join(', ') }) }}
          FButton(
            v-else
            size="sm"
            :type="selectedDetail.state === 'affordable' ? 'primary' : 'secondary'"
            :is-disabled="selectedDetail.state !== 'affordable'"
            @click="buy"
          )
            span.tech__buy
              IconCoin(class="tech__buy-icon")
              | {{ selectedDetail.cost }}
</template>

<style scoped lang="sass">
.tech
  display: flex
  flex-direction: column
  gap: clamp(0.35rem, 1.8vw, 0.7rem)
  width: 100%

.tech__viewport
  position: relative
  width: 100%
  // A viewport tall enough to show ~3 tiers at once but capped so the detail
  // card always stays on screen. `min-height` guards against the container
  // collapsing to nothing inside FModal's flex column.
  min-height: 11rem
  height: clamp(11rem, 42vh, 22rem)
  overflow: hidden
  border: 2px solid #24345a
  border-radius: clamp(0.5rem, 2.4vw, 0.9rem)
  // A starfield-ish backdrop, matching the reference's "tech constellation"
  // feel. One line: indented Sass has no multi-line property values.
  background: radial-gradient(circle at 30% 20%, rgba(90, 130, 220, 0.16), transparent 55%), radial-gradient(circle at 75% 70%, rgba(160, 90, 220, 0.14), transparent 55%), #0a1024
  cursor: grab
  touch-action: none

  &:active
    cursor: grabbing

.tech__board
  position: absolute
  top: 1rem
  left: 50%
  transform-origin: top center
  will-change: transform

.tech__edges
  position: absolute
  inset: 0
  pointer-events: none

  line
    stroke-width: 3
    stroke-linecap: round

    &.is-active
      stroke: rgba(120, 200, 255, 0.7)
    &.is-dim
      stroke: rgba(120, 140, 180, 0.22)

.tech__node
  position: absolute
  translate: -50% -50%
  width: 3.5rem
  height: 3.5rem
  min-width: 2.75rem
  min-height: 2.75rem
  padding: 0
  border: 0
  background: none
  cursor: pointer
  -webkit-tap-highlight-color: transparent
  transition: scale 120ms ease-out

  &:active
    scale: 0.92

.tech__node-body
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 0.05rem
  width: 100%
  height: 100%
  border: 3px solid #0f1a30
  border-radius: 0.7rem
  color: #fff

.tech__node-glyph
  display: flex
  align-items: center
  justify-content: center
  width: 56%
  height: 56%

.tech__node-rank, .tech__node-check
  font-weight: 900
  font-size: 0.62rem
  line-height: 1
  opacity: 0.95
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.6)

// A rank of 0 is noise on a board of thirty nodes — only show it once the
// player has actually invested.
.tech__node.is-locked .tech__node-rank,
.tech__node.is-available .tech__node-rank
  opacity: 0.55

// ── Node states ─────────────────────────────────────────────────────────────
.tech__node.is-locked .tech__node-body
  background-image: linear-gradient(to bottom, #3a4258, #232a3c)
  color: #7d879e
  opacity: 0.75

.tech__node.is-available .tech__node-body
  background-image: linear-gradient(to bottom, #50aaff, #2266ff)

.tech__node.is-affordable .tech__node-body
  background-image: linear-gradient(to bottom, #ffcd00, #f7a000)
  animation: tech-afford 1.5s ease-in-out infinite

.tech__node.is-maxed .tech__node-body
  background-image: linear-gradient(to bottom, #67e08a, #1f9d4d)

.tech__node.is-selected .tech__node-body
  border-color: #7fe0ff
  box-shadow: 0 0 0 3px rgba(127, 224, 255, 0.55)

@keyframes tech-afford
  0%, 100%
    box-shadow: 0 0 0 0 rgba(255, 210, 60, 0)
  50%
    box-shadow: 0 0 12px 2px rgba(255, 210, 60, 0.7)

// ── Detail card ─────────────────────────────────────────────────────────────
.tech__detail
  display: flex
  flex-direction: column
  gap: 0.2rem
  padding: clamp(0.35rem, 1.8vw, 0.65rem)
  border: 2px solid #24345a
  border-radius: clamp(0.5rem, 2.4vw, 0.9rem)
  background-color: rgba(10, 18, 38, 0.7)
  text-align: left

.tech__detail-head
  display: flex
  align-items: baseline
  justify-content: space-between
  gap: 0.5rem

.tech__detail-name
  color: #fff
  font-weight: 900
  text-transform: uppercase
  font-size: clamp(0.72rem, 3.4vw, 1.05rem)
  text-shadow: 2px 2px 0 #000

.tech__detail-rank
  flex: 0 0 auto
  color: #9fb6de
  font-weight: 900
  font-size: clamp(0.55rem, 2.4vw, 0.75rem)

.tech__detail-total
  margin: 0.15rem 0 0
  color: #ffd93c
  font-weight: 900
  font-size: clamp(0.58rem, 2.5vw, 0.76rem)
  text-shadow: 2px 2px 0 #000

.tech__detail-desc
  margin: 0
  color: #cfdcf5
  line-height: 1.25
  font-size: clamp(0.6rem, 2.7vw, 0.85rem)

.tech__detail-foot
  display: flex
  align-items: center
  justify-content: flex-end
  min-height: 2.25rem
  margin-top: 0.15rem

.tech__detail-status
  color: #7ce09a
  font-weight: 900
  text-transform: uppercase
  font-size: clamp(0.6rem, 2.7vw, 0.82rem)

  &.is-locked
    color: #ff9d9d
    text-transform: none

.tech__buy
  display: inline-flex
  align-items: center
  gap: 0.3em

.tech__buy-icon
  width: 1em
  height: 1em
  color: #fff8d0
</style>
