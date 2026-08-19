import type { BlockKind } from './types'

/**
 * ─── Block glyphs ───────────────────────────────────────────────────────────
 *
 * One bold pictogram per block type, drawn into a unit square centred on the
 * origin (−0.5 … +0.5 on both axes) and scaled by the caller.
 *
 * WHY THIS EXISTS
 * A tray thumbnail gives a block roughly 14–20 px. At that size the in-world
 * material detail — plank seams, masonry courses, rivets — collapses into
 * noise, and every brown block looks like every other brown block. The tray
 * previously leaned on "silhouette plus accent colour", which is exactly the
 * cue that fails first: a colour-blind player, a dimmed unaffordable tile, or
 * simply two wood-family blocks side by side, and the hand becomes unreadable.
 *
 * So the thumbnail carries a GLYPH instead, and the rules are the rules of a
 * road sign rather than of an illustration:
 *
 *   · one shape per block, distinguishable by outline alone at 14 px
 *   · filled masses, not thin strokes — a 1 px line disappears under a
 *     hairline of anti-aliasing on a phone
 *   · drawn light-on-dark with a dark backing plate, so contrast never depends
 *     on the block's own palette
 *   · nothing smaller than about 8% of the cell
 *
 * Shared by the build tray, the block inspector and the tech tree, so a block
 * looks the same everywhere the player meets it.
 */

export interface GlyphCtx {
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void
  closePath(): void
  beginPath(): void
  fill(): void
  rect(x: number, y: number, w: number, h: number): void
}

/** Draw `id`'s pictogram as filled paths in a unit square around the origin. */
export type GlyphFn = (c: GlyphCtx) => void

const box = (c: GlyphCtx, x: number, y: number, w: number, h: number): void => {
  c.beginPath()
  c.rect(x, y, w, h)
  c.fill()
}

/** A boat hull seen from the side: flat sheer, raked stem, rounded forefoot. */
const hull = (c: GlyphCtx, halfW: number): void => {
  c.beginPath()
  c.moveTo(-halfW, 0.1)
  c.lineTo(halfW, 0.06)
  c.lineTo(halfW * 0.72, 0.4)
  c.lineTo(-halfW * 0.72, 0.4)
  c.closePath()
  c.fill()
}

const tri = (c: GlyphCtx, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void => {
  c.beginPath()
  c.moveTo(ax, ay)
  c.lineTo(bx, by)
  c.lineTo(cx, cy)
  c.closePath()
  c.fill()
}

const dot = (c: GlyphCtx, x: number, y: number, r: number): void => {
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.fill()
}

export const BLOCK_GLYPHS: Record<string, GlyphFn> = {
  // ── Core ────────────────────────────────────────────────────────────────
  // An arched, barred door. The only glyph with an arch, so the Gate is never
  // confused with the wall blocks it sits between.
  gate: (c) => {
    c.beginPath()
    c.moveTo(-0.26, 0.42)
    c.lineTo(-0.26, -0.06)
    c.arc(0, -0.06, 0.26, Math.PI, 0)
    c.lineTo(0.26, 0.42)
    c.closePath()
    c.fill()
  },

  // ── Structure ───────────────────────────────────────────────────────────
  // Stacked planks with a visible gap: reads as "boards" at any size.
  wood: (c) => {
    box(c, -0.42, -0.34, 0.84, 0.2)
    box(c, -0.42, -0.08, 0.84, 0.2)
    box(c, -0.42, 0.18, 0.84, 0.2)
  },
  // The same planks under a bold X — the X is the whole identity of the brace.
  brace: (c) => {
    box(c, -0.42, -0.4, 0.84, 0.13)
    box(c, -0.42, 0.27, 0.84, 0.13)
    c.beginPath()
    c.moveTo(-0.42, -0.24); c.lineTo(-0.24, -0.34)
    c.lineTo(0.42, 0.22); c.lineTo(0.24, 0.32)
    c.closePath(); c.fill()
    c.beginPath()
    c.moveTo(0.42, -0.24); c.lineTo(0.24, -0.34)
    c.lineTo(-0.42, 0.22); c.lineTo(-0.24, 0.32)
    c.closePath(); c.fill()
  },
  // Running-bond brick: three courses, offset. Blocky, never mistaken for wood.
  stone: (c) => {
    box(c, -0.42, -0.36, 0.38, 0.2)
    box(c, 0.02, -0.36, 0.4, 0.2)
    box(c, -0.42, -0.1, 0.6, 0.2)
    box(c, 0.24, -0.1, 0.18, 0.2)
    box(c, -0.42, 0.16, 0.18, 0.2)
    box(c, -0.18, 0.16, 0.6, 0.2)
  },

  // ── Weapons ─────────────────────────────────────────────────────────────
  // Bow and nocked arrow. Curve + line: unmistakable even at 12 px.
  archer: (c) => {
    c.beginPath()
    c.moveTo(-0.1, -0.44)
    c.quadraticCurveTo(0.34, 0, -0.1, 0.44)
    c.quadraticCurveTo(0.16, 0, -0.1, -0.44)
    c.closePath()
    c.fill()
    box(c, -0.42, -0.05, 0.72, 0.1)
    tri(c, 0.44, 0, 0.24, -0.13, 0.24, 0.13)
  },
  // Wheeled gun on a carriage: the barrel is the diagonal mass.
  cannon: (c) => {
    c.beginPath()
    c.moveTo(-0.34, 0.16)
    c.lineTo(-0.18, -0.02)
    c.lineTo(0.36, -0.34)
    c.lineTo(0.46, -0.14)
    c.lineTo(-0.08, 0.2)
    c.lineTo(-0.22, 0.34)
    c.closePath()
    c.fill()
    dot(c, -0.28, 0.28, 0.15)
  },
  // Wide-mouthed tube pointing straight up — the "it lobs" read.
  mortar: (c) => {
    c.beginPath()
    c.moveTo(-0.2, 0.44)
    c.lineTo(-0.34, -0.24)
    c.lineTo(0.34, -0.24)
    c.lineTo(0.2, 0.44)
    c.closePath()
    c.fill()
    box(c, -0.4, -0.36, 0.8, 0.14)
  },
  // Short, fat barrel over a sandbag lip — squatter than the mortar on purpose.
  bombard: (c) => {
    c.beginPath()
    c.moveTo(-0.16, 0.1)
    c.lineTo(-0.28, -0.28)
    c.lineTo(0.28, -0.28)
    c.lineTo(0.16, 0.1)
    c.closePath()
    c.fill()
    box(c, -0.34, -0.4, 0.68, 0.14)
    dot(c, -0.26, 0.28, 0.14)
    dot(c, 0, 0.3, 0.14)
    dot(c, 0.26, 0.28, 0.14)
  },
  // Lightning bolt.
  tesla: (c) => {
    c.beginPath()
    c.moveTo(0.1, -0.46)
    c.lineTo(-0.3, 0.06)
    c.lineTo(-0.02, 0.06)
    c.lineTo(-0.14, 0.46)
    c.lineTo(0.3, -0.1)
    c.lineTo(0.02, -0.1)
    c.closePath()
    c.fill()
  },
  // Six-armed snowflake.
  frost: (c) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI
      const dx = Math.cos(a) * 0.44
      const dy = Math.sin(a) * 0.44
      const nx = -Math.sin(a) * 0.07
      const ny = Math.cos(a) * 0.07
      c.beginPath()
      c.moveTo(-dx + nx, -dy + ny)
      c.lineTo(dx + nx, dy + ny)
      c.lineTo(dx - nx, dy - ny)
      c.lineTo(-dx - nx, -dy - ny)
      c.closePath()
      c.fill()
    }
    dot(c, 0, 0, 0.11)
  },

  // ── Utility ─────────────────────────────────────────────────────────────
  // Row of spikes on a base bar.
  spikes: (c) => {
    box(c, -0.44, 0.3, 0.88, 0.14)
    tri(c, -0.3, 0.3, -0.16, -0.42, -0.02, 0.3)
    tri(c, 0.02, 0.3, 0.16, -0.42, 0.3, 0.3)
    tri(c, -0.46, 0.3, -0.38, -0.1, -0.3, 0.3)
    tri(c, 0.3, 0.3, 0.38, -0.1, 0.46, 0.3)
  },
  // A plus/cross — the universal "heals" sign.
  repair: (c) => {
    box(c, -0.14, -0.44, 0.28, 0.88)
    box(c, -0.44, -0.14, 0.88, 0.28)
  },

  // ── Economy ─────────────────────────────────────────────────────────────
  // Circular blade with teeth.
  sawmill: (c) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      tri(
        c,
        Math.cos(a) * 0.26, Math.sin(a) * 0.26,
        Math.cos(a + 0.32) * 0.3, Math.sin(a + 0.32) * 0.3,
        Math.cos(a + 0.16) * 0.48, Math.sin(a + 0.16) * 0.48
      )
    }
    dot(c, 0, 0, 0.3)
  },
  // Pickaxe over a rock.
  quarry: (c) => {
    c.beginPath()
    c.moveTo(-0.44, -0.16)
    c.quadraticCurveTo(0, -0.5, 0.44, -0.16)
    c.quadraticCurveTo(0, -0.28, -0.44, -0.16)
    c.closePath()
    c.fill()
    box(c, -0.07, -0.26, 0.14, 0.68)
  },
  // Stack of coins.
  mint: (c) => {
    for (let i = 0; i < 3; i++) {
      c.beginPath()
      c.ellipse(0, 0.26 - i * 0.24, 0.36, 0.13, 0, 0, Math.PI * 2)
      c.fill()
    }
  },

  // ── Buffs ──
  // A pennant on a staff, and a standing stone. Both read as "not a weapon and
  // not a wall" at 14 px, which is the distinction that matters: the player has
  // to be able to spot the block that only works because of what is beside it.
  banner: (c) => {
    box(c, -0.06, -0.46, 0.12, 0.92)
    c.beginPath()
    c.moveTo(0.04, -0.42)
    c.lineTo(0.46, -0.24)
    c.lineTo(0.04, -0.06)
    c.closePath()
    c.fill()
  },
  obelisk: (c) => {
    c.beginPath()
    c.moveTo(0, -0.48)
    c.lineTo(0.2, -0.2)
    c.lineTo(0.14, 0.3)
    c.lineTo(-0.14, 0.3)
    c.lineTo(-0.2, -0.2)
    c.closePath()
    c.fill()
    box(c, -0.34, 0.32, 0.68, 0.14)
  },

  // ── Early economy ──
  // Deliberately near-cousins of their deep counterparts — a lumber hut reads
  // as a smaller sawmill, a stonepit as a smaller quarry — because that is
  // exactly the relationship the player should infer.
  lumberHut: (c) => {
    tri(c, 0, -0.46, 0.44, -0.06, -0.44, -0.06)
    box(c, -0.34, -0.06, 0.68, 0.46)
    box(c, -0.1, 0.08, 0.2, 0.32)
  },
  stonepit: (c) => {
    c.beginPath()
    c.moveTo(-0.46, 0.34)
    c.lineTo(-0.22, -0.16)
    c.lineTo(0.06, 0.06)
    c.lineTo(0.28, -0.34)
    c.lineTo(0.46, 0.34)
    c.closePath()
    c.fill()
  },
  coffer: (c) => {
    // A strongbox: lid, body and a fat keyhole.
    box(c, -0.42, -0.3, 0.84, 0.2)
    box(c, -0.42, -0.08, 0.84, 0.44)
    dot(c, 0, 0.1, 0.13)
  },

  // ── Ships ──
  // All three read as a hull on a waterline; the rig above it is what
  // separates them, which is the same cue the in-world art uses.
  skiff: (c) => {
    hull(c, 0.34)
    c.beginPath()
    c.moveTo(-0.02, 0.06); c.lineTo(-0.02, -0.36); c.lineTo(0.26, -0.12); c.closePath()
    c.fill()
  },
  longship: (c) => {
    hull(c, 0.44)
    box(c, -0.04, -0.44, 0.08, 0.48)
    c.beginPath()
    c.moveTo(-0.3, -0.38); c.lineTo(0.3, -0.38); c.lineTo(0.22, -0.06); c.lineTo(-0.22, -0.06)
    c.closePath(); c.fill()
  },
  galley: (c) => {
    hull(c, 0.46)
    box(c, -0.04, -0.5, 0.08, 0.5)
    c.beginPath()
    c.moveTo(-0.34, -0.44); c.lineTo(0.34, -0.44); c.lineTo(0.24, -0.04); c.lineTo(-0.24, -0.04)
    c.closePath(); c.fill()
    // Ram at the bow.
    c.beginPath()
    c.moveTo(0.46, 0.14); c.lineTo(0.62, 0.2); c.lineTo(0.46, 0.26); c.closePath(); c.fill()
  }
}

/** Fallback pictograms when a block has no bespoke glyph. */
const KIND_FALLBACK: Record<BlockKind, GlyphFn> = {
  core: BLOCK_GLYPHS.gate!,
  structure: BLOCK_GLYPHS.wood!,
  weapon: BLOCK_GLYPHS.cannon!,
  economy: BLOCK_GLYPHS.mint!,
  utility: BLOCK_GLYPHS.repair!,
  ship: BLOCK_GLYPHS.skiff!
}

export const blockGlyph = (typeId: string, kind: BlockKind): GlyphFn =>
  BLOCK_GLYPHS[typeId] ?? KIND_FALLBACK[kind] ?? BLOCK_GLYPHS.wood!
