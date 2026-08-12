import {
  blob, egg, rough, trace, fillShape, ink, stroke, cel,
  terminator, occlude, noise2, tones, type Pt, type CelTones
} from '@/game/inkArt'
import {
  INK, SHADOW_DIR, LINE, paint, blink, eye, socket, horn, groundShadow,
  gait, swing, spines, pivot, SOUL_LIGHT
} from '@/game/monsterKit'

/**
 * ─── The flying cast ────────────────────────────────────────────────────────
 *
 * Same vocabulary, same key light, same tonal ramp as the ground cast — these
 * are not a separate art style, they are the same characters with a different
 * problem to solve.
 *
 * What a flyer needs that a walker does not:
 *
 *   * **A wingbeat as the locomotion cycle.** Same rule as the walk: the wing
 *     ROTATES, it never redraws. Every wing below is authored once in local
 *     coordinates and transformed into world space by `pivot`, so the shape is
 *     rigid and only its angle changes.
 *   * **Lift that arrives late.** The body rises after the downstroke, not
 *     during it. Bobbing in phase with the wings is the single thing that makes
 *     procedural flight look like a sticker on a spring.
 *   * **Trailing mass.** Legs, tails and antennae are dragged, so they lag the
 *     body by a quarter cycle or more.
 */

// ─── 11 · Dustmoth ──────────────────────────────────────────────────────────

export const drawDustmoth = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  // Big wings move slowly. A moth's beat is nearly a third of a second.
  const g = gait(t, 1500)
  const flap = Math.sin(g * Math.PI * 2)
  const bob = Math.cos((g - 0.14) * Math.PI * 2) * 0.06 * S

  const FUZZ = tones('#c08a63')
  const WING = tones('#d8c3a6', 0.85)
  const WING_D = tones('#a98a6d', 0.9)
  const SPOT = tones('#5d3b52')

  groundShadow(ctx, S, 0.24, 1.02, 0.14)

  const cy = 0.16 * S + bob

  // Authored once, in local space, pointing along +x from the shoulder.
  const FORE: Pt[] = [
    [0.02, -0.08], [0.34, -0.36], [0.72, -0.34], [0.92, -0.06],
    [0.78, 0.2], [0.4, 0.28], [0.1, 0.18]
  ]
  const HIND: Pt[] = [
    [0.02, -0.04], [0.3, -0.02], [0.54, 0.16], [0.46, 0.42], [0.18, 0.36]
  ]

  for (const side of [-1, 1] as const) {
    // The far wing lags and travels less — one number, and the pair stops
    // reading as a symmetrical cut-out.
    const near = side === 1
    const a = flap * (near ? 0.42 : 0.32) - 0.12
    const tone = near ? WING : WING_D
    const sd = 1100 + (near ? 0 : 40)

    const hind = pivot(HIND.map(([x, y]) => [x * S * 0.86, y * S * 0.86] as Pt),
      side * 0.11 * S, cy + 0.16 * S, a * 0.72, side)
    paint(ctx, S, hind, tone, sd, { line: LINE.mid, breakUp: 0.3, amp: 0.08 })

    const fore = pivot(FORE.map(([x, y]) => [x * S, y * S] as Pt),
      side * 0.13 * S, cy - 0.04 * S, a, side)
    paint(ctx, S, fore, tone, sd + 10, { line: LINE.mid, breakUp: 0.28, amp: 0.08 })

    // Eyespots: three rings, deliberately off-centre from each other so they
    // look painted on rather than printed.
    ctx.save()
    ctx.beginPath(); trace(ctx, fore); ctx.clip()
    const eyeC = pivot([[0.56 * S, -0.08 * S]], side * 0.13 * S, cy - 0.04 * S, a, side)[0]!
    fillShape(ctx, blob(eyeC[0], eyeC[1], 0.15 * S, 0.14 * S, sd + 20, 0.12), SPOT.shade)
    fillShape(ctx, blob(eyeC[0] + 0.008 * S, eyeC[1] + 0.006 * S, 0.1 * S, 0.095 * S, sd + 21, 0.14), '#f2e4cd')
    fillShape(ctx, blob(eyeC[0] - 0.004 * S, eyeC[1] + 0.004 * S, 0.055 * S, 0.052 * S, sd + 22, 0.16), SPOT.deep)
    fillShape(ctx, blob(eyeC[0] - 0.018 * S, eyeC[1] - 0.016 * S, 0.018 * S, 0.015 * S, sd + 23, 0.2), 'rgba(255,255,255,0.7)')
    // Dusty banding along the outer margin.
    for (let i = 0; i < 3; i++) {
      const p0 = pivot([[(0.62 + i * 0.1) * S, -0.34 * S]], side * 0.13 * S, cy - 0.04 * S, a, side)[0]!
      const p1 = pivot([[(0.56 + i * 0.1) * S, 0.28 * S]], side * 0.13 * S, cy - 0.04 * S, a, side)[0]!
      stroke(ctx, [p0, p1], 0.02 * S, 0.03 * S, 'rgba(92,60,46,0.22)', sd + 30 + i)
    }
    ctx.restore()
  }

  // ── Body: three fuzzy segments and a ruff. High-frequency contour noise is
  // what reads as plush without drawing a single hair ──
  const abd = egg(0, cy + 0.34 * S, 0.14 * S, 0.26 * S, 0.7, 1150, 0.07, 90)
  paint(ctx, S, abd, FUZZ, 1151, { line: LINE.mid, breakUp: 0.25 })
  for (let i = 0; i < 3; i++) {
    stroke(ctx, [
      [-0.1 * S, cy + (0.24 + i * 0.11) * S], [0.1 * S, cy + (0.245 + i * 0.11) * S]
    ], 0.012 * S, 0.012 * S, 'rgba(60,34,22,0.35)', 1152 + i)
  }
  const thorax = blob(0, cy + 0.06 * S, 0.19 * S, 0.17 * S, 1156, 0.07, 8, 90)
  paint(ctx, S, thorax, FUZZ, 1157, { line: LINE.mid, breakUp: 0.24 })
  const ruff = blob(0, cy - 0.08 * S, 0.23 * S, 0.11 * S, 1158, 0.1, 7, 90)
  paint(ctx, S, ruff, tones('#e0b98d'), 1159, { line: LINE.fine, breakUp: 0.4, deep: false })

  // ── Legs: six, tiny, and entirely for show ──
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 3; i++) {
      const lx = side * (0.08 + i * 0.02) * S
      const ly = cy + (0.16 + i * 0.09) * S
      const tr = swing(g - 0.3, 0.03 + i * 0.01) * S
      stroke(ctx, [[lx, ly], [lx + side * 0.09 * S + tr, ly + 0.12 * S]],
        0.018 * S, 0.005 * S, '#4d2f1f', 1160 + i + side * 4)
    }
  }

  // ── Head: mostly eyes, as a moth's is ──
  const hy = cy - 0.16 * S
  const head = blob(0, hy, 0.15 * S, 0.13 * S, 1170, 0.08, 7, 80)
  paint(ctx, S, head, FUZZ, 1171, { line: LINE.mid, breakUp: 0.25 })
  const bl = blink(t, 1700)
  eye(ctx, -0.075 * S, hy + 0.01 * S, 0.075 * S, {
    iris: '#1b1220', pupil: 0.72, lid: bl, seed: 1174, sclera: '#3a2334'
  })
  eye(ctx, 0.08 * S, hy + 0.02 * S, 0.065 * S, {
    iris: '#1b1220', pupil: 0.72, lid: bl, seed: 1178, sclera: '#3a2334'
  })

  // Antennae: feathered, and they trail the beat.
  for (const side of [-1, 1] as const) {
    const lag = swing(g - 0.28, 0.05) * S
    const base: Pt = [side * 0.07 * S, hy - 0.09 * S]
    const tip: Pt = [side * 0.34 * S + lag, hy - 0.36 * S]
    stroke(ctx, [base, [side * 0.2 * S + lag * 0.5, hy - 0.26 * S], tip], 0.022 * S, 0.006 * S, '#4d2f1f', 1180 + side)
    for (let i = 1; i <= 5; i++) {
      const k = i / 6
      const px = base[0] + (tip[0] - base[0]) * k
      const py = base[1] + (tip[1] - base[1]) * k
      stroke(ctx, [[px, py], [px + side * 0.05 * S, py + 0.035 * S]], 0.01 * S, 0.002 * S, '#5c3a26', 1184 + i)
      stroke(ctx, [[px, py], [px - side * 0.01 * S, py - 0.045 * S]], 0.01 * S, 0.002 * S, '#5c3a26', 1190 + i)
    }
  }

  // ── Shed dust ──
  ctx.save()
  for (let i = 0; i < 9; i++) {
    const ph = (t / 2400 + i * 0.31) % 1
    const px = (noise2(i * 2.7, 2, 1200) - 0.5) * 1.5 * S
    const py = cy + 0.2 * S + ph * 0.7 * S
    ctx.globalAlpha = (1 - ph) * 0.4
    ctx.fillStyle = '#e8d2b0'
    ctx.beginPath(); ctx.arc(px, py, (0.006 + noise2(i, 5, 1201) * 0.01) * S, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

// ─── 12 · Skewer ────────────────────────────────────────────────────────────

export const drawSkewer = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  // Small wings beat fast. This is the quickest cycle in the whole cast.
  const g = gait(t, 480)
  const flap = Math.sin(g * Math.PI * 2)
  const bob = Math.cos((g - 0.15) * Math.PI * 2) * 0.05 * S

  const SCALE = tones('#3f6b5e', 1.1)
  const BELLY = tones('#c8b57e', 0.95)
  const MEMB = tones('#c2683a', 0.95)
  const CLAW = tones('#efe4c8', 0.95)

  groundShadow(ctx, S, 0.3, 1.02, 0.16)

  const cy = 0.26 * S + bob

  /**
   * The wing, authored once in local space along +x.
   *
   * A membrane wing is defined by its BAYS: the sag between one finger tip and
   * the next. Doubling each tip pinches the quadratic so the bay ends in a
   * claw instead of a scallop — without that, `trace` rounds the whole trailing
   * edge off and the result reads as a beetle's wing case, which is exactly
   * what the first version did.
   */
  const TIP1: Pt = [1.18, -0.34]
  const TIP2: Pt = [0.88, -0.05]
  const TIP3: Pt = [0.56, 0.05]
  const ROOT: Pt = [0.06, -0.02]
  const WING: Pt[] = [
    [0.04, -0.04], [0.46, -0.3], [0.92, -0.38],
    TIP1, TIP1,
    [1.0, 0.04],
    TIP2, TIP2,
    [0.74, 0.18],
    TIP3, TIP3,
    [0.36, 0.24],
    [0.1, 0.2]
  ]

  const drawWing = (
    cx: number, cyw: number, a: number, k: number, tone: CelTones, sd: number, struts: string
  ): void => {
    const w = pivot(WING.map(([x, y]) => [x * S * k, y * S * k] as Pt), cx, cyw, a, 1)
    paint(ctx, S, w, tone, sd, { line: LINE.mid, breakUp: 0.3, amp: 0.07 })
    const r = pivot([[ROOT[0] * S * k, ROOT[1] * S * k]], cx, cyw, a, 1)[0]!
    for (const tip of [TIP1, TIP2, TIP3]) {
      const q = pivot([[tip[0] * S * k, tip[1] * S * k]], cx, cyw, a, 1)[0]!
      stroke(ctx, [r, q], 0.03 * S * k, 0.007 * S * k, struts, sd + 4 + tip[0] * 100)
    }
  }

  // ── Far wing: set further back, more upright, and a tone down ──
  drawWing(-0.06 * S, cy - 0.16 * S, -1.16 + flap * 0.34, 0.82,
    tones('#8f5330', 0.9), 1250, 'rgba(48,20,10,0.4)')

  // ── Tail: long, whipping, and it ends in a blade ──
  const wag = Math.sin((g - 0.35) * Math.PI * 2) * 0.1 * S
  const tail: Pt[] = [
    [0.26 * S, cy + 0.1 * S],
    [0.58 * S, cy + 0.22 * S + wag * 0.4],
    [0.84 * S, cy + 0.06 * S + wag],
    [0.92 * S, cy - 0.28 * S + wag * 1.4]
  ]
  stroke(ctx, tail, 0.1 * S, 0.016 * S, SCALE.base, 1260)
  stroke(ctx, tail.map(([x, y]) => [x - 0.012 * S, y - 0.014 * S] as Pt), 0.032 * S, 0.006 * S, SCALE.lit, 1261)
  // The barb is aligned to the tail's last segment, so it always looks like the
  // end of the tail rather than an ornament stuck near it.
  const td = Math.atan2(tail[3]![1] - tail[2]![1], tail[3]![0] - tail[2]![0])
  const barb = pivot([
    [-0.04 * S, 0], [0.02 * S, -0.07 * S], [0.22 * S, 0], [0.02 * S, 0.07 * S]
  ], tail[3]![0], tail[3]![1], td, 1)
  paint(ctx, S, barb, CLAW, 1263, { line: LINE.fine, deep: false, amp: 0.05 })

  // ── Body: a long wyrm barrel, not a ball ──
  const body = rough([
    [-0.3 * S, cy - 0.14 * S],
    [0.02 * S, cy - 0.2 * S],
    [0.3 * S, cy - 0.08 * S],
    [0.34 * S, cy + 0.12 * S],
    [0.06 * S, cy + 0.28 * S],
    [-0.26 * S, cy + 0.18 * S]
  ], 0.018 * S, 1270)
  paint(ctx, S, body, SCALE, 1271, { line: LINE.major, breakUp: 0.26 })
  ctx.save()
  ctx.beginPath(); trace(ctx, body); ctx.clip()
  const belly = blob(-0.04 * S, cy + 0.19 * S, 0.26 * S, 0.11 * S, 1272, 0.14)
  paint(ctx, S, belly, BELLY, 1273, { line: false })
  for (let i = 0; i < 5; i++) {
    stroke(ctx, [
      [(-0.22 + i * 0.1) * S, cy + 0.08 * S], [(-0.23 + i * 0.1) * S, cy + 0.3 * S]
    ], 0.008 * S, 0.008 * S, 'rgba(90,70,30,0.4)', 1274 + i)
  }
  ctx.restore()
  // Dorsal ridge, anchored to the body's own contour.
  spines(ctx, body, 0.6, 0.95, 7, 0.09 * S, 0.026 * S, () => SCALE.deep, 1278, 0.3)

  // ── Legs, drawn up under the belly the way a flying thing carries them ──
  for (const side of [-1, 1] as const) {
    const tr = swing(g - 0.3, 0.03) * S
    const hip: Pt = [side * 0.05 * S - 0.02 * S, cy + 0.22 * S]
    const knee: Pt = [side * 0.16 * S + 0.02 * S, cy + 0.42 * S + tr]
    const toe: Pt = [side * 0.06 * S, cy + 0.54 * S + tr]
    stroke(ctx, [hip, knee, toe], 0.075 * S, 0.034 * S, side > 0 ? SCALE.base : SCALE.shade, 1280 + side)
    const hock = blob(knee[0], knee[1], 0.045 * S, 0.04 * S, 1282 + side, 0.16)
    paint(ctx, S, hock, side > 0 ? SCALE : tones('#345a4f', 1.1), 1283 + side, { line: false })
    for (let i = -1; i <= 1; i++) {
      stroke(ctx, [toe, [toe[0] + i * 0.055 * S, toe[1] + 0.09 * S]], 0.02 * S, 0.004 * S, CLAW.base, 1284 + i)
    }
  }

  // ── Neck and head, thrust forward and low ──
  const hx = -0.56 * S
  const hy = cy - 0.26 * S
  stroke(ctx, [
    [-0.24 * S, cy - 0.06 * S], [-0.42 * S, cy - 0.22 * S], [hx + 0.12 * S, hy + 0.06 * S]
  ], 0.15 * S, 0.095 * S, SCALE.shade, 1290)

  const head = rough([
    [hx + 0.18 * S, hy - 0.1 * S],
    [hx - 0.02 * S, hy - 0.17 * S],
    [hx - 0.22 * S, hy - 0.08 * S],
    [hx - 0.3 * S, hy + 0.04 * S],
    [hx - 0.12 * S, hy + 0.1 * S],
    [hx + 0.16 * S, hy + 0.12 * S]
  ], 0.01 * S, 1292)
  paint(ctx, S, head, SCALE, 1293, { line: LINE.mid, breakUp: 0.26 })
  const jaw = rough([
    [hx - 0.26 * S, hy + 0.09 * S],
    [hx + 0.14 * S, hy + 0.14 * S],
    [hx + 0.12 * S, hy + 0.26 * S],
    [hx - 0.19 * S, hy + 0.19 * S]
  ], 0.008 * S, 1294)
  paint(ctx, S, jaw, tones('#345a4f', 1.1), 1295, { line: LINE.fine, deep: false })
  for (let i = 0; i < 5; i++) {
    const tx = hx + (-0.2 + i * 0.07) * S
    fillShape(ctx, [
      [tx, hy + 0.11 * S], [tx + 0.014 * S, hy + 0.17 * S], [tx + 0.028 * S, hy + 0.11 * S]
    ], '#f4ecd6')
  }
  fillShape(ctx, blob(hx - 0.27 * S, hy - 0.02 * S, 0.026 * S, 0.02 * S, 1296, 0.18), '#14201c')
  // A crest of small spines instead of two floating twigs — a ridge reads as
  // part of the skull, where a pair of thin horns reads as an accessory.
  spines(ctx, head, 0.62, 0.98, 5, 0.13 * S, 0.03 * S, () => CLAW.shade, 1300, 0.35)
  horn(ctx, hx + 0.15 * S, hy - 0.1 * S, 0.3 * S, 0.042 * S, -0.36, 0.55, tones('#d9cba6', 0.95), 1304)

  const bl = blink(t, 900)
  eye(ctx, hx - 0.1 * S, hy - 0.02 * S, 0.052 * S, {
    iris: '#ffa424', glow: '#ff8a10', pupil: 0.22, lid: bl, brow: 0.85, seed: 1310, sclera: '#f6dfae'
  })

  // ── Near wing, over everything ──
  drawWing(0.08 * S, cy - 0.14 * S, -0.78 + flap * 0.5, 0.98,
    MEMB, 1320, 'rgba(62,26,14,0.45)')
}

// ─── 13 · Gloomcrow ─────────────────────────────────────────────────────────

export const drawGloomcrow = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  const g = gait(t, 780)
  const flap = Math.sin(g * Math.PI * 2)
  const bob = Math.cos((g - 0.13) * Math.PI * 2) * 0.06 * S

  const SOOT = tones('#3b3945', 1.15)
  const SOOT_D = tones('#2a2833', 1.1)
  const BONE = tones('#ddd0b4', 1.05)
  const GOLD = tones('#d9a83a')

  groundShadow(ctx, S, 0.26, 1.02, 0.16)

  const cy = 0.2 * S + bob

  /**
   * One wing: a bone arm with feathers hung off it.
   *
   * Feathers are separate shapes rather than one silhouette, because that is
   * what lets them go RAGGED — a bird that has been dead a while should be
   * missing some, and a single outline can never say that.
   */
  const wing = (side: number, a: number, tone: CelTones, sd: number): void => {
    const px = side * 0.14 * S
    const py = cy - 0.06 * S
    const arm = pivot([[0.06 * S, 0], [0.44 * S, -0.12 * S], [0.84 * S, -0.06 * S]], px, py, a, side)
    stroke(ctx, arm, 0.055 * S, 0.028 * S, BONE.shade, sd)

    // Primaries fan from the tip, secondaries from the forearm. Two gaps where
    // feathers are simply gone.
    // Primaries off the tip, secondaries off the forearm, and two gaps where
    // feathers are simply gone — a bird this dead should be missing some.
    for (let i = 0; i < 9; i++) {
      if (i === 4 || i === 7) continue
      const k = i / 8
      const root: Pt = [0.14 * S + k * 0.66 * S, -0.05 * S + k * 0.02 * S]
      const len = (0.58 - k * 0.14 + noise2(i * 1.7, sd, sd) * 0.14) * S
      const spread = 0.72 + k * 1.05
      const tip: Pt = [root[0] + Math.cos(spread) * len * 0.72, root[1] + Math.sin(spread) * len]
      const mx = (root[0] + tip[0]) / 2
      const my = (root[1] + tip[1]) / 2
      const wide = 0.1 * S
      const feather = pivot([
        root,
        [mx + wide * 0.6, my - wide],
        [tip[0] + wide * 0.25, tip[1] - wide * 0.2],
        tip,
        [mx - wide * 0.5, my + wide * 0.7]
      ], px, py, a, side)
      paint(ctx, S, feather, tone, sd + 4 + i, { line: LINE.hair, breakUp: 0.35, deep: false, amp: 0.09 })
      // Shaft: one line down the middle, and a shape becomes a feather.
      const q0 = pivot([root], px, py, a, side)[0]!
      const q1 = pivot([tip], px, py, a, side)[0]!
      stroke(ctx, [q0, q1], 0.012 * S, 0.003 * S, 'rgba(16,14,22,0.45)', sd + 20 + i)
    }
    // Coverts: a short overlapping row where the feathers meet the arm.
    for (let i = 0; i < 5; i++) {
      const k = i / 4
      const root: Pt = [0.12 * S + k * 0.5 * S, -0.05 * S]
      const tip: Pt = [root[0] + 0.08 * S, root[1] + 0.2 * S]
      const cov = pivot([
        root, [(root[0] + tip[0]) / 2 + 0.06 * S, (root[1] + tip[1]) / 2], tip,
        [(root[0] + tip[0]) / 2 - 0.05 * S, (root[1] + tip[1]) / 2]
      ], px, py, a, side)
      paint(ctx, S, cov, tone, sd + 40 + i, { line: false })
    }
  }

  // Far wing first, a tone down and travelling less.
  wing(-1, flap * 0.4 - 0.2, SOOT_D, 1400)

  // ── Tail: three tattered feathers ──
  for (let i = -1; i <= 1; i++) {
    const drag = swing(g - 0.3, 0.05) * S
    const tf: Pt[] = [
      [0.16 * S, cy + 0.18 * S],
      [0.46 * S + i * 0.04 * S + drag, cy + (0.3 + i * 0.06) * S],
      [0.7 * S + i * 0.1 * S + drag * 1.6, cy + (0.44 + i * 0.14) * S],
      [0.44 * S + i * 0.04 * S + drag, cy + (0.36 + i * 0.06) * S]
    ]
    paint(ctx, S, tf, i === 0 ? SOOT : SOOT_D, 1430 + i * 3, { line: LINE.hair, breakUp: 0.4, deep: false })
  }

  // ── Body: soot feathers, with the ribcage showing through a bare patch ──
  const body = egg(0, cy + 0.12 * S, 0.24 * S, 0.28 * S, 0.72, 1440, 0.07)
  paint(ctx, S, body, SOOT, 1441, { line: LINE.major, breakUp: 0.26 })
  ctx.save()
  ctx.beginPath(); trace(ctx, body); ctx.clip()
  const bare = blob(0.02 * S, cy + 0.16 * S, 0.15 * S, 0.16 * S, 1442, 0.2)
  fillShape(ctx, bare, '#15131c')
  ctx.save()
  ctx.beginPath(); trace(ctx, bare); ctx.clip()
  for (let i = 0; i < 3; i++) {
    const ry = cy + (0.04 + i * 0.09) * S
    stroke(ctx, [[-0.14 * S, ry], [0.02 * S, ry + 0.02 * S], [0.16 * S, ry - 0.01 * S]],
      0.026 * S, 0.014 * S, BONE.shade, 1444 + i)
  }
  ctx.restore()
  ink(ctx, bare, { width: LINE.hair * S, color: '#12101a', seed: 1448, breakUp: 0.3 })
  // Feather rows: a few marks say plumage; a texture fill never does.
  for (let i = 0; i < 5; i++) {
    stroke(ctx, [
      [-0.2 * S, cy + (-0.08 + i * 0.09) * S], [-0.06 * S, cy + (-0.04 + i * 0.09) * S]
    ], 0.006 * S, 0.018 * S, 'rgba(16,14,22,0.5)', 1450 + i)
  }
  ctx.restore()

  // ── Legs, drawn up tight ──
  for (const side of [-1, 1] as const) {
    const tr = swing(g - 0.3, 0.03) * S
    const hip: Pt = [side * 0.07 * S, cy + 0.3 * S]
    const knee: Pt = [side * 0.16 * S, cy + 0.44 * S + tr]
    const toe: Pt = [side * 0.08 * S, cy + 0.54 * S + tr]
    stroke(ctx, [hip, knee, toe], 0.036 * S, 0.02 * S, BONE.shade, 1460 + side)
    for (let i = -1; i <= 1; i++) {
      stroke(ctx, [toe, [toe[0] + i * 0.045 * S, toe[1] + 0.07 * S]], 0.014 * S, 0.003 * S, BONE.base, 1464 + i)
    }
  }

  // ── Skull, with a long beak ──
  const hy = cy - 0.28 * S
  const skull = egg(-0.06 * S, hy, 0.17 * S, 0.16 * S, 0.84, 1470, 0.05)
  paint(ctx, S, skull, BONE, 1471, { line: LINE.mid, breakUp: 0.3 })

  const beakUpper = rough([
    [-0.18 * S, hy + 0.0 * S],
    [-0.52 * S, hy + 0.06 * S],
    [-0.16 * S, hy + 0.09 * S]
  ], 0.008 * S, 1474)
  const beakLower = rough([
    [-0.18 * S, hy + 0.1 * S],
    [-0.44 * S, hy + 0.13 * S],
    [-0.15 * S, hy + 0.16 * S]
  ], 0.007 * S, 1476)
  paint(ctx, S, beakUpper, tones('#c9b995', 1.05), 1475, { line: LINE.fine, deep: false })
  paint(ctx, S, beakLower, tones('#ab9a78', 1.05), 1477, { line: LINE.fine, deep: false })
  fillShape(ctx, blob(-0.3 * S, hy + 0.045 * S, 0.014 * S, 0.011 * S, 1478, 0.2), '#3a3128')

  socket(ctx, -0.06 * S, hy - 0.01 * S, 0.055 * S, SOUL_LIGHT, 1480, 0.34, blink(t, 1400))
  // A ruff of feathers where skull meets body — the join every bird has and
  // every badly-drawn bird is missing.
  const ruff = blob(0.0 * S, cy - 0.12 * S, 0.2 * S, 0.1 * S, 1484, 0.24, 4)
  paint(ctx, S, ruff, SOOT_D, 1485, { line: LINE.fine, breakUp: 0.45, deep: false })

  // ── The stolen ring, held in the beak ──
  const rx = -0.44 * S
  const ry = hy + 0.14 * S
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const gg = ctx.createRadialGradient(rx, ry, 0, rx, ry, 0.16 * S)
  gg.addColorStop(0, 'rgba(255,206,110,0.5)')
  gg.addColorStop(1, 'rgba(255,190,90,0)')
  ctx.fillStyle = gg
  ctx.beginPath(); ctx.arc(rx, ry, 0.16 * S, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  const ring = blob(rx, ry, 0.05 * S, 0.052 * S, 1490, 0.08)
  cel(ctx, ring, GOLD, { shade: terminator(ring, SHADOW_DIR, 0.05, 0.14, 1491) })
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  fillShape(ctx, blob(rx, ry, 0.026 * S, 0.028 * S, 1492, 0.1), '#000')
  ctx.restore()
  ink(ctx, ring, { width: LINE.hair * S, color: INK, seed: 1493, breakUp: 0.3 })

  // ── Near wing, over everything ──
  wing(1, flap * 0.55 - 0.18, SOOT, 1500)
  // Where the wing meets the shoulder.
  occlude(ctx, body, 0.62, 0.82, 0.03 * S, 'rgba(14,12,20,0.7)', 1510)

  // ── Shed feathers ──
  ctx.save()
  for (let i = 0; i < 4; i++) {
    const ph = (t / 3600 + i * 0.27) % 1
    const px = (noise2(i * 2.7, 2, 1520) - 0.5) * 1.3 * S
    const py = cy + 0.3 * S + ph * 0.7 * S
    ctx.globalAlpha = (1 - ph) * 0.5
    const drift = Math.sin(ph * 8 + i) * 0.05 * S
    fillShape(ctx, [
      [px + drift, py], [px + drift + 0.03 * S, py + 0.05 * S],
      [px + drift, py + 0.1 * S], [px + drift - 0.025 * S, py + 0.05 * S]
    ], '#2a2833')
  }
  ctx.restore()
}
