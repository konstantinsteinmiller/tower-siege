import { blockDef, GATE_ID, isShip } from '@/game/blocks'
import { enemyDef } from '@/game/enemies'
import { themedPalette, spriteFor, withAlpha, mixHex, type Palette } from '@/game/art'
import { isBossWave } from '@/game/waves'
import {
  monsterFrame, monsterFaces, monsterAnchor, pickMonster, primeMonsterSprites,
  allMonsterIds, SPRITE_FOOT, SPRITE_HEIGHT
} from '@/game/monsterSprites'
import { blob, fillShape, ink, noise2, shrink, stroke as inkStroke, type Pt } from '@/game/inkArt'
import { SHAPE_BY_ID } from '@/game/shapes'
import { drawSiegeMachine } from '@/game/siegeArt'
import { drawShip } from '@/game/shipArt'
import { drawCavalry } from '@/game/cavalryArt'
import { ALLY_DEFS } from '@/game/allies'
import { GRASS_DEPTH, SEA_LEVEL } from '@/game/world'
import type { Ally, Block, Enemy, EnemyDef, Projectile } from '@/game/types'
import {
  getBlocks, getEnemies, getProjectiles, getAllies, getDebris, nowMs, phase, wave, gameSpeed
} from '@/use/useTowerGame'
import {
  worldToScreenX, worldToScreenY, getZoom, viewRect, updateCamera
} from '@/use/useTowerCamera'
import {
  drainFx, emit, emitText, emitDecal, stepParticles, stepTexts, stepDecals,
  drawParticles, getTexts, getDecals, sampleFrame, quality, type FxEvent
} from '@/use/useTowerVfx'
import { useScreenshake } from '@/use/useScreenshake'
import { playFx } from '@/use/useTowerAudio'

/**
 * ─── Renderer ───────────────────────────────────────────────────────────────
 *
 * Everything is drawn procedurally with Canvas 2D — no gameplay bitmaps ship
 * with the game. That buys resolution independence (crisp at any DPR and any
 * zoom), a near-zero art payload, and the ability to restyle the whole tower
 * from a palette table.
 *
 * Layer order (back → front):
 *   1  sky gradient, tinted by the wave's "time of day"
 *   2  far mountain ridges          (parallax 0.15)
 *   3  forest band                  (parallax 0.34)
 *   4  ground + trampled lane       (parallax 1.0)
 *   5  water strip + mirrored tower reflection
 *   6  ground decals (craters)
 *   7  air enemies behind the tower, then blocks, then ground enemies
 *   8  projectiles + trails
 *   9  particles (normal pass, then additive pass)
 *  10  floating combat text, HP bars
 *  11  world-space build UI (grid, ghost, range circle)
 *
 * Layers 1–3 are cached into an offscreen canvas and only re-rendered when the
 * camera moves enough to matter — they are the most expensive and the least
 * likely to change frame-to-frame.
 */

const { triggerShake } = useScreenshake()

// ─── Block body sprite cache ────────────────────────────────────────────────
//
// The body of a block is static for a given (type, theme, damage stage, size).
// Rendering it once into an offscreen canvas and blitting thereafter turns
// ~14 canvas ops per block per frame into one `drawImage`. With 300 blocks on
// screen that is the difference between 60 fps and a slideshow on a mid phone.
//
// Size is bucketed to 6 px so a smooth zoom doesn't thrash the cache.

const spriteCache = new Map<string, HTMLCanvasElement>()
const SIZE_BUCKET = 6

const bucketed = (px: number): number => Math.max(12, Math.round(px / SIZE_BUCKET) * SIZE_BUCKET)

/** Damage stage 0 (pristine) → 2 (about to break). Drives the crack overlay. */
const damageStage = (b: Block): 0 | 1 | 2 => {
  const f = b.hp / b.maxHp
  return f > 0.66 ? 0 : f > 0.33 ? 1 : 2
}

const getBlockSprite = (typeId: string, stage: 0 | 1 | 2, sizePx: number): HTMLCanvasElement => {
  const size = bucketed(sizePx)
  const key = `${typeId}|${stage}|${size}`
  const hit = spriteCache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  drawBlockBody(ctx, typeId, stage, size)
  spriteCache.set(key, canvas)

  // Bound the cache. Blocks × 3 stages × a handful of zoom buckets stays well
  // under this; the eviction is a safety net for pathological zoom scrubbing.
  if (spriteCache.size > 260) {
    const firstKey = spriteCache.keys().next().value
    if (firstKey) spriteCache.delete(firstKey)
  }
  return canvas
}

// ─── Block body drawing ─────────────────────────────────────────────────────

/**
 * Paint one block body into a `size × size` context at the origin.
 *
 * The shading model is deliberately consistent across every material so a tower
 * built from five block types still reads as one object: light comes from the
 * upper left, so every block gets a bright top-left bevel, a mid-tone face, an
 * ambient-occlusion gradient in the lower right, and a dark outline.
 */
const drawBlockBody = (
  ctx: CanvasRenderingContext2D,
  typeId: string,
  stage: 0 | 1 | 2,
  size: number
): void => {
  const def = blockDef(typeId)
  const p = themedPalette(def.palette)
  const inset = Math.max(1, size * 0.03)
  const w = size - inset * 2
  const radius = size * 0.1

  ctx.save()
  ctx.translate(inset, inset)

  // ── Body ──
  roundRect(ctx, 0, 0, w, w, radius)
  const body = ctx.createLinearGradient(0, 0, w * 0.35, w)
  body.addColorStop(0, p.light)
  body.addColorStop(0.45, p.mid)
  body.addColorStop(1, p.dark)
  ctx.fillStyle = body
  ctx.fill()

  // ── Ambient occlusion in the lower-right corner ──
  const ao = ctx.createRadialGradient(w * 0.95, w * 0.95, w * 0.05, w * 0.95, w * 0.95, w * 0.95)
  ao.addColorStop(0, 'rgba(0,0,0,0.32)')
  ao.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = ao
  roundRect(ctx, 0, 0, w, w, radius)
  ctx.fill()

  // ── Material detail ──
  ctx.save()
  roundRect(ctx, 0, 0, w, w, radius)
  ctx.clip()
  drawMaterial(ctx, typeId, p, w)
  ctx.restore()

  // ── Specular sheen ──
  // A single soft diagonal band across the upper-left face. It is what makes a
  // flat coloured square read as a solid object with a surface, and it costs one
  // clipped gradient fill per cached sprite.
  ctx.save()
  roundRect(ctx, 0, 0, w, w, radius)
  ctx.clip()
  const sheen = ctx.createLinearGradient(0, 0, w * 0.9, w * 0.9)
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)')
  sheen.addColorStop(0.34, 'rgba(255,255,255,0.07)')
  sheen.addColorStop(0.52, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, w, w)
  // Grounded lower edge: a dark band along the bottom so blocks stack with a
  // visible seam instead of melting into one another.
  const foot = ctx.createLinearGradient(0, w * 0.78, 0, w)
  foot.addColorStop(0, 'rgba(0,0,0,0)')
  foot.addColorStop(1, 'rgba(0,0,0,0.34)')
  ctx.fillStyle = foot
  ctx.fillRect(0, w * 0.78, w, w * 0.22)
  ctx.restore()

  // ── Top-left bevel highlight ──
  ctx.strokeStyle = withAlpha('#ffffff', 0.34)
  ctx.lineWidth = Math.max(1, w * 0.055)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(radius * 0.8, w * 0.06)
  ctx.lineTo(w - radius * 0.8, w * 0.06)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(w * 0.06, radius * 0.8)
  ctx.lineTo(w * 0.06, w - radius * 0.8)
  ctx.stroke()

  // ── Outline ──
  // Two strokes: a dark contact line first, then the palette accent inside it.
  // The dark pass is what separates the tower from a busy background — without
  // it the blocks dissolve into the sky at small zooms.
  roundRect(ctx, 0, 0, w, w, radius)
  ctx.strokeStyle = 'rgba(12,16,26,0.75)'
  ctx.lineWidth = Math.max(1.5, w * 0.075)
  ctx.stroke()
  roundRect(ctx, 0, 0, w, w, radius)
  ctx.strokeStyle = withAlpha(p.accent, 0.9)
  ctx.lineWidth = Math.max(1, w * 0.045)
  ctx.stroke()

  // ── Damage cracks ──
  if (stage === 1 || stage === 2) drawCracks(ctx, w, stage)

  ctx.restore()
}

/** Per-material surface pattern, drawn clipped to the body shape. */
const drawMaterial = (ctx: CanvasRenderingContext2D, typeId: string, p: Palette, w: number): void => {
  switch (typeId) {
    case 'wood':
    case 'sawmill': {
      // A real packing crate: three sawn boards held between two vertical
      // frame rails, with visible grain and iron corner brackets. The extra
      // structure is what separates "crate" from "brown square with lines".
      const planks = 3
      const h = w / planks

      for (let i = 0; i < planks; i++) {
        const y = i * h
        // Each board gets its own top light / bottom shadow, so the stack has
        // depth instead of being one flat face with seams drawn on it.
        const board = ctx.createLinearGradient(0, y, 0, y + h)
        board.addColorStop(0, withAlpha(p.light, 0.42))
        board.addColorStop(0.22, 'rgba(0,0,0,0)')
        board.addColorStop(0.82, 'rgba(0,0,0,0)')
        board.addColorStop(1, withAlpha(p.dark, 0.55))
        ctx.fillStyle = board
        ctx.fillRect(0, y, w, h)

        // Grain: two long, shallow arcs per board.
        ctx.strokeStyle = withAlpha(p.dark, 0.3)
        ctx.lineWidth = Math.max(1, w * 0.016)
        for (let g = 0; g < 2; g++) {
          const gy = y + h * (0.34 + g * 0.32)
          ctx.beginPath()
          ctx.moveTo(w * 0.08, gy)
          ctx.quadraticCurveTo(w * 0.5, gy + (g % 2 === 0 ? -h * 0.12 : h * 0.12), w * 0.92, gy)
          ctx.stroke()
        }
      }
      // Board seams.
      ctx.strokeStyle = withAlpha(p.dark, 0.8)
      ctx.lineWidth = Math.max(1, w * 0.026)
      for (let i = 1; i < planks; i++) {
        ctx.beginPath(); ctx.moveTo(0, i * h); ctx.lineTo(w, i * h); ctx.stroke()
      }

      // Vertical frame rails down both edges.
      const rail = ctx.createLinearGradient(0, 0, w * 0.16, 0)
      rail.addColorStop(0, withAlpha(p.light, 0.5))
      rail.addColorStop(1, withAlpha(p.dark, 0.3))
      ctx.fillStyle = rail
      ctx.fillRect(0, 0, w * 0.14, w)
      ctx.fillRect(w * 0.86, 0, w * 0.14, w)
      ctx.strokeStyle = withAlpha(p.dark, 0.6)
      ctx.lineWidth = Math.max(1, w * 0.022)
      ctx.beginPath()
      ctx.moveTo(w * 0.14, 0); ctx.lineTo(w * 0.14, w)
      ctx.moveTo(w * 0.86, 0); ctx.lineTo(w * 0.86, w)
      ctx.stroke()

      // Iron corner brackets with rivets.
      ctx.strokeStyle = withAlpha(p.accent, 0.85)
      ctx.lineWidth = Math.max(1.2, w * 0.05)
      ctx.lineCap = 'butt'
      for (const [sxs, sys] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
        const ox = sxs > 0 ? w * 0.06 : w * 0.94
        const oy = sys > 0 ? w * 0.06 : w * 0.94
        ctx.beginPath()
        ctx.moveTo(ox + sxs * w * 0.2, oy)
        ctx.lineTo(ox, oy)
        ctx.lineTo(ox, oy + sys * w * 0.2)
        ctx.stroke()
      }
      ctx.fillStyle = withAlpha(p.accent2, 0.75)
      for (const [nx, ny] of [[0.11, 0.11], [0.89, 0.11], [0.11, 0.89], [0.89, 0.89]] as const) {
        ctx.beginPath(); ctx.arc(nx * w, ny * w, w * 0.035, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'brace': {
      // Boards behind, then a cross of squared timbers bolted over them. The
      // two layers are what make this read as REINFORCED wood rather than as
      // plain wood with a decal on it.
      ctx.strokeStyle = withAlpha(p.dark, 0.5)
      ctx.lineWidth = Math.max(1, w * 0.022)
      for (const yy of [0.3, 0.7]) {
        ctx.beginPath(); ctx.moveTo(0, w * yy); ctx.lineTo(w, w * yy); ctx.stroke()
      }

      ctx.lineCap = 'butt'
      for (const [ax, ay, bx, by] of [[0.14, 0.14, 0.86, 0.86], [0.86, 0.14, 0.14, 0.86]] as const) {
        // Drop shadow first, then the timber, then its lit upper face.
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'
        ctx.lineWidth = w * 0.19
        ctx.beginPath()
        ctx.moveTo(w * ax, w * ay + w * 0.03); ctx.lineTo(w * bx, w * by + w * 0.03)
        ctx.stroke()

        ctx.strokeStyle = p.mid
        ctx.lineWidth = w * 0.17
        ctx.beginPath()
        ctx.moveTo(w * ax, w * ay); ctx.lineTo(w * bx, w * by)
        ctx.stroke()

        ctx.strokeStyle = withAlpha(p.light, 0.7)
        ctx.lineWidth = w * 0.045
        ctx.beginPath()
        ctx.moveTo(w * ax, w * ay - w * 0.055); ctx.lineTo(w * bx, w * by - w * 0.055)
        ctx.stroke()
      }

      // Bolt at the crossing plus one at each anchor point.
      ctx.fillStyle = withAlpha(p.accent2, 0.85)
      for (const [bx, by] of [[0.5, 0.5], [0.16, 0.16], [0.84, 0.16], [0.16, 0.84], [0.84, 0.84]] as const) {
        ctx.beginPath(); ctx.arc(bx * w, by * w, w * 0.045, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = withAlpha('#000', 0.4)
        ctx.lineWidth = Math.max(1, w * 0.014)
        ctx.stroke()
      }
      break
    }
    case 'stone':
    case 'quarry': {
      // Running-bond masonry. Each stone is drawn as its own rounded block with
      // a lit top edge and a shadowed base, then the mortar joints are cut in
      // over the top — a grid of lines alone reads as wallpaper, not as rock.
      const rows = 3
      const h = w / rows
      const inset = w * 0.012

      for (let r = 0; r < rows; r++) {
        const y = r * h
        // Alternate rows are offset by half a stone, and the row edges run off
        // the block so the bond continues into its neighbours.
        const off = r % 2 === 0 ? 0 : -w * 0.25
        for (let k = -1; k <= 2; k++) {
          const x = off + k * (w * 0.5)
          if (x > w || x + w * 0.5 < 0) continue
          const shade = 0.86 + ((r * 3 + k * 7) % 5) * 0.06
          ctx.fillStyle = mixHex(p.dark, p.light, shade - 0.42)
          roundRect(ctx, x + inset, y + inset, w * 0.5 - inset * 2, h - inset * 2, w * 0.03)
          ctx.fill()
          // Lit chamfer on top, shadow underneath.
          ctx.strokeStyle = withAlpha('#ffffff', 0.2)
          ctx.lineWidth = Math.max(1, w * 0.018)
          ctx.beginPath()
          ctx.moveTo(x + w * 0.06, y + inset + ctx.lineWidth)
          ctx.lineTo(x + w * 0.44, y + inset + ctx.lineWidth)
          ctx.stroke()
          ctx.strokeStyle = withAlpha('#000', 0.3)
          ctx.beginPath()
          ctx.moveTo(x + w * 0.06, y + h - inset - ctx.lineWidth)
          ctx.lineTo(x + w * 0.44, y + h - inset - ctx.lineWidth)
          ctx.stroke()
        }
      }

      // Chipped highlights and granite speckle.
      ctx.fillStyle = withAlpha(p.light, 0.28)
      for (let i = 0; i < 9; i++) {
        const sx = ((i * 97) % 100) / 100 * w
        const sy = ((i * 61) % 100) / 100 * w
        ctx.beginPath(); ctx.arc(sx, sy, w * 0.018, 0, Math.PI * 2); ctx.fill()
      }
      // A little moss in the lower joints — the cue that this is old stonework.
      ctx.fillStyle = 'rgba(96,140,66,0.28)'
      for (const [mx, my] of [[0.1, 0.94], [0.52, 0.66], [0.86, 0.92]] as const) {
        ctx.beginPath(); ctx.ellipse(mx * w, my * w, w * 0.09, w * 0.035, 0, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'gate': {
      // An arched, banded door — the thing everything else exists to protect.
      ctx.fillStyle = withAlpha(p.dark, 0.85)
      ctx.beginPath()
      ctx.moveTo(w * 0.22, w)
      ctx.lineTo(w * 0.22, w * 0.42)
      ctx.arc(w * 0.5, w * 0.42, w * 0.28, Math.PI, 0)
      ctx.lineTo(w * 0.78, w)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = p.accent
      ctx.lineWidth = w * 0.05
      ctx.stroke()
      // Iron bands.
      ctx.strokeStyle = withAlpha(p.accent, 0.85)
      ctx.lineWidth = w * 0.055
      for (const yy of [0.55, 0.78]) {
        ctx.beginPath(); ctx.moveTo(w * 0.22, w * yy); ctx.lineTo(w * 0.78, w * yy); ctx.stroke()
      }
      // Warm light spilling from within — the tower is inhabited.
      const glow = ctx.createRadialGradient(w * 0.5, w * 0.62, 0, w * 0.5, w * 0.62, w * 0.3)
      glow.addColorStop(0, withAlpha(p.accent2, 0.5))
      glow.addColorStop(1, withAlpha(p.accent2, 0))
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, w)
      break
    }
    case 'spikes': {
      // Rough-cut palisade timbers behind the spikes, bound with two iron straps.
      // Vertical grain here contrasts with the horizontal planks of a wood crate,
      // so the two never get confused mid-build.
      ctx.strokeStyle = withAlpha(p.dark, 0.7)
      ctx.lineWidth = Math.max(1, w * 0.03)
      for (const xx of [0.22, 0.4, 0.6, 0.78]) {
        ctx.beginPath(); ctx.moveTo(w * xx, w * 0.06); ctx.lineTo(w * xx, w); ctx.stroke()
      }
      ctx.fillStyle = withAlpha(p.accent, 0.85)
      for (const yy of [0.32, 0.74]) {
        ctx.fillRect(0, w * yy, w, w * 0.09)
        ctx.fillStyle = withAlpha('#ffffff', 0.18)
        ctx.fillRect(0, w * yy, w, w * 0.022)
        ctx.fillStyle = withAlpha(p.accent, 0.85)
      }
      // Strap rivets.
      ctx.fillStyle = withAlpha(p.accent2, 0.75)
      for (const [rx, ry] of [[0.16, 0.365], [0.84, 0.365], [0.16, 0.785], [0.84, 0.785]] as const) {
        ctx.beginPath(); ctx.arc(rx * w, ry * w, w * 0.032, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'bombard': {
      // A stone emplacement with a sunken firing pit: the mouth of the weapon is
      // part of the BLOCK, so the barrel that sticks out of it reads as mounted
      // rather than balanced on top.
      ctx.fillStyle = withAlpha(p.dark, 0.55)
      ctx.beginPath()
      ctx.ellipse(w * 0.5, w * 0.42, w * 0.3, w * 0.15, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = withAlpha(p.accent, 0.8)
      ctx.lineWidth = Math.max(1, w * 0.035)
      ctx.stroke()
      // Sandbag courses along the bottom.
      ctx.fillStyle = withAlpha(p.light, 0.32)
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.ellipse(w * (0.16 + i * 0.23), w * 0.8, w * 0.13, w * 0.075, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.strokeStyle = withAlpha(p.dark, 0.5)
      ctx.lineWidth = Math.max(1, w * 0.022)
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.ellipse(w * (0.16 + i * 0.23), w * 0.8, w * 0.13, w * 0.075, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    default: {
      // Weapon / utility platform: a recessed metal plate the fixture bolts to.
      ctx.fillStyle = withAlpha(p.dark, 0.45)
      roundRect(ctx, w * 0.16, w * 0.5, w * 0.68, w * 0.36, w * 0.06)
      ctx.fill()
      ctx.strokeStyle = withAlpha(p.accent, 0.6)
      ctx.lineWidth = Math.max(1, w * 0.03)
      ctx.stroke()
      // Rivets.
      ctx.fillStyle = withAlpha(p.accent2, 0.5)
      for (const [rx, ry] of [[0.24, 0.58], [0.76, 0.58], [0.24, 0.79], [0.76, 0.79]] as const) {
        ctx.beginPath(); ctx.arc(rx * w, ry * w, w * 0.03, 0, Math.PI * 2); ctx.fill()
      }
    }
  }
}

/** Deterministic crack overlay — same block always cracks the same way, so the
 *  damage read is stable rather than shimmering between frames. */
const drawCracks = (ctx: CanvasRenderingContext2D, w: number, stage: 1 | 2): void => {
  const seeds = stage === 1
    ? [[0.18, 0.1, 0.42, 0.46, 0.3, 0.72]]
    : [[0.18, 0.1, 0.42, 0.46, 0.3, 0.72], [0.82, 0.2, 0.58, 0.5, 0.72, 0.9], [0.05, 0.62, 0.34, 0.68, 0.2, 0.95]]
  ctx.lineCap = 'round'
  for (const s of seeds) {
    // Draw twice: a light "chipped edge" behind a dark fissure reads as depth.
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = Math.max(1, w * 0.05)
    ctx.beginPath()
    ctx.moveTo(s[0]! * w, s[1]! * w)
    ctx.lineTo(s[2]! * w, s[3]! * w)
    ctx.lineTo(s[4]! * w, s[5]! * w)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.lineWidth = Math.max(1, w * 0.028)
    ctx.beginPath()
    ctx.moveTo(s[0]! * w, s[1]! * w)
    ctx.lineTo(s[2]! * w, s[3]! * w)
    ctx.lineTo(s[4]! * w, s[5]! * w)
    ctx.stroke()
  }
}

/**
 * The gable cap on a roofed block.
 *
 * It has to be readable at a glance from across the tower, because "can I build
 * on this?" is a question the player asks constantly — so it is drawn OUTSIDE
 * the cell (overhanging the top edge) in a saturated tile red that no block
 * material uses. Cheap to draw, impossible to miss.
 */
const drawRoof = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void => {
  const halfW = size * 0.62
  const peak = size * 0.42
  const baseY = cy - size * 0.5

  ctx.save()
  // Eaves shadow, so the roof reads as sitting ON the block rather than in it.
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.beginPath()
  ctx.moveTo(cx - halfW, baseY + size * 0.06)
  ctx.lineTo(cx + halfW, baseY + size * 0.06)
  ctx.lineTo(cx + halfW * 0.86, baseY + size * 0.13)
  ctx.lineTo(cx - halfW * 0.86, baseY + size * 0.13)
  ctx.closePath()
  ctx.fill()

  const g = ctx.createLinearGradient(cx - halfW, baseY - peak, cx + halfW, baseY)
  g.addColorStop(0, '#e0574d')
  g.addColorStop(0.5, '#b8332c')
  g.addColorStop(1, '#7d1f1a')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(cx - halfW, baseY + size * 0.06)
  ctx.lineTo(cx, baseY - peak)
  ctx.lineTo(cx + halfW, baseY + size * 0.06)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(20,10,8,0.9)'
  ctx.lineWidth = Math.max(1, size * 0.045)
  ctx.stroke()

  // Ridge highlight.
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = Math.max(1, size * 0.03)
  ctx.beginPath()
  ctx.moveTo(cx - halfW * 0.7, baseY - peak * 0.12)
  ctx.lineTo(cx, baseY - peak * 0.9)
  ctx.stroke()
  ctx.restore()
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// ─── Weapon fixtures (drawn live — they rotate and recoil) ──────────────────

/** Elevation of a mortar tube, radians above horizontal. Shared with the
 *  muzzle flash so the flame leaves the actual mouth of the actual barrel. */
const MORTAR_ELEV = 0.98
/** The bombard drops it just over the wall, so it sits far steeper. */
const BOMBARD_ELEV = 1.24

const drawFixture = (ctx: CanvasRenderingContext2D, b: Block, cx: number, cy: number, s: number, t: number): void => {
  const def = blockDef(b.typeId)
  const p = themedPalette(def.palette)
  const recoil = b.recoil * s * 0.12

  ctx.save()
  ctx.translate(cx, cy)

  switch (b.typeId) {
    case 'cannon': {
      // Carriage first, in BLOCK space — it does not rotate with the gun.
      ctx.save()
      ctx.fillStyle = withAlpha('#3a2a1a', 0.95)
      roundRect(ctx, -s * 0.26, s * 0.04, s * 0.52, s * 0.16, s * 0.04)
      ctx.fill()
      ctx.strokeStyle = withAlpha('#000', 0.5)
      ctx.lineWidth = Math.max(1, s * 0.02)
      ctx.stroke()
      // Wheels.
      for (const wx of [-0.15, 0.15]) {
        ctx.fillStyle = '#2b1f14'
        ctx.beginPath(); ctx.arc(wx * s, s * 0.2, s * 0.1, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = withAlpha(p.accent, 0.75)
        ctx.lineWidth = Math.max(1, s * 0.022)
        ctx.stroke()
        ctx.beginPath(); ctx.arc(wx * s, s * 0.2, s * 0.032, 0, Math.PI * 2)
        ctx.fillStyle = p.accent; ctx.fill()
      }
      ctx.restore()

      ctx.rotate(-b.aim)
      ctx.translate(-recoil, 0)

      // Cascabel and breech: the fat rear end that tells you which way it shoots.
      ctx.fillStyle = p.dark
      ctx.beginPath(); ctx.arc(-s * 0.12, 0, s * 0.075, 0, Math.PI * 2); ctx.fill()

      // Barrel — a proper tapered tube with a lit top edge.
      const g = ctx.createLinearGradient(0, -s * 0.19, 0, s * 0.19)
      g.addColorStop(0, '#ffffff')
      g.addColorStop(0.16, p.light)
      g.addColorStop(0.55, p.mid)
      g.addColorStop(1, p.dark)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(-s * 0.08, -s * 0.18)
      ctx.lineTo(s * 0.34, -s * 0.13)
      ctx.lineTo(s * 0.52, -s * 0.145)
      ctx.lineTo(s * 0.52, s * 0.145)
      ctx.lineTo(s * 0.34, s * 0.13)
      ctx.lineTo(-s * 0.08, s * 0.18)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = withAlpha('#000', 0.6)
      ctx.lineWidth = Math.max(1, s * 0.022)
      ctx.stroke()

      // Reinforcing rings along the tube.
      ctx.strokeStyle = withAlpha(p.accent, 0.9)
      ctx.lineWidth = Math.max(1, s * 0.035)
      for (const bx of [0.02, 0.2]) {
        ctx.beginPath()
        ctx.moveTo(s * bx, -s * 0.17)
        ctx.lineTo(s * bx, s * 0.17)
        ctx.stroke()
      }

      // Muzzle swell and the dark bore inside it.
      ctx.fillStyle = p.accent
      roundRect(ctx, s * 0.46, -s * 0.165, s * 0.09, s * 0.33, s * 0.03)
      ctx.fill()
      ctx.fillStyle = '#0b0a08'
      ctx.beginPath()
      ctx.ellipse(s * 0.54, 0, s * 0.028, s * 0.1, 0, 0, Math.PI * 2)
      ctx.fill()

      // Trunnion pin at the pivot, so the gun visibly hangs off its carriage.
      ctx.fillStyle = p.accent2
      ctx.beginPath(); ctx.arc(0, s * 0.04, s * 0.05, 0, Math.PI * 2); ctx.fill()

      // Residual heat glow in the barrel right after firing.
      if (b.recoil > 0.15) {
        const heat = ctx.createRadialGradient(s * 0.54, 0, 0, s * 0.54, 0, s * 0.2 * b.recoil)
        heat.addColorStop(0, `rgba(255,180,60,${0.5 * b.recoil})`)
        heat.addColorStop(1, 'rgba(255,120,20,0)')
        ctx.fillStyle = heat
        ctx.beginPath(); ctx.arc(s * 0.54, 0, s * 0.2 * b.recoil, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'archer': {
      // Merlons: a crenellated parapet the bow sits behind, in block space.
      ctx.save()
      ctx.fillStyle = withAlpha(p.dark, 0.9)
      for (const mx of [-0.32, -0.06, 0.2]) {
        roundRect(ctx, mx * s, s * 0.06, s * 0.18, s * 0.16, s * 0.03)
        ctx.fill()
      }
      ctx.restore()

      ctx.rotate(-b.aim)
      ctx.translate(-recoil * 0.6, 0)

      // `draw` runs 1 → 0 as the shot leaves: the string snaps forward rather
      // than the whole bow sliding, which is what makes a bow read as a bow.
      const draw = Math.min(1, b.recoil * 2.2)
      const limb = s * 0.34
      const tipA = -1.32
      const tipB = 1.32

      // Bow limbs: two mirrored recurves meeting at a wrapped grip.
      ctx.lineCap = 'round'
      ctx.strokeStyle = withAlpha('#000', 0.45)
      ctx.lineWidth = Math.max(2, s * 0.085)
      ctx.beginPath()
      ctx.arc(s * 0.06, 0, limb, tipA, tipB)
      ctx.stroke()
      const wood = ctx.createLinearGradient(s * 0.06, -limb, s * 0.06, limb)
      wood.addColorStop(0, p.light)
      wood.addColorStop(0.5, p.accent2)
      wood.addColorStop(1, p.mid)
      ctx.strokeStyle = wood
      ctx.lineWidth = Math.max(1.4, s * 0.055)
      ctx.beginPath()
      ctx.arc(s * 0.06, 0, limb, tipA, tipB)
      ctx.stroke()

      // Recurved tips flicking the other way.
      ctx.lineWidth = Math.max(1.2, s * 0.04)
      for (const a of [tipA, tipB]) {
        const tx = s * 0.06 + Math.cos(a) * limb
        const ty = Math.sin(a) * limb
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.quadraticCurveTo(tx + s * 0.06, ty * 1.12, tx - s * 0.02, ty * 1.24)
        ctx.stroke()
      }

      // Leather grip.
      ctx.strokeStyle = '#4a3018'
      ctx.lineWidth = Math.max(1.6, s * 0.07)
      ctx.beginPath()
      ctx.moveTo(s * 0.06 - limb * 0.02, -s * 0.06)
      ctx.lineTo(s * 0.06 - limb * 0.02, s * 0.06)
      ctx.stroke()

      // String, pulled back to the nock point.
      const nock = s * 0.06 - limb * (0.1 + draw * 0.62)
      ctx.strokeStyle = withAlpha('#ffffff', 0.85)
      ctx.lineWidth = Math.max(1, s * 0.02)
      ctx.beginPath()
      ctx.moveTo(s * 0.06 + Math.cos(tipA) * limb, Math.sin(tipA) * limb)
      ctx.lineTo(nock, 0)
      ctx.lineTo(s * 0.06 + Math.cos(tipB) * limb, Math.sin(tipB) * limb)
      ctx.stroke()

      // Nocked arrow — only while the string is actually drawn.
      if (draw > 0.08) {
        ctx.strokeStyle = '#e8dcc0'
        ctx.lineWidth = Math.max(1, s * 0.026)
        ctx.beginPath()
        ctx.moveTo(nock, 0)
        ctx.lineTo(nock + s * 0.42, 0)
        ctx.stroke()
        ctx.fillStyle = '#d8dee6'
        ctx.beginPath()
        ctx.moveTo(nock + s * 0.42, 0)
        ctx.lineTo(nock + s * 0.34, -s * 0.05)
        ctx.lineTo(nock + s * 0.34, s * 0.05)
        ctx.closePath()
        ctx.fill()
        // Fletching.
        ctx.fillStyle = withAlpha(p.accent, 0.9)
        ctx.beginPath()
        ctx.moveTo(nock + s * 0.03, 0)
        ctx.lineTo(nock - s * 0.05, -s * 0.06)
        ctx.lineTo(nock + s * 0.09, 0)
        ctx.lineTo(nock - s * 0.05, s * 0.06)
        ctx.closePath()
        ctx.fill()
      }
      break
    }
    case 'mortar': {
      // Fixed steep angle — mortars lob, they don't track. The tube is built
      // along +x like the cannon's and then rotated onto its elevation, so one
      // angle serves the drawing, the recoil and the muzzle flash. (Built
      // pointing "up" and mirrored by negating the angle, a right-hand column
      // aimed its mouth down into its own carriage.)
      ctx.rotate(-lobAngle(b.c, MORTAR_ELEV))
      ctx.translate(-recoil, 0)
      const g = ctx.createLinearGradient(0, -s * 0.16, 0, s * 0.16)
      g.addColorStop(0, p.light); g.addColorStop(0.5, p.mid); g.addColorStop(1, p.dark)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.13)
      ctx.lineTo(s * 0.42, -s * 0.2)
      ctx.lineTo(s * 0.42, s * 0.2)
      ctx.lineTo(0, s * 0.13)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = withAlpha('#000', 0.5); ctx.lineWidth = Math.max(1, s * 0.02); ctx.stroke()
      // Reinforcing band, so the tube has a waist to recoil against.
      ctx.strokeStyle = withAlpha(p.accent, 0.85)
      ctx.lineWidth = Math.max(1, s * 0.035)
      ctx.beginPath(); ctx.moveTo(s * 0.16, -s * 0.17); ctx.lineTo(s * 0.16, s * 0.17); ctx.stroke()
      // Bore.
      ctx.fillStyle = withAlpha('#000', 0.55)
      ctx.beginPath(); ctx.ellipse(s * 0.42, 0, s * 0.06, s * 0.2, 0, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'tesla': {
      // Coil with orbiting charge; the idle arc telegraphs "this one chains".
      const pulse = 0.5 + 0.5 * Math.sin(t / 150)
      ctx.fillStyle = p.dark
      ctx.fillRect(-s * 0.05, -s * 0.34, s * 0.1, s * 0.34)
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = withAlpha(p.accent, 0.55 + i * 0.12)
        ctx.lineWidth = Math.max(1, s * 0.03)
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.1 - i * s * 0.08, s * 0.16 - i * s * 0.03, s * 0.05, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      const glow = ctx.createRadialGradient(0, -s * 0.38, 0, 0, -s * 0.38, s * 0.2 * (0.7 + pulse * 0.5))
      glow.addColorStop(0, withAlpha(p.accent2, 0.95))
      glow.addColorStop(0.4, withAlpha(p.accent, 0.6))
      glow.addColorStop(1, withAlpha(p.accent, 0))
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(0, -s * 0.38, s * 0.22, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'frost': {
      const pulse = 0.5 + 0.5 * Math.sin(t / 320)
      ctx.fillStyle = withAlpha(p.accent, 0.9)
      for (const [ox, oy, sc] of [[0, -0.34, 1], [-0.13, -0.22, 0.7], [0.13, -0.24, 0.62]] as const) {
        ctx.beginPath()
        ctx.moveTo(ox * s, (oy - 0.1 * sc) * s)
        ctx.lineTo((ox + 0.07 * sc) * s, oy * s)
        ctx.lineTo(ox * s, (oy + 0.12 * sc) * s)
        ctx.lineTo((ox - 0.07 * sc) * s, oy * s)
        ctx.closePath()
        ctx.fill()
      }
      const glow = ctx.createRadialGradient(0, -s * 0.28, 0, 0, -s * 0.28, s * 0.3)
      glow.addColorStop(0, withAlpha(p.accent2, 0.4 + pulse * 0.25))
      glow.addColorStop(1, withAlpha(p.accent2, 0))
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(0, -s * 0.28, s * 0.3, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'spikes': {
      // Iron spikes on all four faces. They point OUT of the block on every side
      // because the thorns rule fires no matter which face gets hit, and art
      // that only spikes the top would lie about that.
      const glint = 0.55 + 0.45 * Math.sin(t / 420 + b.c * 1.7)
      for (const [ang, count] of [[0, 3], [Math.PI, 3], [-Math.PI / 2, 4], [Math.PI / 2, 4]] as const) {
        ctx.save()
        ctx.rotate(ang)
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * s * 0.19
          const len = s * (0.2 + (i % 2) * 0.05)
          const grad = ctx.createLinearGradient(s * 0.4, off, s * 0.4 + len, off)
          grad.addColorStop(0, p.dark)
          grad.addColorStop(0.5, p.light)
          grad.addColorStop(1, '#ffffff')
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.moveTo(s * 0.38, off - s * 0.055)
          ctx.lineTo(s * 0.4 + len, off)
          ctx.lineTo(s * 0.38, off + s * 0.055)
          ctx.closePath()
          ctx.fill()
          ctx.strokeStyle = withAlpha('#000', 0.45)
          ctx.lineWidth = Math.max(1, s * 0.014)
          ctx.stroke()
        }
        ctx.restore()
      }
      // Tip glints, so the wall looks sharp rather than merely bumpy.
      ctx.fillStyle = `rgba(255,255,255,${0.35 * glint})`
      for (const [gx, gy] of [[0.6, -0.19], [0.6, 0.19], [-0.6, 0], [0, -0.6], [0, 0.6]] as const) {
        ctx.beginPath(); ctx.arc(gx * s, gy * s, s * 0.028, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'bombard': {
      // Squat wide-mouthed barrel on a steep fixed elevation. Unlike the mortar
      // it recoils straight DOWN into its pit, which is the visual difference
      // between "lobs far" and "drops it just over the wall".
      ctx.rotate(-lobAngle(b.c, BOMBARD_ELEV))
      ctx.translate(-recoil * 1.4, 0)

      // Trunnion cheeks.
      ctx.fillStyle = p.dark
      ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2); ctx.fill()

      const g = ctx.createLinearGradient(0, -s * 0.22, 0, s * 0.22)
      g.addColorStop(0, p.light); g.addColorStop(0.58, p.mid); g.addColorStop(1, p.dark)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(-s * 0.04, -s * 0.15)
      ctx.lineTo(s * 0.3, -s * 0.23)
      ctx.lineTo(s * 0.3, s * 0.23)
      ctx.lineTo(-s * 0.04, s * 0.15)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = withAlpha('#000', 0.55); ctx.lineWidth = Math.max(1, s * 0.025); ctx.stroke()

      // Reinforcing bands.
      ctx.strokeStyle = withAlpha(p.accent, 0.9)
      ctx.lineWidth = Math.max(1, s * 0.04)
      for (const xx of [0.08, 0.2]) {
        const halfH = 0.17 + xx * 0.2
        ctx.beginPath()
        ctx.moveTo(s * xx, -s * halfH)
        ctx.lineTo(s * xx, s * halfH)
        ctx.stroke()
      }
      // Flared muzzle + bore shadow.
      ctx.fillStyle = p.accent
      ctx.beginPath()
      ctx.ellipse(s * 0.3, 0, s * 0.07, s * 0.25, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0d0b09'
      ctx.beginPath()
      ctx.ellipse(s * 0.3, 0, s * 0.045, s * 0.17, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'sawmill': {
      ctx.rotate(t / 260)
      ctx.strokeStyle = p.accent
      ctx.fillStyle = withAlpha(p.light, 0.9)
      ctx.beginPath(); ctx.arc(0, -s * 0.18, s * 0.2, 0, Math.PI * 2); ctx.fill()
      ctx.lineWidth = Math.max(1, s * 0.03)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * s * 0.2, -s * 0.18 + Math.sin(a) * s * 0.2)
        ctx.lineTo(Math.cos(a) * s * 0.27, -s * 0.18 + Math.sin(a) * s * 0.27)
        ctx.stroke()
      }
      break
    }
    case 'quarry': {
      ctx.rotate(Math.sin(t / 320) * 0.5 - 0.4)
      ctx.strokeStyle = p.accent
      ctx.lineWidth = Math.max(1.5, s * 0.05)
      ctx.beginPath()
      ctx.moveTo(-s * 0.02, -s * 0.05); ctx.lineTo(-s * 0.02, -s * 0.34)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(-s * 0.02, -s * 0.34, s * 0.18, Math.PI * 1.1, Math.PI * 1.9)
      ctx.stroke()
      break
    }
    case 'mint': {
      const bob = Math.sin(t / 400) * s * 0.03
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i === 0 ? p.accent2 : p.accent
        ctx.beginPath()
        ctx.ellipse(0, -s * 0.14 - i * s * 0.08 + bob, s * 0.15, s * 0.055, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = withAlpha('#000', 0.35); ctx.lineWidth = Math.max(1, s * 0.015); ctx.stroke()
      }
      break
    }
    case 'repair': {
      const pulse = 0.6 + 0.4 * Math.sin(t / 300)
      ctx.fillStyle = withAlpha(p.accent, pulse)
      const arm = s * 0.09
      ctx.fillRect(-arm / 2, -s * 0.4, arm, s * 0.34)
      ctx.fillRect(-s * 0.17, -s * 0.28, s * 0.34, arm)
      break
    }
  }

  ctx.restore()
}

// ─── Unit tint layer ────────────────────────────────────────────────────────
//
// Hit flashes and the frost chill are drawn with `source-atop` so they only
// light up the unit's own pixels. Composited straight onto the battlefield that
// operator sees an opaque background underneath and paints a glowing RECTANGLE
// over the scenery. So a tinted unit is painted into this scratch layer — which
// is transparent everywhere it has not drawn — and the finished, tinted result
// is stamped back onto the scene.
//
// One shared canvas, grown on demand and never shrunk: at most one unit is
// being composited at a time, and reallocating per unit would churn the GPU.

let tintCanvas: HTMLCanvasElement | null = null
let tintCtx: CanvasRenderingContext2D | null = null
let tintSize = 0
let tintDpr = 1

/**
 * Begin painting a unit into the scratch layer.
 *
 * Returns a context pre-translated so that the caller's usual
 * `translate(cx, cy)` lands on the centre of the layer — the drawing code is
 * therefore identical whether or not it is being tinted.
 */
const beginUnitLayer = (cx: number, cy: number, pad: number): CanvasRenderingContext2D => {
  const size = Math.max(16, Math.ceil(pad * 2))
  if (!tintCanvas) {
    tintCanvas = document.createElement('canvas')
    tintCtx = tintCanvas.getContext('2d')
  }
  if (size > tintSize || tintCanvas.width !== Math.ceil(size * tintDpr)) {
    tintSize = Math.max(size, tintSize)
    tintCanvas.width = Math.ceil(tintSize * tintDpr)
    tintCanvas.height = Math.ceil(tintSize * tintDpr)
  }
  const c = tintCtx!
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.clearRect(0, 0, tintCanvas.width, tintCanvas.height)
  c.globalCompositeOperation = 'source-over'
  c.globalAlpha = 1
  c.setTransform(tintDpr, 0, 0, tintDpr, (pad - cx) * tintDpr, (pad - cy) * tintDpr)
  return c
}

/** Apply the tints and stamp the finished unit back onto the scene. */
const endUnitLayer = (
  target: CanvasRenderingContext2D,
  cx: number, cy: number, pad: number, tints: string[]
): void => {
  const c = tintCtx
  if (!c || !tintCanvas) return
  const size = Math.max(16, Math.ceil(pad * 2))
  c.setTransform(tintDpr, 0, 0, tintDpr, 0, 0)
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-atop'
  for (const tint of tints) {
    c.fillStyle = tint
    c.fillRect(0, 0, size, size)
  }
  c.globalCompositeOperation = 'source-over'
  target.drawImage(
    tintCanvas,
    0, 0, Math.ceil(size * tintDpr), Math.ceil(size * tintDpr),
    cx - pad, cy - pad, size, size
  )
}

// ─── Enemies ────────────────────────────────────────────────────────────────

/**
 * Procedurally drawn characters. Each silhouette is built from a handful of
 * primitives with the walk cycle driven by `e.phase`, so no two individuals are
 * in step and a crowd reads as a crowd. Shapes are deliberately chunky and
 * high-contrast so they stay legible at the zoom levels a phone actually uses.
 */
const drawEnemy = (target: CanvasRenderingContext2D, e: Enemy, t: number): void => {
  const def = enemyDef(e.typeId)
  const p = themedPalette(def.palette)
  const zoom = getZoom()
  const s = def.scale * zoom
  const cx = worldToScreenX(e.x)
  const cy = worldToScreenY(e.y)
  // Every procedural body is authored facing RIGHT (club, sling, shield and
  // speed-streaks all sit on +x), and `dir` is +1 for an enemy travelling
  // right. Mirroring by `-dir` therefore turned every unit to face AWAY from
  // the tower it was walking into.
  const facing = e.dir

  // Drop-out on death: shrink + fade so bodies don't linger as clutter.
  const dieT = e.dying > 0 ? e.dying / 320 : 1

  // A unit that needs a colour wash is painted into the scratch layer instead
  // of straight onto the battlefield — see `beginUnitLayer`.
  const tints: string[] = []
  if (e.slowPct > 0) tints.push('rgba(140,230,255,0.35)')
  if (e.flash > 0.02) tints.push(`rgba(255,255,255,${Math.min(1, e.flash) * 0.75})`)
  const tinted = tints.length > 0
  const pad = Math.max(24, s * 2.8)
  const ctx = tinted ? beginUnitLayer(cx, cy, pad) : target
  const stamp = (): void => { if (tinted) endUnitLayer(target, cx, cy, pad, tints) }

  const override = spriteFor('enemy', e.typeId)
  if (override) {
    ctx.save()
    ctx.globalAlpha = dieT
    ctx.translate(cx, cy)
    ctx.scale(facing * dieT, dieT)
    ctx.drawImage(override, -s / 2, -s / 2, s, s)
    ctx.restore()
    stamp()
    return
  }

  ctx.save()
  ctx.globalAlpha = dieT
  ctx.translate(cx, cy)
  ctx.scale(facing, 1)

  // Siege engines are machines, not people: no torso, no legs, no walk cycle.
  // They get their own module, drawn from the same ink/cel kit as the monsters.
  if (def.siege) {
    // Wheels turn with distance travelled, not with time, so a halted engine's
    // wheels stop — the clearest signal that it has set up to fire.
    const engaged = e.targetUid >= 0
    drawSiegeMachine(ctx, def.id, s, p, {
      spin: engaged ? 0 : e.x * 1.6,
      engaged,
      t
    })
    ctx.restore()
    stamp()
    if (e.hp < e.maxHp && e.dying <= 0) {
      drawHpBar(target, cx, cy - s * 0.92, s * 0.86, Math.max(2, s * 0.085), e.hp / e.maxHp, def.boss)
    }
    return
  }

  // Sea creatures are fish, not humanoids — they get a bespoke body and
  // skip the torso/legs/head pipeline entirely. A baked design replaces that
  // body when one is bound and ready; anything not yet baked keeps swimming as
  // the older drawn fish rather than popping out of existence.
  if (def.movement === 'sea') {
    const seaId = pickMonster(def.monster, e.uid)
    // Swimmers play their cycle slower than a walk: a tail beat is a longer
    // stroke than a footfall, and driving it at gait speed makes a shark look
    // like it is sprinting on the spot.
    const seaFrame = seaId ? monsterFrame(seaId, e.phase * 1.5 / (Math.PI * 2)) : null
    if (seaFrame) drawSeaSprite(ctx, e, p, seaFrame, seaId !== null && monsterFaces(seaId) === 'left', s)
    else drawSeaCreature(ctx, e, def, p, s, t)
    ctx.restore()
    stamp()
    // Only show the bar once it has broken the surface — a bar floating over
    // open water for an untargetable creature is misleading.
    if (e.hp < e.maxHp && e.dying <= 0 && (e.surfaced ?? 0) > 0.35) {
      drawHpBar(target, cx, cy - s * 0.9, s * 0.68, Math.max(2, s * 0.075), e.hp / e.maxHp)
    }
    return
  }

  // ── Monster designs ──
  // A baked design replaces the whole procedural body: silhouette, walk cycle
  // and contact shadow all come from the strip, so none of the generic torso /
  // legs / head / prop work below runs for it. Anything not yet baked falls
  // through to that older body rather than popping in and out of existence.
  const monsterId = pickMonster(def.monster, e.uid)
  if (monsterId) {
    // `e.phase` is the game's own walk clock — one leg cycle every 2π/2.4 of
    // it — so driving the strip from it keeps a fast unit's feet moving fast
    // without the strip needing to know anything about speed.
    const frame = monsterFrame(monsterId, e.phase * 2.4 / (Math.PI * 2))
    if (frame) {
      // Designs drawn facing left need one more flip: the battlefield authors
      // everything facing right and mirrors by travel direction.
      if (monsterFaces(monsterId) === 'left') ctx.scale(-1, 1)
      const k = (s * 1.3) / SPRITE_HEIGHT
      const w = frame.width * k
      const h = frame.height * k
      // Line the strip up by the FEET, not by its centre: the designs differ in
      // how much headroom they use, and centring them would leave the tall ones
      // hovering and the wide ones sunk. A design that declares itself centred
      // — a swimmer, which has no feet — is honoured here too, so the anchor
      // means the same thing wherever a strip is drawn.
      const top = monsterAnchor(monsterId) === 'centre'
        ? -h * 0.5
        : s * 0.5 - SPRITE_FOOT * k
      ctx.drawImage(frame, -w * 0.5, top, w, h)
      ctx.restore()
      stamp()
      if (e.hp < e.maxHp && e.dying <= 0) {
        drawHpBar(target, cx, cy - s * 0.82, s * 0.68, Math.max(2, s * 0.075), e.hp / e.maxHp, def.boss)
      }
      return
    }
  }

  // Contact shadow grounds the character on the battlefield.
  if (def.movement === 'ground') {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath()
    ctx.ellipse(0, s * 0.52, s * 0.36, s * 0.1, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  const walk = Math.sin(e.phase * 2.4)
  const bob = def.movement === 'air' ? Math.sin(e.phase * 3) * s * 0.06 : Math.abs(walk) * s * 0.035
  ctx.translate(0, -bob)

  if (def.movement === 'air') {
    // Wings behind the body, flapping on the phase.
    const flap = Math.sin(e.phase * 9)
    ctx.fillStyle = withAlpha(p.dark, 0.95)
    for (const dir of [-1, 1]) {
      ctx.save()
      ctx.scale(dir, 1)
      ctx.rotate(flap * 0.55)
      ctx.beginPath()
      ctx.moveTo(s * 0.1, -s * 0.05)
      ctx.quadraticCurveTo(s * 0.55, -s * 0.42, s * 0.62, -s * 0.02)
      ctx.quadraticCurveTo(s * 0.42, s * 0.04, s * 0.1, s * 0.08)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  } else {
    // Legs — a simple two-bar walk cycle is enough at this scale.
    ctx.strokeStyle = p.dark
    ctx.lineWidth = Math.max(1.4, s * 0.11)
    ctx.lineCap = 'round'
    for (const side of [-1, 1]) {
      const swing = walk * side * s * 0.16
      ctx.beginPath()
      ctx.moveTo(side * s * 0.11, s * 0.16)
      ctx.lineTo(side * s * 0.11 + swing, s * 0.46)
      ctx.stroke()
    }
  }

  // Torso.
  const body = ctx.createLinearGradient(-s * 0.3, -s * 0.3, s * 0.3, s * 0.3)
  body.addColorStop(0, p.light)
  body.addColorStop(0.55, p.mid)
  body.addColorStop(1, p.dark)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.28, s * 0.32, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = withAlpha('#000', 0.45)
  ctx.lineWidth = Math.max(1, s * 0.035)
  ctx.stroke()

  // Head.
  ctx.fillStyle = p.mid
  ctx.beginPath()
  ctx.arc(s * 0.04, -s * 0.36, s * 0.19, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = withAlpha('#000', 0.45)
  ctx.stroke()

  // Eyes — a single glowing pair reads as "hostile" instantly.
  ctx.fillStyle = p.accent2
  ctx.beginPath(); ctx.arc(s * 0.12, -s * 0.38, s * 0.045, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#000'
  ctx.beginPath(); ctx.arc(s * 0.135, -s * 0.38, s * 0.022, 0, Math.PI * 2); ctx.fill()

  // Per-type signature prop.
  drawEnemyProp(ctx, e, def.id, p, s, walk, t)

  ctx.restore()
  stamp()

  // HP bar in screen space (never mirrored), shown only once damaged so a full
  // wave of untouched enemies isn't a wall of bars.
  if (e.hp < e.maxHp && e.dying <= 0) {
    drawHpBar(target, cx, cy - s * 0.72, s * 0.68, Math.max(2, s * 0.075), e.hp / e.maxHp, def.boss)
  }
}


/**
 * Cavalry — the player's own units.
 *
 * The body itself lives in `cavalryArt`; this handles only what the battlefield
 * owns: where the rider sits, which way it faces, the hit flash, and the fade
 * as its contract expires (`life`), so a rider vanishing never looks like a bug.
 */
const drawAlly = (target: CanvasRenderingContext2D, a: Ally, t: number): void => {
  const def = ALLY_DEFS[a.typeId]
  if (!def) return
  const p = themedPalette(def.palette)
  const zoom = getZoom()
  const s = def.scale * zoom
  const cx = worldToScreenX(a.x)
  const cy = worldToScreenY(a.y)
  const dieT = a.dying > 0 ? a.dying / 320 : 1
  // Fade out over the last second of the contract, so the rider disappearing
  // never looks like a bug.
  const expiring = Math.min(1, a.life / 1000)

  const tinted = a.flash > 0.02
  const pad = Math.max(24, s * 2.8)
  const ctx = tinted ? beginUnitLayer(cx, cy, pad) : target
  const stamp = (): void => {
    if (tinted) endUnitLayer(target, cx, cy, pad, [`rgba(255,255,255,${Math.min(1, a.flash) * 0.7})`])
  }

  ctx.save()
  ctx.globalAlpha = dieT * expiring
  ctx.translate(cx, cy)
  ctx.scale(a.dir, 1)

  // The whole rider is drawn by its own module, from the same ink/cel kit as
  // the monster cast — see `cavalryArt`.
  drawCavalry(ctx, s, p, {
    phase: a.phase,
    striking: a.targetUid >= 0,
    t
  })
  ctx.restore()
  stamp()

  if (a.hp < a.maxHp && a.dying <= 0) {
    drawHpBar(target, cx, cy - s * 0.7, s * 0.6, Math.max(2, s * 0.07), a.hp / a.maxHp)
  }
}

/**
 * A sea creature.
 *
 * Deliberately FISH-shaped rather than humanoid: a deep body, a sweeping
 * caudal fin, a dorsal ridge and a single round eye. Nothing about the
 * silhouette should be mistakable for the infantry marching in on the grass,
 * because the answer to it is different — most weapons cannot reach it at all
 * until it surfaces.
 *
 * Two presentations, because a creature that is invisible until it bites is not
 * a threat the player can answer — it is just damage arriving from nowhere:
 *
 *   SUBMERGED — a dark silhouette gliding under the surface plus a travelling
 *               V-wake on the waterline. Visible, clearly located, and clearly
 *               out of reach (weapons genuinely cannot target it yet).
 *   SURFACED  — the body breaches to strike. `surfaced` drives both the
 *               animation and the targetability rule, so what the player sees
 *               and what the simulation allows are the same thing.
 */
const drawSeaCreature = (
  ctx: CanvasRenderingContext2D, e: Enemy, def: EnemyDef,
  p: Palette, s: number, t: number
): void => {
  const surfaced = e.surfaced ?? 0
  const zoom = getZoom()
  // Screen-space offset from the creature's origin down to the waterline.
  // Positive means part of the body is ABOVE the water.
  const waterY = (e.y - SEA_LEVEL) * zoom
  const swim = t / 190 + e.phase
  // Tail beat drives everything: the fin sweeps, and the body counter-rotates
  // slightly against it, which is what makes a fish look like it is swimming
  // rather than being dragged.
  const beat = Math.sin(swim)
  const isKraken = def.id === 'kraken'

  /** Body, fins and head. `tint` flattens everything for the silhouette pass. */
  const drawBody = (tint: string | null): void => {
    const flat = tint !== null
    ctx.save()
    ctx.rotate(beat * 0.09)

    // ── Caudal (tail) fin ──
    const sweep = beat * s * 0.3
    ctx.fillStyle = flat ? tint! : withAlpha(p.dark, 0.95)
    ctx.beginPath()
    ctx.moveTo(-s * 0.38, 0)
    ctx.quadraticCurveTo(-s * 0.62, sweep * 0.4 - s * 0.36, -s * 0.86, sweep - s * 0.3)
    ctx.quadraticCurveTo(-s * 0.66, sweep * 0.6, -s * 0.86, sweep + s * 0.3)
    ctx.quadraticCurveTo(-s * 0.62, sweep * 0.4 + s * 0.36, -s * 0.38, 0)
    ctx.closePath()
    ctx.fill()
    if (!flat) {
      ctx.strokeStyle = withAlpha('#000', 0.35)
      ctx.lineWidth = Math.max(1, s * 0.025)
      ctx.stroke()
      // Fin rays.
      ctx.strokeStyle = withAlpha(p.accent, 0.5)
      ctx.lineWidth = Math.max(1, s * 0.018)
      for (const f of [-0.6, 0, 0.6]) {
        ctx.beginPath()
        ctx.moveTo(-s * 0.4, 0)
        ctx.lineTo(-s * 0.8, sweep + f * s * 0.26)
        ctx.stroke()
      }
    }

    // ── Dorsal fin ──
    ctx.fillStyle = flat ? tint! : withAlpha(p.accent, 0.6 + surfaced * 0.4)
    ctx.beginPath()
    ctx.moveTo(-s * 0.2, -s * 0.2)
    ctx.lineTo(-s * 0.02, -s * (isKraken ? 0.66 : 0.54))
    ctx.lineTo(s * 0.2, -s * 0.22)
    ctx.closePath()
    ctx.fill()

    // ── Pelvic fin, angled against the beat ──
    ctx.fillStyle = flat ? tint! : withAlpha(p.dark, 0.8)
    ctx.beginPath()
    ctx.moveTo(-s * 0.08, s * 0.18)
    ctx.lineTo(-s * 0.24, s * 0.44 - beat * s * 0.06)
    ctx.lineTo(s * 0.06, s * 0.22)
    ctx.closePath()
    ctx.fill()

    // ── Main body: deep at the shoulder, tapering to the tail ──
    if (flat) {
      ctx.fillStyle = tint!
    } else {
      const g = ctx.createLinearGradient(0, -s * 0.34, 0, s * 0.3)
      g.addColorStop(0, p.light)
      g.addColorStop(0.42, p.mid)
      g.addColorStop(1, p.dark)
      ctx.fillStyle = g
    }
    ctx.beginPath()
    ctx.moveTo(s * 0.52, 0)
    ctx.quadraticCurveTo(s * 0.24, -s * 0.36, -s * 0.1, -s * 0.28)
    ctx.quadraticCurveTo(-s * 0.32, -s * 0.2, -s * 0.4, 0)
    ctx.quadraticCurveTo(-s * 0.32, s * 0.2, -s * 0.1, s * 0.28)
    ctx.quadraticCurveTo(s * 0.24, s * 0.36, s * 0.52, 0)
    ctx.closePath()
    ctx.fill()

    if (flat) {
      ctx.restore()
      return
    }

    ctx.strokeStyle = withAlpha('#000', 0.42)
    ctx.lineWidth = Math.max(1, s * 0.032)
    ctx.stroke()

    // Pale belly.
    ctx.fillStyle = withAlpha(p.light, 0.3)
    ctx.beginPath()
    ctx.moveTo(-s * 0.3, s * 0.08)
    ctx.quadraticCurveTo(s * 0.1, s * 0.34, s * 0.46, s * 0.03)
    ctx.quadraticCurveTo(s * 0.1, s * 0.2, -s * 0.3, s * 0.08)
    ctx.closePath()
    ctx.fill()

    // Scale rows — three arcs is enough to read as scales without becoming
    // a texture that costs anything at this size.
    ctx.strokeStyle = withAlpha(p.dark, 0.45)
    ctx.lineWidth = Math.max(1, s * 0.016)
    for (const sx of [-0.14, 0.04, 0.22]) {
      ctx.beginPath()
      ctx.arc(s * sx, 0, s * 0.24, -1.05, 1.05)
      ctx.stroke()
    }

    // Gill slit.
    ctx.strokeStyle = withAlpha(p.dark, 0.7)
    ctx.lineWidth = Math.max(1, s * 0.026)
    ctx.beginPath()
    ctx.arc(s * 0.3, 0, s * 0.16, -1.2, 1.2)
    ctx.stroke()

    // Pectoral fin, in front of the gill.
    ctx.fillStyle = withAlpha(p.accent, 0.75)
    ctx.beginPath()
    ctx.moveTo(s * 0.22, s * 0.06)
    ctx.quadraticCurveTo(s * 0.1, s * 0.34 + beat * s * 0.05, s * 0.3, s * 0.28)
    ctx.closePath()
    ctx.fill()

    // ── Jaw, opening as it strikes ──
    const gape = surfaced * 0.55
    ctx.fillStyle = '#2a0d12'
    ctx.beginPath()
    ctx.moveTo(s * 0.36, s * 0.02)
    ctx.lineTo(s * 0.56, -s * (0.02 + gape * 0.2))
    ctx.lineTo(s * 0.54, s * (0.1 + gape * 0.26))
    ctx.closePath()
    ctx.fill()
    // Teeth.
    ctx.fillStyle = '#fbf4e6'
    for (let i = 0; i < 3; i++) {
      const tx = s * (0.4 + i * 0.055)
      ctx.beginPath()
      ctx.moveTo(tx, s * 0.0)
      ctx.lineTo(tx + s * 0.02, s * (0.06 + gape * 0.1))
      ctx.lineTo(tx + s * 0.045, s * 0.0)
      ctx.closePath()
      ctx.fill()
    }

    // ── Eye ──
    ctx.fillStyle = p.accent2
    ctx.beginPath(); ctx.arc(s * 0.34, -s * 0.09, s * 0.07, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = withAlpha('#000', 0.5)
    ctx.lineWidth = Math.max(1, s * 0.016)
    ctx.stroke()
    ctx.fillStyle = '#000'
    ctx.beginPath(); ctx.arc(s * 0.355, -s * 0.09, s * 0.032, 0, Math.PI * 2); ctx.fill()

    // A kraken keeps its tentacles — it is the boss of the water, and the
    // extra limbs are what separate it from the ordinary fish at a glance.
    if (isKraken) {
      ctx.strokeStyle = withAlpha(p.mid, 0.9)
      ctx.lineWidth = Math.max(1.4, s * 0.055)
      ctx.lineCap = 'round'
      for (let i = 0; i < 4; i++) {
        const ph = swim + i * 1.3
        ctx.beginPath()
        ctx.moveTo(s * 0.3, s * (0.1 + i * 0.04))
        ctx.quadraticCurveTo(
          s * (0.62 + Math.sin(ph) * 0.1), s * (0.3 + i * 0.1),
          s * (0.5 + Math.cos(ph) * 0.24), s * (0.56 + i * 0.12)
        )
        ctx.stroke()
      }
    }

    ctx.restore()
  }

  // ── Underwater silhouette ──
  // Clipped to BELOW the waterline so it can never bleed onto the shore.
  ctx.save()
  ctx.beginPath()
  ctx.rect(-s * 3, waterY, s * 6, s * 8)
  ctx.clip()
  ctx.globalAlpha = 0.5 + surfaced * 0.3
  drawBody(withAlpha(p.dark, 0.85))
  ctx.restore()
  ctx.globalAlpha = 1

  // ── Above-water body ──
  // The clip runs from well above the crown DOWN TO the waterline, so its
  // height is the distance between them — not `waterY`, which is only the
  // waterline's own offset. Passing that as the height put the visible band at
  // [-4s, -4s + waterY]: entirely above the creature. The body was drawn, then
  // clipped away, and a sea monster rearing up to bite vanished at exactly the
  // moment the player needed to see it.
  if (waterY > -s * 4) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(-s * 3, -s * 4, s * 6, waterY + s * 4)
    ctx.clip()
    drawBody(null)
    ctx.restore()
  }

  drawSeaSurface(ctx, p, s, waterY, surfaced)
}

/**
 * What the water does about the thing under it.
 *
 * A travelling wake while submerged, widening into foam as it breaches, and the
 * dorsal fin cutting the surface. This is the player's only warning that
 * something is coming out of the water, so it is drawn unconditionally — for
 * the drawn fish and the baked designs alike — rather than only when the body
 * happens to show.
 */
const drawSeaSurface = (
  ctx: CanvasRenderingContext2D, p: Palette, s: number, waterY: number, surfaced: number
): void => {
  const zoom = getZoom()
  const foam = 0.3 + surfaced * 0.7
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = '#dff4ff'
  ctx.lineWidth = Math.max(1, zoom * 0.03)
  ctx.beginPath()
  ctx.ellipse(0, waterY, s * (0.35 + foam * 0.55), s * 0.13, 0, 0, Math.PI * 2)
  ctx.stroke()
  // Trailing V-wake, so the direction of travel is readable at a glance.
  ctx.globalAlpha = 0.3
  ctx.lineWidth = Math.max(1, zoom * 0.022)
  for (let i = 1; i <= 2; i++) {
    const spread = s * 0.5 * i
    ctx.beginPath()
    ctx.moveTo(-spread * 0.2, waterY)
    ctx.lineTo(-spread * 1.6, waterY - spread * 0.28)
    ctx.moveTo(-spread * 0.2, waterY)
    ctx.lineTo(-spread * 1.6, waterY + spread * 0.28)
    ctx.stroke()
  }
  // Dorsal fin cutting the surface while submerged — the classic tell.
  if (surfaced < 0.5) {
    ctx.globalAlpha = 0.55
    ctx.fillStyle = withAlpha(p.dark, 0.9)
    ctx.beginPath()
    ctx.moveTo(-s * 0.16, waterY)
    ctx.lineTo(s * 0.02, waterY - s * 0.22)
    ctx.lineTo(s * 0.18, waterY)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

/** Canvas filters darken the submerged pass cheaply; Safari &lt;17 lacks them,
 *  where the alpha drop alone still reads as depth over dark water. */
const CAN_FILTER = typeof CanvasRenderingContext2D !== 'undefined' &&
  'filter' in CanvasRenderingContext2D.prototype

/**
 * A sea creature drawn from its baked design strip.
 *
 * Same two presentations as the procedural fish — a dimmed silhouette below the
 * waterline, the full drawing above it — but the body is now one of the cast in
 * `monstersSea.ts` rather than a generic gradient fish, and the strip carries
 * its own swim cycle.
 *
 * The rear-up is a ROTATION of the whole sprite rather than a second baked
 * pose. A strip per attack state would double the bake for every design; a
 * nose-up tilt driven by `surfaced` costs nothing and reads as exactly what it
 * is — an animal levering itself out of the water to reach the wall.
 */
const drawSeaSprite = (
  ctx: CanvasRenderingContext2D, e: Enemy, p: Palette,
  frame: HTMLCanvasElement, faceLeft: boolean, s: number
): void => {
  const surfaced = e.surfaced ?? 0
  const zoom = getZoom()
  // Screen-space offset from the creature's origin down to the waterline.
  // Positive means part of the body is ABOVE the water.
  const waterY = (e.y - SEA_LEVEL) * zoom

  const k = (s * 1.5) / SPRITE_HEIGHT
  const w = frame.width * k
  const h = frame.height * k

  /**
   * Levering out of the water, not levitating over it.
   *
   * A fully surfaced creature's origin sits most of a cell ABOVE the waterline
   * — that is what lets it reach the lowest blocks — so a body drawn centred on
   * it stands clear of the sea altogether and reads as beached on the grass.
   * Dropping the drawing back toward the water as it rears keeps the tail wet
   * and puts the head at the wall, which is the pose the whole mechanic
   * describes. `e.y` is left alone: it is the simulation's idea of where the
   * animal is, and the wake is measured from it.
   */
  const dip = surfaced * 0.36 * zoom
  const rear = -surfaced * 0.85

  /** One pass of the body, clipped to a band and optionally dimmed. */
  const pass = (top: number, height: number, alpha: number, dim: boolean): void => {
    if (height <= 0) return
    ctx.save()
    // The clip stays on the TRUE waterline while the body moves inside it, so
    // the split follows the drawing rather than the simulation's origin.
    ctx.beginPath()
    ctx.rect(-s * 3, top, s * 6, height)
    ctx.clip()
    ctx.globalAlpha *= alpha
    if (dim && CAN_FILTER) ctx.filter = 'brightness(0.5) saturate(0.6)'
    ctx.translate(0, dip)
    // +x is forward and screen y runs down, so a negative rotation lifts the
    // head. Mirroring happens outside this, so it reads the same both ways.
    ctx.rotate(rear)
    if (faceLeft) ctx.scale(-1, 1)
    ctx.drawImage(frame, -w * 0.5, -h * 0.5, w, h)
    if (dim && CAN_FILTER) ctx.filter = 'none'
    ctx.restore()
  }

  pass(waterY, s * 8, 0.55 + surfaced * 0.25, true)
  pass(-s * 4, waterY + s * 4, 1, false)

  drawSeaSurface(ctx, p, s, waterY, surfaced)
}

const drawEnemyProp = (
  ctx: CanvasRenderingContext2D, e: Enemy, id: string,
  p: Palette, s: number, walk: number, t: number
): void => {
  switch (id) {
    case 'grunt': {
      // Club, raised on the attack beat.
      const swing = e.targetUid >= 0 ? Math.sin(t / 90) * 0.6 : walk * 0.25
      ctx.save()
      ctx.translate(s * 0.24, -s * 0.02)
      ctx.rotate(-0.6 + swing)
      ctx.fillStyle = p.accent2
      ctx.fillRect(0, -s * 0.035, s * 0.3, s * 0.07)
      ctx.beginPath(); ctx.arc(s * 0.32, 0, s * 0.09, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
      break
    }
    case 'runner': {
      // Speed streaks trailing the body.
      ctx.strokeStyle = withAlpha(p.accent2, 0.4)
      ctx.lineWidth = Math.max(1, s * 0.03)
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo(-s * (0.34 + i * 0.12), -s * 0.1 + i * s * 0.12)
        ctx.lineTo(-s * (0.5 + i * 0.12), -s * 0.1 + i * s * 0.12)
        ctx.stroke()
      }
      break
    }
    case 'slinger': {
      const spin = t / 110
      ctx.save()
      ctx.translate(s * 0.2, -s * 0.18)
      ctx.strokeStyle = p.accent2
      ctx.lineWidth = Math.max(1, s * 0.022)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(spin) * s * 0.24, Math.sin(spin) * s * 0.24)
      ctx.stroke()
      ctx.fillStyle = '#6b6b6b'
      ctx.beginPath()
      ctx.arc(Math.cos(spin) * s * 0.24, Math.sin(spin) * s * 0.24, s * 0.05, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      break
    }
    case 'brute': {
      // Shoulder pauldrons + a two-handed maul.
      ctx.fillStyle = p.dark
      ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.2, s * 0.14, s * 0.1, -0.4, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.ellipse(s * 0.2, -s * 0.2, s * 0.14, s * 0.1, 0.4, 0, Math.PI * 2); ctx.fill()
      ctx.save()
      ctx.translate(s * 0.26, 0)
      ctx.rotate(-0.5 + (e.targetUid >= 0 ? Math.sin(t / 110) * 0.7 : 0))
      ctx.fillStyle = p.accent2
      ctx.fillRect(0, -s * 0.04, s * 0.34, s * 0.08)
      ctx.fillRect(s * 0.3, -s * 0.14, s * 0.12, s * 0.28)
      ctx.restore()
      break
    }
    case 'bomber': {
      // The payload, pulsing brighter as it closes — a legible warning.
      const pulse = 0.5 + 0.5 * Math.sin(t / 90)
      ctx.fillStyle = mixHex('#2a2a2a', '#ff3a10', pulse)
      ctx.beginPath(); ctx.arc(0, -s * 0.04, s * 0.2, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = withAlpha('#000', 0.5); ctx.lineWidth = Math.max(1, s * 0.03); ctx.stroke()
      const g = ctx.createRadialGradient(0, -s * 0.04, 0, 0, -s * 0.04, s * 0.36 * pulse)
      g.addColorStop(0, `rgba(255,90,20,${0.35 * pulse})`)
      g.addColorStop(1, 'rgba(255,90,20,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(0, -s * 0.04, s * 0.36, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'bulwark': {
      // Tower shield on the leading side — the thing you have to shoot around.
      ctx.fillStyle = p.accent
      roundRect(ctx, s * 0.2, -s * 0.36, s * 0.16, s * 0.7, s * 0.05)
      ctx.fill()
      ctx.strokeStyle = withAlpha('#000', 0.5); ctx.lineWidth = Math.max(1, s * 0.03); ctx.stroke()
      ctx.fillStyle = withAlpha(p.accent2, 0.7)
      ctx.beginPath(); ctx.arc(s * 0.28, 0, s * 0.05, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'bombardier':
    case 'firebug': {
      // A slung gondola under the body with visible ordnance in it. The load is
      // drawn because the threat has to be legible from the ground: the player
      // needs to see a bomber and think "that is going for my roof".
      const fire = id === 'firebug'
      ctx.fillStyle = p.dark
      roundRect(ctx, -s * 0.2, s * 0.14, s * 0.4, s * 0.22, s * 0.06)
      ctx.fill()
      ctx.strokeStyle = withAlpha('#000', 0.45)
      ctx.lineWidth = Math.max(1, s * 0.025)
      ctx.stroke()
      // Rigging up to the body.
      ctx.strokeStyle = withAlpha(p.accent2, 0.6)
      ctx.lineWidth = Math.max(1, s * 0.018)
      ctx.beginPath()
      ctx.moveTo(-s * 0.16, s * 0.14); ctx.lineTo(-s * 0.1, s * 0.02)
      ctx.moveTo(s * 0.16, s * 0.14); ctx.lineTo(s * 0.1, s * 0.02)
      ctx.stroke()

      // The payload itself, swinging slightly as it flies.
      const sway = Math.sin(e.phase * 2.2) * s * 0.02
      if (fire) {
        // Molotov: a bottle with a lit rag.
        ctx.fillStyle = '#6fbf5a'
        roundRect(ctx, -s * 0.05 + sway, s * 0.17, s * 0.1, s * 0.15, s * 0.03)
        ctx.fill()
        const flick = 0.6 + 0.4 * Math.sin(t / 70)
        const g = ctx.createRadialGradient(sway, s * 0.15, 0, sway, s * 0.15, s * 0.11 * flick)
        g.addColorStop(0, '#fff3c0')
        g.addColorStop(0.45, '#ff9a2a')
        g.addColorStop(1, 'rgba(255,110,20,0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(sway, s * 0.15, s * 0.12 * flick, 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.fillStyle = '#2f3238'
        ctx.beginPath()
        ctx.ellipse(sway, s * 0.24, s * 0.08, s * 0.11, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = p.accent2
        ctx.beginPath()
        ctx.moveTo(sway - s * 0.06, s * 0.34)
        ctx.lineTo(sway, s * 0.28)
        ctx.lineTo(sway + s * 0.06, s * 0.34)
        ctx.closePath()
        ctx.fill()
      }

      // Goggles / helm, so it reads as a crewed machine rather than a beast.
      ctx.fillStyle = withAlpha(p.accent, 0.9)
      ctx.beginPath()
      ctx.ellipse(s * 0.1, -s * 0.4, s * 0.13, s * 0.07, -0.2, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'wyvern': {
      // Horned skull crest + a barbed tail, so it reads as "bigger, meaner bat"
      // rather than a recoloured one.
      ctx.fillStyle = p.accent
      ctx.beginPath()
      ctx.moveTo(-s * 0.02, -s * 0.5)
      ctx.lineTo(s * 0.1, -s * 0.66)
      ctx.lineTo(s * 0.14, -s * 0.44)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = p.dark
      ctx.lineWidth = Math.max(1.2, s * 0.05)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-s * 0.22, s * 0.1)
      ctx.quadraticCurveTo(-s * 0.55, s * 0.24, -s * 0.62, -s * 0.06)
      ctx.stroke()
      ctx.fillStyle = p.accent
      ctx.beginPath()
      ctx.moveTo(-s * 0.62, -s * 0.06)
      ctx.lineTo(-s * 0.76, -s * 0.02)
      ctx.lineTo(-s * 0.6, s * 0.08)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'golem': {
      // Molten seams that glow through the rock — boss-scale telegraphing.
      const pulse = 0.5 + 0.5 * Math.sin(t / 260)
      ctx.strokeStyle = `rgba(255,122,31,${0.5 + pulse * 0.4})`
      ctx.lineWidth = Math.max(1.5, s * 0.035)
      ctx.beginPath()
      ctx.moveTo(-s * 0.2, -s * 0.16); ctx.lineTo(-s * 0.02, 0); ctx.lineTo(-s * 0.14, s * 0.2)
      ctx.moveTo(s * 0.18, -s * 0.2); ctx.lineTo(s * 0.06, s * 0.02)
      ctx.stroke()
      // Rock shoulders.
      ctx.fillStyle = p.light
      for (const [ox, oy, rr] of [[-0.26, -0.24, 0.11], [0.26, -0.22, 0.12], [0.0, -0.5, 0.09]] as const) {
        ctx.beginPath(); ctx.arc(ox * s, oy * s, rr * s, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
  }
}

const drawHpBar = (
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  w: number, h: number, frac: number, boss = false
): void => {
  const x = cx - w / 2
  ctx.fillStyle = 'rgba(0,0,0,0.62)'
  roundRect(ctx, x - 1, cy - 1, w + 2, h + 2, h)
  ctx.fill()
  // Green → amber → red so the player can triage at a glance.
  const col = frac > 0.55 ? '#4ade80' : frac > 0.28 ? '#fbbf24' : '#f87171'
  ctx.fillStyle = boss ? '#ff7a1f' : col
  roundRect(ctx, x, cy, Math.max(1, w * Math.max(0, frac)), h, h)
  ctx.fill()
}

// ─── Background ─────────────────────────────────────────────────────────────
//
// Sky / mountains / forest are cached into an offscreen canvas keyed by the
// camera state, and only re-rendered once the camera has drifted enough that
// the parallax would visibly lag. Everything is generated from a deterministic
// hash so the horizon is stable across frames and sessions.

let bgCanvas: HTMLCanvasElement | null = null
let bgCtx: CanvasRenderingContext2D | null = null
let bgKey = ''

/** Sunrise to sunset — the sun's whole visible arc. */
export const DAY_ARC_MS = 90_000

/** A full sunrise → sunset → midnight → sunrise turn: the day plus its night. */
export const DAY_CYCLE_MS = DAY_ARC_MS * 2

let skyEpoch = 0

/**
 * Position in the day, read from the WALL CLOCK rather than accumulated frame
 * deltas.
 *
 * Ninety seconds has to mean ninety seconds. The render loop clamps its delta
 * to 120 ms so a stall cannot blow up the simulation, which means summing those
 * deltas loses real time on every dropped frame — a backgrounded tab drops to
 * roughly one frame a second and the sun crawls at an eighth speed. Reading the
 * clock is immune to all of it, and to the 2x battle speed as well: the sun
 * should not sprint because the fight did.
 */
const skyNow = (): number => {
  if (skyEpoch === 0) skyEpoch = performance.now()
  return performance.now() - skyEpoch
}

/**
 * Position in the day, 0..1.
 *
 * 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight. The sun's arc, the
 * moon's arc and the sky gradient are all driven from this one number, which is
 * what keeps them agreeing: a sunset sky with the sun still overhead is the
 * kind of mismatch that reads as broken even when nobody can say why.
 */
export const dayPhase = (): number => (skyNow() % DAY_CYCLE_MS) / DAY_CYCLE_MS

/**
 * Sky keyframes around the cycle. Interpolated, not switched.
 *
 * The sky used to step between five fixed moods every five waves, which meant
 * it never MOVED — it cut. Blending between keys means every wave looks a
 * little different from the last, which is most of what makes a backdrop feel
 * alive rather than painted.
 */
const SKY_KEYS: Array<[number, string, string, string]> = [
  [0.00, '#2f3a6e', '#8a6f92', '#e0956a'], // sunrise
  [0.14, '#6db4e6', '#b6dcef', '#ecdcc4'], // morning
  [0.28, '#78c0ea', '#bfe2f4', '#e9d6c0'], // midday
  [0.42, '#4a5a90', '#95739e', '#e8965f'], // sunset
  [0.55, '#1d2652', '#3c4780', '#6d5c8e'], // dusk
  [0.78, '#111830', '#26315a', '#454578'], // midnight
  [1.00, '#2f3a6e', '#8a6f92', '#e0956a']  // back to sunrise
]

/** Sky gradient right now, blended between keyframes. */
const skyFor = (w: number): [string, string, string] => {
  const t = dayPhase()
  let i = 0
  while (i < SKY_KEYS.length - 2 && t > SKY_KEYS[i + 1]![0]) i++
  const a = SKY_KEYS[i]!
  const b = SKY_KEYS[i + 1]!
  const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0])
  const blend: [string, string, string] = [
    mixHex(a[1], b[1], k), mixHex(a[2], b[2], k), mixHex(a[3], b[3], k)
  ]
  // A boss night still turns the sky over — the escalation the old tiers were
  // reaching for, kept as an EVENT rather than as a permanent step.
  if (isBossWave(w) && t > 0.5) {
    return [mixHex(blend[0], '#2a0e18', 0.7), mixHex(blend[1], '#5a1a24', 0.7), mixHex(blend[2], '#a33a30', 0.7)]
  }
  return blend
}

/** Deterministic 0..1 hash — used for ridge lines and tree placement so the
 *  scenery never shimmers between frames. */
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Sun or moon, depending on how deep the run is.
 *
 * Built from five stacked passes — outer bloom, warm halo, ray fan, disc,
 * limb-darkened rim — because a single flat circle reads as a sticker. All of
 * it is baked into the cached background canvas, so the cost is paid once per
 * camera move rather than once per frame.
 */
/**
 * Sun and moon are baked once and blitted.
 *
 * Everything about a body except WHERE it is — halo, ray fan, disc, limb
 * detail — is fixed, and this now runs on every frame rather than once per
 * cached background. Redrawing sixteen gradients a frame to move a sprite
 * across the sky is work for nothing; the only pass that genuinely depends on
 * position is the wide atmospheric bloom, and that is a single fill.
 */
const bodySprites = new Map<string, HTMLCanvasElement>()

const celestialSprite = (isNight: boolean, r: number, tier: number): HTMLCanvasElement => {
  // Rays reach ~4.3r, so the sprite has to be a good deal wider than the disc.
  const reach = Math.ceil(r * 4.6)
  const size = reach * 2
  const key = `${isNight ? 'moon' : 'sun'}|${Math.round(r)}|${tier}`
  const hit = bodySprites.get(key)
  if (hit) return hit

  const cv = document.createElement('canvas')
  cv.width = size
  cv.height = size
  const c = cv.getContext('2d')!
  const x = reach
  const y = reach

  const core = isNight ? '#f4f1ff' : '#fffdf0'
  const body = isNight ? '#d9dcf0' : '#ffe27a'
  const glow = isNight ? '210,220,255' : '255,214,120'

  // 1 · Tight halo that gives the disc a definite edge to sit inside.
  const halo = c.createRadialGradient(x, y, r * 0.85, x, y, r * 3.1)
  halo.addColorStop(0, `rgba(${glow},0.5)`)
  halo.addColorStop(1, `rgba(${glow},0)`)
  c.fillStyle = halo
  c.beginPath()
  c.arc(x, y, r * 3.1, 0, Math.PI * 2)
  c.fill()

  // 2 · Ray fan. Uneven lengths from the hash so it never looks like a clock
  //     face; skipped at night, where a moon has no rays.
  if (!isNight) {
    c.save()
    c.translate(x, y)
    c.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + tier * 0.21
      const len = r * (1.9 + hash(i * 13.7 + tier) * 2.4)
      const halfW = r * 0.12
      const ray = c.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len)
      ray.addColorStop(0, `rgba(${glow},0.4)`)
      ray.addColorStop(1, `rgba(${glow},0)`)
      c.fillStyle = ray
      c.beginPath()
      c.moveTo(Math.cos(a + 0.5) * halfW, Math.sin(a + 0.5) * halfW)
      c.lineTo(Math.cos(a) * len, Math.sin(a) * len)
      c.lineTo(Math.cos(a - 0.5) * halfW, Math.sin(a - 0.5) * halfW)
      c.closePath()
      c.fill()
    }
    c.restore()
  }

  // 3 · The disc itself, hot in the middle and cooling towards the limb.
  const disc = c.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r)
  disc.addColorStop(0, core)
  disc.addColorStop(0.55, body)
  disc.addColorStop(1, isNight ? '#aab0cc' : '#ffb43c')
  c.fillStyle = disc
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.fill()

  // 4 · Surface detail. Craters for a moon, a faint bright limb for a sun.
  if (isNight) {
    c.fillStyle = 'rgba(120,128,164,0.35)'
    for (let i = 0; i < 5; i++) {
      const a = hash(i * 9.1) * Math.PI * 2
      const d = hash(i * 4.4) * r * 0.62
      const cr = r * (0.09 + hash(i * 6.6) * 0.14)
      c.beginPath()
      c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, cr, 0, Math.PI * 2)
      c.fill()
    }
  } else {
    c.strokeStyle = 'rgba(255,255,255,0.55)'
    c.lineWidth = Math.max(1, r * 0.06)
    c.beginPath()
    c.arc(x, y, r * 0.97, Math.PI * 0.9, Math.PI * 1.9)
    c.stroke()
  }

  // Only a handful of variants ever exist (two bodies x a few sizes), but a
  // resize sweep could mint one per pixel width if this were unbounded.
  if (bodySprites.size > 12) bodySprites.clear()
  bodySprites.set(key, cv)
  return cv
}

const drawCelestial = (
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  groundY: number,
  waveNo: number,
  isNight: boolean,
  /** This body's own phase: 0 = rising, 0.25 = highest, 0.5 = setting. */
  bodyPhase: number
): void => {
  const tier = Math.floor(Math.max(0, waveNo) / 5) % 5
  // Below the horizon for the other half of its cycle — the hills are drawn
  // after this, so a body sitting low is occluded by them and rises out of the
  // ridgeline rather than fading in over it.
  if (bodyPhase >= 0.5) return

  const r = Math.max(10, Math.min(w, h) * 0.055)
  // Arc east to west. `sin` gives the ease at both horizons for free, so the
  // body lingers at sunrise and sunset and sweeps through noon.
  const t = bodyPhase / 0.5
  const x = w * (0.08 + 0.84 * t)
  const base = Math.max(groundY, h * 0.55) + r * 0.55
  const y = base - (base - h * 0.1) * Math.sin(Math.PI * t)

  const glow = isNight ? '210,220,255' : '255,214,120'
  const bloomTint = tier === 4 ? '255,150,120' : glow

  // The one pass that has to follow the body: a wide wash of light across the
  // whole sky, which is what makes a low sun feel like it is IN the scene
  // rather than pasted over it.
  const bloom = c.createRadialGradient(x, y, r * 0.4, x, y, Math.min(w, h) * 0.5)
  bloom.addColorStop(0, `rgba(${bloomTint},0.34)`)
  bloom.addColorStop(0.22, `rgba(${bloomTint},0.12)`)
  bloom.addColorStop(1, `rgba(${bloomTint},0)`)
  c.fillStyle = bloom
  c.fillRect(0, 0, w, Math.max(0, groundY))

  const sprite = celestialSprite(isNight, r, tier)
  c.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2)
}

/**
 * A conifer: stacked canopy tiers with a lit right edge.
 *
 * Drawn as overlapping trapezoids rather than one triangle so the silhouette
 * has the notched profile a spruce actually has at this size.
 */
const drawConifer = (
  c: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  hgt: number,
  seed: number
): void => {
  const halfW = hgt * (0.24 + hash(seed * 1.7) * 0.08)

  c.fillStyle = '#3b2a1c'
  c.fillRect(x - hgt * 0.028, baseY - hgt * 0.24, hgt * 0.056, hgt * 0.24)

  const tiers = 4
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers
    const tierBase = baseY - hgt * (0.14 + f * 0.72)
    const tierTop = tierBase - hgt * 0.34
    const spread = halfW * (1 - f * 0.62)
    // Darker at the base, lighter towards the crown: cheap aerial perspective
    // that keeps the tiers from merging into one blob.
    c.fillStyle = `rgb(${26 + i * 7}, ${58 + i * 11}, ${40 + i * 7})`
    c.beginPath()
    c.moveTo(x, tierTop)
    c.lineTo(x + spread, tierBase)
    c.lineTo(x + spread * 0.42, tierBase)
    c.lineTo(x, tierBase - hgt * 0.05)
    c.lineTo(x - spread * 0.42, tierBase)
    c.lineTo(x - spread, tierBase)
    c.closePath()
    c.fill()

    // Sun side.
    c.fillStyle = 'rgba(150,205,120,0.22)'
    c.beginPath()
    c.moveTo(x, tierTop)
    c.lineTo(x + spread, tierBase)
    c.lineTo(x + spread * 0.35, tierBase)
    c.closePath()
    c.fill()
  }
}

/**
 * A broadleaf tree: a forked trunk under three overlapping canopy lobes.
 *
 * The lobes are deliberately off-centre and unequal — a symmetrical blob is
 * the single clearest "programmer art" tell in a tree line.
 */
const drawBroadleaf = (
  c: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  hgt: number,
  seed: number
): void => {
  const trunkH = hgt * 0.42
  const trunkW = Math.max(1, hgt * 0.07)

  c.strokeStyle = '#4a3520'
  c.lineWidth = trunkW
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(x, baseY)
  c.lineTo(x, baseY - trunkH)
  c.moveTo(x, baseY - trunkH * 0.62)
  c.lineTo(x - hgt * 0.11, baseY - trunkH * 0.95)
  c.moveTo(x, baseY - trunkH * 0.72)
  c.lineTo(x + hgt * 0.12, baseY - trunkH * 1.02)
  c.stroke()

  const lobes: Array<[number, number, number]> = [
    [-hgt * 0.16, -trunkH - hgt * 0.14, hgt * 0.23],
    [hgt * 0.15, -trunkH - hgt * 0.18, hgt * 0.25],
    [(hash(seed * 8.3) - 0.5) * hgt * 0.12, -trunkH - hgt * 0.34, hgt * 0.22]
  ]

  c.fillStyle = '#24503a'
  for (const [dx, dy, rr] of lobes) {
    c.beginPath()
    c.arc(x + dx, baseY + dy, rr, 0, Math.PI * 2)
    c.fill()
  }
  // Highlight pass on the sun side of each lobe.
  c.fillStyle = 'rgba(126,190,104,0.34)'
  for (const [dx, dy, rr] of lobes) {
    c.beginPath()
    c.arc(x + dx + rr * 0.26, baseY + dy - rr * 0.28, rr * 0.62, 0, Math.PI * 2)
    c.fill()
  }
}

/**
 * Sky gradient and the two bodies, painted fresh every frame.
 *
 * Cheap by design: two linear/radial gradient fills plus whichever body is
 * above the horizon. Everything expensive about the backdrop — ridges, tree
 * line, water — stays in the cached layer that goes on top of this.
 */
const drawSky = (c: CanvasRenderingContext2D, w: number, h: number): void => {
  const [top, mid, low] = skyFor(wave.value)
  const groundY = worldToScreenY(0)

  const sky = c.createLinearGradient(0, 0, 0, Math.max(groundY, h * 0.7))
  sky.addColorStop(0, top)
  sky.addColorStop(0.62, mid)
  sky.addColorStop(1, low)
  c.fillStyle = sky
  c.fillRect(0, 0, w, Math.max(0, groundY))

  // Both bodies, half a cycle apart, so dusk actually shows the sun going down
  // on one side while the moon comes up on the other.
  const phase = dayPhase()
  drawCelestial(c, w, h, groundY, wave.value, true, (phase + 0.5) % 1)
  drawCelestial(c, w, h, groundY, wave.value, false, phase)
}

const renderBackground = (w: number, h: number, dpr: number): void => {
  const zoom = getZoom()
  const rect = viewRect()
  // Quantise the key: re-render only on a meaningful camera move.
  const key = `${w}x${h}|${Math.round(rect.l * 4)}|${Math.round(rect.b * 4)}|${Math.round(zoom)}|${wave.value}|${Math.round(dayPhase() * 40)}|${quality.value}`
  if (key === bgKey && bgCanvas) return
  bgKey = key

  if (!bgCanvas) {
    bgCanvas = document.createElement('canvas')
    bgCtx = bgCanvas.getContext('2d')
  }
  if (bgCanvas.width !== Math.round(w * dpr) || bgCanvas.height !== Math.round(h * dpr)) {
    bgCanvas.width = Math.round(w * dpr)
    bgCanvas.height = Math.round(h * dpr)
  }
  const c = bgCtx!
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.clearRect(0, 0, w, h)

  // The sky and the two bodies are NOT drawn here — they change every frame and
  // this canvas is cached across many. They are painted live underneath it (see
  // `drawSky`), and the sky band of this canvas is simply left transparent for
  // them to show through. The scenery on top is opaque, so it composites
  // exactly as it did when it was one layer.
  const [, mid] = skyFor(wave.value)
  const groundY = worldToScreenY(0)

  // ── Mountain ridges (two ranges, different parallax + tone) ──
  //
  // The ridge is sampled on a fixed step, but the LAST sample is pinned to the
  // right edge. Without that pin the loop stops a partial step short and the
  // closing `lineTo(w + 10, h)` cuts a diagonal straight down to the ground —
  // which reads on screen as the mountains "falling off" the right side.
  for (const [idx, cfg] of [
    { par: 0.1, amp: 0.16, base: 0.62, lo: '#5a7099', hi: '#8fa6c8', snow: 0.62 },
    { par: 0.18, amp: 0.22, base: 0.78, lo: '#2b3a5e', hi: '#4f6690', snow: 0.74 }
  ].entries()) {
    const yBase = groundY - h * (1 - cfg.base) * 0.62
    const step = Math.max(18, w / 48)
    const left = -10
    const right = w + 10

    /** Ridge height at a screen x, in pixels above `yBase`. */
    const ridgeAt = (sx: number): number => {
      const wx = (sx + rect.l * zoom * cfg.par) / 90
      const n = hash(Math.floor(wx) + idx * 71) * 0.6
        + hash(Math.floor(wx * 2.3) + idx * 131) * 0.3
        + hash(Math.floor(wx * 5.1) + idx * 17) * 0.1
      return n * h * cfg.amp
    }

    // Sample once, reuse for the body fill, the lit faces and the snow caps.
    const pts: Array<[number, number]> = []
    for (let sx = left; sx < right; sx += step) pts.push([sx, yBase - ridgeAt(sx)])
    pts.push([right, yBase - ridgeAt(right)])

    const rock = c.createLinearGradient(0, yBase - h * cfg.amp, 0, groundY)
    rock.addColorStop(0, cfg.hi)
    rock.addColorStop(0.55, cfg.lo)
    rock.addColorStop(1, cfg.lo)
    c.fillStyle = rock
    c.beginPath()
    c.moveTo(left, h)
    for (const [px, py] of pts) c.lineTo(px, py)
    c.lineTo(right, h)
    c.closePath()
    c.fill()

    // Sunward faces: a light stroke down the right-hand slope of each peak,
    // which is what turns a flat silhouette into something with volume.
    c.strokeStyle = idx === 0 ? 'rgba(214,232,255,0.32)' : 'rgba(150,180,225,0.28)'
    c.lineWidth = Math.max(1, h * 0.0022)
    c.beginPath()
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1]!
      const [bx, by] = pts[i]!
      if (by > ay) continue // only descending (right-facing) slopes catch light
      c.moveTo(ax, ay)
      c.lineTo(bx, by)
    }
    c.stroke()

    // Snow caps on the tallest peaks only.
    const capLimit = yBase - h * cfg.amp * cfg.snow
    c.fillStyle = 'rgba(238,246,255,0.9)'
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i]!
      if (py > capLimit) continue
      const [lx, ly] = pts[i - 1]!
      const [rx, ry] = pts[i + 1]!
      const drop = Math.min(h * 0.02, (Math.min(ly, ry) - py) * 0.85)
      if (drop <= 0.5) continue
      c.beginPath()
      c.moveTo(px, py)
      c.lineTo(px - (px - lx) * (drop / Math.max(1, ly - py)) * 0.9, py + drop)
      c.lineTo(px + (rx - px) * (drop / Math.max(1, ry - py)) * 0.9, py + drop)
      c.closePath()
      c.fill()
    }
  }

  // ── Forest ──
  //
  // Two bands: a hazy far tree line that reads as distance, and a nearer band
  // of individually-drawn trees with trunks, tiered canopies and a lit side.
  // The old version was a row of flat triangles, which is exactly what made the
  // horizon look like placeholder art.
  const farBase = groundY - h * 0.03
  const farStep = Math.max(5, w / 150)
  c.fillStyle = 'rgba(30,58,46,0.72)'
  c.beginPath()
  c.moveTo(-10, farBase)
  for (let sx = -10; sx <= w + 10; sx += farStep) {
    const wx = (sx + rect.l * zoom * 0.26) / 14
    const hgt = (0.35 + hash(Math.floor(wx) * 5.3) * 0.65) * h * 0.05
    c.lineTo(sx, farBase - hgt)
    c.lineTo(sx + farStep * 0.5, farBase - hgt * 0.55)
  }
  c.lineTo(w + 10, farBase)
  c.closePath()
  c.fill()

  // The near band sits slightly ABOVE the ground line and is smaller than the
  // units that walk in front of it. Matching their scale made the enemy lane
  // look like it ran *through* the forest rather than in front of it.
  const nearBase = groundY - h * 0.008
  const nearStep = Math.max(11, w / 52)
  for (let sx = -nearStep; sx <= w + nearStep; sx += nearStep) {
    const wx = (sx + rect.l * zoom * 0.34) / 26
    const seed = Math.floor(wx)
    const jitter = (hash(seed * 2.1) - 0.5) * nearStep * 0.8
    const x = sx + jitter
    const scale = 0.62 + hash(seed * 7.7) * 0.62
    const hgt = h * 0.046 * scale
    // Two species so the tree line has rhythm instead of a repeating sawtooth.
    if (hash(seed * 3.3) > 0.42) drawConifer(c, x, nearBase, hgt, seed)
    else drawBroadleaf(c, x, nearBase, hgt, seed)
  }

  // Aerial haze over the whole scenery band. A wash of sky colour is what makes
  // distance read as distance; without it the background competes with the
  // tower for attention no matter how well the trees are drawn.
  //
  // Baked at the CACHE's sky colour and refreshed whenever that drifts far
  // enough to notice (see the key below). Following it per frame would mean
  // re-rendering the ridges and every tree with it, for a wash that runs at 8
  // to 30 percent alpha.
  const haze = c.createLinearGradient(0, groundY - h * 0.3, 0, groundY)
  haze.addColorStop(0, withAlpha(mid, 0.3))
  haze.addColorStop(1, withAlpha(mid, 0.08))
  c.fillStyle = haze
  c.fillRect(0, groundY - h * 0.3, w, h * 0.3)

  // Contact shadow along the far edge of the field, so the tree line has
  // something to stand on and the units in front of it read as nearer.
  const rim = c.createLinearGradient(0, groundY - h * 0.012, 0, groundY + h * 0.022)
  rim.addColorStop(0, 'rgba(18,34,22,0)')
  rim.addColorStop(0.45, 'rgba(18,34,22,0.42)')
  rim.addColorStop(1, 'rgba(18,34,22,0)')
  c.fillStyle = rim
  c.fillRect(0, groundY - h * 0.012, w, h * 0.034)

  // ── Ground ──
  // A narrow strip of land the tower stands on, then the shoreline, then open
  // water filling the rest of the frame. The lake is the reference silhouette:
  // every screenshot of this genre has the tower mirrored in the water beneath
  // it, and it also gives the sea creatures somewhere to legibly come FROM.
  if (groundY < h) {
    const seaY = worldToScreenY(SEA_LEVEL)
    const landH = Math.max(2, seaY - groundY)

    // The approach lane is a MEADOW, not a dirt road: a green field the enemies
    // cross, with individually drawn tufts. Grass reads as somewhere worth
    // defending; a brown strip reads as a placeholder.
    const gr = c.createLinearGradient(0, groundY, 0, seaY)
    gr.addColorStop(0, '#63a34a')
    gr.addColorStop(0.3, '#4d8a38')
    gr.addColorStop(0.72, '#3a6c2a')
    gr.addColorStop(1, '#2c5220')
    c.fillStyle = gr
    c.fillRect(0, groundY, w, landH)

    // Broad soft patches so the field has tonal variation before any blade is
    // drawn — flat green is what makes a lawn look like a rectangle.
    for (let i = 0; i < 14; i++) {
      const px = ((hash(i * 3.1) * 1.6 - 0.3) * w + rect.l * zoom * 0.5) % (w + 200) - 100
      const py = groundY + hash(i * 5.7) * landH
      const pr = landH * (0.25 + hash(i * 9.2) * 0.5)
      const patch = c.createRadialGradient(px, py, 0, px, py, pr)
      patch.addColorStop(0, hash(i * 11.3) > 0.5 ? 'rgba(126,186,86,0.22)' : 'rgba(38,84,34,0.2)')
      patch.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = patch
      c.beginPath()
      c.arc(px, py, pr, 0, Math.PI * 2)
      c.fill()
    }

    // Grass tufts. Density is capped by the visible width rather than the zoom
    // so a wide desktop frame never explodes the loop count, and each tuft is
    // three blades fanned from one root — one blade per stroke reads as hair.
    const tuftStep = Math.max(7, Math.min(zoom * 0.3, w / 90))
    const bladeH = Math.max(2, Math.min(landH * 0.55, zoom * 0.16))
    c.lineWidth = Math.max(1, zoom * 0.016)
    c.lineCap = 'round'
    for (let sx = -tuftStep; sx <= w + tuftStep; sx += tuftStep) {
      const seed = Math.floor((sx + rect.l * zoom) / 9)
      const gx = sx + (hash(seed * 2.7) - 0.5) * tuftStep
      // Tufts nearer the bottom of the strip are nearer the camera: taller,
      // lighter, and drawn last so they overlap the ones behind them.
      const depth = hash(seed * 6.1)
      const gy = groundY + landH * (0.08 + depth * 0.82)
      const th = bladeH * (0.55 + depth * 0.9)
      c.strokeStyle = depth > 0.55
        ? 'rgba(150,214,104,0.75)'
        : 'rgba(96,158,74,0.62)'
      c.beginPath()
      for (let b = -1; b <= 1; b++) {
        const lean = b * th * 0.42 + (hash(seed * 4.3 + b) - 0.5) * th * 0.3
        c.moveTo(gx, gy)
        c.quadraticCurveTo(gx + lean * 0.4, gy - th * 0.62, gx + lean, gy - th)
      }
      c.stroke()
    }

    // A few small stones and flower dots to break the green up.
    for (let i = 0; i < 18; i++) {
      const sxr = ((hash(i * 7.9) * 1.4 - 0.2) * w + rect.l * zoom * 0.5) % (w + 120) - 60
      const syr = groundY + landH * (0.2 + hash(i * 12.7) * 0.7)
      const rr = Math.max(0.6, zoom * 0.012 * (0.6 + hash(i * 2.2)))
      c.fillStyle = hash(i * 15.1) > 0.62
        ? 'rgba(226,232,150,0.8)'
        : 'rgba(120,120,110,0.42)'
      c.beginPath()
      c.arc(sxr, syr, rr, 0, Math.PI * 2)
      c.fill()
    }

    // ── Water ──
    if (seaY < h) {
      const water = c.createLinearGradient(0, seaY, 0, h)
      water.addColorStop(0, '#3f8fb8')
      water.addColorStop(0.18, '#2f6f9e')
      water.addColorStop(1, '#123a63')
      c.fillStyle = water
      c.fillRect(0, seaY, w, h - seaY)

      // Wet sand where land meets water. Drawn as a soft band with a scalloped
      // upper edge rather than a straight gradient — a perfectly level sand
      // line across the whole frame is the giveaway that this is a rectangle.
      const bandTop = seaY - zoom * 0.13
      const shore = c.createLinearGradient(0, bandTop, 0, seaY + zoom * 0.12)
      shore.addColorStop(0, 'rgba(134,120,84,0)')
      shore.addColorStop(0.45, 'rgba(158,142,102,0.5)')
      shore.addColorStop(1, 'rgba(96,146,176,0)')
      c.fillStyle = shore
      c.beginPath()
      c.moveTo(-10, seaY + zoom * 0.12)
      for (let sx = -10; sx <= w + 10; sx += Math.max(9, w / 70)) {
        const n = hash(Math.floor((sx + rect.l * zoom) / 11))
        c.lineTo(sx, bandTop + n * zoom * 0.07)
      }
      c.lineTo(w + 10, seaY + zoom * 0.12)
      c.closePath()
      c.fill()

      // Foam line breaking on the sand.
      c.strokeStyle = 'rgba(236,250,255,0.42)'
      c.lineWidth = Math.max(1, zoom * 0.02)
      c.beginPath()
      for (let sx = -10; sx <= w + 10; sx += Math.max(9, w / 70)) {
        const n = hash(Math.floor((sx + rect.l * zoom) / 11) + 5)
        const fy = seaY + zoom * 0.02 + n * zoom * 0.03
        if (sx <= -10) c.moveTo(sx, fy)
        else c.lineTo(sx, fy)
      }
      c.stroke()

      // Ripple bands — a few horizontal highlights whose spacing widens with
      // depth, which is what sells "receding surface" rather than "blue block".
      c.strokeStyle = 'rgba(210,240,255,0.16)'
      c.lineWidth = Math.max(1, zoom * 0.018)
      const depth = h - seaY
      for (let i = 1; i < 9; i++) {
        const f = i / 9
        const ry = seaY + depth * f * f
        if (ry > h) break
        const offset = Math.sin(i * 1.7 + rect.l * 0.4) * zoom * 0.4
        c.beginPath()
        c.moveTo(-10 + offset, ry)
        c.lineTo(w + 10 + offset, ry)
        c.stroke()
      }
    }
  }
}

// ─── FX event → presentation ────────────────────────────────────────────────

/**
 * Convert one semantic simulation event into particles, text, decals, shake and
 * sound. Keeping this translation in ONE place means the sim never has to know
 * how loud or how sparkly anything is.
 */
/**
 * Particles shed by a body when it is struck.
 *
 * Small, and deliberately not gratuitous: a couple of droplets sold as the
 * right SUBSTANCE does more than a shower of red. What matters is that a
 * skeleton throws bone chips, a slime throws slime, and a ghost throws nothing
 * at all — the same red spray on every enemy is the sort of detail nobody
 * articulates and everybody registers as cheap.
 *
 * `dir` is the side to spray toward (away from whatever landed the hit); 0
 * sprays both ways. `amount` only nudges the count, so a big hit reads bigger
 * without a chip-damage tick producing a fountain.
 */
const emitGore = (
  gore: string, x: number, y: number, dir: number, amount: number, density: number
): void => {
  if (gore === 'none') return
  const heavy = Math.min(1.8, 0.7 + amount / 40)
  const n = Math.round(4 * heavy * density)
  if (n <= 0) return
  /** Away from the hit, or both ways when the direction is unknown. */
  const side = (): number => (dir === 0 ? (Math.random() < 0.5 ? -1 : 1) : dir)

  switch (gore) {
    case 'bone':
      for (let i = 0; i < n; i++) {
        emit({
          x, y, vx: side() * (0.6 + Math.random() * 2.6), vy: -0.4 - Math.random() * 2.2,
          life: 420, size: 0.055 + Math.random() * 0.05, color: [232, 220, 192],
          gravity: 11, drag: 1.2, shape: 1, rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * 14
        })
      }
      emit({ x, y, life: 240, size: 0.2, color: [206, 194, 170], alpha: 0.45, drag: 2 })
      break

    case 'ooze':
      for (let i = 0; i < n; i++) {
        emit({
          x, y, vx: side() * (0.5 + Math.random() * 2), vy: -0.3 - Math.random() * 1.6,
          life: 560, size: 0.08 + Math.random() * 0.07, color: [126, 206, 92],
          gravity: 7, drag: 0.8
        })
      }
      break

    case 'sap':
      for (let i = 0; i < n; i++) {
        emit({
          x, y, vx: side() * (0.5 + Math.random() * 2), vy: -0.4 - Math.random() * 1.8,
          life: 500, size: 0.06 + Math.random() * 0.05,
          color: i % 3 === 0 ? [110, 154, 66] : [186, 132, 54], gravity: 9, drag: 1
        })
      }
      break

    case 'ember':
      for (let i = 0; i < n + 2; i++) {
        emit({
          x, y, vx: side() * (0.8 + Math.random() * 2.4), vy: -1 - Math.random() * 2.2,
          life: 480, size: 0.05 + Math.random() * 0.04, color: [255, 176, 72],
          additive: true, gravity: -1.4, drag: 2, shape: 2
        })
      }
      break

    case 'spectral':
      for (let i = 0; i < n; i++) {
        emit({
          x, y, vx: side() * (0.4 + Math.random() * 1.2), vy: -0.8 - Math.random() * 1.4,
          life: 620, size: 0.09 + Math.random() * 0.07, color: [172, 240, 232],
          additive: true, alpha: 0.6, drag: 1.6
        })
      }
      break

    case 'metal':
      for (let i = 0; i < n; i++) {
        emit({
          x, y, vx: side() * (1.4 + Math.random() * 4), vy: -0.6 - Math.random() * 2.6,
          life: 260, size: 0.045, color: [255, 232, 170], additive: true, shape: 2,
          gravity: 10, drag: 3
        })
      }
      for (let i = 0; i < Math.round(n * 0.5); i++) {
        emit({
          x, y, vx: side() * (0.6 + Math.random() * 1.8), vy: -0.4 - Math.random() * 1.6,
          life: 420, size: 0.06, color: [128, 132, 140], gravity: 12, drag: 1.2, shape: 1,
          rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * 12
        })
      }
      break

    default:
      // Blood.
      for (let i = 0; i < n; i++) {
        emit({
          x, y, vx: side() * (0.7 + Math.random() * 2.8), vy: -0.5 - Math.random() * 2.4,
          life: 400, size: 0.05 + Math.random() * 0.055, color: [172, 34, 42],
          gravity: 12, drag: 1.1
        })
      }
      // A little fine mist, so the spray has a soft edge rather than reading as
      // a handful of discrete dots.
      for (let i = 0; i < Math.round(n * 0.6); i++) {
        emit({
          x, y, vx: side() * (0.3 + Math.random() * 1.4), vy: -0.3 - Math.random() * 1.2,
          life: 300, size: 0.09, color: [138, 26, 34], alpha: 0.4, drag: 2.4
        })
      }
  }
}

const consumeFx = (ev: FxEvent): void => {
  const q = quality.value
  const density = q === 'high' ? 1 : q === 'medium' ? 0.6 : 0.32

  switch (ev.kind) {
    case 'place': {
      const p = themedPalette(ev.palette)
      for (let i = 0; i < Math.round(14 * density); i++) {
        const a = Math.PI + Math.random() * Math.PI
        emit({
          x: ev.x + (Math.random() - 0.5) * 0.7, y: ev.y - 0.45,
          vx: Math.cos(a) * 1.6, vy: Math.abs(Math.sin(a)) * 1.4,
          life: 420 + Math.random() * 240, size: 0.14,
          color: [190, 175, 150], alpha: 0.6, gravity: 3, drag: 2.2, shape: 3
        })
      }
      emit({ x: ev.x, y: ev.y, vx: 0, vy: 0, life: 220, size: 1.1, color: hexToRgb(p.accent2), alpha: 0.5, additive: true })
      playFx('place')
      break
    }
    case 'sell': {
      for (let i = 0; i < Math.round(10 * density); i++) {
        emit({
          x: ev.x, y: ev.y,
          vx: (Math.random() - 0.5) * 2.4, vy: 1 + Math.random() * 2,
          life: 500, size: 0.12, color: [255, 214, 92], alpha: 0.9, gravity: 5, additive: true
        })
      }
      playFx('sell')
      break
    }
    case 'blockHit': {
      for (let i = 0; i < Math.round(4 * density); i++) {
        emit({
          x: ev.x, y: ev.y,
          vx: (Math.random() - 0.5) * 3.2, vy: Math.random() * 2.4,
          life: 300, size: 0.09, color: [220, 200, 170], alpha: 0.8, gravity: 9, shape: 1,
          rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * 9
        })
      }
      break
    }
    case 'shatter': {
      const p = themedPalette(ev.palette)
      for (let i = 0; i < Math.round(18 * density); i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 1.5 + Math.random() * 4.5
        emit({
          x: ev.x, y: ev.y,
          vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp * 1.2,
          life: 700 + Math.random() * 500, size: 0.13 + Math.random() * 0.12,
          color: p.debris, gravity: 16, drag: 0.4, shape: 1,
          rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * 14
        })
      }
      for (let i = 0; i < Math.round(8 * density); i++) {
        emit({
          x: ev.x, y: ev.y,
          vx: (Math.random() - 0.5) * 2, vy: 0.6 + Math.random() * 1.4,
          life: 800, size: 0.4, color: [180, 170, 155], alpha: 0.4, gravity: -1.2, drag: 1.4, shape: 3
        })
      }
      triggerShake('small')
      playFx('shatter')
      break
    }
    case 'explosion': {
      const r = ev.radius
      // A splash detonation is drawn with the palette of the ROUND that made
      // it. Every splash used to bloom as the same orange fireball, which meant
      // a frost shell — a weapon whose entire identity is that it is cold —
      // exploded in fire.
      const cold = ev.kindOf === 'frost'
      const kindOf = cold ? 'frost' : ev.kindOf === 'ball' ? 'ball' : 'shell'
      spawnBlast(ev.x, ev.y, Math.min(1.3, r * 0.7), kindOf, 0,
        { life: cold ? 420 : 480, radial: true, dust: !cold && ev.y < 1.1 })
      // A soft additive bloom UNDER the drawn fireball. Kept small: it is there
      // to make the drawing glow, not to be the effect.
      emit({
        // Trimmed with the drawing it sits under: a glow that keeps its old
        // radius around a smaller fireball stops being a glow and becomes the
        // effect, which is the thing being cut back.
        x: ev.x, y: ev.y, life: 130, size: r * 0.5 * BLAST_SCALE,
        color: cold ? [212, 246, 255] : [255, 250, 220], alpha: 0.45, additive: true
      })
      for (let i = 0; i < Math.round(26 * density); i++) {
        const a = Math.random() * Math.PI * 2
        const sp = (1 + Math.random() * 6) * r * 0.5
        emit({
          x: ev.x, y: ev.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (cold ? 0.6 : 1.5),
          life: 380 + Math.random() * 320, size: 0.2 + Math.random() * 0.24,
          color: cold
            ? (i % 3 === 0 ? [240, 253, 255] : [150, 226, 255])
            : (i % 3 === 0 ? [255, 240, 180] : [255, 140, 40]),
          gravity: cold ? 5 : 3, drag: 2.4, additive: true,
          shape: cold && i % 2 === 0 ? 1 : 0,
          rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * 9
        })
      }
      for (let i = 0; i < Math.round(12 * density); i++) {
        emit({
          x: ev.x, y: ev.y,
          vx: (Math.random() - 0.5) * 3 * r, vy: 0.8 + Math.random() * 2.4,
          life: 900 + Math.random() * 500, size: 0.55 * r,
          color: cold ? [186, 216, 228] : [70, 66, 62],
          alpha: cold ? 0.35 : 0.5, gravity: -1.4, drag: 1.3, shape: 3
        })
      }
      if (!cold && ev.y < 1.4) emitDecal(ev.x, 0.06, r * 0.9, 0.5)
      triggerShake(r > 2 ? 'strong' : 'small')
      playFx(cold ? 'frost' : 'explosion')
      break
    }
    case 'impact': {
      // Every round used to land as the same eight-dot radial puff, in one of
      // two colours. A weapon's hit is the only feedback the player gets that
      // it did anything, so each one now lands differently — and along the
      // round's own line of travel, because a radial burst reads as a decal
      // stamped on the scene rather than as something arriving.
      const a0 = ev.angle
      /** A cone of debris thrown FORWARD along the round's path. */
      const spray = (
        n: number, speed: number, spread: number, life: number, size: number,
        color: [number, number, number],
        o: { additive?: boolean; shape?: 0 | 1 | 2 | 3; gravity?: number; drag?: number } = {}
      ): void => {
        for (let i = 0; i < Math.round(n * density); i++) {
          const a = a0 + (Math.random() - 0.5) * spread
          const sp = speed * (0.55 + Math.random() * 0.9)
          emit({
            x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: life * (0.7 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.7),
            color, additive: o.additive, shape: o.shape ?? 2,
            gravity: o.gravity ?? 0, drag: o.drag ?? 3,
            rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * 10
          })
        }
      }
      /** A thin ring perpendicular to the impact — the concussion tell. */
      const ring = (n: number, speed: number, life: number, size: number, color: [number, number, number], additive = false): void => {
        for (let i = 0; i < Math.round(n * density); i++) {
          const a = a0 + Math.PI / 2 + (i % 2 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.9
          emit({
            x: ev.x, y: ev.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
            life, size, color, additive, drag: 4
          })
        }
      }

      spawnBlast(ev.x, ev.y, BLAST_R[ev.kindOf] ?? 0.45, ev.kindOf, a0, {
        life: ev.kindOf === 'bolt' ? 260 : 340,
        // Only the heavy rounds kick up a skirt, and only near the dirt.
        dust: ev.y < 0.9 && (ev.kindOf === 'ball' || ev.kindOf === 'shell')
      })

      switch (ev.kindOf) {
        case 'bolt':
          // Archer: fast, small, and over instantly. A hard white pin-flash and
          // a tight spark cone — no smoke, nothing that lingers, because an
          // arrow that leaves a cloud reads as artillery.
          emit({ x: ev.x, y: ev.y, life: 80, size: 0.18, color: [255, 248, 220], additive: true, alpha: 0.7 })
          spray(6, 4.2, 1.1, 170, 0.07, [255, 226, 168], { additive: true, drag: 5 })
          spray(3, 2.2, 2.4, 260, 0.05, [190, 160, 120], { gravity: 7, shape: 1, drag: 2 })
          break

        case 'ball': {
          // Cannon: a blunt, dusty concussion. The perpendicular ring is what
          // sells weight — debris going sideways means something stopped hard.
          emit({ x: ev.x, y: ev.y, life: 110, size: 0.2, color: [255, 224, 170], additive: true, alpha: 0.32 })
          ring(6, 3.2, 300, 0.16, [150, 138, 122])
          spray(8, 4.6, 1.0, 340, 0.11, [186, 168, 146], { gravity: 9, shape: 1, drag: 2 })
          spray(5, 1.6, 2.0, 520, 0.2, [120, 112, 104], { gravity: -0.8, shape: 0, drag: 1.6 })
          triggerShake('small')
          break
        }

        case 'shell': {
          // Bombard: the heaviest single round in the tower. Bright core, real
          // embers, rising smoke, and a scorch left behind.
          emit({ x: ev.x, y: ev.y, life: 140, size: 0.3, color: [255, 214, 130], additive: true, alpha: 0.4 })
          emit({ x: ev.x, y: ev.y, life: 220, size: 0.22, color: [255, 140, 50], additive: true, alpha: 0.42 })
          ring(8, 4.4, 340, 0.2, [255, 176, 90], true)
          spray(10, 5.4, 1.3, 480, 0.1, [255, 190, 90], { additive: true, drag: 2.4 })
          spray(7, 2.0, 2.4, 700, 0.26, [104, 96, 90], { gravity: -1.1, shape: 0, drag: 1.4 })
          if (q !== 'low') emitDecal(ev.x, ev.y, 0.5, 0.4)
          triggerShake('strong')
          break
        }

        case 'zap': {
          // Tesla: no debris at all. Electricity does not throw chips of the
          // thing it hits — it flashes, and it forks.
          emit({ x: ev.x, y: ev.y, life: 90, size: 0.3, color: [235, 250, 255], additive: true, alpha: 0.7 })
          for (let i = 0; i < Math.round(9 * density); i++) {
            const a = Math.random() * Math.PI * 2
            const sp = 5.5 + Math.random() * 4
            emit({
              x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 130 + Math.random() * 90, size: 0.05, color: [150, 220, 255],
              additive: true, shape: 2, drag: 9
            })
          }
          break
        }

        case 'frost': {
          // Frost: slow, crystalline, and it hangs. The lingering mist is the
          // point — this is the weapon whose effect outlasts its hit.
          emit({ x: ev.x, y: ev.y, life: 260, size: 0.34, color: [206, 244, 255], additive: true, alpha: 0.5 })
          spray(7, 3.0, 2.6, 480, 0.09, [176, 234, 255], { shape: 1, drag: 4, gravity: 3 })
          for (let i = 0; i < Math.round(5 * density); i++) {
            const a = Math.random() * Math.PI * 2
            emit({
              x: ev.x, y: ev.y, vx: Math.cos(a) * 0.8, vy: Math.sin(a) * 0.8 - 0.4,
              life: 900, size: 0.24, color: [214, 240, 255], alpha: 0.5, drag: 1.2
            })
          }
          break
        }

        default:
          spray(7, 3.6, 1.6, 260, 0.1, [255, 210, 140], { additive: true, drag: 3 })
      }
      playFx(ev.kindOf === 'frost' ? 'frost' : 'impact')
      break
    }
    case 'muzzle': {
      // The flash itself is DRAWN (see `drawMuzzle`); particles only carry the
      // embers and grit that a drawn shape can't animate convincingly.
      const rec = MUZZLE_RECIPES[ev.weapon]
      if (!rec) { playFx('shoot'); break }

      // A lobbing gun fires on its own fixed elevation, and the tesla straight
      // up out of its coil — following the aim would hang the flame in mid-air
      // beside a barrel that never moved.
      const ang = rec.up ? Math.PI / 2
        : rec.elev !== undefined ? lobAngle(ev.x, rec.elev)
        : ev.angle
      const mx = ev.x + Math.cos(ang) * rec.reach
      const my = ev.y + Math.sin(ang) * rec.reach + (rec.rise ?? 0)
      spawnMuzzle(mx, my, ang, rec)

      if (q !== 'low') {
        if (rec.style === 'gun' || rec.style === 'lob') {
          // Burning grains riding the flame out, and — for the heavy guns —
          // soot falling back around the tube.
          const heavy = rec.style === 'lob'
          for (let i = 0; i < Math.round((heavy ? 4 : 6) * density); i++) {
            const a = ang + (Math.random() - 0.5) * rec.spread * 1.6
            const sp = (heavy ? 3 : 6) * (0.5 + Math.random())
            emit({
              x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 200 + Math.random() * 180, size: 0.07,
              color: [255, 214, 140], additive: true, shape: 2, drag: 4.5
            })
          }
          if (heavy) {
            for (let i = 0; i < Math.round(3 * density); i++) {
              emit({
                x: mx, y: my, vx: (Math.random() - 0.5) * 1.6, vy: 0.6 + Math.random() * 1.2,
                life: 700 + Math.random() * 400, size: 0.26,
                color: [86, 80, 72], alpha: 0.45, gravity: -1, drag: 1.5, shape: 3
              })
            }
            triggerShake('small')
          }
        } else if (rec.style === 'bow') {
          // Grit off the rail — the bow throws no light at all.
          for (let i = 0; i < Math.round(3 * density); i++) {
            emit({
              x: mx, y: my, vx: (Math.random() - 0.5) * 1.4, vy: -0.3 - Math.random() * 0.8,
              life: 320, size: 0.07, color: [196, 182, 156], alpha: 0.7, gravity: 5, drag: 2.6
            })
          }
        }
      }
      playFx('shoot')
      break
    }
    case 'lightning': {
      // The bolt itself is drawn by `drawLightning` from a short-lived record;
      // here we only add the sparks at each strike point.
      lightningBolts.push({ points: ev.points.slice(), life: 190, maxLife: 190 })
      for (let i = 2; i < ev.points.length; i += 2) {
        for (let k = 0; k < Math.round(6 * density); k++) {
          const a = Math.random() * Math.PI * 2
          emit({
            x: ev.points[i]!, y: ev.points[i + 1]!,
            vx: Math.cos(a) * 4, vy: Math.sin(a) * 4,
            life: 260, size: 0.09, color: [160, 240, 255], additive: true, shape: 2, drag: 3.5
          })
        }
      }
      screenFlash = Math.max(screenFlash, 0.24)
      playFx('zap')
      break
    }
    case 'enemyHit': {
      if (ev.amount >= 1) {
        emitText({
          x: ev.x, y: ev.y + 0.45, vy: 1.5, life: 620,
          text: String(Math.max(1, Math.round(ev.amount))),
          color: '#ffe08a', size: 0.34, crit: ev.amount >= 25
        })
      }
      // What comes out depends on what was hit. Every enemy used to shed the
      // same red droplets, skeletons included.
      emitGore(ev.gore, ev.x, ev.y, ev.dir, ev.amount, density)
      break
    }
    case 'enemyDie': {
      const p = themedPalette(ev.palette)
      const n = ev.boss ? 40 : 14
      for (let i = 0; i < Math.round(n * density); i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 1.5 + Math.random() * (ev.boss ? 7 : 3.5)
        emit({
          x: ev.x, y: ev.y,
          vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp,
          life: 520 + Math.random() * 420, size: 0.11 + Math.random() * 0.1,
          color: p.debris, gravity: 13, drag: 0.7, shape: 1,
          rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * 12
        })
      }
      // Coin pop — the reward beat every kill needs.
      for (let i = 0; i < Math.min(6, ev.coins); i++) {
        emit({
          x: ev.x, y: ev.y,
          vx: (Math.random() - 0.5) * 2.4, vy: 2.6 + Math.random() * 1.6,
          life: 700, size: 0.16, color: [255, 214, 80], gravity: 11, additive: true
        })
      }
      emitText({
        x: ev.x, y: ev.y + 0.7, vy: 1.9, life: 720,
        text: `+${ev.coins}`, color: '#ffd24a', size: 0.32, crit: false
      })
      if (ev.boss) { triggerShake('big'); playFx('bossDie') } else playFx('enemyDie')
      break
    }
    case 'enemyAttack': {
      if (ev.ranged) {
        // A ranged attacker used to deal its damage with NO visual at all —
        // just a sound. The slinger stood off at four cells lobbing invisible
        // rocks, which reads as a broken enemy that has stopped attacking.
        //
        // Solve for the launch velocity that puts a ballistic round on the
        // target in `T`, so the round actually arrives where the damage did.
        const T = 0.34
        const G = 12
        const vx = (ev.tx - ev.x) / T
        const vy = (ev.ty - ev.y) / T - 0.5 * G * T
        emit({
          x: ev.x, y: ev.y - 0.15, vx, vy, gravity: G,
          life: T * 1000, size: 0.17, color: [138, 126, 112], shape: 1,
          rot: Math.random() * 6.28, vrot: 9
        })
        // A puff at the throw, and grit where it lands.
        for (let i = 0; i < Math.round(3 * density); i++) {
          emit({
            x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 1.2,
            life: 320, size: 0.11, color: [140, 130, 118], alpha: 0.6, drag: 2
          })
        }
        for (let i = 0; i < Math.round(4 * density); i++) {
          emit({
            x: ev.tx, y: ev.ty, vx: (Math.random() - 0.5) * 2.6, vy: -Math.random() * 1.8,
            life: 300, size: 0.08, color: [196, 180, 158], gravity: 9, drag: 2
          })
        }
      } else {
        for (let i = 0; i < Math.round(5 * density); i++) {
          emit({
            x: ev.tx, y: ev.ty,
            vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2,
            life: 260, size: 0.09, color: [225, 205, 175], gravity: 9, shape: 1,
            rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * 8
          })
        }
        // The attacker sheds a little of itself on a melee swing too.
        emitGore(ev.gore, ev.x, ev.y, 0, 4, density * 0.5)
      }
      playFx(ev.ranged ? 'throw' : 'hit')
      break
    }
    case 'collapse': {
      triggerShake(ev.count > 4 ? 'big' : 'strong')
      playFx('collapse')
      break
    }
    case 'waveStart': {
      screenFlash = Math.max(screenFlash, ev.boss ? 0.5 : 0.18)
      if (ev.boss) triggerShake('strong')
      playFx(ev.boss ? 'bossHorn' : 'waveStart')
      break
    }
    case 'waveClear': {
      playFx('waveClear')
      break
    }
    case 'coinPayout': {
      // The wave reward lands in the wallet, so it needs to be SEEN leaving the
      // battlefield — a number that changes off-screen isn't a reward.
      const n = Math.min(18, 6 + Math.round(ev.amount / 4))
      for (let i = 0; i < Math.round(n * density); i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4
        emit({
          x: (Math.random() - 0.5) * 3, y: 1 + Math.random() * 2,
          vx: Math.cos(a) * 3, vy: Math.abs(Math.sin(a)) * 5,
          life: 900, size: 0.2, color: [255, 214, 80], gravity: 5, additive: true
        })
      }
      emitText({
        x: 0, y: 3.2, vy: 2.2, life: 1100,
        text: `+${ev.amount}`, color: '#ffd24a', size: 0.5, crit: true
      })
      break
    }
    case 'thorns': {
      // Spiked-wall reflection. Deliberately reads as the WALL hurting the
      // attacker, not the other way round: sparks fly outwards from the block
      // face and the number floats above the enemy that took it.
      for (let i = 0; i < Math.round(9 * density); i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 2.4 + Math.random() * 3.4
        emit({
          x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
          life: 260 + Math.random() * 160, size: 0.1,
          color: [232, 226, 214], gravity: 9, additive: true
        })
      }
      playFx('hit')
      break
    }
    case 'deflect': {
      // A hard, metallic spark fan plus a "NO" readout. This is the only
      // teaching moment the immunity gets, so it is loud on purpose — a player
      // whose arrows silently stopped working concludes the game is broken.
      for (let i = 0; i < Math.round(8 * density); i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2
        const sp = 3 + Math.random() * 4
        emit({
          x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 200 + Math.random() * 120, size: 0.08,
          color: [226, 236, 248], gravity: 12, additive: true
        })
      }
      emitText({
        x: ev.x, y: ev.y + 0.7, vy: 1.4, life: 620,
        text: 'CLANG', color: '#cfe0f5', size: 0.34, crit: false
      })
      playFx('impact')
      break
    }
    case 'crush': {
      // The moment the falling wall connects. Loud, because this is the payoff
      // for losing a block — and because a boss surviving it needs to look
      // like it SURVIVED it rather than like the block passed through.
      const rgb = themedPalette(ev.palette).debris
      const n = Math.round((ev.boss ? 22 : 14) * density)
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4
        const sp = 3 + Math.random() * 5
        emit({
          x: ev.x, y: ev.y,
          vx: Math.cos(a) * sp * 1.4, vy: Math.abs(Math.sin(a)) * sp,
          life: 300 + Math.random() * 300, size: 0.14 + Math.random() * 0.14,
          color: rgb, gravity: 8, drag: 1.2
        })
      }
      // A hard white flash ring at the point of contact.
      for (let i = 0; i < Math.round(8 * density); i++) {
        const a = Math.random() * Math.PI * 2
        emit({
          x: ev.x, y: ev.y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 3 + 1,
          life: 190, size: 0.1, color: [255, 250, 232], gravity: 4, additive: true
        })
      }
      if (ev.boss) {
        emitText({
          x: ev.x, y: ev.y + 1.1, vy: 2, life: 900,
          text: 'CRUSHED!', color: '#ffd24a', size: 0.5, crit: true
        })
      }
      triggerShake(ev.boss ? 'strong' : 'small')
      playFx('shatter')
      break
    }
    case 'blockLand': {
      // Rubble hitting the tower. Scaled entirely by `impact` so a one-cell
      // slump is a puff and a five-cell drop is a real crash — the player has
      // to be able to tell "that was fine" from "that just cost me a wall".
      const rgb = themedPalette(ev.palette).debris
      const n = Math.round((5 + ev.impact * 16) * density)
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6
        const sp = (1 + Math.random() * 2.6) * (0.5 + ev.impact)
        emit({
          x: ev.x + (Math.random() - 0.5) * 0.8, y: ev.y - 0.4,
          vx: Math.cos(a) * sp * 1.6, vy: Math.abs(Math.sin(a)) * sp,
          life: 380 + Math.random() * 320, size: 0.12 + Math.random() * 0.16,
          color: rgb, gravity: 6, drag: 1.4
        })
      }
      // Dust sheet along the ground, which is what sells weight.
      for (let i = 0; i < Math.round(6 * density * (0.4 + ev.impact)); i++) {
        emit({
          x: ev.x + (Math.random() - 0.5) * 1.4, y: ev.y - 0.45,
          vx: (Math.random() - 0.5) * 3, vy: 0.4 + Math.random(),
          life: 620, size: 0.26, color: [186, 178, 162], gravity: -0.4, drag: 2.4
        })
      }
      emitDecal(ev.x, Math.max(0, ev.y - 0.5), 0.5 + ev.impact * 0.6, 0.25 + ev.impact * 0.3)
      if (ev.impact > 0.35) triggerShake(ev.impact > 0.75 ? 'strong' : 'small')
      playFx(ev.impact > 0.6 ? 'collapse' : 'hit')
      break
    }
    case 'bombDrop': {
      // A puff at the bomb bay, warm for a molotov and grey for a bomb, so the
      // player can tell WHICH kind is falling before it lands on them.
      const col: [number, number, number] = ev.fire ? [255, 150, 60] : [150, 150, 158]
      for (let i = 0; i < Math.round(5 * density); i++) {
        emit({
          x: ev.x + (Math.random() - 0.5) * 0.3, y: ev.y - 0.2,
          vx: (Math.random() - 0.5) * 0.8, vy: -0.4 - Math.random(),
          life: 420, size: 0.14, color: col, gravity: -0.6, drag: 2
        })
      }
      playFx('throw')
      break
    }
    case 'firebomb': {
      // Molotov: a short bright flash, then a spreading pool of flame that
      // keeps licking upward long enough to read as "this is still burning".
      screenFlash = Math.max(screenFlash, 0.1)
      triggerShake('small')
      const r = ev.radius
      // The drawn bloom the particles sit inside. Slower and sootier than a
      // shell's, which is the whole difference between fuel and powder.
      spawnBlast(ev.x, ev.y, Math.min(1.2, r * 0.8), 'fire', 0, { life: 620, radial: true, dust: ev.y < 1.1 })
      for (let i = 0; i < Math.round(26 * density); i++) {
        const a = Math.random() * Math.PI * 2
        const sp = (0.4 + Math.random()) * r * 2.2
        emit({
          x: ev.x, y: ev.y,
          vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp * 0.9 + 1.4,
          life: 520 + Math.random() * 520, size: 0.2 + Math.random() * 0.24,
          color: Math.random() < 0.6 ? [255, 150, 40] : [255, 216, 120],
          gravity: -1.4, drag: 1.5, additive: true
        })
      }
      // Soot, so the fire has something dark to read against.
      for (let i = 0; i < Math.round(10 * density); i++) {
        emit({
          x: ev.x + (Math.random() - 0.5) * r, y: ev.y,
          vx: (Math.random() - 0.5) * 1.4, vy: 1 + Math.random() * 1.8,
          life: 900, size: 0.26, color: [58, 50, 46], gravity: -0.8, drag: 1.8
        })
      }
      emitDecal(ev.x, 0, r * 0.9, 0.5)
      playFx('explosion')
      break
    }
    case 'siegeShot': {
      // A siege engine loosing from standoff range. The muzzle burst is smoky
      // and slow rather than bright and fast, so it never gets confused with
      // one of the player's own guns firing.
      const ang = Math.atan2(ev.ty - ev.y, ev.tx - ev.x)
      for (let i = 0; i < Math.round(10 * density); i++) {
        const spread = ang + (Math.random() - 0.5) * 0.5
        const sp = 1.6 + Math.random() * 3
        emit({
          x: ev.x, y: ev.y, vx: Math.cos(spread) * sp, vy: Math.sin(spread) * sp + 1.2,
          life: 520 + Math.random() * 320, size: 0.24 + Math.random() * 0.16,
          color: [120, 112, 100], gravity: -1.2, drag: 1.6
        })
      }
      triggerShake('small')
      playFx('throw')
      break
    }
    case 'cavalryOut': {
      // The charge leaving the gate: a dust kick in the direction of travel and
      // a rally text, so a purchase the player made off-screen is unmistakable.
      for (let i = 0; i < Math.round(16 * density); i++) {
        emit({
          x: ev.x, y: ev.y + Math.random() * 0.4,
          vx: ev.dir * (1.5 + Math.random() * 4), vy: Math.random() * 2.4,
          life: 620 + Math.random() * 320, size: 0.2 + Math.random() * 0.18,
          color: [196, 182, 150], gravity: 2.4, drag: 1.9
        })
      }
      emitText({
        x: ev.x, y: ev.y + 1.6, vy: 1.9, life: 900,
        text: 'CHARGE!', color: '#7fd4ff', size: 0.46, crit: true
      })
      playFx('waveStart')
      break
    }
    case 'allyStrike': {
      // Lance hit. Cool sparks, to keep the player's own damage visually
      // distinct from the warm sparks the tower's weapons throw.
      const a = Math.atan2(ev.ty - ev.y, ev.tx - ev.x)
      for (let i = 0; i < Math.round(7 * density); i++) {
        const sp = 2.6 + Math.random() * 3.4
        const j = a + (Math.random() - 0.5) * 1.1
        emit({
          x: ev.tx, y: ev.ty, vx: Math.cos(j) * sp, vy: Math.sin(j) * sp + 1,
          life: 220 + Math.random() * 140, size: 0.09,
          color: [180, 226, 255], gravity: 8, additive: true
        })
      }
      playFx('impact')
      break
    }
    case 'allyDown': {
      for (let i = 0; i < Math.round(12 * density); i++) {
        const a = Math.random() * Math.PI * 2
        emit({
          x: ev.x, y: ev.y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3 + 1.5,
          life: 480, size: 0.16, color: [31, 106, 168], gravity: 7
        })
      }
      emitDecal(ev.x, 0, 0.6, 0.35)
      playFx('enemyDie')
      break
    }
    case 'allyLeave': {
      // Contract expired. A quiet puff — no death sound, because nothing died.
      for (let i = 0; i < Math.round(8 * density); i++) {
        emit({
          x: ev.x, y: ev.y + Math.random() * 0.5,
          vx: (Math.random() - 0.5) * 1.6, vy: 1 + Math.random() * 1.6,
          life: 560, size: 0.2, color: [196, 182, 150], gravity: -0.6, drag: 2.2
        })
      }
      break
    }
    case 'gateFell': {
      screenFlash = Math.max(screenFlash, 0.7)
      triggerShake('big')
      playFx('gateFell')
      break
    }
  }
}

const hexToRgb = (hex: string): [number, number, number] => {
  const p = parseInt(hex.slice(1), 16)
  return [(p >> 16) & 255, (p >> 8) & 255, p & 255]
}

// ─── Transient overlays ─────────────────────────────────────────────────────

interface Bolt { points: number[]; life: number; maxLife: number }
const lightningBolts: Bolt[] = []
/** 0..1 full-screen white flash, decays every frame. */
let screenFlash = 0

/**
 * The bolt, drawn rather than glowed.
 *
 * Three even-width strokes stacked into a bloom is how you fake light, and it
 * was the one mark on the field that looked airbrushed. What replaces it is the
 * same silhouette laid in as INK ribbons — a dark outer edge so the bolt reads
 * against a bright sky, a cyan body, a white core, each tapering along its own
 * length — plus hairs forking off the joints, which is the drawn shorthand for
 * electricity that no amount of blur supplies.
 */
const drawLightning = (ctx: CanvasRenderingContext2D, bolt: Bolt): void => {
  const t = bolt.life / bolt.maxLife
  const zoom = getZoom()
  const rich = quality.value !== 'low'
  // Snaps to full width and thins away, rather than dimming uniformly.
  const w = Math.min(1, t * 2.2)
  ctx.globalAlpha = Math.min(1, t * 1.7)

  for (let seg = 0; seg + 3 < bolt.points.length; seg += 2) {
    const x1 = worldToScreenX(bolt.points[seg]!)
    const y1 = worldToScreenY(bolt.points[seg + 1]!)
    const x2 = worldToScreenX(bolt.points[seg + 2]!)
    const y2 = worldToScreenY(bolt.points[seg + 3]!)

    // Jitter scaled to the SPAN, and enough steps to carry it. A fixed seven
    // kinks of a fixed amplitude across a link that might be ten cells long is
    // how a bolt ends up looking like a drawn sword blade.
    const dx = x2 - x1
    const dy = y2 - y1
    const span = Math.hypot(dx, dy) || 1
    const steps = Math.max(6, Math.min(16, Math.round(span / (zoom * 0.45))))
    const amp = Math.min(zoom * 0.9, span * 0.16)
    // Perpendicular, so the kinks cut ACROSS the run instead of sliding along it.
    const px = -dy / span
    const py = dx / span

    const path: Pt[] = [[x1, y1]]
    for (let i = 1; i < steps; i++) {
      const f = i / steps
      // Deterministic per-segment jitter so the bolt doesn't crawl while alive.
      const j = (hash(seg * 13.7 + i * 3.1) - 0.5) * 2 * amp * (1 - Math.abs(f - 0.5) * 1.4)
      path.push([x1 + dx * f + px * j, y1 + dy * f + py * j])
    }
    path.push([x2, y2])

    const seed = seg * 7 + 3
    if (rich) inkStroke(ctx, path, zoom * 0.15 * w, zoom * 0.07 * w, '#12283a', seed)
    inkStroke(ctx, path, zoom * 0.1 * w, zoom * 0.042 * w, '#6fd8ff', seed + 1)
    inkStroke(ctx, path, zoom * 0.042 * w, zoom * 0.016 * w, '#ffffff', seed + 2)

    // Forks. Two hairs peeling off mid-run, thinning to nothing — the bolt
    // spending charge on air it isn't going to reach.
    if (!rich) continue
    for (let k = 0; k < 2; k++) {
      const at = 2 + Math.floor(hash(seg * 5.3 + k * 11.7) * (steps - 3))
      const from = path[at]!
      const dx = path[at + 1]![0] - from[0]
      const dy = path[at + 1]![1] - from[1]
      const side = k ? 1 : -1
      const len = 0.55 + hash(seg * 3.9 + k) * 0.9
      const hair: Pt[] = [
        from,
        [from[0] + (dx * 0.9 - dy * side * 0.8) * len, from[1] + (dy * 0.9 + dx * side * 0.8) * len],
        [from[0] + (dx * 1.9 - dy * side * 0.5) * len, from[1] + (dy * 1.9 + dx * side * 1.3) * len]
      ]
      inkStroke(ctx, hair, zoom * 0.05 * w, zoom * 0.004, '#a8f0ff', seed + 5 + k)
    }
  }
  ctx.globalAlpha = 1
}

// ─── Projectiles ────────────────────────────────────────────────────────────

// ─── Impact blasts ───────────────────────────────────────────────────────────

/**
 * A hit is DRAWN, not only sprayed.
 *
 * Particles give a hit its energy but never its shape: a cone of additive dots
 * reads much the same whether a bolt landed or a shell did, and it shares no
 * language at all with the monsters it lands on, which are cel-shaded under
 * broken ink. A blast is the drawn half of the hit — a lumpy fireball in three
 * flat tones, a hand-drawn shock ring, a few hard shards and inked smoke — with
 * the particle system left to do embers and debris on top of it.
 */
interface BlastPalette {
  /** Hot centre. */
  core: string
  /** The body of the fireball — the tone that identifies the weapon. */
  mid: string
  /** Shadow side and the shock ring. */
  deep: string
  ink: string
  smoke: string
}

interface Blast {
  x: number
  y: number
  /** Peak radius, world units. */
  r: number
  life: number
  maxLife: number
  seed: number
  /** Screen-space heading the shards are thrown along. */
  angle: number
  /** No line of travel to throw along — shards go all the way round instead. */
  radial: boolean
  pal: BlastPalette
  /** Suppresses the hot core, for hits that should not read as fire. */
  cold: boolean
  /** Detonated on (or just above) the ground: throws a sheet of dust sideways. */
  dust: boolean
}

const BLAST_PALETTES: Record<string, BlastPalette> = {
  bolt: { core: '#fffbe8', mid: '#ffd977', deep: '#e08a2a', ink: '#3a2410', smoke: '#8a7a68' },
  ball: { core: '#fff3d2', mid: '#ffb44a', deep: '#c85a1e', ink: '#33190f', smoke: '#7d7166' },
  shell: { core: '#fffdf2', mid: '#ffc24a', deep: '#d4441f', ink: '#2e150e', smoke: '#6e655e' },
  zap: { core: '#ffffff', mid: '#c8f2ff', deep: '#3f9fdc', ink: '#12283a', smoke: '#7f97a8' },
  // Stepped hard, on purpose: a cold blast built from three near-whites reads
  // as a smudge of steam rather than as ice breaking.
  frost: { core: '#ffffff', mid: '#b7ecff', deep: '#3f9fd8', ink: '#123244', smoke: '#93b6c4' },
  // Burning fuel: sootier and redder than gunpowder, so a molotov landing on
  // the tower never reads as one of the player's own rounds going off.
  fire: { core: '#fff2c2', mid: '#ff8f2a', deep: '#a52d0e', ink: '#28100a', smoke: '#4f463f' }
}

/** Peak radius per weapon, world units. Range matters more than the values. */
const BLAST_R: Record<string, number> = {
  bolt: 0.32, ball: 0.5, shell: 0.62, zap: 0.42, frost: 0.44
}

const blasts: Blast[] = []
let blastSeq = 0

/**
 * Global size trim for every drawn blast.
 *
 * The hits were sized to read on their own and, in a fight, read as a wall:
 * a splash detonation covered its whole neighbourhood and hid the monster it
 * had just landed on — and a hit you cannot see land is feedback lost, not
 * feedback delivered. Applied here rather than at the three call sites so the
 * relative sizes of an arrow, a cannonball and a mortar shell stay exactly as
 * authored, and there is one number to tune.
 */
const BLAST_SCALE = 0.7

const spawnBlast = (
  x: number, y: number, r: number, kind: string, angle: number,
  o: { life?: number; radial?: boolean; dust?: boolean } = {}
): void => {
  const q = quality.value
  if (q === 'low' && blasts.length >= 3) return
  // A hard cap. Overlapping blasts add nothing legible and each one is real
  // path work; the oldest goes, so the newest hit is always among those drawn.
  if (blasts.length >= (q === 'high' ? 14 : 8)) blasts.shift()
  const life = o.life ?? 340
  blastSeq = (blastSeq + 1) % 997
  blasts.push({
    x, y, r: r * BLAST_SCALE,
    life, maxLife: life,
    seed: blastSeq * 7.13,
    // World angles run y-up, the canvas runs y-down.
    angle: -angle,
    radial: o.radial ?? false,
    pal: BLAST_PALETTES[kind] ?? BLAST_PALETTES.ball!,
    cold: kind === 'frost' || kind === 'zap',
    dust: o.dust ?? false
  })
}

/** Snaps out and settles — a detonation is not a linear tween. */
const blastEase = (u: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3)

const drawBlast = (ctx: CanvasRenderingContext2D, b: Blast): void => {
  const u = 1 - b.life / b.maxLife
  const R = b.r * getZoom()
  if (R < 3) return

  // Redrawn in three HOLDS rather than tweened continuously. Limited animation
  // is what a hand-drawn effect actually does, and the small jump in the
  // contour between holds is exactly what a smoothly scaled sprite can't have.
  const hold = Math.min(2, Math.floor(u * 3))
  const seed = b.seed + hold * 17.3

  ctx.save()
  ctx.translate(worldToScreenX(b.x), worldToScreenY(b.y))

  // ── Shock ring ──
  // Wide, broken, and gone before the smoke arrives.
  const ringA = 1 - u * 1.7
  if (ringA > 0.03) {
    const rr = R * (0.55 + blastEase(u * 2.2) * 1.2)
    ctx.globalAlpha = ringA * 0.85
    ink(ctx, blob(0, 0, rr, rr * 0.8, seed + 3, 0.16, 2.4, 34), {
      width: Math.max(1.2, R * 0.11 * (1 - u * 0.7)),
      color: b.pal.deep,
      breakUp: 0.5,
      seed: seed + 11
    })
  }

  // ── Shards ──
  // The only hard edges in the whole effect: the fireball and the smoke are all
  // curves, so the sharpness that says "impact" has to come from somewhere.
  const shardA = 1 - u * 2.2
  if (shardA > 0.03) {
    ctx.globalAlpha = shardA
    ctx.fillStyle = b.pal.mid
    const n = 5
    for (let i = 0; i < n; i++) {
      const off = b.radial
        ? (i / n) * Math.PI * 2
        : (i / (n - 1) - 0.5) * 2.2
      const a = b.angle + off + noise2(i * 1.7, seed, seed) * 0.34
      const len = R * (1.1 + noise2(i * 2.3, seed + 5, seed) * 1.0) * (0.75 + blastEase(u * 1.6) * 0.7)
      const base = R * 0.3
      const w = R * 0.15
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * len, Math.sin(a) * len)
      ctx.lineTo(Math.cos(a) * base + Math.cos(a + 1.5708) * w, Math.sin(a) * base + Math.sin(a + 1.5708) * w)
      ctx.lineTo(Math.cos(a) * base - Math.cos(a + 1.5708) * w, Math.sin(a) * base - Math.sin(a + 1.5708) * w)
      ctx.closePath()
      ctx.fill()
    }
  }

  // ── Fireball ──
  // Three flat tones and an inked contour. The moment a gradient goes in here
  // it stops matching the monsters, which is the whole point of drawing it.
  const bodyA = u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.38)
  if (bodyA > 0.03) {
    const br = R * (0.5 + blastEase(u * 1.9) * 0.62)
    const body = blob(0, 0, br, br * 0.9, seed, 0.24, 2.7, 40)
    ctx.globalAlpha = bodyA
    fillShape(ctx, body, b.pal.deep)
    fillShape(ctx, shrink(body, 0.74, -br * 0.16, -br * 0.2), b.pal.mid)
    fillShape(ctx, shrink(body, b.cold ? 0.26 : 0.31, -br * 0.3, -br * 0.36), b.pal.core)
    ink(ctx, body, { width: br * 0.17, color: b.pal.ink, breakUp: 0.28, seed: seed + 2 })
  }

  // ── Dust sheet ──
  // A round that goes off ON the ground does not throw a sphere: it throws a
  // low, wide skirt of dirt sideways, and that skirt is most of what makes a
  // mortar hit look like it landed rather than like it happened in mid-air.
  if (b.dust && quality.value !== 'low') {
    const dustA = Math.min(1, u * 4) * Math.max(0, 1 - Math.max(0, u - 0.35) / 0.65) * 0.75
    if (dustA > 0.04) {
      ctx.globalAlpha = dustA
      const ground = worldToScreenY(0) - worldToScreenY(b.y)
      const spread = R * (0.7 + blastEase(u * 1.8) * 1.5)
      for (const side of [-1, 1]) {
        const px = side * spread
        const pr = R * (0.42 + u * 0.5)
        const puff = blob(px, ground - pr * 0.35, pr * 1.15, pr * 0.62, b.seed + side * 3, 0.22, 2.3, 22)
        fillShape(ctx, puff, '#93887a')
        fillShape(ctx, shrink(puff, 0.6, px - pr * 0.4, ground - pr * 0.7), '#c4b8a4')
        ink(ctx, puff, { width: pr * 0.14, color: '#4a3f33', breakUp: 0.55, seed: b.seed + side })
      }
    }
  }

  // ── Smoke ──
  // Lobes that push outward and lift, each its own inked silhouette so the
  // cloud reads as drawn shapes rather than as a soft mass. Seeded off the
  // blast rather than the hold, so it DRIFTS while the fireball pops.
  const smokeA = Math.min(1, Math.max(0, (u - 0.22) / 0.22)) * Math.max(0, 1 - Math.max(0, u - 0.6) / 0.4) * 0.7
  if (smokeA > 0.04 && quality.value !== 'low') {
    const n = quality.value === 'high' ? 4 : 3
    ctx.globalAlpha = smokeA
    const lit = mixHex(b.pal.smoke, '#ffffff', 0.34)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + b.seed * 0.7
      const d = R * (0.45 + u * 0.95)
      const pr = R * (0.3 + noise2(i * 3.1, b.seed, b.seed) * 0.24) * (0.7 + u * 0.7)
      const px = Math.cos(a) * d
      const py = Math.sin(a) * d * 0.7 - u * R * 0.7
      const puff = blob(px, py, pr, pr * 0.86, b.seed + i * 5, 0.2, 2.4, 24)
      fillShape(ctx, puff, b.pal.smoke)
      fillShape(ctx, shrink(puff, 0.6, px - pr * 0.3, py - pr * 0.34), lit)
      ink(ctx, puff, { width: pr * 0.17, color: b.pal.ink, breakUp: 0.5, seed: b.seed + i })
    }
  }

  ctx.restore()
}

// ─── Muzzle flashes ─────────────────────────────────────────────────────────
//
// A shot leaving a barrel used to be one additive blob and five streaks —
// the same mark for a bow, a cannon and a mortar, and the only pure-glow thing
// on a field where the monsters, the blocks and the impact blasts are all flat
// tones under broken ink.
//
// A shot is DRAWN now. The flame is a fan cut into tongues, filled in three cel
// tones and inked; the smoke is its own inked silhouette; and the whole thing
// is redrawn in three HOLDS rather than tweened, because the small jump in the
// contour between holds is exactly what a scaled sprite cannot fake.

type FlashStyle = 'gun' | 'lob' | 'bow' | 'coil' | 'chill'

interface FlashPalette {
  /** Hot centre. */
  core: string
  /** Body of the flame — the tone that identifies the gun. */
  mid: string
  /** Shadow side, and the ring. */
  deep: string
  ink: string
  smoke: string
}

const FLASH_PALETTES: Record<string, FlashPalette> = {
  // Loose powder: yellow-hot and quick.
  powder: { core: '#fffdf0', mid: '#ffce67', deep: '#e0651c', ink: '#2a1408', smoke: '#7d7267' },
  // A heavy charge under a short tube: redder, and mostly smoke.
  heavy: { core: '#fff7dc', mid: '#ffb246', deep: '#c2451c', ink: '#231208', smoke: '#615950' },
  arc: { core: '#ffffff', mid: '#cdf3ff', deep: '#3f9fdc', ink: '#10202e', smoke: '#8098aa' },
  rime: { core: '#ffffff', mid: '#e2f8ff', deep: '#5cbde2', ink: '#123244', smoke: '#9dbecc' },
  dust: { core: '#fdf4e0', mid: '#e3d2b0', deep: '#a08a6a', ink: '#3a2a18', smoke: '#8f8069' }
}

interface FlashRecipe {
  style: FlashStyle
  pal: FlashPalette
  /** Block centre → barrel mouth, world units. Keeps the flame ON the gun. */
  reach: number
  /** Flame length at full extension, world units. */
  len: number
  /** Half-angle of the fan. */
  spread: number
  life: number
  /**
   * Fixed elevation in radians for the guns that lob instead of tracking,
   * mirrored for columns left of the gate. Absent means "along the aim".
   */
  elev?: number
  /** Straight up out of the cell, whatever the block is pointing at. */
  up?: boolean
  /** Extra lift, world units — for fixtures that sit on top of their block. */
  rise?: number
}

/**
 * Elevation of the lobbing guns, as a WORLD angle (y-up).
 *
 * Mortars and bombards do not track: they sit at a steep fixed angle pointing
 * AWAY from the gate, so a column on the left of the tower answers the left
 * lane and one on the right answers the right.
 */
const lobAngle = (c: number, elev: number): number => (c < 0 ? Math.PI - elev : elev)

const MUZZLE_RECIPES: Record<string, FlashRecipe> = {
  cannon: { style: 'gun', pal: FLASH_PALETTES.powder!, reach: 0.56, len: 0.95, spread: 0.6, life: 260 },
  mortar: { style: 'lob', pal: FLASH_PALETTES.heavy!, reach: 0.46, len: 0.8, spread: 0.52, life: 460, elev: MORTAR_ELEV },
  bombard: { style: 'lob', pal: FLASH_PALETTES.heavy!, reach: 0.34, len: 0.66, spread: 0.66, life: 400, elev: BOMBARD_ELEV },
  archer: { style: 'bow', pal: FLASH_PALETTES.dust!, reach: 0.26, len: 0.46, spread: 0.9, life: 180 },
  tesla: { style: 'coil', pal: FLASH_PALETTES.arc!, reach: 0.38, len: 0.44, spread: 1.5, life: 200, up: true },
  // The frost fixture is a cluster of crystals sitting ON TOP of its block, so
  // the vapour has to leave from up there — along the aim, but lifted.
  frost: { style: 'chill', pal: FLASH_PALETTES.rime!, reach: 0.32, len: 0.52, spread: 0.85, life: 320, rise: 0.26 }
}

interface Muzzle {
  x: number
  y: number
  /** Screen-space heading (canvas y runs down). */
  angle: number
  life: number
  maxLife: number
  seed: number
  rec: FlashRecipe
}

const muzzles: Muzzle[] = []
let muzzleSeq = 0

const spawnMuzzle = (x: number, y: number, worldAngle: number, rec: FlashRecipe): void => {
  const q = quality.value
  const cap = q === 'high' ? 10 : q === 'medium' ? 6 : 3
  if (muzzles.length >= cap) muzzles.shift()
  muzzleSeq = (muzzleSeq + 1) % 991
  muzzles.push({
    x, y,
    angle: -worldAngle,
    life: rec.life, maxLife: rec.life,
    seed: muzzleSeq * 5.77,
    rec
  })
}

/**
 * The flame: a fan opening along +x whose leading edge is cut into tongues.
 *
 * A smooth cone reads as a cone. It is the tongues — and the fact that no two
 * are the same length — that make a discharge look like burning gas instead of
 * a lighting effect stuck on the end of a barrel.
 */
const flameFan = (
  len: number, base: number, spread: number, tongues: number, seed: number, n = 22
): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const a = (u - 0.5) * 2 * spread
    // Clamped: 1.5708 overshoots π/2, so the cosine goes microscopically
    // negative at the rim and a fractional power of that is NaN.
    const fall = Math.pow(Math.max(0, Math.cos((a / spread) * 1.5708)), 0.55)
    const cut = 0.56 + 0.44 * Math.abs(Math.cos(u * Math.PI * tongues + seed * 0.7))
    const jitter = 0.82 + noise2(u * 6.1, seed, seed) * 0.42
    const r = base + (len - base) * fall * cut * jitter
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  // Close around the mouth rather than across it, so the fill is a solid form
  // and not a wedge with a straight chord cut through its throat.
  for (let i = n; i >= 0; i--) {
    const u = i / n
    const a = (u - 0.5) * 2 * spread
    pts.push([Math.cos(a) * base * 0.18, Math.sin(a) * base * 0.7])
  }
  return pts
}

/**
 * One smoke lobe. Every puff a gun makes is drawn by this, so a mortar plume
 * and a cannon's powder smoke are unmistakably the same material.
 *
 * Deliberately pale and thinly drawn: at full opacity with a heavy contour a
 * lobe stops being smoke and becomes a boulder, and a stack of them turns a
 * mortar into a chimney with rocks coming out of it.
 */
const smokePuff = (
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  pal: FlashPalette, seed: number, inked: boolean
): void => {
  const puff = blob(x, y, r, r * 0.82, seed, 0.26, 2.5, 18)
  fillShape(ctx, puff, mixHex(pal.smoke, '#ffffff', 0.22))
  fillShape(ctx, shrink(puff, 0.55, x - r * 0.34, y - r * 0.4), mixHex(pal.smoke, '#ffffff', 0.62))
  // Only the underside carries a line — the lit crown of a cloud has no edge.
  if (inked) {
    ink(ctx, puff, {
      width: r * 0.1, color: pal.ink, breakUp: 0.85, seed: seed + 3,
      weight: (_t, na) => Math.max(0, Math.sin(na)) * 1.3 + 0.05
    })
  }
}

const drawMuzzle = (ctx: CanvasRenderingContext2D, m: Muzzle): void => {
  const Z = getZoom()
  const rec = m.rec
  const L0 = rec.len * Z
  if (L0 < 4) return

  const u = 1 - m.life / m.maxLife
  const q = quality.value
  const rich = q !== 'low'
  // Three holds, as with the impact blasts: limited animation, not a tween.
  const hold = Math.min(2, Math.floor(u * 3))
  const seed = m.seed + hold * 19.7
  const pal = rec.pal
  // World "up" expressed in the rotated local frame, so smoke lifts vertically
  // no matter which way the gun is pointing.
  const upx = -Math.sin(m.angle)
  const upy = -Math.cos(m.angle)

  ctx.save()
  ctx.translate(worldToScreenX(m.x), worldToScreenY(m.y))
  ctx.rotate(m.angle)

  switch (rec.style) {
    case 'gun':
    case 'lob': {
      const heavy = rec.style === 'lob'
      // Punches out over the first third of its life and is pulled back into
      // the bore over the rest. A discharge does not fade in place.
      const flameU = Math.min(1, u / (heavy ? 0.45 : 0.62))
      const grow = flameU < 0.42 ? blastEase(flameU / 0.42) : 1 - ((flameU - 0.42) / 0.58) * 0.72
      const L = L0 * Math.max(0, grow)
      const base = L * 0.32
      const fade = 1 - Math.max(0, (flameU - 0.4) / 0.6)

      // Fine linework is a lie at play scale: a cell is ~25 px on screen, so a
      // ring and a spray of slivers drawn at a tenth of that land as stray
      // hairs beside the gun. They are worth drawing only once the camera is
      // close enough for them to be shapes.
      const detail = rich && L0 >= 16

      // ── Shards ──
      // Burning grains thrown clear of the mouth. The only hard edges here:
      // everything else is curves, so the "bang" has to come from somewhere.
      if (detail && flameU < 0.55) {
        ctx.globalAlpha = (1 - flameU / 0.55) * 0.9
        ctx.fillStyle = pal.mid
        const shards = heavy ? 3 : 4
        for (let i = 0; i < shards; i++) {
          const a = (i / (shards - 1) - 0.5) * rec.spread * 2.3 + noise2(i * 2.7, seed, seed) * 0.3
          const len = L * (0.85 + noise2(i * 1.9, seed + 4, seed) * 0.7)
          const w = L * 0.12
          ctx.beginPath()
          ctx.moveTo(Math.cos(a) * len, Math.sin(a) * len)
          ctx.lineTo(Math.cos(a) * base + Math.cos(a + 1.5708) * w, Math.sin(a) * base + Math.sin(a + 1.5708) * w)
          ctx.lineTo(Math.cos(a) * base - Math.cos(a + 1.5708) * w, Math.sin(a) * base - Math.sin(a + 1.5708) * w)
          ctx.closePath()
          ctx.fill()
        }
      }

      // ── Flame ──
      if (fade > 0.03 && L > 3) {
        ctx.globalAlpha = fade
        const fan = flameFan(L, base, rec.spread, heavy ? 3 : 4, seed, rich ? 22 : 14)
        fillShape(ctx, fan, pal.deep)
        fillShape(ctx, shrink(fan, 0.66), pal.mid)
        fillShape(ctx, shrink(fan, heavy ? 0.3 : 0.36), pal.core)
        if (rich) ink(ctx, fan, { width: L * 0.11, color: pal.ink, breakUp: 0.45, seed: seed + 6 })
      }

      // ── Blast ring ──
      // The pressure wave leaving the mouth: a broken ink ellipse standing
      // across the barrel, wide and gone before the smoke arrives. Only the
      // flat-shooting guns get one — a mortar's charge stays in the tube, and
      // a ring drawn round a near-vertical mouth read as a stray scratch.
      const ringA = 1 - u * 3.4
      if (detail && !heavy && ringA > 0.04) {
        const d = L0 * (0.25 + blastEase(u * 2.4) * 0.8)
        const rr = L0 * (0.35 + blastEase(u * 2.2) * 0.5)
        ctx.globalAlpha = ringA * 0.75
        ink(ctx, blob(d, 0, rr * 0.5, rr, seed + 9, 0.18, 2.2, 24), {
          width: Math.max(1.5, L0 * 0.12 * (1 - u)),
          color: pal.deep,
          breakUp: 0.4,
          seed: seed + 12
        })
      }

      // ── Smoke ──
      // The cannon coughs a little; the mortar is mostly smoke, and its plume
      // outlives the flame by half a second. That difference is the whole
      // reason the two guns don't sound alike on screen.
      const smokeA = Math.min(1, Math.max(0, (u - 0.12) / 0.2)) *
        Math.max(0, 1 - Math.max(0, u - (heavy ? 0.5 : 0.4)) / (heavy ? 0.5 : 0.6)) *
        (heavy ? 0.5 : 0.34)
      if (rich && smokeA > 0.04) {
        const n = heavy ? (q === 'high' ? 3 : 2) : 2
        for (let i = 0; i < n; i++) {
          // Pushed out of the muzzle, then lifted — smoke leaves along the
          // barrel and immediately forgets about it. Each lobe further along
          // the plume is thinner than the one behind it, which is what keeps
          // the column from reading as a stack of identical objects.
          const wob = noise2(i * 3.3, m.seed, m.seed)
          const along = L0 * (0.25 + i * 0.3) * (0.5 + u * 0.8)
          const lift = L0 * u * (heavy ? 0.95 : 0.6) * (0.4 + i * 0.3)
          const drift = (wob - 0.5) * L0 * 0.35
          const pr = L0 * (0.2 + wob * 0.22) * (0.55 + u * 0.9)
          ctx.globalAlpha = smokeA * (1 - i * 0.24)
          smokePuff(ctx, along + upx * lift - upy * drift, upy * lift + upx * drift, pr, pal, m.seed + i * 7, true)
        }
      }
      break
    }

    case 'bow': {
      // No fire — a bow releases air. Two motion arcs snapping shut across the
      // string's path, and a flick of grit off the rail.
      const a = 1 - u
      if (a <= 0.02) break
      ctx.globalAlpha = a * 0.85
      for (const k of [0, 1]) {
        const r = L0 * (0.42 + k * 0.3 + u * 0.55)
        const arc: Pt[] = []
        for (let i = 0; i <= 8; i++) {
          const th = (i / 8 - 0.5) * rec.spread * 2
          arc.push([Math.cos(th) * r, Math.sin(th) * r * 1.15])
        }
        // Dark line first, pale one chasing it: a release reads as a flick of
        // light escaping a dark stroke, and one tone alone reads as a smudge.
        inkStroke(ctx, arc, L0 * 0.02, L0 * (0.09 - k * 0.04), k ? '#f6ead2' : pal.ink, seed + k * 3)
      }
      // The shaft's own wake: a thin line already leaving along the aim.
      ctx.globalAlpha = a * 0.5
      inkStroke(ctx, [[L0 * 0.2, 0], [L0 * (0.9 + u * 1.4), 0]], L0 * 0.05, L0 * 0.008, pal.mid, seed + 7)
      break
    }

    case 'coil': {
      // The coil dumping its charge: hard zigzag hairs, no soft glow — the
      // lightning that follows is the light, this is the crack.
      const a = 1 - u * 1.4
      if (a <= 0.02) break
      ctx.globalAlpha = Math.min(1, a)
      const arms = rich ? 5 : 3
      for (let i = 0; i < arms; i++) {
        const th = (i / arms) * Math.PI * 2 + m.seed * 0.9
        const len = L0 * (0.6 + noise2(i * 2.1, seed, seed) * 0.9) * (0.5 + blastEase(u * 2) * 0.8)
        const hair: Pt[] = [[0, 0]]
        for (let k = 1; k <= 3; k++) {
          const f = k / 3
          const j = (noise2(i * 3.1 + k, seed + 2, seed) - 0.5) * len * 0.45
          hair.push([Math.cos(th) * len * f - Math.sin(th) * j, Math.sin(th) * len * f + Math.cos(th) * j])
        }
        inkStroke(ctx, hair, L0 * 0.09, L0 * 0.012, pal.deep, seed + i)
        inkStroke(ctx, hair, L0 * 0.045, L0 * 0.006, pal.core, seed + i + 40)
      }
      break
    }

    case 'chill': {
      // Frost: vapour, not flame. Pale lobes that bloom and sag, with a few
      // hard crystal slivers thrown along the barrel.
      const a = Math.min(1, (1 - u) * 1.6)
      if (a <= 0.02) break
      ctx.globalAlpha = a * 0.9
      const spread = L0 * (0.3 + blastEase(u * 1.8) * 0.75)
      for (let i = 0; i < (rich ? 3 : 2); i++) {
        const th = (i / 3 - 0.33) * rec.spread * 1.8
        const pr = L0 * (0.3 + noise2(i * 2.9, m.seed, m.seed) * 0.16) * (0.7 + u * 0.6)
        const cxx = Math.cos(th) * spread + upx * L0 * u * 0.3
        const cyy = Math.sin(th) * spread + upy * L0 * u * 0.3
        const puff = blob(cxx, cyy, pr, pr * 0.82, seed + i * 4, 0.24, 2.6, 18)
        fillShape(ctx, puff, pal.deep)
        fillShape(ctx, shrink(puff, 0.62, cxx - pr * 0.28, cyy - pr * 0.3), pal.mid)
        if (rich) ink(ctx, puff, { width: pr * 0.16, color: pal.ink, breakUp: 0.5, seed: seed + i })
      }
      if (rich && u < 0.6) {
        ctx.globalAlpha = (1 - u / 0.6) * 0.95
        ctx.fillStyle = pal.core
        for (let i = 0; i < 4; i++) {
          const th = (i / 3 - 0.5) * rec.spread * 2
          const len = L0 * (0.7 + noise2(i * 1.7, seed + 1, seed) * 0.8)
          const w = L0 * 0.05
          ctx.beginPath()
          ctx.moveTo(Math.cos(th) * len, Math.sin(th) * len)
          ctx.lineTo(Math.cos(th) * L0 * 0.2 + Math.cos(th + 1.5708) * w, Math.sin(th) * L0 * 0.2 + Math.sin(th + 1.5708) * w)
          ctx.lineTo(Math.cos(th) * L0 * 0.2 - Math.cos(th + 1.5708) * w, Math.sin(th) * L0 * 0.2 - Math.sin(th + 1.5708) * w)
          ctx.closePath()
          ctx.fill()
        }
      }
      break
    }
  }

  ctx.restore()
  ctx.globalAlpha = 1
}

/**
 * A drawn round object: wobbled contour, three flat tones, inked.
 *
 * Every lump of matter in flight is built from this, so a cannonball, a shell
 * and a dropped bomb are recognisably the same material under the same light —
 * which is precisely what a stack of radial gradients could not give them.
 */
const celOrb = (
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number,
  pal: { deep: string; mid: string; lit: string; line: string },
  seed: number, inked: boolean
): Pt[] => {
  const body = blob(cx, cy, rx, ry, seed, 0.11, 2.6, inked ? 20 : 12)
  fillShape(ctx, body, pal.deep)
  fillShape(ctx, shrink(body, 0.8, cx - rx * 0.2, cy - ry * 0.24), pal.mid)
  fillShape(ctx, shrink(body, 0.34, cx - rx * 0.44, cy - ry * 0.48), pal.lit)
  if (inked) ink(ctx, body, { width: Math.max(1, rx * 0.34), color: pal.line, breakUp: 0.34, seed: seed + 2 })
  return body
}

/** Iron, as it reads on every round the tower and the enemy throw. */
const IRON = { deep: '#0f1114', mid: '#333a42', lit: '#6e7783', line: '#07080a' }

const drawProjectile = (ctx: CanvasRenderingContext2D, p: Projectile): void => {
  const zoom = getZoom()
  const x = worldToScreenX(p.x)
  const y = worldToScreenY(p.y)
  const q = quality.value
  const rich = q === 'high'
  // Deterministic per-round seed: the wobble has to stay put frame to frame,
  // or a cannonball boils on its way across the sky.
  const seed = (p.uid % 97) * 3.7

  // ── Trail ──
  // Two characters, because a trail is half of what identifies a shot at speed.
  // Anything with mass leaves DRAWN powder smoke — inked lobes that expand and
  // thin with age — and the small fast rounds leave a tapered ink whisk. A
  // cannonball wearing the archer's hard bright line is most of why the two
  // weapons used to look alike in flight.
  const n = p.trail.length / 2
  if (n >= 3) {
    if (p.kind === 'ball' || p.kind === 'shell' || p.kind === 'bomb') {
      const smoke = themedPalette('smoke')
      const step = q === 'low' ? 3 : 2
      for (let i = 0; i < n - 1; i += step) {
        // 1 at the oldest sample, 0 at the round itself.
        const age = 1 - i / (n - 1)
        const pr = zoom * 0.075 * (0.5 + age * 1.15)
        if (pr < 1.5) continue
        ctx.globalAlpha = 0.4 * (1 - age * 0.82)
        const px = worldToScreenX(p.trail[i * 2]!)
        const py = worldToScreenY(p.trail[i * 2 + 1]!)
        const puff = blob(px, py, pr, pr * 0.88, seed + i * 4.1, 0.2, 2.4, rich ? 16 : 10)
        fillShape(ctx, puff, smoke.mid)
        fillShape(ctx, shrink(puff, 0.6, px - pr * 0.3, py - pr * 0.34), smoke.light)
        if (rich && age < 0.45) {
          ink(ctx, puff, { width: pr * 0.2, color: smoke.dark, breakUp: 0.55, seed: seed + i })
        }
      }
      ctx.globalAlpha = 1
    } else {
      // A whisk: nocked thin at the tail, swelling toward the round. Drawn as
      // ink rather than stroked, so it belongs to the same hand as everything
      // it flies past.
      const path: Pt[] = []
      for (let i = 0; i < p.trail.length; i += 2) {
        path.push([worldToScreenX(p.trail[i]!), worldToScreenY(p.trail[i + 1]!)])
      }
      const cold = p.kind === 'frost'
      ctx.globalAlpha = cold ? 0.5 : 0.42
      inkStroke(ctx, path, zoom * 0.005, zoom * (cold ? 0.1 : 0.07), cold ? '#9fe9ff' : '#ffd79a', seed + 5)
      ctx.globalAlpha = cold ? 0.9 : 0.75
      inkStroke(ctx, path, zoom * 0.002, zoom * (cold ? 0.045 : 0.03), cold ? '#eafcff' : '#fff3d4', seed + 9)
      ctx.globalAlpha = 1
    }
  }

  switch (p.kind) {
    case 'bolt': {
      // An arrow is a drawn object, not a lit one: a tapered shaft, a flat
      // steel head with one bright facet, and fletching that reads even at
      // eight pixels because it is the only warm note on the round.
      const ang = Math.atan2(-p.vy, p.vx)
      const u = zoom * 0.1
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)

      // Shaft — swelling toward the head, the way a nib leaves a line.
      inkStroke(ctx, [[-u * 1.7, 0], [u * 0.4, 0], [u * 1.5, 0]], u * 0.16, u * 0.34, '#c39a5e', seed)
      inkStroke(ctx, [[-u * 1.7, u * 0.1], [u * 1.5, u * 0.1]], u * 0.07, u * 0.13, '#6d4a24', seed + 3)

      // Head: two flat tones and a hard inked edge.
      const head: Pt[] = [[u * 2.5, 0], [u * 1.35, -u * 0.5], [u * 1.6, 0], [u * 1.35, u * 0.5]]
      fillShape(ctx, head, '#8e9aa8')
      fillShape(ctx, [[u * 2.4, -u * 0.04], [u * 1.4, -u * 0.42], [u * 1.62, -u * 0.05]], '#e8eef6')
      if (rich) ink(ctx, head, { width: u * 0.14, color: '#171c22', breakUp: 0.3, seed: seed + 7 })

      // Fletching.
      ctx.fillStyle = '#2f7d5a'
      for (const f of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(-u * 1.75, 0)
        ctx.lineTo(-u * 1.1, f * u * 0.55)
        ctx.lineTo(-u * 0.55, f * u * 0.12)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
      break
    }

    case 'ball': {
      // Cannonball: a solid iron round shot, deliberately circular and NOT
      // aligned to its velocity. Roundness is the entire silhouette cue for a
      // cannon — elongate it and it reads as a second, fatter arrow.
      const r = zoom * 0.11
      if (r < 1.5) { ctx.fillStyle = IRON.mid; ctx.fillRect(x - 1, y - 1, 2, 2); break }

      // Muzzle heat still clinging to the shot, drawn as a crescent on the
      // TRAILING limb rather than sprayed as a glow: a hot edge says the ball
      // just left a barrel, a halo says the ball is a light source.
      const back = Math.atan2(p.vy, p.vx) + Math.PI
      ctx.globalAlpha = 0.55
      fillShape(ctx, blob(x + Math.cos(back) * r * 0.5, y - Math.sin(back) * r * 0.5, r * 0.72, r * 0.66, seed + 11, 0.2, 2.4, 12), '#e0621c')
      ctx.globalAlpha = 1

      celOrb(ctx, x, y, r, r * 0.98, IRON, seed, rich)
      // A specular pip: one dot is all it takes to stop a filled shape reading
      // as a flat disc.
      fillShape(ctx, blob(x - r * 0.4, y - r * 0.44, r * 0.24, r * 0.2, seed + 4, 0.25, 2, 10), '#ffffff')
      break
    }

    case 'shell': {
      // The mortar's round: a finned iron shell that points along its arc, with
      // a fuse still burning at the tail. The fuse is the tell that this one is
      // going to detonate rather than simply land.
      const ang = Math.atan2(-p.vy, p.vx)
      const u = zoom * 0.1
      if (u < 1.5) { ctx.fillStyle = IRON.mid; ctx.fillRect(x - 1, y - 1, 2, 2); break }
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)

      // Fins first, so the body sits over their roots.
      ctx.fillStyle = IRON.mid
      for (const f of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(-u * 0.5, f * u * 0.25)
        ctx.lineTo(-u * 1.5, f * u * 0.95)
        ctx.lineTo(-u * 0.6, f * u * 0.2)
        ctx.closePath()
        ctx.fill()
      }

      celOrb(ctx, 0, 0, u * 1.35, u * 0.72, IRON, seed, rich)
      // Driving band: the one bright horizontal on an otherwise dark form.
      ctx.globalAlpha = 0.9
      fillShape(ctx, [[-u * 0.25, -u * 0.66], [u * 0.1, -u * 0.66], [u * 0.1, u * 0.66], [-u * 0.25, u * 0.66]], '#c98a2a')
      ctx.globalAlpha = 1

      // Fuse spark — a tiny drawn star, not a glow.
      const sp = 0.6 + 0.4 * Math.sin(p.life / 40)
      ctx.fillStyle = '#ffe9b0'
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const rr = u * (i % 2 ? 0.16 : 0.46) * sp
        const sx = -u * 1.6 + Math.cos(a) * rr
        const sy = Math.sin(a) * rr
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      break
    }

    case 'bomb': {
      // Enemy ordnance: the same iron, but nose-down along its own velocity.
      // The rotation is what sells the fall, and it is the player's cue to
      // look up.
      const ang = Math.atan2(-p.vy, p.vx)
      const u = zoom * 0.1
      if (u < 1.5) { ctx.fillStyle = IRON.mid; ctx.fillRect(x - 1, y - 1, 2, 2); break }
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)
      ctx.fillStyle = '#8f98a4'
      for (const f of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(-u * 0.6, f * u * 0.2)
        ctx.lineTo(-u * 1.6, f * u * 0.9)
        ctx.lineTo(-u * 1.45, f * u * 0.15)
        ctx.closePath()
        ctx.fill()
      }
      celOrb(ctx, 0, 0, u * 1.25, u * 0.7, IRON, seed, rich)
      ctx.restore()
      break
    }

    case 'fire': {
      // Molotov: a tumbling bottle wrapped in its own flame. The flame is the
      // same fan the guns fire, pointed at the sky and re-cut every 90 ms, so
      // burning fuel looks the same wherever it appears in the game.
      const u = zoom * 0.1
      const spin = (p.life / 90) % (Math.PI * 2)
      const fire = themedPalette('fire')
      const hold = Math.floor(p.life / 90)

      ctx.save()
      ctx.translate(x, y)
      // Flame climbs, whichever way the bottle is tumbling.
      const fan = flameFan(u * 3.1, u * 0.9, 0.95, 3, hold * 4.3 + seed, rich ? 18 : 12)
      ctx.rotate(-Math.PI / 2)
      fillShape(ctx, fan, fire.dark)
      fillShape(ctx, shrink(fan, 0.72), fire.mid)
      fillShape(ctx, shrink(fan, 0.4), fire.light)
      fillShape(ctx, shrink(fan, 0.18), fire.accent)
      if (rich) ink(ctx, fan, { width: u * 0.3, color: '#3a1206', breakUp: 0.5, seed: seed + 6 })
      ctx.restore()

      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(spin)
      const glass: Pt[] = [
        [-u * 0.42, u * 0.85], [-u * 0.5, -u * 0.2], [-u * 0.2, -u * 0.75],
        [u * 0.2, -u * 0.75], [u * 0.5, -u * 0.2], [u * 0.42, u * 0.85]
      ]
      fillShape(ctx, glass, '#3f7a34')
      fillShape(ctx, shrink(glass, 0.5, -u * 0.25, 0), '#7fc063')
      if (rich) ink(ctx, glass, { width: u * 0.22, color: '#14260f', breakUp: 0.3, seed: seed + 1 })
      ctx.fillStyle = '#e8dcc0'
      ctx.fillRect(-u * 0.18, -u * 1.15, u * 0.36, u * 0.45)
      ctx.restore()
      break
    }

    case 'frost': {
      // A shard of ice rather than a ball of light: three flat pale tones under
      // a cold outline, turning slowly so it catches differently each frame.
      const r = zoom * 0.11
      if (r < 1.5) { ctx.fillStyle = '#cdf2ff'; ctx.fillRect(x - 1, y - 1, 2, 2); break }
      const spin = p.life / 260
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(spin)
      const crystal: Pt[] = [
        [0, -r * 1.5], [r * 0.5, -r * 0.35], [r * 1.15, 0],
        [r * 0.5, r * 0.4], [0, r * 1.35], [-r * 0.5, r * 0.4],
        [-r * 1.15, 0], [-r * 0.5, -r * 0.35]
      ]
      fillShape(ctx, crystal, '#4f9dbe')
      fillShape(ctx, shrink(crystal, 0.66, -r * 0.2, -r * 0.3), '#b6ecff')
      fillShape(ctx, shrink(crystal, 0.28, -r * 0.35, -r * 0.5), '#ffffff')
      if (rich) ink(ctx, crystal, { width: r * 0.26, color: '#123244', breakUp: 0.4, seed: seed + 3 })
      ctx.restore()
      // Two chips tumbling alongside, so the round reads as ice breaking off it.
      ctx.globalAlpha = 0.8
      for (let i = 0; i < 2; i++) {
        const a = spin * (i ? -1.6 : 1.3) + i * 2.1
        fillShape(ctx, blob(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5, r * 0.28, r * 0.2, seed + i * 6, 0.3, 2, 8), '#dcf6ff')
      }
      ctx.globalAlpha = 1
      break
    }
  }
}

// ─── Build-mode world UI ────────────────────────────────────────────────────

export interface BuildOverlay {
  /** Shape the player has armed in the tray, or null. */
  selectedShape: string | null
  /** Cell under the pointer (the shape's bottom-left anchor), or null. */
  hoverC: number | null
  hoverR: number | null
  /** Whether the hovered anchor is a legal, affordable placement. */
  hoverValid: boolean
  /** Anchor cells where the armed shape would fit — drawn as faint sockets. */
  slots: Array<[number, number]>
  /** Block whose inspector is open (draws its range circle). */
  inspectC: number | null
  inspectR: number | null
}

let overlay: BuildOverlay = {
  selectedShape: null, hoverC: null, hoverR: null, hoverValid: false,
  slots: [], inspectC: null, inspectR: null
}

export const setBuildOverlay = (next: Partial<BuildOverlay>): void => {
  overlay = { ...overlay, ...next }
}

/**
 * The "nothing may go here" cross, drawn in the cell ABOVE a gable.
 *
 * A roofed cell seals its column, and until this existed the only feedback was
 * the ghost outline turning red once the player had already aimed at the dead
 * slot — which reads as "the game refused my tap", not as a rule. Marking the
 * sealed cell itself, before the tap, turns the same rule into something the
 * player can see and plan around.
 *
 * Drawn as a disc plus a thick cross so it survives being 14 px wide on a
 * zoomed-out phone, where a bare stroked ✕ dissolves into the sky.
 */
const drawSealMark = (
  ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, alpha: number
): void => {
  const r = size * 0.3
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(24, 6, 10, 0.55)'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#ff4d4d'
  ctx.lineWidth = Math.max(1.5, size * 0.09)
  ctx.lineCap = 'round'
  const a = r * 0.62
  ctx.beginPath()
  ctx.moveTo(cx - a, cy - a)
  ctx.lineTo(cx + a, cy + a)
  ctx.moveTo(cx + a, cy - a)
  ctx.lineTo(cx - a, cy + a)
  ctx.stroke()
  ctx.restore()
}

const drawBuildOverlay = (ctx: CanvasRenderingContext2D, t: number): void => {
  const zoom = getZoom()
  const pulse = 0.5 + 0.5 * Math.sin(t / 420)
  const shape = overlay.selectedShape ? SHAPE_BY_ID[overlay.selectedShape] : null

  // Legal anchor sockets.
  //
  // Two deliberate limits keep this readable. Only the ANCHOR cell is marked,
  // not the whole footprint of every candidate. And once the pointer is over
  // the field, sockets fade with distance from it — a twenty-block tower has
  // fifty legal anchors, and drawing them all at full strength wallpapers the
  // sky in blue and hides the tower the player is trying to read.
  if (shape && overlay.slots.length > 0) {
    ctx.lineWidth = Math.max(1, zoom * 0.03)
    const hasHover = overlay.hoverC != null && overlay.hoverR != null
    const FALLOFF = 5.5
    for (const [c, r] of overlay.slots) {
      let near = 1
      if (hasHover) {
        const d = Math.hypot(c - overlay.hoverC!, r - overlay.hoverR!)
        near = Math.max(0.12, 1 - d / FALLOFF)
      }
      const x = worldToScreenX(c - 0.5)
      const y = worldToScreenY(r + 1)
      ctx.fillStyle = `rgba(120,220,255,${(0.05 + pulse * 0.045) * near})`
      ctx.strokeStyle = `rgba(150,230,255,${(0.22 + pulse * 0.16) * near})`
      roundRect(ctx, x, y, zoom, zoom, zoom * 0.12)
      ctx.fill()
      ctx.stroke()
    }
  }

  // Cells already sealed by a gable somewhere in the standing tower.
  //
  // Only while a piece is armed — outside build mode these would be pure noise —
  // and faded with distance from the pointer, on the same falloff as the
  // sockets, so a tower with a dozen roofs doesn't turn into a field of crosses.
  if (shape) {
    const hasHover = overlay.hoverC != null && overlay.hoverR != null
    for (const b of getBlocks().values()) {
      if (!b.roof) continue
      let near = 0.55
      if (hasHover) {
        const d = Math.hypot(b.c - overlay.hoverC!, b.r + 1 - overlay.hoverR!)
        near = Math.max(0.14, 0.85 - d / 7)
      }
      drawSealMark(ctx, worldToScreenX(b.c), worldToScreenY(b.r + 1.5), zoom, near)
    }
  }

  // Ghost preview — the WHOLE shape, drawn from the anchor under the pointer,
  // so the player sees the exact footprint they are committing to.
  if (shape && overlay.hoverC != null && overlay.hoverR != null) {
    const roofs = new Set(shape.roofs ?? [])
    ctx.save()
    ctx.globalAlpha = 0.72
    shape.cells.forEach(([dx, dy, typeId], i) => {
      const cc = overlay.hoverC! + dx
      const rr = overlay.hoverR! + dy
      const x = worldToScreenX(cc - 0.5)
      const y = worldToScreenY(rr + 1)
      ctx.drawImage(getBlockSprite(typeId, 0, zoom), x, y, zoom, zoom)
      if (roofs.has(i)) drawRoof(ctx, worldToScreenX(cc), worldToScreenY(rr + 0.5), zoom)
    })
    ctx.restore()

    ctx.lineWidth = Math.max(2, zoom * 0.06)
    ctx.strokeStyle = overlay.hoverValid ? '#5ef08a' : '#ff5a5a'
    for (const [dx, dy] of shape.cells) {
      const x = worldToScreenX(overlay.hoverC! + dx - 0.5)
      const y = worldToScreenY(overlay.hoverR! + dy + 1)
      roundRect(ctx, x, y, zoom, zoom, zoom * 0.12)
      ctx.stroke()
    }

    // What THIS piece would seal if the player commits, at full strength — the
    // cost of a roofed shape is the cell it takes off the board above itself,
    // and that has to be visible before the tap, not after.
    const own = new Set(shape.cells.map(([dx, dy]) => `${dx},${dy}`))
    shape.cells.forEach(([dx, dy], i) => {
      if (!roofs.has(i)) return
      // A gable under another cell of the same piece is already illegal and is
      // flagged by the red footprint outline; a second marker there is noise.
      if (own.has(`${dx},${dy + 1}`)) return
      const cx = worldToScreenX(overlay.hoverC! + dx)
      const cy = worldToScreenY(overlay.hoverR! + dy + 1.5)
      drawSealMark(ctx, cx, cy, zoom, 0.75 + pulse * 0.25)
    })
  }

  // Range circle for the inspected turret — the clearest way to teach reach.
  if (overlay.inspectC != null && overlay.inspectR != null) {
    const b = getBlocks().get(`${overlay.inspectC},${overlay.inspectR}`)
    const w = b ? blockDef(b.typeId).weapon : null
    if (b && w) {
      const cx = worldToScreenX(b.c)
      const cy = worldToScreenY(b.r + 0.5)
      const rr = w.range * zoom
      ctx.strokeStyle = `rgba(120,220,255,${0.35 + pulse * 0.25})`
      ctx.lineWidth = Math.max(1.5, zoom * 0.035)
      ctx.setLineDash([zoom * 0.22, zoom * 0.16])
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(120,220,255,0.06)'
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill()
      // Selection ring on the block itself.
      ctx.strokeStyle = '#7fe0ff'
      ctx.lineWidth = Math.max(2, zoom * 0.06)
      roundRect(ctx, worldToScreenX(b.c - 0.5), worldToScreenY(b.r + 1), zoom, zoom, zoom * 0.12)
      ctx.stroke()
    }
  }
}

// ─── Block drawing ──────────────────────────────────────────────────────────

const drawBlock = (ctx: CanvasRenderingContext2D, b: Block, t: number, fallOffset = 0, fallRot = 0, fallDx = 0): void => {
  const zoom = getZoom()
  const size = zoom
  const cx = worldToScreenX(b.c + fallDx)
  const cy = worldToScreenY(b.r + 0.5 + fallOffset)

  // Placement pop-in: elastic squash-stretch over 260 ms.
  const age = t - b.bornAt
  let sx = 1
  let sy = 1
  if (age >= 0 && age < 260) {
    const k = age / 260
    const e = 1 - Math.pow(1 - k, 3)
    sx = 1 + (1 - e) * 0.35
    sy = 1 - (1 - e) * 0.3
  }

  ctx.save()
  ctx.translate(cx, cy)
  if (fallRot !== 0) ctx.rotate(fallRot)
  ctx.scale(sx, sy)

  // A hull is not a cube of material: it has its own module, it is clipped at
  // the waterline, and it rolls. It also skips the pop-in squash, the damage
  // stages and the roof cap, none of which mean anything for a boat.
  if (isShip(b.typeId)) {
    drawShip(ctx, b.typeId, size, themedPalette(blockDef(b.typeId).palette), {
      aim: b.aim, t, seed: b.uid
    })
    ctx.restore()
    if (b.hp < b.maxHp && fallOffset === 0) {
      drawHpBar(ctx, cx, cy - size * 0.72, size * 0.72, Math.max(2, size * 0.07),
        b.hp / b.maxHp, false)
    }
    return
  }

  const override = spriteFor('block', b.typeId)
  if (override) {
    ctx.drawImage(override, -size / 2, -size / 2, size, size)
  } else {
    const sprite = getBlockSprite(b.typeId, damageStage(b), size)
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size)
  }

  // Reinforced blocks: a gold rim plus a shine that sweeps across the face.
  // The sweep is phase-offset per cell so a wall of them shimmers rather than
  // pulsing in lockstep, and it is additive so it never muddies the material.
  if (b.enhanced) {
    ctx.save()
    roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.1)
    ctx.clip()
    const k = ((t / 1900 + (b.c * 0.17 + b.r * 0.11)) % 1)
    const sweep = -size + k * size * 2.6
    const gl = ctx.createLinearGradient(sweep - size * 0.32, -size / 2, sweep + size * 0.32, size / 2)
    gl.addColorStop(0, 'rgba(255,238,170,0)')
    gl.addColorStop(0.5, 'rgba(255,246,205,0.5)')
    gl.addColorStop(1, 'rgba(255,238,170,0)')
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = gl
    ctx.fillRect(-size / 2, -size / 2, size, size)
    ctx.restore()

    roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.1)
    ctx.strokeStyle = 'rgba(255,206,74,0.85)'
    ctx.lineWidth = Math.max(1, size * 0.05)
    ctx.stroke()
  }

  ctx.restore()

  // Roof caps sit above the block body and outside its cell.
  if (b.roof) drawRoof(ctx, cx, cy, size)

  // Fixtures rotate/recoil, so they are never cached.
  if (fallOffset === 0) drawFixture(ctx, b, cx, cy, size, t)

  // Burning — a molotov left this block alight and it is still losing HP.
  //
  // Drawn from a handful of cheap sine-driven tongues rather than particles:
  // a fire that lasts five seconds on a dozen blocks at once would otherwise
  // dominate the particle budget for the whole wave, and the flame has to keep
  // burning during the build phase where nothing else is emitting.
  if (b.burnMs && b.burnMs > 0 && fallOffset === 0) {
    // Fade the last 700 ms so the fire visibly dies rather than blinking out.
    const fade = Math.min(1, b.burnMs / 700)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = fade
    const seed = b.c * 3.7 + b.r * 1.9
    for (let i = 0; i < 5; i++) {
      const ph = t / 190 + seed + i * 1.27
      const fx = cx + (i / 4 - 0.5) * size * 0.62 + Math.sin(ph * 1.7) * size * 0.06
      const base = cy + size * 0.42
      const hgt = size * (0.36 + 0.24 * (0.5 + 0.5 * Math.sin(ph)))
      const wid = size * 0.15

      const g = ctx.createLinearGradient(fx, base, fx, base - hgt)
      g.addColorStop(0, 'rgba(255,120,20,0.85)')
      g.addColorStop(0.45, 'rgba(255,186,60,0.7)')
      g.addColorStop(1, 'rgba(255,244,200,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(fx - wid, base)
      ctx.quadraticCurveTo(fx - wid * 0.5, base - hgt * 0.55, fx + Math.sin(ph * 2.3) * wid * 0.5, base - hgt)
      ctx.quadraticCurveTo(fx + wid * 0.6, base - hgt * 0.5, fx + wid, base)
      ctx.closePath()
      ctx.fill()
    }
    // Ember glow washing over the block face, so the block itself looks hot.
    const glow = ctx.createRadialGradient(cx, cy + size * 0.2, 0, cx, cy + size * 0.2, size * 0.8)
    glow.addColorStop(0, 'rgba(255,120,30,0.3)')
    glow.addColorStop(1, 'rgba(255,90,20,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(cx, cy + size * 0.2, size * 0.8, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // Hit flash — a warm-white wash over the block.
  //
  // Additive at 0.7 blew the whole cell out to flat white and took the material
  // with it, so a struck block briefly stopped reading as wood or stone. Half
  // that, in a slightly warm tone, still punches at 60 fps while leaving the
  // block recognisable.
  if (b.flash > 0.02) {
    ctx.save()
    ctx.globalAlpha = Math.min(1, b.flash) * 0.42
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = '#fff4d8'
    roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.12)
    ctx.fill()
    ctx.restore()
  }

  // Damage bar — only on wounded blocks, and never on debris.
  if (b.hp < b.maxHp && fallOffset === 0) {
    drawHpBar(ctx, cx, cy - size * 0.6, size * 0.72, Math.max(2, size * 0.07),
      b.hp / b.maxHp, b.typeId === GATE_ID)
  }

  // Upgrade rank — one gold chevron per rank bought with run gold.
  //
  // Stacked in the bottom-left corner rather than written as a number: at 20 px
  // a cell no digit is legible, but "how many notches" is, and that is the only
  // question the marker has to answer from across the tower.
  const rank = b.level ?? 0
  if (rank > 0 && fallOffset === 0) {
    ctx.save()
    ctx.translate(cx - size * 0.36, cy + size * 0.36)
    ctx.strokeStyle = '#ffd93c'
    ctx.lineWidth = Math.max(1, size * 0.055)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = 'rgba(0,0,0,0.75)'
    ctx.shadowBlur = Math.max(1, size * 0.05)
    const w = size * 0.11
    for (let i = 0; i < rank; i++) {
      const y = -i * size * 0.11
      ctx.beginPath()
      ctx.moveTo(-w, y)
      ctx.lineTo(0, y - w * 0.8)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    ctx.restore()
  }
}

// ─── Reflection ─────────────────────────────────────────────────────────────

/**
 * Mirror the tower into the water strip below the ground line. Cheap version of
 * a real reflection: re-draw the blocks flipped, at low alpha, with a horizontal
 * sine wobble applied per scanline band. Skipped entirely below `high` quality.
 */
const drawReflection = (ctx: CanvasRenderingContext2D, t: number): void => {
  if (quality.value !== 'high') return
  const zoom = getZoom()
  const h = ctx.canvas.height

  // Clip to the WATER only. Mirroring onto the strip of grass in front of the
  // tower made the land look like a second lake.
  const seaY = worldToScreenY(SEA_LEVEL)
  if (seaY > h) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, seaY, ctx.canvas.width, h - seaY)
  ctx.clip()
  ctx.globalAlpha = 0.22
  ctx.translate(0, seaY * 2)
  ctx.scale(1, -1)
  // Slow horizontal shear makes the mirrored image ripple.
  ctx.transform(1, 0, Math.sin(t / 900) * 0.02, 1, 0, 0)

  for (const b of getBlocks().values()) {
    // Hulls are already sitting ON the surface; mirroring one would print a
    // second boat upside-down through the one the player is looking at.
    if (isShip(b.typeId)) continue
    const size = zoom
    const cx = worldToScreenX(b.c)
    const cy = worldToScreenY(b.r + 0.5)
    const sprite = getBlockSprite(b.typeId, damageStage(b), size)
    ctx.drawImage(sprite, cx - size / 2, cy - size / 2, size, size)
    if (b.roof) drawRoof(ctx, cx, cy, size)
  }

  ctx.restore()
  ctx.globalAlpha = 1
}

// ─── Public API ─────────────────────────────────────────────────────────────

let lastFrame = 0

/**
 * Draw one frame. `dtMs` is the real elapsed time; the caller has already
 * stepped the simulation.
 */
let monstersPrimed = false

export const drawScene = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dtMs: number,
  dpr: number
): void => {
  const t = nowMs()
  // Monster strips bake in idle time. Priming the whole cast up front is safe:
  // the build phase gives it orders of magnitude more idle than the ~620 ms of
  // work involved, and anything still unbaked draws its older body.
  if (!monstersPrimed) {
    monstersPrimed = true
    primeMonsterSprites(allMonsterIds())
  }
  tintDpr = dpr
  sampleFrame(dtMs)
  updateCamera(dtMs)

  // Translate this tick's simulation events into presentation.
  for (const ev of drainFx()) consumeFx(ev)
  stepParticles(dtMs)
  stepTexts(dtMs)
  stepDecals(dtMs)
  for (let i = lightningBolts.length - 1; i >= 0; i--) {
    lightningBolts[i]!.life -= dtMs
    if (lightningBolts[i]!.life <= 0) lightningBolts.splice(i, 1)
  }
  for (let i = blasts.length - 1; i >= 0; i--) {
    blasts[i]!.life -= dtMs
    if (blasts[i]!.life <= 0) blasts.splice(i, 1)
  }
  for (let i = muzzles.length - 1; i >= 0; i--) {
    muzzles[i]!.life -= dtMs
    if (muzzles[i]!.life <= 0) muzzles.splice(i, 1)
  }
  if (screenFlash > 0) screenFlash = Math.max(0, screenFlash - dtMs / 260)

  ctx.clearRect(0, 0, w, h)

  // 1–4. Cached background.
  drawSky(ctx, w, h)
  renderBackground(w, h, dpr)
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, w, h)

  const zoom = getZoom()
  const rect = viewRect()

  // 5. Reflection (under everything else on the ground).
  drawReflection(ctx, t)

  // 6. Ground decals.
  for (const d of getDecals()) {
    const a = (d.life / d.maxLife) * d.dark
    if (a <= 0.02) continue
    const x = worldToScreenX(d.x)
    const y = worldToScreenY(d.y)
    const g = ctx.createRadialGradient(x, y, 0, x, y, d.r * zoom)
    g.addColorStop(0, `rgba(24,18,12,${a})`)
    g.addColorStop(1, 'rgba(24,18,12,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.ellipse(x, y, d.r * zoom, d.r * zoom * 0.34, 0, 0, Math.PI * 2); ctx.fill()
  }

  // 7a. Air enemies BEHIND the tower — depth without a z-buffer.
  //
  // Bombers are excluded: they fly ABOVE the crown, not around it, so hiding
  // one behind the tower when it happens to cross the centre column would put
  // the thing currently dropping bombs on the player out of sight.
  const enemies = getEnemies()
  for (const e of enemies) {
    const d = enemyDef(e.typeId)
    if (d.movement !== 'air' || d.bombRun) continue
    if (e.x < rect.l - 3 || e.x > rect.r + 3) continue
    if (Math.abs(e.x) < 1.2) drawEnemy(ctx, e, t)
  }

  // 7b. Blocks — culled to the visible rect.
  for (const b of getBlocks().values()) {
    if (b.c < rect.l - 1 || b.c > rect.r + 1) continue
    if (b.r + 0.5 < rect.b - 1 || b.r + 0.5 > rect.t + 1) continue
    drawBlock(ctx, b, t)
  }
  // Collapsing debris draws with the tower so it tumbles in-plane.
  for (const b of getDebris()) {
    const f = b.falling!
    drawBlock(ctx, b, t, f.dy, f.rot, f.dx)
  }

  // 7c. Everything else in front.
  for (const e of enemies) {
    if (e.x < rect.l - 3 || e.x > rect.r + 3) continue
    const d = enemyDef(e.typeId)
    const behind = d.movement === 'air' && !d.bombRun && Math.abs(e.x) < 1.2
    if (behind) continue // already drawn behind the tower
    drawEnemy(ctx, e, t)
  }

  // 7d. Allies, in front of the enemies they are riding into.
  for (const a of getAllies()) drawAlly(ctx, a, t)

  // 8. Muzzle flashes, over the barrels that made them.
  for (const m of muzzles) drawMuzzle(ctx, m)

  // 8a. Projectiles.
  for (const p of getProjectiles()) drawProjectile(ctx, p)
  for (const bolt of lightningBolts) drawLightning(ctx, bolt)

  // 8b. Drawn impact blasts — over the monster that was hit, under the embers.
  for (const b of blasts) drawBlast(ctx, b)

  // 9. Particles.
  drawParticles(ctx, worldToScreenX, worldToScreenY, zoom)

  // 10. Floating combat text.
  drawFloatingTexts(ctx, zoom)

  // 11. Build UI.
  if (phase.value !== 'defeat') drawBuildOverlay(ctx, t)

  // Full-screen flash for lightning / wave start / gate fall.
  if (screenFlash > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${screenFlash})`
    ctx.fillRect(0, 0, w, h)
  }

  // Speed-up vignette so 2× is unmistakable.
  if (gameSpeed.value > 1 && phase.value === 'battle') {
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(255,140,40,0.13)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, w, h)
  }

  lastFrame = t
  void lastFrame
}

const drawFloatingTexts = (ctx: CanvasRenderingContext2D, zoom: number): void => {
  const texts = getTexts()
  if (texts.length === 0) return
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (const t of texts) {
    const a = Math.min(1, (t.life / t.maxLife) * 2)
    const px = Math.max(10, t.size * zoom * (t.crit ? 1.35 : 1))
    ctx.font = `900 ${px}px Angry, sans-serif`
    ctx.globalAlpha = a
    const x = worldToScreenX(t.x)
    const y = worldToScreenY(t.y)
    ctx.lineWidth = Math.max(2, px * 0.22)
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.strokeText(t.text, x, y)
    ctx.fillStyle = t.color
    ctx.fillText(t.text, x, y)
  }
  ctx.globalAlpha = 1
}

/**
 * Drop the drawn transients the renderer owns — flashes, blasts, bolts.
 *
 * `resetVfx` only reaches the particle/text/decal pools that live in the VFX
 * module, so without this a mortar that fired the instant the player died had
 * its smoke still hanging over the first frame of the next run.
 */
export const resetDrawnFx = (): void => {
  muzzles.length = 0
  blasts.length = 0
  lightningBolts.length = 0
  screenFlash = 0
}

/** Drop every cached sprite. Called when the block theme changes. */
export const invalidateSprites = (): void => {
  spriteCache.clear()
  bgKey = ''
}
