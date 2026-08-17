<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { blockDef } from '@/game/blocks'
import { themedPalette, spriteFor } from '@/game/art'
import { shapeDef, shapeBounds } from '@/game/shapes'
import { blockGlyph } from '@/game/blockGlyph'

/**
 * A shape thumbnail, drawn on its own canvas with the SAME palettes as the
 * in-world renderer — so the piece in your hand is recognisably the piece that
 * lands on the tower. Roofed cells get the same red gable they will have once
 * placed, which is how the player learns what "roof" means without a tutorial.
 *
 * READABILITY IS THE JOB HERE, not fidelity.
 *
 * A tray cell is 14–20 px. The in-world material detail (plank seams, masonry
 * courses, rivets) turns to mud at that size, and the earlier version leaned on
 * "silhouette plus accent colour" — which fails exactly when it matters: two
 * wood-family blocks side by side, or a dimmed unaffordable tile. So each cell
 * is a flat palette-coloured plate carrying one bold pictogram from
 * `blockGlyph`, drawn light-on-dark so contrast never depends on the block's
 * own colour.
 */

interface Props {
  shapeId: string
  /** CSS pixel size of the square the shape is fitted into. */
  size?: number
}

const props = withDefaults(defineProps<Props>(), { size: 52 })

const canvasRef = ref<HTMLCanvasElement | null>(null)

const roundRect = (
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number
): void => {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

const paint = (): void => {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const px = Math.round(props.size * dpr)
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, px, px)

  const def = shapeDef(props.shapeId)
  const { w, h } = shapeBounds(props.shapeId)
  // Fit the whole footprint into the square, leaving room for the roof to
  // overhang the top of its cell.
  const roofPad = (def.roofs?.length ?? 0) > 0 ? 0.42 : 0
  // No shrink factor: the tray is tight now, and a thumbnail that holds itself
  // 8 % off its own box is 8 % of the tray spent on nothing.
  const cell = Math.floor(Math.min(px / w, px / (h + roofPad)))
  const totalW = cell * w
  const totalH = cell * (h + roofPad)
  const ox = (px - totalW) / 2
  const oy = (px - totalH) / 2 + cell * roofPad

  const roofs = new Set(def.roofs ?? [])

  def.cells.forEach(([dx, dy, typeId], i) => {
    // `dy` grows upward in world space; the canvas grows downward.
    const x = ox + dx * cell
    const y = oy + (h - 1 - dy) * cell

    const override = spriteFor('block', typeId)
    if (override) {
      ctx.drawImage(override, x, y, cell, cell)
    } else {
      const bd = blockDef(typeId)
      const p = themedPalette(bd.palette)
      const inset = cell * 0.045
      const size = cell - inset * 2
      const rad = cell * 0.16

      // 1 · Plate. A vertical two-stop gradient rather than the in-world
      //     diagonal three-stop: at this size the extra stop only muddies the
      //     mid-tone the glyph has to sit on.
      roundRect(ctx, x + inset, y + inset, size, size, rad)
      const g = ctx.createLinearGradient(0, y, 0, y + cell)
      g.addColorStop(0, p.light)
      g.addColorStop(1, p.dark)
      ctx.fillStyle = g
      ctx.fill()

      // 2 · Dark rim. Two blocks of the same family sit flush against each
      //     other in a shape, and without this seam they read as one slab.
      ctx.strokeStyle = 'rgba(10,14,24,0.85)'
      ctx.lineWidth = Math.max(1, cell * 0.07)
      ctx.stroke()

      // 3 · Glyph, on its own dark disc.
      //
      //     The disc is what makes this legible on every palette: a pale glyph
      //     on a pale block (stone, frost) and a dark glyph on a dark block
      //     (gate, tesla) both vanish, and no single ink colour fixes both.
      //     A constant dark backing plate with a constant near-white glyph
      //     does, and it survives the tray's grayscale "unaffordable" filter.
      const gx = x + cell / 2
      const gy = y + cell / 2
      ctx.beginPath()
      ctx.arc(gx, gy, cell * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(8,12,20,0.46)'
      ctx.fill()

      ctx.save()
      ctx.translate(gx, gy)
      // The glyph is authored in a unit square, scaled to just under the disc.
      ctx.scale(cell * 0.56, cell * 0.56)
      ctx.fillStyle = '#f4f8ff'
      blockGlyph(typeId, bd.kind)(ctx)
      ctx.restore()

      // 4 · A colour pip in the corner, so the block's family is still
      //     available at a glance without the glyph having to carry hue too.
      ctx.beginPath()
      ctx.arc(x + cell * 0.82, y + cell * 0.82, cell * 0.1, 0, Math.PI * 2)
      ctx.fillStyle = p.accent2
      ctx.fill()
      ctx.strokeStyle = 'rgba(8,12,20,0.75)'
      ctx.lineWidth = Math.max(1, cell * 0.04)
      ctx.stroke()
    }

    // Roof cap — same red gable the placed block will wear.
    if (roofs.has(i)) {
      const cx = x + cell / 2
      const halfW = cell * 0.6
      const peak = cell * 0.4
      ctx.fillStyle = '#b8332c'
      ctx.beginPath()
      ctx.moveTo(cx - halfW, y + cell * 0.06)
      ctx.lineTo(cx, y - peak)
      ctx.lineTo(cx + halfW, y + cell * 0.06)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(20,10,8,0.9)'
      ctx.lineWidth = Math.max(1, cell * 0.05)
      ctx.stroke()
    }
  })
}

onMounted(paint)
watch(() => [props.shapeId, props.size], paint)
</script>

<template lang="pug">
  canvas.shape-tile(
    ref="canvasRef"
    :style="{ width: size + 'px', height: size + 'px' }"
    aria-hidden="true"
  )
</template>

<style scoped lang="sass">
.shape-tile
  display: block
  // Decorative; the parent button owns the interaction.
  pointer-events: none
</style>
