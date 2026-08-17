import {
  rough, hard, fillShape, ink, stroke, tones, noise2, trace,
  type Pt, type CelTones
} from '@/game/inkArt'
import { INK, LINE, paint } from '@/game/monsterKit'
import { mixHex, type Palette } from '@/game/art'

/**
 * ─── Ships ──────────────────────────────────────────────────────────────────
 *
 * The harbour's three hulls, drawn from the same vocabulary as the siege
 * engines — one key light, the kit's three line weights, its ink colour, cel
 * tone cuts, and the same timber/iron/rope materials. A fleet that was lit
 * differently from the machines it shoots at would read as a different game
 * however good it looked on its own.
 *
 * What ships get that the engines do not is WATER. Three things sell it, and
 * all three are cheap:
 *
 *   * The hull is cut off at the waterline by a clip, so it sits IN the lake
 *     rather than on top of it. A boat drawn whole always looks beached.
 *   * Everything above the line rolls and heaves on its own slow clock, with
 *     the mast leaning further than the deck because it is further from the
 *     pivot. Two ships never roll in step.
 *   * A bow wave and a wake, drawn as flat light shapes ON the water rather
 *     than as foam sprites, because the lake itself is flat colour.
 *
 * Convention, shared with the block renderer that calls this: origin at the
 * CELL centre, which for the water row lands exactly on the waterline; `S` is
 * the cell size; authored FACING +X, and the caller mirrors nothing — a moored
 * ship keeps its bow pointing out to the lake it is guarding.
 */

/** Cold iron for fittings, shared with the siege engines. */
const IRON = tones('#5a626d', 1.25)
/** Bright steel for edges and heads. */
const STEEL = tones('#8e97a3', 1.3)
/** Hemp: rigging, lashings, the anchor line. */
const ROPE = tones('#b39a6b', 1.0)

export interface ShipParts {
  timber: CelTones
  timberDark: CelTones
  /** Sail and livery colour. */
  accent: string
  accent2: string
}

export const shipParts = (p: Palette): ShipParts => ({
  timber: tones(p.mid, 1.12),
  // Mixed DOWN from the mid tone: `tones()` rotates its shadows toward violet,
  // which turns a near-black brown into a purple slab.
  timberDark: tones(mixHex(p.mid, p.dark, 0.6), 0.9),
  accent: p.accent,
  accent2: p.accent2
})

/** An authored hard-edged part: corners kept, then a hand-drawn wobble. */
const slab = (pts: Pt[], amount: number, seed: number): Pt[] =>
  rough(hard(pts), amount, seed)

/**
 * Point a deck weapon at its target.
 *
 * `Block.aim` is a WORLD angle — `atan2(target.y − by, …)` with +y pointing up
 * — while the canvas has +y pointing down. Every turret in the game therefore
 * rotates by `−aim`, and the ships were rotating by `+aim`: their guns tracked
 * a mirror image of the target and elevated when they should have depressed.
 *
 * The extra vertical mirror is what a land turret gets away with skipping.
 * A bare barrel can hang upside-down at the far end of its traverse and nobody
 * notices; a gun with a carriage, cap-squares and a bright top chamfer plainly
 * cannot. Flipping across the gun's own axis once it points astern keeps its
 * top face up through the whole arc.
 */
const aimTransform = (ctx: CanvasRenderingContext2D, aim: number): void => {
  ctx.rotate(-aim)
  if (Math.cos(aim) < 0) ctx.scale(1, -1)
}

/** Planked timber with the grain running along it. */
const plank = (
  ctx: CanvasRenderingContext2D, S: number,
  a: Pt, b: Pt, th: number, t: CelTones, seed: number
): void => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * th * 0.5
  const ny = (dx / len) * th * 0.5
  const shape = slab([
    [a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]
  ], th * 0.05, seed)
  paint(ctx, S, shape, t, seed, { line: LINE.fine, amp: 0.05, breakUp: 0.2 })
}

/** Rope, drawn with its lay so it reads as cordage rather than as wire. */
const rope = (
  ctx: CanvasRenderingContext2D, pts: Pt[], w: number, seed: number
): void => {
  stroke(ctx, pts, w * 1.5, w * 1.5, INK, seed)
  stroke(ctx, pts, w, w, ROPE.base, seed)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    for (let k = 0; k < 3; k++) {
      const t0 = k / 3
      const t1 = (k + 0.55) / 3
      stroke(ctx, [
        [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
        [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]
      ], w * 0.34, w * 0.34, ROPE.deep!, seed + i * 5 + k)
    }
  }
}

/**
 * A shield hung on the gunwale.
 *
 * Historically how a longship's crew stowed them, and mechanically the single
 * best readability trick available here: a row of round livery-coloured discs
 * along the sheer line says "this is a warship, and it is the player's" at a
 * size where no amount of hull detail resolves.
 */
const gunwaleShields = (
  ctx: CanvasRenderingContext2D, S: number,
  from: number, to: number, y: number, n: number, accent: string, seed: number
): void => {
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1)
    const x = (from + (to - from) * k) * S
    const r = 0.055 * S
    const disc = rough([
      [x - r, y * S], [x, y * S - r], [x + r, y * S], [x, y * S + r]
    ], r * 0.12, seed + i)
    paint(ctx, S, disc, tones(i % 2 ? accent : '#d8d2c4', 1.1), seed + i,
      { line: LINE.hair, amp: 0.06 })
    fillShape(ctx, [
      [x - r * 0.22, y * S], [x, y * S - r * 0.22],
      [x + r * 0.22, y * S], [x, y * S + r * 0.22]
    ], IRON.base)
  }
}

/**
 * Mast, yard and a bellied sail.
 *
 * The sail is drawn as a curve rather than a rectangle: canvas under wind has
 * a belly, and a flat sail is the single loudest "this is a cardboard cutout"
 * signal a boat can send. `furl` runs 0 (full) to 1 (brailed up to the yard).
 */
const sail = (
  ctx: CanvasRenderingContext2D, S: number,
  x: number, deckY: number, h: number, w: number,
  accent: string, roll: number, t: number, seed: number
): void => {
  const belly = 0.14 + Math.sin(t / 900 + seed) * 0.05
  const topY = deckY - h

  // Mast, leaning with the roll.
  plank(ctx, S, [x, deckY * S], [x + roll * 0.5, topY * S], 0.05 * S, IRON, seed)
  // Yard across it.
  plank(ctx, S,
    [x - w * 0.55 * S + roll * 0.4, (topY + 0.06) * S],
    [x + w * 0.55 * S + roll * 0.4, (topY + 0.06) * S],
    0.036 * S, IRON, seed + 1)

  // Canvas: two arcs meeting at the clews, bellied downwind.
  const sailShape: Pt[] = []
  const yl = x - w * 0.5 * S + roll * 0.4
  const yr = x + w * 0.5 * S + roll * 0.4
  const bot = (topY + h * 0.72) * S
  for (let i = 0; i <= 10; i++) {
    const k = i / 10
    sailShape.push([yl + (yr - yl) * k, (topY + 0.07) * S + Math.sin(k * Math.PI) * belly * 0.3 * S])
  }
  for (let i = 10; i >= 0; i--) {
    const k = i / 10
    sailShape.push([yl + (yr - yl) * k + roll * 0.3, bot + Math.sin(k * Math.PI) * belly * S])
  }
  paint(ctx, S, sailShape, tones(accent, 1.05), seed + 2,
    { line: LINE.mid, amp: 0.1, breakUp: 0.3 })
  // One bold stripe: heraldry at a size where a device would be mud.
  ctx.save()
  ctx.beginPath(); trace(ctx, sailShape); ctx.clip()
  stroke(ctx, [
    [x - w * 0.1 * S, (topY + 0.05) * S], [x - w * 0.1 * S + roll * 0.3, bot + 0.02 * S]
  ], 0.07 * S, 0.07 * S, 'rgba(255,255,255,0.45)', seed + 3)
  ctx.restore()

  // Stays fore and aft.
  rope(ctx, [[x + roll * 0.5, topY * S], [x + w * 0.62 * S, (deckY - 0.02) * S]], 0.014 * S, seed + 4)
  rope(ctx, [[x + roll * 0.5, topY * S], [x - w * 0.62 * S, (deckY - 0.02) * S]], 0.014 * S, seed + 5)
}

/**
 * Water furniture: bow wave, wake and the shadow the hull casts into the lake.
 *
 * Drawn as flat light shapes rather than particles, because the lake itself is
 * flat colour — a soft foam sprite would be the only soft thing on screen.
 */
const waterLine = (
  ctx: CanvasRenderingContext2D, S: number, halfW: number, t: number, seed: number
): void => {
  // The hull's shadow under the surface, so it reads as displacing water.
  ctx.save()
  ctx.globalAlpha = 0.22
  fillShape(ctx, [
    [-halfW * 0.95 * S, 0.02 * S], [halfW * 0.95 * S, 0.02 * S],
    [halfW * 0.7 * S, 0.16 * S], [-halfW * 0.7 * S, 0.16 * S]
  ], '#0d2a3d')
  ctx.restore()

  // Bow wave and wake, breathing on their own clock.
  const swell = 0.5 + 0.5 * Math.sin(t / 620 + seed)
  ctx.save()
  ctx.globalAlpha = 0.5
  fillShape(ctx, [
    [halfW * 0.86 * S, 0.02 * S],
    [(halfW * 1.16 + swell * 0.06) * S, -0.03 * S],
    [(halfW * 1.24 + swell * 0.08) * S, 0.03 * S],
    [halfW * 0.9 * S, 0.06 * S]
  ], '#dff1ff')
  for (let i = 0; i < 3; i++) {
    const d = halfW + 0.16 + i * 0.22
    const a = 0.34 - i * 0.09
    ctx.globalAlpha = a
    fillShape(ctx, [
      [-d * S, (0.0 + i * 0.03) * S],
      [(-d - 0.2 - swell * 0.05) * S, (0.01 + i * 0.03) * S],
      [(-d - 0.2 - swell * 0.05) * S, (0.045 + i * 0.03) * S],
      [-d * S, (0.05 + i * 0.03) * S]
    ], '#cfe9ff')
  }
  ctx.restore()
}

// ─── The hulls ──────────────────────────────────────────────────────────────

/**
 * Skiff — the cheap picket boat.
 *
 * One crewman, one swivel bolt-thrower, a scrap of sail. It has to read as
 * SMALL, because it is what the player buys first and what everything else in
 * the harbour is measured against.
 */
const drawSkiff = (
  ctx: CanvasRenderingContext2D, S: number, m: ShipParts,
  roll: number, aim: number, t: number
): void => {
  const deck = -0.1

  // Hull: a shallow clinker-built boat with a raked stem.
  const hull = slab([
    [-0.42 * S, deck * S], [0.44 * S, (deck - 0.04) * S],
    [0.5 * S, 0.06 * S], [0.3 * S, 0.2 * S],
    [-0.3 * S, 0.2 * S], [-0.44 * S, 0.06 * S]
  ], 0.012 * S, 500)
  paint(ctx, S, hull, m.timber, 501, { line: LINE.major, amp: 0.06 })
  ctx.save()
  ctx.beginPath(); trace(ctx, hull); ctx.clip()
  // Overlapping strakes — the planking that makes a clinker hull a hull.
  for (let i = 0; i < 3; i++) {
    const y = (deck + 0.06 + i * 0.055) * S
    stroke(ctx, [[-0.46 * S, y], [0.5 * S, y - 0.012 * S]],
      0.016 * S, 0.013 * S, m.timber.deep!, 502 + i)
  }
  ctx.restore()
  // Gunwale rail along the sheer.
  stroke(ctx, [[-0.42 * S, deck * S], [0.46 * S, (deck - 0.04) * S]],
    0.03 * S, 0.026 * S, m.timberDark.base, 505)

  // A stubby mast with a scrap of sail, well aft.
  sail(ctx, S, -0.16 * S, deck, 0.44, 0.3, m.accent, roll, t, 506)

  // Swivel bolt-thrower on the foredeck, tracking its target.
  ctx.save()
  ctx.translate(0.22 * S, (deck - 0.02) * S)
  plank(ctx, S, [0, 0], [0, -0.12 * S], 0.05 * S, m.timberDark, 510)
  ctx.translate(0, -0.13 * S)
  aimTransform(ctx, aim)
  plank(ctx, S, [-0.1 * S, 0], [0.22 * S, 0], 0.05 * S, IRON, 511)
  fillShape(ctx, [
    [0.3 * S, 0], [0.2 * S, -0.045 * S], [0.2 * S, 0.045 * S]
  ], STEEL.lit!)
  // Prod arms across it.
  stroke(ctx, [[0.06 * S, -0.11 * S], [0.1 * S, 0], [0.06 * S, 0.11 * S]],
    0.026 * S, 0.026 * S, m.timberDark.base, 512)
  ctx.restore()
}

/**
 * Longship — the workhorse.
 *
 * A carved stem-post, a row of shields on the sheer, oars out, and a heavy
 * harpoon on the foredeck. This is the silhouette the harbour is remembered by.
 */
const drawLongship = (
  ctx: CanvasRenderingContext2D, S: number, m: ShipParts,
  roll: number, aim: number, t: number
): void => {
  const deck = -0.14

  // Oars, drawn first so the hull covers where they enter the water.
  const stroke_ = Math.sin(t / 520) * 0.06
  for (let i = 0; i < 4; i++) {
    const ox = (-0.32 + i * 0.19) * S
    stroke(ctx, [
      [ox, (deck + 0.04) * S],
      [ox - 0.18 * S, (0.16 + stroke_) * S]
    ], 0.026 * S, 0.02 * S, m.timberDark.shade, 520 + i)
  }

  const hull = slab([
    [-0.52 * S, (deck - 0.02) * S], [0.52 * S, (deck - 0.06) * S],
    [0.56 * S, 0.06 * S], [0.34 * S, 0.24 * S],
    [-0.34 * S, 0.24 * S], [-0.56 * S, 0.06 * S]
  ], 0.012 * S, 530)
  paint(ctx, S, hull, m.timber, 531, { line: LINE.major, amp: 0.06 })
  ctx.save()
  ctx.beginPath(); trace(ctx, hull); ctx.clip()
  for (let i = 0; i < 4; i++) {
    const y = (deck + 0.05 + i * 0.055) * S
    stroke(ctx, [[-0.58 * S, y], [0.58 * S, y - 0.014 * S]],
      0.016 * S, 0.013 * S, m.timber.deep!, 532 + i)
  }
  ctx.restore()
  stroke(ctx, [[-0.52 * S, (deck - 0.02) * S], [0.52 * S, (deck - 0.06) * S]],
    0.034 * S, 0.03 * S, m.timberDark.base, 536)

  // Carved stem-post curling over the bow — the one flourish this hull gets.
  const stem: Pt[] = []
  for (let i = 0; i <= 12; i++) {
    const k = i / 12
    const a = -0.5 + k * 2.6
    stem.push([
      (0.52 + Math.cos(a) * 0.12 * (1 - k * 0.4)) * S,
      (deck - 0.04 - k * 0.3) * S + Math.sin(a) * 0.05 * S
    ])
  }
  stroke(ctx, stem, 0.05 * S, 0.02 * S, m.timberDark.base, 538)

  gunwaleShields(ctx, S, -0.4, 0.36, deck - 0.02, 5, m.accent, 540)
  sail(ctx, S, -0.04 * S, deck, 0.6, 0.44, m.accent, roll, t, 545)

  // Harpoon thrower on the foredeck.
  ctx.save()
  ctx.translate(0.34 * S, (deck - 0.04) * S)
  plank(ctx, S, [0, 0], [0, -0.14 * S], 0.06 * S, m.timberDark, 550)
  ctx.translate(0, -0.15 * S)
  aimTransform(ctx, aim)
  plank(ctx, S, [-0.12 * S, 0], [0.26 * S, 0], 0.055 * S, IRON, 551)
  fillShape(ctx, [
    [0.38 * S, 0], [0.24 * S, -0.055 * S], [0.24 * S, 0.055 * S]
  ], STEEL.lit!)
  stroke(ctx, [[0.04 * S, -0.14 * S], [0.11 * S, 0], [0.04 * S, 0.14 * S]],
    0.03 * S, 0.03 * S, m.timberDark.base, 552)
  ctx.restore()
}

/**
 * War galley — the capital ship.
 *
 * A bronze ram at the waterline, an armoured bulwark, a fighting castle aft and
 * a heavy bombard amidships. It is the biggest thing the player can put on the
 * water and it is drawn to be worth what it costs.
 */
const drawGalley = (
  ctx: CanvasRenderingContext2D, S: number, m: ShipParts,
  roll: number, aim: number, t: number
): void => {
  const deck = -0.16

  const oarBeat = Math.sin(t / 420) * 0.07
  for (let i = 0; i < 5; i++) {
    const ox = (-0.4 + i * 0.16) * S
    stroke(ctx, [
      [ox, (deck + 0.06) * S],
      [ox - 0.2 * S, (0.17 + oarBeat) * S]
    ], 0.028 * S, 0.022 * S, m.timberDark.shade, 560 + i)
  }

  const hull = slab([
    [-0.56 * S, (deck - 0.02) * S], [0.5 * S, (deck - 0.04) * S],
    [0.62 * S, 0.04 * S], [0.36 * S, 0.26 * S],
    [-0.36 * S, 0.26 * S], [-0.6 * S, 0.04 * S]
  ], 0.012 * S, 570)
  paint(ctx, S, hull, m.timber, 571, { line: LINE.major, amp: 0.05 })
  ctx.save()
  ctx.beginPath(); trace(ctx, hull); ctx.clip()
  for (let i = 0; i < 4; i++) {
    const y = (deck + 0.06 + i * 0.06) * S
    stroke(ctx, [[-0.62 * S, y], [0.64 * S, y - 0.014 * S]],
      0.017 * S, 0.014 * S, m.timber.deep!, 572 + i)
  }
  ctx.restore()

  // Bronze ram at the waterline — the detail that says "capital ship".
  const ram = slab([
    [0.5 * S, 0.0 * S], [0.78 * S, 0.03 * S],
    [0.76 * S, 0.11 * S], [0.5 * S, 0.12 * S]
  ], 0.008 * S, 576)
  paint(ctx, S, ram, tones('#a9772e', 1.25), 577, { line: LINE.mid, amp: 0.05 })

  // Armoured bulwark along the sheer, with a shield row above it.
  const wall = slab([
    [-0.5 * S, (deck - 0.12) * S], [0.44 * S, (deck - 0.14) * S],
    [0.44 * S, (deck + 0.02) * S], [-0.5 * S, (deck + 0.02) * S]
  ], 0.008 * S, 578)
  paint(ctx, S, wall, m.timberDark, 579, { line: LINE.mid, amp: 0.05 })
  gunwaleShields(ctx, S, -0.42, 0.36, deck - 0.06, 6, m.accent, 580)

  // Fighting castle aft, with a pennant.
  const castle = slab([
    [-0.56 * S, (deck - 0.34) * S], [-0.24 * S, (deck - 0.34) * S],
    [-0.24 * S, (deck - 0.04) * S], [-0.56 * S, (deck - 0.04) * S]
  ], 0.01 * S, 584)
  paint(ctx, S, castle, m.timber, 585, { line: LINE.mid, amp: 0.05 })
  for (const mx of [-0.55, -0.43, -0.31]) {
    paint(ctx, S, slab([
      [mx * S, (deck - 0.42) * S], [(mx + 0.08) * S, (deck - 0.42) * S],
      [(mx + 0.08) * S, (deck - 0.33) * S], [mx * S, (deck - 0.33) * S]
    ], 0.006 * S, 586), m.timberDark, 587, { line: LINE.hair, amp: 0.04 })
  }

  sail(ctx, S, 0.02 * S, deck - 0.02, 0.7, 0.5, m.accent, roll, t, 590)

  // ── The battery ──
  //
  // TWO bombards, fore and aft of the mast. The galley is the capital ship and
  // the top of the harbour tree, and a single gun made it read as a longship
  // with a nicer hull — a broadside is the silhouette that earns the price.
  // Both track the same target, because they are crewed by the same order.
  const bombard = (x: number, scale: number, seed: number): void => {
    ctx.save()
    ctx.translate(x * S, (deck - 0.06) * S)
    plank(ctx, S, [-0.09 * S * scale, 0], [0.09 * S * scale, 0], 0.07 * S, m.timberDark, seed)
    ctx.translate(0, -0.07 * S)
    aimTransform(ctx, aim)
    ctx.scale(scale, scale)
    paint(ctx, S, slab([
      [-0.1 * S, -0.055 * S], [0.28 * S, -0.045 * S],
      [0.28 * S, 0.045 * S], [-0.1 * S, 0.055 * S]
    ], 0.006 * S, seed + 1), IRON, seed + 2, { line: LINE.mid, amp: 0.04 })
    // Reinforcing rings, and a dark muzzle bore.
    for (const k of [0.02, 0.16]) {
      paint(ctx, S, slab([
        [k * S, -0.062 * S], [(k + 0.03) * S, -0.062 * S],
        [(k + 0.03) * S, 0.062 * S], [k * S, 0.062 * S]
      ], 0.004 * S, seed + 3), STEEL, seed + 4, { line: LINE.hair, amp: 0.03 })
    }
    fillShape(ctx, [
      [0.28 * S, -0.05 * S], [0.32 * S, -0.05 * S],
      [0.32 * S, 0.05 * S], [0.28 * S, 0.05 * S]
    ], '#0c1016')
    ctx.restore()
  }

  // The aft gun is drawn a little smaller: it sits further from the viewer on
  // the far side of the mast, and matching them exactly reads as a decal.
  bombard(-0.18, 0.86, 592)
  bombard(0.3, 1, 596)
}

/**
 * Draw one moored ship.
 *
 * `aim` is the deck weapon's angle in radians; `t` the render clock. Everything
 * above the waterline rolls, and the hull is clipped at it.
 */
/**
 * How far below its cell centre a hull is drawn, in cells.
 *
 * The water row's centre lands exactly on `SEA_LEVEL`, which is the SHORELINE
 * — and in this side-on projection the lake reads as the band below the grass,
 * not as the line where they meet. A boat drawn on that line looks beached
 * against the bank behind it. Dropping it clear of the grass strip is what puts
 * it visibly on open water.
 */
const DRAFT = 0.42

export const drawShip = (
  ctx: CanvasRenderingContext2D, id: string, S: number, p: Palette,
  opts: { aim: number; t: number; seed: number }
): void => {
  const m = shipParts(p)
  const { aim, t, seed } = opts
  // Every hull rolls and heaves on its own phase, so a line of moored ships
  // never moves as one object.
  const phase = seed * 1.7
  const roll = Math.sin(t / 1450 + phase) * 0.05 * S
  const heave = Math.sin(t / 1100 + phase * 1.3) * 0.022 * S

  ctx.save()
  ctx.translate(0, DRAFT * S)

  waterLine(ctx, S, id === 'skiff' ? 0.5 : id === 'longship' ? 0.58 : 0.62, t, phase)

  ctx.save()
  // Clip away everything below the waterline: the origin of the water row IS
  // the surface, so a boat drawn whole always looks beached on the lake.
  ctx.beginPath()
  ctx.rect(-S * 1.2, -S * 1.6, S * 2.4, S * 1.6 + S * 0.22)
  ctx.clip()
  ctx.translate(0, heave)
  ctx.rotate(roll / S * 0.5)

  if (id === 'longship') drawLongship(ctx, S, m, roll, aim, t)
  else if (id === 'galley') drawGalley(ctx, S, m, roll, aim, t)
  else drawSkiff(ctx, S, m, roll, aim, t)

  ctx.restore()
  ctx.restore()
  void noise2
  void ink
}
