import {
  blob, rough, shrink, trace, fillShape, ink, stroke, hatch,
  occlude, noise2, tones, type Pt, type CelTones
} from '@/game/inkArt'
import {
  INK, LINE, paint, eye, horn, pivot, gait
} from '@/game/monsterKit'

/**
 * ─── Sea designs ────────────────────────────────────────────────────────────
 *
 * The swimming half of the cast, drawn from the same vocabulary as the walkers
 * in `monsters.ts` and obeying the same three rules: silhouette first,
 * asymmetry everywhere, and nothing re-decides the shared light, line weights
 * or tonal steps.
 *
 * Two things are different about a swimmer, and both are structural rather than
 * stylistic:
 *
 *   * **It is authored side-on and centred**, not standing on the bottom of the
 *     frame. There are no feet to line up, so these designs declare
 *     `anchor: 'centre'` and the battlefield hangs them off the middle of the
 *     body instead of off a floor they never touch.
 *   * **Locomotion is a travelling wave, not a gait.** A walk moves two limbs
 *     against a still torso; a swim moves the whole body, with the amplitude
 *     growing from the head backwards, so the head barely stirs and the tail
 *     covers real distance. That is the difference between a fish swimming and
 *     a fish being dragged sideways through the water.
 *
 * The no-boiling rule matters more here than anywhere else in the cast. A body
 * that bends every frame is exactly the case where a `t` leaking into a seed or
 * a radius would show: the outline would crawl with static while it swam. So
 * the wobble on every contour below is indexed by SEGMENT, never by time, and
 * `t` only ever reaches the spine's shape and a joint angle.
 *
 * FRAME BUDGET: everything lives inside x, y ∈ [−1, 1]. A long animal wants to
 * be drawn long, and the first pass of all four ran off both ends of the card —
 * a tail that leaves the frame is not a longer tail, it is a missing one. Where
 * a body needed length it was bought by shortening the trunk, never by growing
 * past the edge.
 */

// ─── Swimming bodies ────────────────────────────────────────────────────────

/** A sampled centre-line with the outward normal at each sample. */
interface Spine {
  p: Pt[]
  /** Unit normal, 90° counter-clockwise from the direction of travel. */
  n: Pt[]
}

/**
 * Sample a centre-line.
 *
 * `u` runs 0 at the SNOUT to 1 at the tail tip for every design here, so a fin
 * placed at `u = 0.3` sits in the same relative place on an eel and on a
 * dragon, and the reading code doesn't have to know which way a given body
 * happens to be drawn.
 */
const spineOf = (f: (u: number) => Pt, n = 26): Spine => {
  const p: Pt[] = []
  for (let i = 0; i < n; i++) p.push(f(i / (n - 1)))
  const nrm: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)]!
    const b = p[Math.min(n - 1, i + 1)]!
    const tx = b[0] - a[0]
    const ty = b[1] - a[1]
    const l = Math.hypot(tx, ty) || 1
    nrm.push([-ty / l, tx / l])
  }
  return { p, n: nrm }
}

/**
 * The travelling wave that drives every swimmer here.
 *
 * Amplitude grows with `u`, which is the whole trick: a sine applied evenly
 * along a body makes it slither sideways like a rope being shaken, while a
 * sine that starts at nothing under the head and opens up toward the tail
 * makes the same body look like it is PUSHING against water.
 */
const swimWave = (u: number, phase: number, amp: number, waves = 1.15): number =>
  Math.sin(u * Math.PI * 2 * waves - phase) * amp * (0.12 + u * 0.88)

/** Close a body outline around a spine, `r(u)` wide on each side. */
const ribbon = (sp: Spine, r: (u: number) => number, seed: number, wob = 0.1): Pt[] => {
  const n = sp.p.length
  const top: Pt[] = []
  const bot: Pt[] = []
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const [nx, ny] = sp.n[i]!
    // Indexed by segment, so the outline bends with the swim and never boils.
    const w = r(u) * (1 + (noise2(i * 1.7, seed, seed) - 0.5) * wob)
    top.push([sp.p[i]![0] + nx * w, sp.p[i]![1] + ny * w])
    bot.unshift([sp.p[i]![0] - nx * w, sp.p[i]![1] - ny * w])
  }
  return top.concat(bot)
}

/**
 * A membrane running along one side of a body — dorsal ridge, belly fin, crest.
 *
 * Built between two offsets off the SPINE rather than authored as a polygon,
 * so it stays welded to the back however hard the body is flexing. A crest laid
 * out along a straight line detaches from the animal on the first bend, and
 * detaches differently on every frame.
 */
const crest = (
  sp: Spine, from: number, to: number,
  inner: (u: number) => number, outer: (u: number) => number, side: 1 | -1
): Pt[] => {
  const n = sp.p.length
  const i0 = Math.round(from * (n - 1))
  const i1 = Math.round(to * (n - 1))
  const a: Pt[] = []
  const b: Pt[] = []
  for (let i = i0; i <= i1; i++) {
    const u = i / (n - 1)
    const [nx, ny] = sp.n[i]!
    const ri = inner(u) * side
    const ro = outer(u) * side
    a.push([sp.p[i]![0] + nx * ri, sp.p[i]![1] + ny * ri])
    b.unshift([sp.p[i]![0] + nx * ro, sp.p[i]![1] + ny * ro])
  }
  return a.concat(b)
}

/**
 * A spiked ridge: a smooth root and a SAWTOOTH outer edge.
 *
 * A crest whose outer edge is a smooth arc paints as a slab of colour laid on
 * the back — which is exactly how the dragon's first pass read. The notches are
 * the whole difference between a fin with rays in it and a rubber stripe.
 */
const sawCrest = (
  sp: Spine, from: number, to: number,
  base: (u: number) => number, height: (u: number) => number, side: 1 | -1, teeth: number
): Pt[] => {
  const n = sp.p.length
  const i0 = Math.round(from * (n - 1))
  const i1 = Math.round(to * (n - 1))
  const root: Pt[] = []
  const edge: Pt[] = []
  for (let i = i0; i <= i1; i++) {
    const u = i / (n - 1)
    const k = (i - i0) / Math.max(1, i1 - i0)
    const [nx, ny] = sp.n[i]!
    const b = base(u) * side
    root.push([sp.p[i]![0] + nx * b, sp.p[i]![1] + ny * b])
    // Triangle wave: each tooth climbs to a point and drops back to the root.
    const saw = Math.abs((((k * teeth) % 1) + 1) % 1 * 2 - 1)
    const h = (base(u) + height(u) * (0.25 + 0.75 * saw)) * side
    edge.unshift([sp.p[i]![0] + nx * h, sp.p[i]![1] + ny * h])
  }
  return root.concat(edge)
}

/**
 * A fin: a painted membrane with ray struts fanning out of its root.
 *
 * The rays are what separate a fin from a flap of skin. They are clipped to the
 * membrane so they can never overshoot the edge — a stray ray poking past the
 * outline reads as a crack in the drawing.
 */
const fin = (
  ctx: CanvasRenderingContext2D, S: number, pts: Pt[], t: CelTones, seed: number,
  o: { root?: Pt; rays?: number; line?: number; rayColor?: string } = {}
): void => {
  paint(ctx, S, pts, t, seed, {
    line: o.line ?? LINE.fine, breakUp: 0.4, deep: false, amp: 0.09
  })
  const rays = o.rays ?? 0
  if (rays <= 0 || !o.root) return
  ctx.save()
  ctx.beginPath(); trace(ctx, pts); ctx.clip()
  for (let i = 0; i < rays; i++) {
    const q = pts[Math.round(((i + 1) / (rays + 1)) * (pts.length - 1))]!
    stroke(ctx, [o.root, q], 0.022 * S, 0.005 * S, o.rayColor ?? 'rgba(28,20,24,0.32)', seed + 40 + i)
  }
  ctx.restore()
}

/** Gill slits: curved rakes, never evenly spaced. */
const gills = (
  ctx: CanvasRenderingContext2D, S: number, x: number, y: number,
  h: number, count: number, color: string, seed: number
): void => {
  for (let i = 0; i < count; i++) {
    const gx = x - i * 0.055 * S - noise2(i, seed, seed) * 0.012 * S
    const k = 1 - i * 0.13
    stroke(ctx, [
      [gx + 0.02 * S, y - h * k],
      [gx - 0.015 * S, y],
      [gx + 0.025 * S, y + h * k * 0.92]
    ], 0.018 * S, 0.01 * S, color, seed + i)
  }
}

/** A cone of teeth along a jaw line, pointing `dir` (+1 down, −1 up). */
const teeth = (
  ctx: CanvasRenderingContext2D, S: number, from: Pt, to: Pt,
  count: number, len: number, dir: 1 | -1, color = '#f6f0dc'
): void => {
  ctx.fillStyle = color
  for (let i = 0; i < count; i++) {
    const k = (i + 0.5) / count
    const x = from[0] + (to[0] - from[0]) * k
    const y = from[1] + (to[1] - from[1]) * k
    // Tapering back along the jaw: the front teeth are the long ones.
    const h = len * (1 - k * 0.45) * (0.8 + noise2(i * 2.3, 71, 71) * 0.4)
    const w = len * 0.34
    ctx.beginPath()
    ctx.moveTo(x - w, y)
    ctx.lineTo(x + w * 0.3, y + dir * h)
    ctx.lineTo(x + w, y)
    ctx.closePath()
    ctx.fill()
  }
}

// ─── 1 · Sliverfin ──────────────────────────────────────────────────────────
//
// The eel. A ribbon with a mouth on the front — the thinnest silhouette in the
// whole cast, which is the point: everything else that swims is a mass, and
// this one is a line that whips.

export const drawSliverfin = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  const g = gait(t, 700)
  const phase = g * Math.PI * 2
  // A long body carries close to a wave and a half. Fewer reads as a fish;
  // more reads as a worm.
  const sp = spineOf((u) => [
    (0.6 - 1.46 * u) * S,
    swimWave(u, phase, 0.15, 1.3) * S + 0.04 * S
  ], 30)

  const HIDE = tones('#3f7d63', 1.05)
  const BELLY = tones('#e2e7c2', 0.8)
  const MEMB = tones('#7ec9a4', 0.85)

  /** Blunt through the shoulders, then a long taper to a whipping point. */
  const R = (u: number): number => {
    const head = Math.min(1, 0.5 + u * 4.2)
    const taper = Math.pow(Math.max(0, 1 - Math.max(0, u - 0.42) / 0.58), 0.85)
    return S * (0.012 + 0.115 * head * taper)
  }

  // ── Fins first, so the body's outline closes over their roots ──
  fin(ctx, S, crest(sp, 0.16, 0.99,
    (u) => R(u) * 0.85,
    (u) => R(u) * 0.85 + S * (0.075 * Math.sin(Math.min(1, (u - 0.16) / 0.84) * Math.PI) + 0.014),
    1), MEMB, 300, { line: LINE.hair })
  fin(ctx, S, crest(sp, 0.44, 0.98,
    (u) => R(u) * 0.85,
    (u) => R(u) * 0.85 + S * 0.05 * Math.sin(Math.min(1, (u - 0.44) / 0.56) * Math.PI),
    -1), MEMB, 302, { line: LINE.hair })

  // ── Body ──
  const body = ribbon(sp, R, 310, 0.07)
  paint(ctx, S, body, HIDE, 311, { line: LINE.major, breakUp: 0.24, amp: 0.09 })

  ctx.save()
  ctx.beginPath(); trace(ctx, body); ctx.clip()
  // Pale underside, following the spine rather than sitting as a flat band —
  // on a body this flexible a straight belly stripe slides off the animal.
  fillShape(ctx, crest(sp, 0.04, 0.88, () => 0, (u) => R(u) * 0.6, -1), BELLY.base)
  stroke(ctx, sp.p.slice(3, 24).map(([x, y]) => [x, y + 0.012 * S] as Pt),
    0.014 * S, 0.006 * S, 'rgba(20,40,32,0.45)', 314)
  for (let i = 0; i < 3; i++) {
    const idx = 5 + i * 6
    const p = sp.p[idx]!
    hatch(ctx, blob(p[0], p[1] - R(idx / 29) * 0.35, (0.09 - i * 0.014) * S, 0.045 * S, 320 + i, 0.2),
      -0.5, 0.026 * S, 0.007 * S, 'rgba(18,44,34,0.3)', 322 + i)
  }
  ctx.restore()

  // ── Head ──
  // Drawn as its own wedge over the front of the ribbon. The first pass let the
  // body's own outline serve as the head, and a tube with teeth stuck on the
  // end reads as a piece of rope, not as a face.
  const hy = sp.p[0]![1]
  const hx = 0.66 * S
  const skull = rough([
    [hx + 0.3 * S, hy + 0.03 * S],
    [hx + 0.16 * S, hy - 0.06 * S],
    [hx - 0.1 * S, hy - 0.11 * S],
    [hx - 0.26 * S, hy - 0.02 * S],
    [hx - 0.24 * S, hy + 0.1 * S],
    [hx + 0.1 * S, hy + 0.1 * S]
  ], 0.01 * S, 330)
  paint(ctx, S, skull, HIDE, 331, { line: LINE.mid, breakUp: 0.25, amp: 0.07 })
  occlude(ctx, skull, 0.58, 0.82, 0.035 * S, 'rgba(28,20,24,0.55)', 332)

  // The mouth: a dark cavity first, then the jaw over it, so the teeth have a
  // value to grow from instead of floating on the hide.
  const gape = 0.09 + 0.14 * Math.max(0, Math.sin(phase * 2 - 1))
  const mouth = rough([
    [hx + 0.31 * S, hy + 0.035 * S],
    [hx - 0.04 * S, hy + 0.02 * S],
    [hx - 0.02 * S, hy + 0.06 * S + gape * 0.5 * S],
    [hx + 0.29 * S, hy + 0.06 * S + gape * 0.34 * S]
  ], 0.006 * S, 334)
  fillShape(ctx, mouth, '#2a1220')
  ctx.save()
  ctx.beginPath(); trace(ctx, mouth); ctx.clip()
  teeth(ctx, S, [hx + 0.28 * S, hy + 0.03 * S], [hx - 0.02 * S, hy + 0.02 * S], 5, 0.055 * S, 1)
  teeth(ctx, S, [hx + 0.27 * S, hy + 0.06 * S + gape * 0.34 * S],
    [hx - 0.02 * S, hy + 0.06 * S + gape * 0.5 * S], 4, 0.048 * S, -1)
  ctx.restore()
  ink(ctx, mouth, { width: LINE.hair * S, color: INK, seed: 335, breakUp: 0.4 })

  // Lower jaw, hinged at the back of the skull — the piece that makes the head
  // a head and not a slot cut in a tube.
  const jaw = pivot(rough([
    [-0.2 * S, 0], [0.26 * S, 0.005 * S], [0.24 * S, 0.06 * S], [-0.2 * S, 0.07 * S]
  ], 0.007 * S, 336), hx + 0.04 * S, hy + 0.055 * S, gape)
  paint(ctx, S, jaw, HIDE, 337, { line: LINE.fine, deep: false, amp: 0.05 })

  eye(ctx, hx + 0.02 * S, hy - 0.045 * S, 0.058 * S, {
    iris: '#ffcf3f', pupil: 0.34, brow: 0.5, seed: 340
  })
  gills(ctx, S, hx - 0.2 * S, hy + 0.02 * S, 0.05 * S, 3, 'rgba(18,44,34,0.55)', 344)
}

// ─── 2 · Gnashfin ───────────────────────────────────────────────────────────
//
// The shark. A torpedo with a tall dorsal — the one silhouette every player
// already knows, which is why it is worth having: it is read as a threat before
// it is identified as an enemy.

export const drawGnashfin = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  const g = gait(t, 900)
  const phase = g * Math.PI * 2
  // A shark is stiff through the shoulders and flexible at the tail: nearly all
  // of the wave lives in the back third. That stiffness IS the read — it is
  // what makes it look heavy next to the eel.
  const sp = spineOf((u) => [
    (0.68 - 1.3 * u) * S,
    Math.sin(u * Math.PI * 1.05 - phase) * 0.11 * S * Math.pow(u, 1.8) - 0.02 * S
  ], 22)

  const HIDE = tones('#4e6f8b', 1.15)
  const BELLY = tones('#e8eef2', 0.75)
  const FIN = tones('#3f5c74', 1.1)

  /**
   * Deep across the shoulders, and it keeps that depth well back before pulling
   * into a WRIST at the tail. The first pass tapered from the shoulder all the
   * way out, which gave the shark a needle for a back half.
   */
  const R = (u: number): number => {
    const rise = Math.min(1, (u + 0.05) / 0.3)
    const fall = Math.pow(Math.max(0, 1 - Math.max(0, u - 0.3) / 0.75), 1.3)
    return S * (0.04 + 0.2 * rise * fall)
  }

  const tailAt = sp.p[sp.p.length - 1]!
  const tailDir = Math.atan2(tailAt[1] - sp.p[sp.p.length - 3]![1], tailAt[0] - sp.p[sp.p.length - 3]![0])

  // ── Caudal fin ──
  // Asymmetric on purpose: the upper lobe is longer, which is a real shark and
  // also the fastest way to stop a tail reading as a symmetrical bowtie.
  const caudal = pivot(rough([
    [0.02 * S, 0],
    [0.34 * S, -0.46 * S], [0.4 * S, -0.2 * S],
    [0.14 * S, 0], [0.34 * S, 0.12 * S], [0.3 * S, 0.34 * S]
  ], 0.014 * S, 400), tailAt[0], tailAt[1], tailDir)
  fin(ctx, S, caudal, FIN, 401, { root: tailAt, rays: 3, line: LINE.mid })

  // ── Far pectoral, behind the body ──
  const pecSwing = Math.sin(phase - 0.6) * 0.12
  const farPec = pivot(rough([
    [0, 0], [0.3 * S, 0.1 * S], [0.34 * S, 0.18 * S], [0.03 * S, 0.1 * S]
  ], 0.008 * S, 404), 0.1 * S, 0.06 * S, 0.5 + pecSwing)
  fin(ctx, S, farPec, tones('#35506a', 1.1), 405, { line: LINE.fine })

  // ── Dorsal ──
  // Raked back, with a notch at the trailing edge. Placed on the spine so it
  // leans with the body instead of standing bolt upright as the shark turns.
  const dIdx = 6
  const dp = sp.p[dIdx]!
  const dRoot = R(dIdx / 21)
  const dorsal = rough([
    [dp[0] + 0.14 * S, dp[1] - dRoot * 0.8],
    [dp[0] - 0.04 * S, dp[1] - 0.54 * S],
    [dp[0] - 0.16 * S, dp[1] - 0.46 * S],
    [dp[0] - 0.3 * S, dp[1] - dRoot * 0.7]
  ], 0.012 * S, 408)
  fin(ctx, S, dorsal, FIN, 409, { root: [dp[0], dp[1] - dRoot * 0.6], rays: 2, line: LINE.mid })

  // ── Body ──
  const body = ribbon(sp, R, 410, 0.05)
  paint(ctx, S, body, HIDE, 411, { line: LINE.major, breakUp: 0.22, amp: 0.07 })

  ctx.save()
  ctx.beginPath(); trace(ctx, body); ctx.clip()
  // Countershading, cut as a hard edge rather than faded: the boundary between
  // a shark's dark back and white belly is a LINE, and drawing it as a gradient
  // is most of what made the old fish look like a balloon. It stops short of
  // the tail — carried all the way it becomes a stripe.
  fillShape(ctx, crest(sp, 0, 0.82, () => 0, (u) => R(u) * 0.66, -1), BELLY.base)
  fillShape(ctx, crest(sp, 0, 0.62, () => 0, (u) => R(u) * 0.28, -1), BELLY.lit)
  // Scars: two old rake marks over the shoulder. Nothing says "this one has
  // been in fights" faster, and it breaks up a large flat flank.
  stroke(ctx, [[0.2 * S, -0.14 * S], [0.1 * S, -0.05 * S]], 0.014 * S, 0.006 * S, 'rgba(232,238,242,0.5)', 414)
  stroke(ctx, [[0.14 * S, -0.17 * S], [0.03 * S, -0.09 * S]], 0.011 * S, 0.005 * S, 'rgba(232,238,242,0.4)', 415)
  hatch(ctx, blob(-0.3 * S, -0.06 * S, 0.24 * S, 0.1 * S, 416, 0.16),
    -0.45, 0.03 * S, 0.007 * S, 'rgba(16,28,40,0.25)', 417)
  ctx.restore()

  // ── Near pectoral, in front of the body ──
  const nearPec = pivot(rough([
    [0, 0], [0.38 * S, 0.18 * S], [0.42 * S, 0.28 * S], [0.04 * S, 0.13 * S]
  ], 0.01 * S, 420), 0.16 * S, 0.12 * S, 0.42 - pecSwing)
  fin(ctx, S, nearPec, FIN, 421, { root: [0.16 * S, 0.12 * S], rays: 2, line: LINE.mid })

  // On the FLANK, above the countershading line: rakes drawn across the white
  // belly read as scratches in the paint rather than as gills.
  gills(ctx, S, 0.32 * S, -0.07 * S, 0.085 * S, 5, 'rgba(14,26,38,0.5)', 424)

  // ── Snout and jaw ──
  // The mouth is UNDERSLUNG and set back from the tip. A shark whose mouth is
  // on the front of its face is a dolphin.
  const bite = 0.16 + 0.12 * Math.max(0, Math.sin(phase * 2))
  const maw = rough([
    [0.7 * S, 0.03 * S], [0.44 * S, 0.02 * S],
    [0.4 * S, 0.07 * S + bite * 0.3 * S], [0.66 * S, 0.11 * S + bite * 0.2 * S]
  ], 0.008 * S, 428)
  fillShape(ctx, maw, '#2a1018')
  ctx.save()
  ctx.beginPath(); trace(ctx, maw); ctx.clip()
  teeth(ctx, S, [0.68 * S, 0.02 * S], [0.42 * S, 0.02 * S], 7, 0.06 * S, 1)
  teeth(ctx, S, [0.65 * S, 0.1 * S + bite * 0.22 * S], [0.42 * S, 0.07 * S + bite * 0.3 * S], 6, 0.05 * S, -1)
  ctx.restore()
  ink(ctx, maw, { width: LINE.fine * S, color: INK, seed: 429, breakUp: 0.3 })

  // Nostril flick and the ampullae — the speckle across the snout that says the
  // thing hunts by something other than sight.
  stroke(ctx, [[0.6 * S, -0.03 * S], [0.57 * S, -0.005 * S]], 0.016 * S, 0.008 * S, 'rgba(14,26,38,0.6)', 432)
  ctx.fillStyle = 'rgba(14,26,38,0.4)'
  for (let i = 0; i < 7; i++) {
    const k = noise2(i * 2.3, 434, 434)
    ctx.beginPath()
    ctx.arc((0.44 + k * 0.22) * S, (-0.07 + noise2(i * 1.7, 435, 435) * 0.09) * S, 0.008 * S, 0, Math.PI * 2)
    ctx.fill()
  }

  // Flat black eye, no iris: a shark's eye is a hole, and the one white
  // catch-light is what keeps it from reading as a missing pixel.
  eye(ctx, 0.44 * S, -0.11 * S, 0.055 * S, { sclera: '#141a20', pupil: 0.5, seed: 440 })
}

// ─── 3 · Tidewyrm ───────────────────────────────────────────────────────────
//
// The sea dragon. Long, crested and limbed — the only swimmer with hands, and
// the only one whose silhouette curls back on itself.

export const drawTidewyrm = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  const g = gait(t, 1500)
  const phase = g * Math.PI * 2
  // Slow and deep: a big animal moving a lot of water.
  // Short enough that the fluke — which is another third of a unit past the
  // last spine sample — still lands inside the frame.
  const sp = spineOf((u) => [
    (0.5 - 1.08 * u) * S,
    swimWave(u, phase, 0.2, 1.0) * S - 0.04 * S
  ], 28)

  const SCALE = tones('#2f7f74', 1.2)
  const BELLY = tones('#e6d6a4', 0.9)
  const CREST = tones('#c9503a', 1.05)
  const BONE = tones('#efe4c8', 0.95)

  /** A deep chest behind the skull, tapering into a long muscular tail. */
  const R = (u: number): number => {
    const rise = Math.min(1, (u + 0.06) / 0.26)
    const fall = Math.pow(Math.max(0, 1 - Math.max(0, u - 0.26) / 0.8), 1.15)
    return S * (0.022 + 0.165 * rise * fall)
  }

  // ── Dorsal crest ──
  // Sawtoothed, so it reads as a fin with rays rather than a stripe of colour
  // laid along the back.
  const spikes = sawCrest(sp, 0.06, 0.97,
    (u) => R(u) * 0.88,
    (u) => S * (0.115 * Math.sin(Math.min(1, (u - 0.06) / 0.91) * Math.PI) + 0.02),
    1, 6)
  fin(ctx, S, spikes, CREST, 500, { line: LINE.fine })

  // Tail fluke: a broad vertical paddle, the engine of the whole animal.
  const tp = sp.p[sp.p.length - 1]!
  const td = Math.atan2(tp[1] - sp.p[sp.p.length - 4]![1], tp[0] - sp.p[sp.p.length - 4]![0])
  const fluke = pivot(rough([
    [0.04 * S, 0],
    [0.26 * S, -0.3 * S], [0.36 * S, -0.05 * S],
    [0.3 * S, 0.28 * S], [0.09 * S, 0.09 * S]
  ], 0.014 * S, 504), tp[0], tp[1], td)
  fin(ctx, S, fluke, CREST, 505, { root: tp, rays: 4, line: LINE.mid })

  // ── Far foreflipper ──
  const row = Math.sin(phase - 0.9) * 0.24
  const farLimb = pivot(rough([
    [0, -0.04 * S], [0.26 * S, 0.03 * S], [0.3 * S, 0.14 * S], [0.02 * S, 0.09 * S]
  ], 0.008 * S, 508), 0.06 * S, 0.06 * S, 0.62 + row)
  fin(ctx, S, farLimb, tones('#256a61', 1.15), 509, { line: LINE.fine })

  // ── Body ──
  const body = ribbon(sp, R, 510, 0.06)
  paint(ctx, S, body, SCALE, 511, { line: LINE.major, breakUp: 0.24, amp: 0.08 })

  ctx.save()
  ctx.beginPath(); trace(ctx, body); ctx.clip()
  fillShape(ctx, crest(sp, 0, 0.9, () => 0, (u) => R(u) * 0.64, -1), BELLY.base)
  // Belly plates, laid along the spine so they bank with the body.
  for (let i = 2; i < 24; i += 2) {
    const p = sp.p[i]!
    const [nx, ny] = sp.n[i]!
    const w = R(i / 27) * 0.6
    stroke(ctx, [
      [p[0] - nx * w * 0.2, p[1] - ny * w * 0.2],
      [p[0] - nx * w, p[1] - ny * w]
    ], 0.013 * S, 0.008 * S, 'rgba(120,96,40,0.4)', 512 + i)
  }
  // Scale rows on the flank: three arcs, no more. At sprite size a real scale
  // texture turns into noise and costs a hundred paths to do it.
  for (let i = 0; i < 3; i++) {
    const p = sp.p[3 + i * 4]!
    ctx.strokeStyle = 'rgba(16,58,54,0.35)'
    ctx.lineWidth = Math.max(1, 0.012 * S)
    ctx.beginPath()
    ctx.arc(p[0], p[1], 0.13 * S, -1.2, 1.2)
    ctx.stroke()
  }
  ctx.restore()

  // ── Near foreflipper: clawed, because this one can hold on ──
  const limbRoot: Pt = [0.16 * S, 0.09 * S]
  const nearLimb = pivot(rough([
    [0, -0.05 * S], [0.3 * S, 0.05 * S], [0.33 * S, 0.2 * S], [0.02 * S, 0.12 * S]
  ], 0.01 * S, 514), limbRoot[0], limbRoot[1], 0.5 - row)
  fin(ctx, S, nearLimb, tones('#38948a', 1.15), 515, { root: limbRoot, rays: 3, line: LINE.mid })
  for (let i = 0; i < 3; i++) {
    const c = pivot([[0.31 * S, (0.04 + i * 0.06) * S]], limbRoot[0], limbRoot[1], 0.5 - row)[0]!
    const tip = pivot([[0.39 * S, (0.06 + i * 0.06) * S]], limbRoot[0], limbRoot[1], 0.5 - row)[0]!
    stroke(ctx, [c, tip], 0.016 * S, 0.003 * S, BONE.base, 516 + i)
  }

  // ── Head ──
  const hx = 0.6 * S
  const hy = sp.p[0]![1]
  // The snout TAPERS. Carried out at full depth it becomes a bill, which is
  // what the first pass drew — a duck with horns.
  const skull = rough([
    [hx + 0.34 * S, hy + 0.005 * S],
    [hx + 0.2 * S, hy - 0.06 * S],
    [hx + 0.04 * S, hy - 0.11 * S],
    [hx - 0.14 * S, hy - 0.1 * S],
    [hx - 0.22 * S, hy + 0.04 * S],
    [hx - 0.06 * S, hy + 0.13 * S],
    [hx + 0.2 * S, hy + 0.09 * S]
  ], 0.012 * S, 520)

  // Frill behind the jaw — a webbed fan, drawn BEFORE the skull so it sits
  // behind the cheek instead of pasting itself over the face.
  const frill = rough([
    [hx - 0.1 * S, hy - 0.08 * S],
    [hx - 0.3 * S, hy - 0.18 * S],
    [hx - 0.34 * S, hy + 0.06 * S],
    [hx - 0.16 * S, hy + 0.14 * S]
  ], 0.012 * S, 534)
  fin(ctx, S, frill, tones('#a8442f', 1.0), 535, { root: [hx - 0.12 * S, hy + 0.0 * S], rays: 3, line: LINE.fine })

  paint(ctx, S, skull, SCALE, 521, { line: LINE.major, breakUp: 0.24, amp: 0.07 })
  occlude(ctx, skull, 0.62, 0.86, 0.045 * S, 'rgba(28,20,24,0.6)', 522)

  // Horns: swept back, and deliberately mismatched — the near one is longer and
  // set higher, which is the cheapest character a face can have.
  horn(ctx, hx - 0.08 * S, hy - 0.1 * S, 0.3 * S, 0.042 * S, -2.5, 0.5, BONE, 524)
  horn(ctx, hx + 0.0 * S, hy - 0.12 * S, 0.2 * S, 0.032 * S, -2.2, 0.6, BONE, 526)

  // Barbels: whiskers off the chin, trailing a beat behind the head.
  for (const [k, len] of [[0, 0.26], [1, 0.2]] as const) {
    const lag = Math.sin(phase - 0.5 - k * 0.4) * 0.05 * S
    stroke(ctx, [
      [hx + 0.18 * S, hy + 0.11 * S],
      [hx + 0.06 * S, hy + 0.2 * S + lag],
      [hx - 0.06 * S + k * 0.05 * S, hy + (0.1 + len) * S + lag * 1.8]
    ], 0.02 * S, 0.003 * S, SCALE.shade, 528 + k)
  }

  // Jaw, hinged at the back of the skull. The dark of the throat goes down
  // FIRST so the fangs have a value to grow out of — teeth drawn straight onto
  // scale look stuck on, which is exactly how the first pass read.
  const gape = 0.12 + 0.2 * Math.max(0, Math.sin(phase * 1.5 - 0.8))
  const jawPivot: Pt = [hx - 0.04 * S, hy + 0.08 * S]
  const throat = pivot(rough([
    [-0.02 * S, -0.02 * S], [0.3 * S, -0.03 * S], [0.28 * S, 0.06 * S], [-0.02 * S, 0.07 * S]
  ], 0.006 * S, 529), jawPivot[0], jawPivot[1], gape * 0.5)
  fillShape(ctx, throat, '#2a1220')

  const jaw = pivot(rough([
    [-0.14 * S, 0], [0.26 * S, -0.012 * S], [0.22 * S, 0.07 * S], [-0.14 * S, 0.08 * S]
  ], 0.008 * S, 530), jawPivot[0], jawPivot[1], gape)
  paint(ctx, S, jaw, SCALE, 531, { line: LINE.fine, deep: false, amp: 0.06 })
  teeth(ctx, S, [hx + 0.24 * S, hy + 0.055 * S], [hx + 0.02 * S, hy + 0.075 * S], 4, 0.048 * S, 1)
  const jt = pivot([[0.22 * S, -0.005 * S], [0.0 * S, 0.005 * S]], jawPivot[0], jawPivot[1], gape)
  teeth(ctx, S, jt[0]!, jt[1]!, 4, 0.04 * S, -1)

  eye(ctx, hx + 0.1 * S, hy - 0.03 * S, 0.066 * S, {
    iris: '#ffd76a', glow: '#ffbe4a', pupil: 0.3, brow: 0.55, seed: 540
  })
  gills(ctx, S, hx - 0.24 * S, hy + 0.04 * S, 0.07 * S, 3, 'rgba(16,58,54,0.5)', 544)
}

// ─── 4 · Brinemaw ───────────────────────────────────────────────────────────
//
// The kraken. Not a fish at all: a mantle behind, a curtain of arms reaching
// FORWARD, and a beak in the middle of them. The silhouette breaks the family
// on purpose — this is the one that ends a run, and it should not be mistaken
// for anything else in the water.
//
// Arms forward rather than trailing is a deliberate lie about how a squid
// actually swims. Trailing arms gave one smooth wedge that read as a fish head;
// reaching arms read as a thing coming for you, which is what it is.

export const drawBrinemaw = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  const g = gait(t, 1800)
  const phase = g * Math.PI * 2
  // A jet-propelled swimmer surges: the mantle pulses and the arms trail it.
  const pulse = Math.sin(phase)
  const surge = pulse * 0.045 * S

  const FLESH = tones('#4a3570', 1.2)
  const UNDER = tones('#9c6fb8', 0.9)
  const SUCKER = tones('#e8cfa8', 0.85)
  const GLOW = '#9fe8c0'

  /**
   * One arm, reaching forward and curling.
   *
   * `k` picks the arm, `depth` puts it behind the head (a tone down, thinner)
   * or in front of it. Every arm gets its own length, curl and phase — eight
   * identical tentacles is a hair-do, not a monster.
   */
  const arm = (k: number, depth: -1 | 1): void => {
    const lag = phase - k * 0.5
    // Reach is capped so every tip lands inside the frame. An arm that leaves
    // the card is not a longer arm — it is an arm with the end cut off.
    const reach = 0.62 + noise2(k * 1.9, 600, 600) * 0.28
    const rise = (-0.26 + k * 0.15) * S
    const curl = Math.sin(lag) * 0.14 * S
    // Five points, and the last two hook back on themselves. A tentacle drawn
    // as three points is a straight bar with a bend in it; the curl at the tip
    // is the entire difference between an arm and a stick.
    const pts: Pt[] = []
    for (let i = 0; i <= 4; i++) {
      const u = i / 4
      const x = (0.06 + reach * u * (1.25 - u * 0.32)) * S
      const droop = Math.sin(u * 2.1) * curl
      const hook = Math.pow(u, 2.4) * 0.24 * S * (k % 2 ? 1 : -1)
      pts.push([x, rise * (0.45 + u * 0.55) + droop + hook + 0.06 * S])
    }
    const w = depth > 0 ? 0.085 : 0.058
    stroke(ctx, pts, w * S, 0.008 * S, depth > 0 ? FLESH.base : FLESH.shade, 602 + k)
    if (depth < 0) return
    // Suckers on the near arms only, and only on the outer half — a full run of
    // them down every limb is texture, not drawing.
    for (let i = 1; i < 5; i++) {
      const u = i / 5
      const a = pts[1]!
      const b = pts[4]!
      const x = a[0] + (b[0] - a[0]) * u
      const y = a[1] + (b[1] - a[1]) * u
      fillShape(ctx, blob(x, y + 0.032 * S, 0.022 * S, 0.019 * S, 610 + k * 8 + i, 0.2), SUCKER.base)
    }
  }

  // ── Far arms ──
  arm(0, -1)
  arm(3, -1)

  // ── Mantle ──
  // A heavy teardrop pointing BACKWARD: the pointed end is where it came from,
  // the blunt end is the end with the eyes in it.
  const mantle = rough([
    [0.3 * S, 0.08 * S + surge],
    [0.18 * S, -0.28 * S + surge],
    [-0.16 * S, -0.36 * S + surge * 0.6],
    [-0.6 * S, -0.2 * S],
    [-0.92 * S, 0.04 * S],
    [-0.54 * S, 0.22 * S],
    [-0.1 * S, 0.32 * S + surge * 0.6],
    [0.22 * S, 0.3 * S + surge]
  ], 0.02 * S, 620)
  paint(ctx, S, mantle, FLESH, 621, { line: LINE.major, breakUp: 0.22, amp: 0.1 })

  ctx.save()
  ctx.beginPath(); trace(ctx, mantle); ctx.clip()
  fillShape(ctx, blob(-0.24 * S, 0.24 * S + surge * 0.5, 0.46 * S, 0.13 * S, 622, 0.2), UNDER.base)
  for (let i = 0; i < 4; i++) {
    hatch(ctx, blob((-0.52 + i * 0.24) * S, (-0.14 + noise2(i, 624, 624) * 0.2) * S,
      (0.12 - i * 0.012) * S, 0.085 * S, 626 + i, 0.22),
      0.6, 0.028 * S, 0.008 * S, 'rgba(20,10,34,0.3)', 630 + i)
  }
  ctx.restore()

  // Mantle fins: two soft paddles at the pointed end, rippling out of phase.
  for (const side of [-1, 1] as const) {
    const flap = Math.sin(phase - 0.4) * 0.18 * side
    const paddle = pivot(rough([
      [0, 0], [0.24 * S, -0.1 * S], [0.3 * S, 0.06 * S], [0.04 * S, 0.1 * S]
    ], 0.01 * S, 634 + side), -0.74 * S, (-0.02 + side * 0.12) * S, side * 0.6 + flap + Math.PI)
    fin(ctx, S, paddle, side > 0 ? UNDER : tones('#6d4a8c', 0.95), 636 + side, { line: LINE.fine })
  }

  // ── Beak ──
  // Set INSIDE a ring of flesh, not on the front of the face. A parrot beak
  // sitting proud of the body is a bird; sunk in a pit of muscle it is a squid.
  const bite = 0.1 + 0.14 * Math.max(0, Math.sin(phase * 2 + 1))
  const pit = blob(0.22 * S, 0.14 * S + surge, 0.19 * S, 0.16 * S, 640, 0.16)
  paint(ctx, S, pit, tones('#33224f', 1.1), 641, { line: LINE.fine, lit: false, amp: 0.12 })
  fillShape(ctx, blob(0.22 * S, 0.15 * S + surge, 0.115 * S, 0.105 * S, 642, 0.18), '#180a20')
  const beakTop = pivot(rough([
    [-0.1 * S, 0], [0.13 * S, -0.02 * S], [0.02 * S, 0.11 * S]
  ], 0.006 * S, 644), 0.22 * S, 0.1 * S + surge, -bite)
  const beakBot = pivot(rough([
    [-0.09 * S, 0], [0.11 * S, 0.02 * S], [0.0 * S, -0.1 * S]
  ], 0.006 * S, 646), 0.22 * S, 0.21 * S + surge, bite)
  for (const [b, sd] of [[beakTop, 645], [beakBot, 647]] as const) {
    paint(ctx, S, b, tones('#d8c9a4', 0.95), sd, { line: LINE.fine, deep: false, amp: 0.05 })
  }

  // ── Near arms, over the beak ──
  arm(1, 1)
  arm(2, 1)
  arm(4, 1)

  // ── Lure ──
  // A stalk with a cold light on the end, hung out in front. The one warm-free
  // light source in the cast, and the thing a player actually tracks in dark
  // water.
  const bobA = Math.sin(phase * 1.3) * 0.06 * S
  const stalk: Pt[] = [
    [0.16 * S, -0.3 * S + surge],
    [0.42 * S, -0.56 * S + bobA],
    [0.62 * S, -0.42 * S + bobA * 1.6]
  ]
  stroke(ctx, stalk, 0.028 * S, 0.011 * S, FLESH.shade, 650)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const glow = ctx.createRadialGradient(stalk[2]![0], stalk[2]![1], 0, stalk[2]![0], stalk[2]![1], 0.28 * S)
  glow.addColorStop(0, 'rgba(159,232,192,0.55)')
  glow.addColorStop(1, 'rgba(159,232,192,0)')
  ctx.fillStyle = glow
  ctx.beginPath(); ctx.arc(stalk[2]![0], stalk[2]![1], 0.28 * S, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  fillShape(ctx, blob(stalk[2]![0], stalk[2]![1], 0.05 * S, 0.046 * S, 652, 0.16), GLOW)
  fillShape(ctx, blob(stalk[2]![0] - 0.012 * S, stalk[2]![1] - 0.014 * S, 0.02 * S, 0.018 * S, 653, 0.2), '#ffffff')

  // ── Eyes ──
  // Enormous, and set at different heights: the near one reads first, the far
  // one tells you the head is turned slightly toward you.
  eye(ctx, -0.02 * S, -0.1 * S + surge, 0.125 * S, {
    iris: '#f2e27a', sclera: '#f6ecd8', pupil: 0.24, brow: 0.3, seed: 660
  })
  eye(ctx, -0.3 * S, -0.18 * S + surge * 0.8, 0.08 * S, {
    iris: '#f2e27a', sclera: '#e2d6c4', pupil: 0.26, lid: 0.15, brow: 0.2, seed: 664
  })

  // A rim light along the mantle's top edge, so the whole mass separates from
  // the water behind it.
  ctx.save()
  ctx.globalAlpha = 0.5
  ink(ctx, shrink(mantle, 0.96, 0, 0), {
    width: 0.018 * S, color: '#b9a0e0', breakUp: 0.7, seed: 670,
    weight: (_u, na) => Math.max(0, -Math.sin(na)) * 1.4
  })
  ctx.restore()
}
