import {
  rough, hard, fillShape, ink, stroke, tones, noise2, trace,
  type Pt, type CelTones
} from '@/game/inkArt'
import { INK, LINE, paint, groundShadow } from '@/game/monsterKit'
import { mixHex, type Palette } from '@/game/art'

/**
 * ─── Siege engines ──────────────────────────────────────────────────────────
 *
 * The six machines, drawn from the SAME vocabulary as the monster cast: one key
 * light, the kit's three line weights, the kit's ink colour, and cel tone cuts
 * from `tones()`. That agreement is the whole point. The engines used to be
 * built from gradient-filled rounded rectangles while everything else on the
 * field was hand-inked, and no amount of detail on a machine fixes the fact
 * that it is lit differently from the thing standing next to it.
 *
 * What machines get that creatures do not is a MATERIAL vocabulary — timber
 * with grain and end-checks, iron with rivets and a bright chamfer, rope with
 * a visible lay. Those three, used consistently, are what make a catapult and a
 * trebuchet read as the same workshop's output.
 *
 * Drawing convention, shared with the enemy pipeline that calls this: origin at
 * the engine's centre of mass, `S` is the unit scale, the ground line sits at
 * `y = +0.5`, and everything is authored FACING +X. The caller has already
 * applied the mirror for direction.
 */

/**
 * Where the wheels meet the earth, in units of S.
 *
 * Not a look-right number: ground units spawn at `y = scale / 2`, and `S` is
 * `scale × zoom`, so `+0.5 S` below the origin is exactly the world's ground
 * line. Anything else and the engine floats or paddles.
 */
const GROUND = 0.5

/** Cold iron, shared by every engine so fittings read as one metal. */
const IRON = tones('#5a626d', 1.25)
/** Bright steel for edges and heads — a step above the fittings. */
const STEEL = tones('#8e97a3', 1.3)
/** Hemp. Rope is drawn, never implied: it is what holds a machine together. */
const ROPE = tones('#b39a6b', 1.0)

export interface SiegeParts {
  /** Wood tones for the frame. */
  wood: CelTones
  /** A step darker, for parts sitting behind the frame. */
  woodBack: CelTones
  /** The engine's accent, for banners, torsion bundles and trim. */
  accent: string
  accent2: string
}

/**
 * Derive the material set from the engine's themed palette.
 *
 * `woodBack` is mixed DOWN from the mid tone rather than taken from `p.dark`.
 * `tones()` rotates its shadow steps toward violet, which is right for a lit
 * form and wrong for a base that is already nearly black: the palette's dark
 * browns came out of it as purple slabs, and a purple beam next to a brown one
 * reads as a different material rather than as the same beam further back.
 */
export const siegeParts = (p: Palette): SiegeParts => ({
  wood: tones(p.mid, 1.12),
  woodBack: tones(mixHex(p.mid, p.dark, 0.6), 0.9),
  accent: p.accent,
  accent2: p.accent2
})

// ─── Material vocabulary ────────────────────────────────────────────────────

/** An authored machine part: hard corners, then a hand-drawn wobble. */
const slab = (pts: Pt[], amount: number, seed: number): Pt[] =>
  rough(hard(pts), amount, seed)

/** The four corners of a beam running from `a` to `b` with thickness `th`. */
const beamShape = (a: Pt, b: Pt, th: number): Pt[] => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * th * 0.5
  const ny = (dx / len) * th * 0.5
  // Extended a hair past each end so a joint never shows daylight.
  const ex = (dx / len) * th * 0.12
  const ey = (dy / len) * th * 0.12
  return [
    [a[0] + nx - ex, a[1] + ny - ey],
    [b[0] + nx + ex, b[1] + ny + ey],
    [b[0] - nx + ex, b[1] - ny + ey],
    [a[0] - nx - ex, a[1] - ny - ey]
  ]
}

/**
 * A squared timber.
 *
 * Grain runs ALONG the beam and the end takes a check (a split), which is what
 * separates sawn oak from a brown rectangle. Both are clipped inside the form
 * so a beam never leaks marks over the part in front of it.
 */
export const timber = (
  ctx: CanvasRenderingContext2D, S: number,
  a: Pt, b: Pt, th: number, t: CelTones, seed: number, grain = 3
): void => {
  const shape = slab(beamShape(a, b, th), th * 0.05, seed)
  paint(ctx, S, shape, t, seed, { line: LINE.mid, amp: 0.06, breakUp: 0.2 })

  ctx.save()
  ctx.beginPath(); trace(ctx, shape); ctx.clip()
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  for (let i = 0; i < grain; i++) {
    const off = (noise2(i * 1.7, seed, seed) - 0.5) * th * 0.72
    const wob = th * 0.06
    stroke(ctx, [
      [a[0] + nx * off, a[1] + ny * off],
      [a[0] + dx * 0.5 + nx * (off + wob), a[1] + dy * 0.5 + ny * (off + wob)],
      [b[0] + nx * off, b[1] + ny * off]
    ], th * 0.05, th * 0.03, t.deep ?? t.shade, seed + i * 3)
  }
  ctx.restore()
}

/** A row of iron rivets along a line — the tell that a plate is bolted on. */
const rivets = (
  ctx: CanvasRenderingContext2D, a: Pt, b: Pt, n: number, r: number, seed: number
): void => {
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1)
    const x = a[0] + (b[0] - a[0]) * k
    const y = a[1] + (b[1] - a[1]) * k
    fillShape(ctx, [
      [x - r, y], [x, y - r], [x + r, y], [x, y + r]
    ], IRON.deep!)
    fillShape(ctx, [
      [x - r * 0.5, y - r * 0.15], [x, y - r * 0.65], [x + r * 0.45, y - r * 0.15]
    ], STEEL.lit!)
    void seed
  }
}

/**
 * Rope, drawn with its LAY — the twist of the strands.
 *
 * A plain line reads as wire. Two offset zig-zag passes over a base stroke is
 * the cheapest thing that reads as cordage at any size.
 */
const rope = (
  ctx: CanvasRenderingContext2D, pts: Pt[], w: number, seed: number
): void => {
  stroke(ctx, pts, w * 1.5, w * 1.5, INK, seed)
  stroke(ctx, pts, w, w, ROPE.base, seed)
  const n = pts.length
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const steps = 3
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps
      const t1 = (k + 0.55) / steps
      stroke(ctx, [
        [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
        [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]
      ], w * 0.34, w * 0.34, ROPE.deep!, seed + i * 5 + k)
    }
  }
}

/**
 * A torsion skein: the bundle of twisted sinew that actually stores the energy
 * in a ballista or an onager.
 *
 * Drawn as a banded drum with a washer at each end. It is the single most
 * identifying part of a torsion engine and the old art had none — which is why
 * the ballista read as "a bow on a cart".
 */
const skein = (
  ctx: CanvasRenderingContext2D, S: number,
  x: number, y: number, r: number, accent: string, seed: number
): void => {
  const drum = slab([
    [x - r * 0.62, y - r], [x + r * 0.62, y - r],
    [x + r * 0.62, y + r], [x - r * 0.62, y + r]
  ], r * 0.06, seed)
  paint(ctx, S, drum, tones(accent, 1.15), seed, { line: LINE.fine, amp: 0.05 })
  // Cord bands across the bundle.
  ctx.save()
  ctx.beginPath(); trace(ctx, drum); ctx.clip()
  for (let i = 0; i < 5; i++) {
    const yy = y - r + (r * 2 * (i + 0.5)) / 5
    stroke(ctx, [[x - r * 0.7, yy], [x + r * 0.7, yy + r * 0.06]],
      r * 0.13, r * 0.13, 'rgba(28,20,24,0.35)', seed + i)
  }
  ctx.restore()
  // Iron washers top and bottom — what the skein is tensioned against.
  for (const wy of [y - r, y + r]) {
    const w = slab([
      [x - r * 0.8, wy - r * 0.12], [x + r * 0.8, wy - r * 0.12],
      [x + r * 0.8, wy + r * 0.12], [x - r * 0.8, wy + r * 0.12]
    ], r * 0.03, seed + 7)
    paint(ctx, S, w, IRON, seed + 8, { line: LINE.hair, amp: 0.04 })
  }
}

/**
 * A spoked cart wheel with an iron tyre.
 *
 * `spin` turns the SPOKES only — the tyre and hub are radially symmetric, so
 * rotating them costs draw calls and changes nothing. Wheels are driven by
 * distance travelled rather than by time, so a halted engine's wheels stop:
 * the clearest possible signal that it has set up to fire.
 */
export const cartWheel = (
  ctx: CanvasRenderingContext2D, S: number,
  x: number, y: number, r: number, spin: number, t: CelTones, seed: number
): void => {
  const ring = (rad: number, wob: number): Pt[] => {
    const pts: Pt[] = []
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2
      const k = 1 + noise2(Math.cos(a) * 2, Math.sin(a) * 2 + seed, seed) * wob
      pts.push([x + Math.cos(a) * rad * k, y + Math.sin(a) * rad * k])
    }
    return pts
  }

  // Iron tyre.
  paint(ctx, S, ring(r, 0.03), IRON, seed, { line: LINE.mid, amp: 0.05 })
  // Timber felloe inside it.
  paint(ctx, S, ring(r * 0.82, 0.035), t, seed + 1, { line: LINE.fine, amp: 0.06 })

  // Spokes. Six, deliberately not perfectly even — a wheel built by hand.
  ctx.save()
  ctx.beginPath(); trace(ctx, ring(r * 0.84, 0)); ctx.clip()
  for (let i = 0; i < 6; i++) {
    const a = spin + (i / 6) * Math.PI * 2 + noise2(i, seed, seed) * 0.06
    const cs = Math.cos(a)
    const sn = Math.sin(a)
    stroke(ctx, [[x, y], [x + cs * r * 0.86, y + sn * r * 0.86]],
      r * 0.2, r * 0.15, t.shade, seed + 10 + i)
    stroke(ctx, [
      [x + cs * r * 0.2 - sn * r * 0.04, y + sn * r * 0.2 + cs * r * 0.04],
      [x + cs * r * 0.8 - sn * r * 0.04, y + sn * r * 0.8 + cs * r * 0.04]
    ], r * 0.05, r * 0.04, t.lit ?? t.base, seed + 20 + i)
  }
  ctx.restore()

  // Hub, with an iron nave band.
  paint(ctx, S, ring(r * 0.26, 0.05), t, seed + 30, { line: LINE.fine, amp: 0.06 })
  fillShape(ctx, ring(r * 0.11, 0.04), IRON.deep!)
}

/** Hide sheeting — soaked ox-hide, the historical answer to fire arrows. */
const hide = (
  ctx: CanvasRenderingContext2D, S: number, shape: Pt[], seed: number
): void => {
  paint(ctx, S, shape, tones('#6d5a45', 1.05), seed, { line: LINE.fine, amp: 0.12 })
  ctx.save()
  ctx.beginPath(); trace(ctx, shape); ctx.clip()
  // Lacing holes down the seams: what makes it read as hide rather than paint.
  for (let i = 0; i < 6; i++) {
    const k = (i + 0.5) / 6
    const x0 = shape[0]![0] + (shape[1]![0] - shape[0]![0]) * k
    const y0 = shape[0]![1] + (shape[1]![1] - shape[0]![1]) * k
    fillShape(ctx, [
      [x0 - S * 0.012, y0], [x0, y0 - S * 0.012],
      [x0 + S * 0.012, y0], [x0, y0 + S * 0.012]
    ], 'rgba(28,20,24,0.5)')
  }
  ctx.restore()
}

/**
 * A crewman in a fighting top, working a bow.
 *
 * Deliberately tiny and deliberately simple: at the size this appears, a
 * silhouette with a helmet, a shoulder and a bent bow is the whole message.
 * Any more detail turns into noise before it turns into a person.
 *
 * The draw cycle is asymmetric — a slow pull and a fast loose — because an
 * archer nocking on a sine wave reads as someone doing exercises.
 */
const crewArcher = (
  ctx: CanvasRenderingContext2D, S: number,
  x: number, y: number, loosing: boolean, t: number, phase: number
): void => {
  const cycle = ((t / 900 + phase) % 1)
  const draw = loosing ? (cycle < 0.75 ? cycle / 0.75 : 0) : 0.25
  const TUNIC = tones('#5b4a63', 1.1)

  // Torso, leaning into the shot.
  paint(ctx, S, slab([
    [x - 0.045 * S, y - 0.02 * S], [x + 0.045 * S, y - 0.03 * S],
    [x + 0.05 * S, y + 0.16 * S], [x - 0.05 * S, y + 0.16 * S]
  ], 0.006 * S, 220), TUNIC, 221, { line: LINE.hair, amp: 0.08 })

  // Helmet — a kettle hat, the cheapest thing that reads as a soldier.
  paint(ctx, S, slab([
    [x - 0.05 * S, y - 0.04 * S], [x - 0.035 * S, y - 0.1 * S],
    [x + 0.035 * S, y - 0.1 * S], [x + 0.05 * S, y - 0.04 * S]
  ], 0.005 * S, 222), IRON, 223, { line: LINE.hair, amp: 0.05 })

  // Bow: a recurve held out front, its string pulled back to the ear.
  const nock = x + 0.03 * S - draw * 0.07 * S
  stroke(ctx, [
    [x + 0.1 * S, y - 0.12 * S],
    [x + 0.15 * S, y - 0.01 * S],
    [x + 0.1 * S, y + 0.1 * S]
  ], 0.016 * S, 0.016 * S, '#6b5238', 224)
  stroke(ctx, [
    [x + 0.1 * S, y - 0.12 * S], [nock, y - 0.01 * S], [x + 0.1 * S, y + 0.1 * S]
  ], 0.008 * S, 0.008 * S, '#e6dcc4', 225)
  // The arrow on the string, only while there is one on the string.
  if (draw > 0.05) {
    stroke(ctx, [[nock, y - 0.01 * S], [nock + 0.2 * S, y - 0.01 * S]],
      0.012 * S, 0.01 * S, '#d8cdb0', 226)
  }
}

/** A rough field stone: never a circle, never twice the same. */
const blobStone = (x: number, y: number, r: number): Pt[] => [
  [x - r, y - r * 0.3], [x - r * 0.5, y - r], [x + r * 0.4, y - r * 0.9],
  [x + r, y - r * 0.1], [x + r * 0.6, y + r * 0.8], [x - r * 0.5, y + r]
]

/** Arrows stuck uselessly in armour — a unit's story, told without a tooltip. */
const stuckArrows = (
  ctx: CanvasRenderingContext2D, S: number, spots: ReadonlyArray<readonly [number, number, number]>
): void => {
  for (const [ax, ay, aa] of spots) {
    const tx = ax * S - Math.cos(aa) * S * 0.2
    const ty = ay * S - Math.sin(aa) * S * 0.2
    stroke(ctx, [[ax * S, ay * S], [tx, ty]], S * 0.018, S * 0.014, '#c9b28a', 41)
    fillShape(ctx, [
      [tx + S * 0.03, ty], [tx - S * 0.02, ty - S * 0.035],
      [tx - S * 0.03, ty], [tx - S * 0.02, ty + S * 0.035]
    ], '#b8443a')
  }
}

// ─── The engines ────────────────────────────────────────────────────────────

/**
 * Bolt thrower. The one the player has to answer at range.
 *
 * Built to look like the machine it is named after, which the previous version
 * did not: a heavy stock on a wheeled carriage, TWO vertical torsion skeins in
 * an upright frame, arms sweeping forward out of them, a bowstring between,
 * a bolt lying in the groove, and a windlass at the tail to draw it. The old
 * one was a curved line and a stick — a longbow lashed to a cart.
 *
 * The far arm is drawn a full tone down and slightly offset rather than
 * mirrored exactly: depth by value, the same trick the four-legged monsters use
 * for their far pair.
 */
const drawBallista = (
  ctx: CanvasRenderingContext2D, S: number, m: SiegeParts,
  spin: number, aiming: boolean, t: number
): void => {
  // Draw progresses over the reload cycle: string comes back, then looses.
  const cycle = (t / 1500) % 1
  const draw = aiming ? (cycle < 0.82 ? cycle / 0.82 : 0) : 0.15

  // Two wheels under a real carriage. One wheel is a wheelbarrow; the mass of
  // this machine has to be visibly carried.
  cartWheel(ctx, S, -0.34 * S, GROUND * S - 0.14 * S, 0.14 * S, spin, m.woodBack, 58)
  cartWheel(ctx, S, 0.26 * S, GROUND * S - 0.14 * S, 0.14 * S, spin, m.woodBack, 60)

  // Carriage bed the whole engine is bolted to.
  timber(ctx, S, [-0.5 * S, 0.28 * S], [0.46 * S, 0.28 * S], 0.11 * S, m.wood, 61, 3)
  // Trail beam running back to a ground stake, so the recoil has somewhere to
  // go. A siege engine that is not braced is a cart.
  timber(ctx, S, [-0.46 * S, 0.28 * S], [-0.72 * S, GROUND * S], 0.06 * S, m.woodBack, 63, 1)

  // ── The stock: the spine of the machine, with the bolt groove on top ──
  timber(ctx, S, [-0.52 * S, 0.1 * S], [0.52 * S, 0.02 * S], 0.19 * S, m.wood, 64, 4)
  stroke(ctx, [[-0.46 * S, 0.02 * S], [0.48 * S, -0.05 * S]],
    0.045 * S, 0.038 * S, m.wood.deep!, 65)
  // Standards tying the stock down to the bed.
  timber(ctx, S, [-0.34 * S, 0.16 * S], [-0.34 * S, 0.28 * S], 0.07 * S, m.woodBack, 66, 1)
  timber(ctx, S, [0.3 * S, 0.12 * S], [0.3 * S, 0.28 * S], 0.07 * S, m.woodBack, 67, 1)

  // ── Upright frame carrying the skeins ──
  timber(ctx, S, [0.14 * S, -0.4 * S], [0.18 * S, 0.16 * S], 0.09 * S, m.wood, 68, 2)
  timber(ctx, S, [0.1 * S, -0.36 * S], [0.44 * S, -0.28 * S], 0.075 * S, m.wood, 69, 2)

  // FAR skein and arm, a tone down and set back.
  skein(ctx, S, 0.17 * S, -0.2 * S, 0.13 * S, m.accent, 70)
  const farAng = -0.62 + draw * 0.55
  timber(ctx, S,
    [0.17 * S, -0.3 * S],
    [0.17 * S + Math.cos(farAng) * 0.5 * S, -0.3 * S + Math.sin(farAng) * 0.5 * S],
    0.065 * S, m.woodBack, 72, 2)

  // NEAR skein and arm.
  skein(ctx, S, 0.24 * S, -0.02 * S, 0.14 * S, m.accent, 74)
  const nearAng = 0.55 - draw * 0.55
  const armTip: Pt = [
    0.24 * S + Math.cos(nearAng) * 0.54 * S,
    -0.02 * S + Math.sin(nearAng) * 0.54 * S
  ]
  timber(ctx, S, [0.24 * S, 0.0 * S], armTip, 0.075 * S, m.wood, 76, 2)

  // ── Bowstring, pulled back to the nock ──
  const farTip: Pt = [
    0.17 * S + Math.cos(farAng) * 0.5 * S,
    -0.3 * S + Math.sin(farAng) * 0.5 * S
  ]
  const nockX = (0.34 - draw * 0.55) * S
  rope(ctx, [farTip, [nockX, -0.05 * S], armTip], 0.022 * S, 80)

  // ── The bolt in the groove ──
  const boltX = nockX
  stroke(ctx, [[boltX, -0.05 * S], [boltX + 0.62 * S, -0.05 * S]],
    0.038 * S, 0.03 * S, '#d8cdb0', 82)
  fillShape(ctx, [
    [boltX + 0.74 * S, -0.05 * S],
    [boltX + 0.6 * S, -0.11 * S],
    [boltX + 0.6 * S, 0.01 * S]
  ], STEEL.base)
  ink(ctx, [
    [boltX + 0.74 * S, -0.05 * S],
    [boltX + 0.6 * S, -0.11 * S],
    [boltX + 0.6 * S, 0.01 * S]
  ], { width: 0.014 * S, color: INK, seed: 83, breakUp: 0.1 })
  // Fletching at the tail.
  for (const f of [-1, 1]) {
    fillShape(ctx, [
      [boltX + 0.02 * S, -0.05 * S],
      [boltX + 0.12 * S, -0.05 * S + f * 0.05 * S],
      [boltX + 0.16 * S, -0.05 * S]
    ], m.accent2)
  }

  // ── Pavise ──
  //
  // The shield board the crew stand behind, bolted across the front of the
  // frame with a slot for the bolt to pass through. It is the most
  // recognisable thing on a ballista after the skeins, it explains at a glance
  // why the machine can sit in the open under fire, and it gives the whole
  // silhouette a solid vertical to hang off instead of a lattice of sticks.
  const pavise = slab([
    [0.36 * S, -0.42 * S], [0.5 * S, -0.36 * S],
    [0.52 * S, 0.12 * S], [0.38 * S, 0.18 * S]
  ], 0.012 * S, 88)
  paint(ctx, S, pavise, m.wood, 89, { line: LINE.major, amp: 0.06 })
  ctx.save()
  ctx.beginPath(); trace(ctx, pavise); ctx.clip()
  // Vertical planking and an iron band across it.
  for (const px of [0.41, 0.46]) {
    stroke(ctx, [[px * S, -0.44 * S], [px * S, 0.2 * S]],
      0.016 * S, 0.014 * S, m.wood.deep!, 90)
  }
  ctx.restore()
  rivets(ctx, [0.38 * S, -0.3 * S], [0.5 * S, -0.28 * S], 2, 0.018 * S, 91)
  // The embrasure the bolt flies through.
  fillShape(ctx, [
    [0.34 * S, -0.09 * S], [0.54 * S, -0.09 * S],
    [0.54 * S, -0.01 * S], [0.34 * S, -0.01 * S]
  ], '#0d1016')

  // ── Spare bolts, racked on the carriage ──
  for (let i = 0; i < 3; i++) {
    const bx = (-0.28 + i * 0.07) * S
    stroke(ctx, [[bx, 0.24 * S], [bx + 0.05 * S, -0.12 * S]],
      0.022 * S, 0.018 * S, '#c9b28a', 92 + i)
    fillShape(ctx, [
      [bx + 0.05 * S, -0.16 * S], [bx + 0.085 * S, -0.1 * S],
      [bx + 0.015 * S, -0.1 * S]
    ], STEEL.base)
  }

  // ── Elevation quadrant ──
  //
  // The notched wedge the stock rests on. Without it the machine has no way to
  // be aimed, which the eye notices even when it cannot name what is missing.
  paint(ctx, S, slab([
    [-0.14 * S, 0.24 * S], [0.06 * S, 0.24 * S], [0.06 * S, 0.06 * S]
  ], 0.008 * S, 95), m.woodBack, 96, { line: LINE.fine, amp: 0.05 })
  for (let i = 0; i < 3; i++) {
    stroke(ctx, [
      [(-0.1 + i * 0.05) * S, 0.22 * S], [(-0.07 + i * 0.05) * S, 0.16 * S]
    ], 0.012 * S, 0.01 * S, m.wood.deep!, 97 + i)
  }

  // ── Windlass at the tail: the crank that draws that string ──
  const crank = aiming ? -t / 260 : 0
  paint(ctx, S, slab([
    [-0.5 * S, -0.14 * S], [-0.28 * S, -0.14 * S],
    [-0.28 * S, 0.06 * S], [-0.5 * S, 0.06 * S]
  ], 0.01 * S, 84), m.woodBack, 85, { line: LINE.fine, amp: 0.05 })
  stroke(ctx, [
    [-0.39 * S, -0.04 * S],
    [-0.39 * S + Math.cos(crank) * 0.15 * S, -0.04 * S + Math.sin(crank) * 0.15 * S]
  ], 0.032 * S, 0.024 * S, IRON.base, 86)
  rivets(ctx, [-0.5 * S, -0.14 * S], [-0.28 * S, -0.14 * S], 3, 0.017 * S, 87)
}

/** Onager: one arm, one skein, one job. */
const drawCatapult = (
  ctx: CanvasRenderingContext2D, S: number, m: SiegeParts,
  spin: number, aiming: boolean, t: number
): void => {
  // The arm's cycle, in the order the crew actually work it: a long slow winch
  // down against the skein, a beat held loaded, then a snap up into the buffer.
  // The old version ran the sweep backwards and spent three quarters of its
  // time mid-throw, which read as an arm waving rather than a shot being taken.
  const cycle = (t / 1900) % 1
  const COCKED = 0.4
  const STOP = -0.62
  const arm = aiming
    ? (cycle < 0.72
      ? STOP + (COCKED - STOP) * (cycle / 0.72)
      : cycle < 0.8
        ? COCKED
        : COCKED - (COCKED - STOP) * ((cycle - 0.8) / 0.2))
    // Travelling pose. It used to rest at +0.3, which tucks the bowl and its
    // stone down INSIDE the frame — so at play scale the only prominent thing
    // left was the buffer, which sits forward and tall, and the machine read as
    // leaning away from the tower rather than aimed at it. Carrying the arm a
    // little high puts the loaded stone out front where it says which way this
    // thing throws.
    : -0.2

  cartWheel(ctx, S, -0.34 * S, GROUND * S - 0.14 * S, 0.14 * S, spin, m.woodBack, 100)
  cartWheel(ctx, S, 0.32 * S, GROUND * S - 0.14 * S, 0.14 * S, spin, m.woodBack, 101)

  // ── Frame ──
  //
  // A box, not a lattice. An onager's whole job is to survive its own recoil,
  // so it is built as two heavy side sills with raking knees between them and
  // a crossbeam across the top — and the previous version's thin diagonals
  // read as scaffolding rather than as a machine under tension.
  timber(ctx, S, [-0.56 * S, 0.34 * S], [0.52 * S, 0.34 * S], 0.13 * S, m.wood, 102, 3)
  timber(ctx, S, [-0.36 * S, 0.3 * S], [-0.18 * S, -0.12 * S], 0.095 * S, m.woodBack, 103, 2)
  timber(ctx, S, [0.4 * S, 0.3 * S], [0.16 * S, -0.24 * S], 0.095 * S, m.wood, 104, 2)
  // Collar tie between the knees — the joint that stops the frame splaying.
  timber(ctx, S, [-0.2 * S, -0.06 * S], [0.2 * S, -0.16 * S], 0.075 * S, m.woodBack, 105, 2)

  // ── The skein ──
  //
  // Low and at the BACK, which is where an onager's torsion bundle actually
  // sits: the arm is sprung out of it and swings up and over. Drawn before the
  // arm so the arm reads as emerging from it.
  skein(ctx, S, -0.2 * S, 0.1 * S, 0.16 * S, m.accent, 112)

  // ── Throwing arm ──
  ctx.save()
  ctx.translate(-0.2 * S, 0.1 * S)
  ctx.rotate(arm)
  timber(ctx, S, [0, 0], [0.74 * S, 0], 0.085 * S, m.wood, 106, 3)
  // Iron reinforcing bands where the arm takes the most strain.
  for (const k of [0.22, 0.46]) {
    paint(ctx, S, slab([
      [(k - 0.02) * S, -0.055 * S], [(k + 0.02) * S, -0.055 * S],
      [(k + 0.02) * S, 0.055 * S], [(k - 0.02) * S, 0.055 * S]
    ], 0.005 * S, 107), IRON, 107, { line: LINE.hair, amp: 0.04 })
  }
  // Bowl and the stone sitting in it.
  paint(ctx, S, slab([
    [0.6 * S, -0.05 * S], [0.84 * S, -0.05 * S],
    [0.79 * S, 0.13 * S], [0.65 * S, 0.13 * S]
  ], 0.012 * S, 108), m.woodBack, 109, { line: LINE.fine, amp: 0.08 })
  paint(ctx, S, rough([
    [0.66 * S, -0.14 * S], [0.78 * S, -0.12 * S],
    [0.8 * S, -0.02 * S], [0.65 * S, -0.03 * S]
  ], 0.014 * S, 110), tones('#8a867e', 1.15), 111, { line: LINE.fine, amp: 0.16 })
  ctx.restore()

  // ── Buffer ──
  //
  // The padded crossbeam the arm slams into. It is what stops the arm and it
  // is what converts the stop into a throw, so it is drawn heavy and lashed.
  timber(ctx, S, [0.16 * S, -0.3 * S], [0.44 * S, -0.24 * S], 0.09 * S, m.woodBack, 114, 2)
  paint(ctx, S, rough([
    [0.14 * S, -0.4 * S], [0.42 * S, -0.33 * S],
    [0.45 * S, -0.21 * S], [0.16 * S, -0.27 * S]
  ], 0.016 * S, 116), tones('#6d5a45', 1.0), 117, { line: LINE.fine, amp: 0.18 })
  for (const k of [0.24, 0.36]) {
    rope(ctx, [[k * S, -0.42 * S], [(k + 0.02) * S, -0.2 * S]], 0.016 * S, 118)
  }

  // ── Windlass and ratchet at the tail ──
  //
  // How the arm is winched back down against the skein between shots. A
  // machine with no visible way to be reloaded reads as a prop.
  const crank = aiming ? -t / 320 : 0
  paint(ctx, S, slab([
    [-0.54 * S, 0.06 * S], [-0.34 * S, 0.06 * S],
    [-0.34 * S, 0.24 * S], [-0.54 * S, 0.24 * S]
  ], 0.009 * S, 120), m.woodBack, 121, { line: LINE.fine, amp: 0.05 })
  stroke(ctx, [
    [-0.44 * S, 0.15 * S],
    [-0.44 * S + Math.cos(crank) * 0.13 * S, 0.15 * S + Math.sin(crank) * 0.13 * S]
  ], 0.03 * S, 0.022 * S, IRON.base, 122)
  rope(ctx, [[-0.42 * S, 0.1 * S], [-0.28 * S, 0.04 * S], [-0.2 * S, 0.02 * S]], 0.016 * S, 123)

  // ── Ammunition ──
  //
  // A few stones stacked on the sill. Cheap, and it is the detail that makes
  // the engine read as CREWED — something a person loads, not a stone dispenser.
  for (const [sx, sy, sr] of [[-0.02, 0.24, 0.06], [0.1, 0.25, 0.05], [0.04, 0.15, 0.052]] as const) {
    paint(ctx, S, rough(
      blobStone(sx * S, sy * S, sr * S), 0.01 * S, 124 + sx * 100
    ), tones('#8a867e', 1.15), 125, { line: LINE.fine, amp: 0.16 })
  }
}

/** Roofed ram shed: hide over a pent roof, log slung on ropes. */
const drawRam = (
  ctx: CanvasRenderingContext2D, S: number, m: SiegeParts,
  spin: number, striking: boolean, t: number
): void => {
  const swing = striking ? Math.sin(t / 220) * 0.15 * S : 0

  cartWheel(ctx, S, -0.34 * S, GROUND * S - 0.13 * S, 0.13 * S, spin, m.woodBack, 130)
  cartWheel(ctx, S, 0.3 * S, GROUND * S - 0.13 * S, 0.13 * S, spin, m.woodBack, 131)
  timber(ctx, S, [-0.54 * S, 0.32 * S], [0.54 * S, 0.32 * S], 0.1 * S, m.wood, 132, 3)

  // Corner posts, both BEHIND the log so nothing occludes it.
  timber(ctx, S, [-0.48 * S, 0.3 * S], [-0.46 * S, -0.26 * S], 0.06 * S, m.woodBack, 133, 2)
  timber(ctx, S, [0.34 * S, 0.3 * S], [0.32 * S, -0.26 * S], 0.06 * S, m.woodBack, 134, 2)

  // ── The log ──
  //
  // Slung LOW and running well past the shed on the striking side. The thing
  // that does the damage has to be the thing you see: tucked up inside the
  // frame it read as a crossbar and the unit lost its name.
  rope(ctx, [[-0.22 * S, -0.24 * S], [-0.22 * S + swing, 0.06 * S]], 0.022 * S, 136)
  rope(ctx, [[0.16 * S, -0.24 * S], [0.16 * S + swing, 0.06 * S]], 0.022 * S, 137)
  timber(ctx, S, [-0.42 * S + swing, 0.14 * S], [0.6 * S + swing, 0.12 * S], 0.18 * S, m.wood, 138, 4)
  // Iron bands where the head is lashed on.
  for (const bx of [0.3, 0.44]) {
    paint(ctx, S, slab([
      [(bx - 0.022) * S + swing, 0.03 * S], [(bx + 0.022) * S + swing, 0.03 * S],
      [(bx + 0.022) * S + swing, 0.21 * S], [(bx - 0.022) * S + swing, 0.21 * S]
    ], 0.006 * S, 139), IRON, 140, { line: LINE.hair, amp: 0.04 })
  }

  // A ram's HEAD, because that is what the machine is named after — a horned
  // iron casting rather than a wedge. Cheap, and it makes the unit memorable.
  const hx = 0.6 * S + swing
  const head = slab([
    [hx - 0.06 * S, 0.02 * S], [hx + 0.18 * S, 0.05 * S],
    [hx + 0.21 * S, 0.13 * S], [hx + 0.15 * S, 0.2 * S],
    [hx - 0.06 * S, 0.21 * S]
  ], 0.012 * S, 141)
  paint(ctx, S, head, STEEL, 142, { line: LINE.mid, amp: 0.07 })
  for (const f of [-1, 1]) {
    const hy = 0.115 * S + f * 0.06 * S
    stroke(ctx, [
      [hx + 0.11 * S, hy], [hx + 0.19 * S, hy + f * 0.055 * S], [hx + 0.1 * S, hy + f * 0.09 * S]
    ], 0.032 * S, 0.012 * S, IRON.base, 143 + f)
  }

  // Pent roof, hide-covered, sloping toward the tower. Pulled BACK off the
  // striking end so the head always has clear air in front of it.
  const roof = slab([
    [-0.6 * S, -0.24 * S], [-0.06 * S, -0.56 * S],
    [0.48 * S, -0.24 * S], [0.42 * S, -0.16 * S], [-0.52 * S, -0.16 * S]
  ], 0.014 * S, 144)
  hide(ctx, S, roof, 145)
  // Ridge pole along the crown.
  timber(ctx, S, [-0.08 * S, -0.56 * S], [-0.04 * S, -0.56 * S], 0.05 * S, m.wood, 146, 1)
  stuckArrows(ctx, S, [[-0.32, -0.34, -0.9], [0.16, -0.38, -0.5]])
}

/** The armoured ram: cold grey, riveted, and visibly arrow-proof. */
const drawIronRam = (
  ctx: CanvasRenderingContext2D, S: number, m: SiegeParts,
  spin: number, striking: boolean, t: number
): void => {
  const hit = striking ? Math.sin(t / 200) * 0.14 * S : 0
  const PLATE = tones(m.wood.base, 1.3)

  cartWheel(ctx, S, -0.34 * S, GROUND * S - 0.13 * S, 0.13 * S, spin, IRON, 160)
  cartWheel(ctx, S, 0.32 * S, GROUND * S - 0.13 * S, 0.13 * S, spin, IRON, 161)
  timber(ctx, S, [-0.56 * S, 0.32 * S], [0.56 * S, 0.32 * S], 0.1 * S, IRON, 162, 2)

  // The log runs well past the casemate, so the part that does the damage is
  // visible rather than tucked away inside the armour.
  timber(ctx, S, [-0.1 * S + hit, 0.1 * S], [0.62 * S + hit, 0.1 * S], 0.15 * S, IRON, 164, 2)
  const hx = 0.62 * S + hit
  const head = slab([
    [hx, -0.02 * S], [hx + 0.26 * S, 0.02 * S],
    [hx + 0.26 * S, 0.18 * S], [hx, 0.22 * S]
  ], 0.012 * S, 165)
  paint(ctx, S, head, STEEL, 166, { line: LINE.major, amp: 0.05 })
  rivets(ctx, [hx + 0.04 * S, 0.02 * S], [hx + 0.04 * S, 0.18 * S], 3, 0.02 * S, 167)

  // Plated casemate: walls all the way to the chassis, shallow sloped lid.
  const shell = slab([
    [-0.56 * S, 0.28 * S], [-0.56 * S, -0.22 * S],
    [-0.34 * S, -0.5 * S], [0.34 * S, -0.5 * S],
    [0.56 * S, -0.22 * S], [0.56 * S, 0.28 * S]
  ], 0.012 * S, 168)
  paint(ctx, S, shell, PLATE, 169, { line: LINE.major, amp: 0.05 })

  ctx.save()
  ctx.beginPath(); trace(ctx, shell); ctx.clip()
  // Vertical plate seams.
  for (const px of [-0.28, 0, 0.28]) {
    stroke(ctx, [[px * S, 0.3 * S], [px * S, -0.5 * S]],
      0.022 * S, 0.018 * S, PLATE.deep!, 170)
  }
  // Riveted band along the eaves.
  rivets(ctx, [-0.46 * S, -0.19 * S], [0.46 * S, -0.19 * S], 5, 0.019 * S, 171)
  // A vision slit — what makes it read as crewed armour, not a crate on wheels.
  fillShape(ctx, [
    [0.16 * S, -0.42 * S], [0.46 * S, -0.42 * S],
    [0.46 * S, -0.35 * S], [0.16 * S, -0.35 * S]
  ], '#0a0d12')
  ctx.restore()

  stuckArrows(ctx, S, [[-0.4, -0.1, -0.8], [-0.1, -0.46, -1.4], [0.5, 0.02, -0.35]])
}

/** Rolling tower: the only engine that puts enemies ON the wall. */
const drawSiegeTower = (
  ctx: CanvasRenderingContext2D, S: number, m: SiegeParts,
  spin: number, docked: boolean, t: number
): void => {
  cartWheel(ctx, S, -0.3 * S, GROUND * S - 0.12 * S, 0.12 * S, spin, m.woodBack, 190)
  cartWheel(ctx, S, 0.28 * S, GROUND * S - 0.12 * S, 0.12 * S, spin, m.woodBack, 191)

  const body = slab([
    [-0.4 * S, 0.42 * S], [-0.36 * S, -0.95 * S],
    [0.36 * S, -0.95 * S], [0.4 * S, 0.42 * S]
  ], 0.014 * S, 192)
  paint(ctx, S, body, m.wood, 193, { line: LINE.major, amp: 0.06 })

  ctx.save()
  ctx.beginPath(); trace(ctx, body); ctx.clip()
  // Horizontal planking, uneven — a tower is built fast, out of what is there.
  for (let i = 0; i < 7; i++) {
    const yy = (-0.9 + i * 0.2) * S + noise2(i, 194, 194) * 0.02 * S
    stroke(ctx, [[-0.42 * S, yy], [0.42 * S, yy + 0.01 * S]],
      0.018 * S, 0.014 * S, m.wood.deep!, 195 + i)
  }
  // Cross-bracing.
  stroke(ctx, [[-0.34 * S, 0.38 * S], [0.34 * S, -0.3 * S]], 0.03 * S, 0.03 * S, m.wood.shade, 202)
  stroke(ctx, [[0.34 * S, 0.38 * S], [-0.34 * S, -0.3 * S]], 0.03 * S, 0.03 * S, m.wood.shade, 203)
  // Hide panel on the exposed face, against fire arrows.
  ctx.restore()
  hide(ctx, S, slab([
    [0.16 * S, -0.86 * S], [0.38 * S, -0.86 * S],
    [0.38 * S, -0.1 * S], [0.16 * S, -0.1 * S]
  ], 0.012 * S, 204), 205)

  // ── Drop ramp ──
  //
  // Hinged at the FRONT of the fighting top and always falling forward, so the
  // side it reaches from is the side the wall is on. It is the one part of this
  // machine that states which way it is going, and it has to be unmistakable
  // even mirrored: raised it leans forward-up over the wall, dropped it lies
  // flat across it.
  ctx.save()
  ctx.translate(0.34 * S, -0.9 * S)
  ctx.rotate(-1.0 + (docked ? 1.0 : 0))
  timber(ctx, S, [0, 0], [0.66 * S, 0], 0.09 * S, m.woodBack, 206, 3)
  // Cleats along it — the rungs the crew cross on, and the detail that keeps
  // the ramp from reading as just another beam.
  for (const k of [0.24, 0.44, 0.62]) {
    stroke(ctx, [[k * S, -0.05 * S], [k * S, 0.05 * S]],
      0.022 * S, 0.022 * S, m.wood.deep!, 212 + k * 10)
  }
  ctx.restore()

  // Banner, waving on its own clock. Behind the crew so it never hides them.
  const wave = Math.sin(t / 260) * 0.05 * S
  stroke(ctx, [[-0.2 * S, -1.1 * S], [-0.2 * S, -1.58 * S]], 0.022 * S, 0.018 * S, m.wood.shade, 209)
  paint(ctx, S, slab([
    [-0.19 * S, -1.54 * S], [0.06 * S + wave, -1.48 * S],
    [0.0 * S, -1.36 * S], [0.06 * S + wave, -1.24 * S],
    [-0.19 * S, -1.18 * S]
  ], 0.012 * S, 210), tones(m.accent, 1.1), 211, { line: LINE.fine, amp: 0.1 })

  // ── The crew ──
  //
  // Archers, drawn BEFORE the crenellations so the merlons cover them to the
  // waist and they read as standing inside the top rather than on it. They are
  // why height is not safety: the simulation lets this engine's crew strike
  // three rows up the wall, and until they were drawn that rule arrived with
  // nothing on screen to explain it.
  crewArcher(ctx, S, -0.02 * S, -1.02 * S, docked, t, 0)
  crewArcher(ctx, S, 0.26 * S, -1.04 * S, docked, t, 1.9)

  // Crenellated fighting top.
  for (const mx of [-0.38, -0.14, 0.1, 0.28]) {
    paint(ctx, S, slab([
      [mx * S, -1.1 * S], [(mx + 0.14) * S, -1.1 * S],
      [(mx + 0.14) * S, -0.92 * S], [mx * S, -0.92 * S]
    ], 0.01 * S, 207), m.woodBack, 208, { line: LINE.fine, amp: 0.05 })
  }
}

/** Counterweight machine: the biggest silhouette on the field. */
const drawTrebuchet = (
  ctx: CanvasRenderingContext2D, S: number, m: SiegeParts,
  aiming: boolean, t: number
): void => {
  const cycle = (t / 2600) % 1
  const arm = aiming
    ? (cycle < 0.8 ? 0.6 - cycle * 0.9 : 0.6 - 0.72 + (cycle - 0.8) * 5.4)
    : 0.4

  // Ground sill and the two A-frame legs.
  timber(ctx, S, [-0.5 * S, 0.5 * S], [0.5 * S, 0.5 * S], 0.1 * S, m.wood, 230, 3)
  timber(ctx, S, [-0.44 * S, 0.48 * S], [-0.03 * S, -0.5 * S], 0.085 * S, m.woodBack, 231, 3)
  timber(ctx, S, [0.44 * S, 0.48 * S], [0.03 * S, -0.5 * S], 0.085 * S, m.wood, 232, 3)
  // Collar tie across the legs — the joint that stops the frame splaying.
  timber(ctx, S, [-0.24 * S, 0.0 * S], [0.24 * S, 0.0 * S], 0.06 * S, m.woodBack, 233, 2)

  // Throwing beam.
  ctx.save()
  ctx.translate(0, -0.5 * S)
  ctx.rotate(arm)
  timber(ctx, S, [-0.55 * S, 0], [1.05 * S, 0], 0.085 * S, m.wood, 234, 4)
  // Counterweight: a banded crate, hanging from its own pivot so it stays
  // upright as the arm swings — which is what a real one does.
  ctx.save()
  ctx.translate(-0.52 * S, 0.02 * S)
  ctx.rotate(-arm)
  const box = slab([
    [-0.14 * S, 0], [0.14 * S, 0], [0.13 * S, 0.3 * S], [-0.13 * S, 0.3 * S]
  ], 0.012 * S, 235)
  paint(ctx, S, box, m.woodBack, 236, { line: LINE.mid, amp: 0.05 })
  rivets(ctx, [-0.12 * S, 0.08 * S], [0.12 * S, 0.08 * S], 3, 0.017 * S, 237)
  rivets(ctx, [-0.12 * S, 0.22 * S], [0.12 * S, 0.22 * S], 3, 0.017 * S, 238)
  ctx.restore()
  // Sling trailing off the long end, with its stone.
  rope(ctx, [[1.0 * S, 0], [1.12 * S, 0.2 * S], [0.94 * S, 0.32 * S]], 0.018 * S, 239)
  paint(ctx, S, slab([
    [0.86 * S, 0.26 * S], [0.99 * S, 0.28 * S],
    [1.0 * S, 0.4 * S], [0.87 * S, 0.38 * S]
  ], 0.014 * S, 240), tones('#8a867e', 1.15), 241, { line: LINE.fine, amp: 0.14 })
  ctx.restore()

  // Iron pivot pin.
  paint(ctx, S, slab([
    [-0.07 * S, -0.57 * S], [0.07 * S, -0.57 * S],
    [0.07 * S, -0.43 * S], [-0.07 * S, -0.43 * S]
  ], 0.008 * S, 242), IRON, 243, { line: LINE.fine, amp: 0.05 })
}

/**
 * Draw one siege engine.
 *
 * `rolling` drives the wheels; `engaged` is "has a target" — the flag that
 * switches every engine from travelling to working.
 */
export const drawSiegeMachine = (
  ctx: CanvasRenderingContext2D, id: string, S: number, p: Palette,
  opts: { spin: number; engaged: boolean; t: number }
): void => {
  const m = siegeParts(p)
  groundShadow(ctx, S, 0.62, GROUND + 0.03, 0.32)
  switch (id) {
    case 'ram': drawRam(ctx, S, m, opts.spin, opts.engaged, opts.t); break
    case 'ironRam': drawIronRam(ctx, S, m, opts.spin, opts.engaged, opts.t); break
    case 'ballista': drawBallista(ctx, S, m, opts.spin, opts.engaged, opts.t); break
    case 'catapult': drawCatapult(ctx, S, m, opts.spin, opts.engaged, opts.t); break
    case 'siegeTower': drawSiegeTower(ctx, S, m, opts.spin, opts.engaged, opts.t); break
    case 'trebuchet': {
      // Authored with the counterweight on the +x side, which is backwards.
      //
      // A counterweight trebuchet loads by winching the LONG arm down on the
      // side AWAY from the target — that is what raises the counterweight over
      // the target side — and fires by letting the weight fall, sweeping the
      // sling up and over the frame and releasing forward. Drawn as authored it
      // did the opposite: weight raised at the back, sling hanging on the tower
      // side, so its whole swing would have thrown the stone over its own tail.
      //
      // Mirrored rather than re-authored because the machine is an A-frame:
      // flipping it swaps exactly the two things that are on the wrong sides
      // and leaves everything else where it was.
      ctx.save()
      ctx.scale(-1, 1)
      drawTrebuchet(ctx, S, m, opts.engaged, opts.t)
      ctx.restore()
      break
    }
  }
}
