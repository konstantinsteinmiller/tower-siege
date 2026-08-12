import {
  blob, shrink, densify, fillShape, ink, stroke, cel, terminator, noise2,
  type Pt, type CelTones
} from '@/game/inkArt'

/**
 * ─── Shared monster vocabulary ──────────────────────────────────────────────
 *
 * The parts every character is assembled from, and the constants they all obey.
 *
 * A cast reads as ONE cast because of agreement, not because of style words.
 * Ten creatures that each pick their own light direction, their own line
 * weights and their own tonal steps will look like ten unrelated drawings even
 * when every one of them is cel-shaded and hand-inked. So all of that lives
 * here and nothing below re-decides it:
 *
 *   * one key light (`SHADOW_DIR`) for the whole cast;
 *   * three line weights (`LINE`), never an arbitrary number;
 *   * three tone cuts at fixed depths (`SHADE` / `DEEP` / `LIT`);
 *   * one ink colour, and one palette ramp (`tones`, in `inkArt`).
 *
 * What a character IS allowed to choose: its silhouette, its base hues, its
 * asymmetries, and which of the shared parts it uses.
 */

export const INK = '#1c1418'

/**
 * The key light, up and to the left, for every character.
 *
 * Per-character lighting is a tell that nobody can name but everybody sees.
 */
export const SHADOW_DIR = 1.05

/**
 * Line-weight scale, in units of S.
 *
 * `major` is the silhouette of a primary form, `mid` a secondary part, `fine`
 * an interior edge, `hair` a detail line.
 */
export const LINE = { major: 0.05, mid: 0.034, fine: 0.022, hair: 0.013 } as const

/** Where the three tone cuts land, as a fraction of the form's radius. */
export const SHADE = 0.1
export const DEEP = 0.48
export const LIT = 0.58

export interface PaintOpts {
  /** Terminator offsets. `false` omits that band. */
  shade?: number
  deep?: number | false
  lit?: number | false
  /** Outline width in units of S; `false` leaves the form unlined. */
  line?: number | false
  inkColor?: string
  breakUp?: number
  /** Wobble of the terminator edge. Lower for hard surfaces. */
  amp?: number
}

/**
 * Paint one form — base, three tone cuts, outline — in a single call.
 *
 * Every part of every character goes through here. That is the enforcement
 * mechanism for everything the header promises; a part painted by hand would
 * silently drift from the rest of the cast.
 */
export const paint = (
  ctx: CanvasRenderingContext2D, S: number, shape: Pt[],
  t: CelTones, seed: number, o: PaintOpts = {}
): void => {
  const amp = o.amp ?? 0.14
  cel(ctx, shape, t, {
    shade: terminator(shape, SHADOW_DIR, o.shade ?? SHADE, amp, seed),
    deep: o.deep === false || !t.deep
      ? undefined
      : terminator(shape, SHADOW_DIR, o.deep ?? DEEP, amp * 0.8, seed + 1),
    lit: o.lit === false || !t.lit
      ? undefined
      : terminator(shape, SHADOW_DIR + Math.PI, o.lit ?? LIT, amp * 0.85, seed + 2)
  })
  if (o.line !== false) {
    ink(ctx, shape, {
      width: (o.line ?? LINE.mid) * S,
      color: o.inkColor ?? INK,
      seed: seed + 3,
      breakUp: o.breakUp ?? 0.26
    })
  }
}

// ─── Idle motion ────────────────────────────────────────────────────────────

/** Breathing / idle bob, in units of S. */
export const breathe = (t: number, speed = 1, amp = 0.012): number =>
  Math.sin(t / (900 / speed)) * amp

/** 0 = open, 1 = fully closed. Blinks are quick and rare, like real ones. */
export const blink = (t: number, offset = 0): number => {
  const period = 3400
  const p = ((t + offset) % period) / period
  if (p > 0.965) return Math.sin((p - 0.965) / 0.035 * Math.PI)
  return 0
}

// ─── Features ───────────────────────────────────────────────────────────────

export interface EyeOpts {
  /** Iris colour; omit for a flat dark eye. */
  iris?: string
  glow?: string
  pupil?: number
  /** 0 = wide, 1 = shut. */
  lid?: number
  /** Brow angle, radians. Positive slants inward-down (menacing). */
  brow?: number
  sclera?: string
  seed?: number
}

/**
 * A living eye.
 *
 * The catch-light is deliberately off-centre and NOT a circle: a symmetrical
 * dot in the middle of a pupil is the single thing that makes procedural faces
 * look dead.
 */
export const eye = (
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number, o: EyeOpts = {}
): void => {
  const seed = o.seed ?? 4
  const lid = o.lid ?? 0
  const open = Math.max(0.06, 1 - lid)

  const ball = blob(x, y, r, r * open, seed, 0.05)
  if (o.sclera !== 'none') {
    cel(ctx, ball, { base: o.sclera ?? '#fdf7e8', shade: '#cbbca4' }, {
      shade: terminator(ball, SHADOW_DIR, -0.1, 0.12, seed)
    })
  }
  if (o.iris) {
    const ir = r * 0.62
    const ix = x + r * 0.08
    const iy = y + r * 0.06 * open
    fillShape(ctx, blob(ix, iy, ir, ir * Math.max(0.12, open), seed + 2, 0.05), o.iris)
    if (o.glow) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, r * 2.4)
      g.addColorStop(0, o.glow)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.arc(ix, iy, r * 2.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    const pr = ir * (o.pupil ?? 0.5)
    fillShape(ctx, blob(ix, iy, pr, pr * Math.max(0.12, open), seed + 3, 0.06), '#140e14')
  }
  if (open > 0.35) {
    fillShape(ctx, blob(x - r * 0.36, y - r * 0.38 * open, r * 0.26, r * 0.2 * open, seed + 5, 0.22), 'rgba(255,255,255,0.92)')
    fillShape(ctx, blob(x + r * 0.3, y + r * 0.3 * open, r * 0.11, r * 0.09 * open, seed + 6, 0.2), 'rgba(255,255,255,0.5)')
  }
  ink(ctx, ball, { width: r * 0.24, color: INK, seed, breakUp: 0.25 })

  if (o.brow !== undefined) {
    const bl = r * 1.5
    const by = y - r * (open * 1.05 + 0.25)
    const pts: Pt[] = []
    for (let i = 0; i <= 8; i++) {
      const k = i / 8
      pts.push([
        x - bl / 2 + bl * k,
        by + Math.sin(o.brow) * bl * (k - 0.5) - Math.cos(k * Math.PI) * r * 0.08
      ])
    }
    stroke(ctx, pts, r * 0.34, r * 0.14, INK, seed + 7)
  }
}

export interface SocketLight {
  /** Centre of the glow. */
  hot: string
  /** Mid ramp. */
  mid: string
  /** Outer falloff — must be fully transparent. */
  out: string
  /** The hard core burning inside. */
  core: string
}

export const SPORE_LIGHT: SocketLight = {
  hot: 'rgba(190,255,90,0.95)', mid: 'rgba(150,220,60,0.35)',
  out: 'rgba(120,200,40,0)', core: '#e6ff9c'
}
export const SOUL_LIGHT: SocketLight = {
  hot: 'rgba(150,235,255,0.95)', mid: 'rgba(70,190,255,0.4)',
  out: 'rgba(40,150,255,0)', core: '#bdf2ff'
}
export const EMBER_LIGHT: SocketLight = {
  hot: 'rgba(255,196,90,0.95)', mid: 'rgba(255,120,40,0.4)',
  out: 'rgba(220,70,20,0)', core: '#ffd98a'
}

/**
 * A hollow socket with something burning in it.
 *
 * Shared by every undead in the cast, so the three of them read as the same
 * KIND of dead. Only the hue changes between them; the ramp and the hard core
 * are identical, which is what makes the family legible at a glance.
 */
export const socket = (
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  light: SocketLight, seed = 1, core = 0.38, lid = 0
): void => {
  const open = Math.max(0.08, 1 - lid)
  const hole = blob(x, y, r, r * 1.1 * open, seed, 0.1)
  fillShape(ctx, hole, '#1d1524')
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const g = ctx.createRadialGradient(x, y + r * 0.2, 0, x, y + r * 0.2, r * 2.3)
  g.addColorStop(0, light.hot)
  g.addColorStop(0.42, light.mid)
  g.addColorStop(1, light.out)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y + r * 0.2, r * 2.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  if (open > 0.3) {
    fillShape(ctx, blob(x + r * 0.06, y + r * 0.14, r * core, r * core * 1.1 * open, seed + 1, 0.16), light.core)
  }
  ink(ctx, hole, { width: r * 0.3, color: INK, seed: seed + 2, breakUp: 0.2 })
}

/** A curved horn / tusk / claw: tapered, slightly hooked, never symmetrical. */
export const horn = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, len: number, thick: number,
  angle: number, curve: number, t: CelTones, seed = 9
): void => {
  const pts: Pt[] = []
  const n = 14
  for (let i = 0; i <= n; i++) {
    const k = i / n
    const a = angle + curve * k * k
    pts.push([x + Math.cos(a) * len * k, y + Math.sin(a) * len * k])
  }
  const front: Pt[] = []
  const back: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const k = i / n
    const w = thick * (1 - k) ** 1.35 * (0.9 + noise2(i * 0.8, seed, seed) * 0.25)
    const p = pts[i]!
    const q = pts[Math.min(n, i + 1)]!
    const tx = q[0] - p[0]
    const ty = q[1] - p[1]
    const l = Math.hypot(tx, ty) || 1
    front.push([p[0] + (ty / l) * w, p[1] - (tx / l) * w])
    back.unshift([p[0] - (ty / l) * w, p[1] + (tx / l) * w])
  }
  const full = front.concat(back)
  cel(ctx, full, t, { shade: terminator(full, SHADOW_DIR, 0.0, 0.12, seed) })
  ink(ctx, full, { width: thick * 0.34, color: INK, seed, breakUp: 0.3 })
  // Growth rings — two or three, never evenly spaced.
  for (let i = 1; i <= 3; i++) {
    const k = i * 0.19 + noise2(i, seed + 2, seed) * 0.06
    const p = pts[Math.floor(k * n)]!
    const w = thick * (1 - k) ** 1.35
    stroke(ctx, [
      [p[0] - w * 0.8, p[1] - w * 0.3],
      [p[0] + w * 0.8, p[1] + w * 0.3]
    ], thick * 0.16, thick * 0.1, 'rgba(28,20,24,0.4)', seed + i)
  }
}

/**
 * A skeletal hand: carpals, four digits of two phalanges each, an opposed thumb.
 *
 * `grip` runs 0 (splayed claw) to 1 (closed around something).
 *
 * The previous hands were a fan of tapered strokes, which reads as a bundle of
 * twigs at anything above thumbnail size. What makes a hand a hand is the
 * KNUCKLES — the joint swellings between segments — and the thumb sitting on a
 * different axis from the fingers. Both are cheap; neither is optional.
 */
export const boneHand = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, len: number, angle: number,
  t: CelTones, seed = 1, grip = 0
): void => {
  const bleed = len * 0.055

  const phalanx = (a: Pt, bpt: Pt, w0: number, w1: number, sd: number): void => {
    stroke(ctx, [a, bpt], w0 + bleed, w1 + bleed, INK, sd)
    stroke(ctx, [a, bpt], w0, w1, t.base, sd)
    stroke(ctx, [
      [a[0] - w0 * 0.2, a[1] - w0 * 0.26],
      [bpt[0] - w1 * 0.2, bpt[1] - w1 * 0.26]
    ], w0 * 0.36, w1 * 0.3, t.lit ?? t.base, sd + 1)
  }

  const joint = (px: number, py: number, r: number, sd: number): void => {
    const k = blob(px, py, r, r * 0.92, sd, 0.16)
    fillShape(ctx, shrink(k, 1 + bleed / r, px, py), INK)
    cel(ctx, k, t, { shade: terminator(k, SHADOW_DIR, SHADE, 0.16, sd) })
  }

  // Carpals: a small wedge, wider across the knuckles than at the wrist.
  const pw = len * 0.3
  const palm = blob(x, y, pw, pw * 0.82, seed, 0.15)
  fillShape(ctx, shrink(palm, 1 + bleed / pw, x, y), INK)
  cel(ctx, palm, t, {
    shade: terminator(palm, SHADOW_DIR, SHADE, 0.16, seed),
    lit: t.lit ? terminator(palm, SHADOW_DIR + Math.PI, LIT, 0.14, seed + 1) : undefined
  })

  // Four digits, fanned. Ring and little finger are shorter; nothing matches.
  const fan = [-0.66, -0.23, 0.19, 0.58]
  const rel = [0.84, 1, 0.95, 0.74]
  for (let i = 0; i < 4; i++) {
    const spread = 1 - grip * 0.4
    const a0 = angle + fan[i]! * spread
    const l1 = len * 0.38 * rel[i]!
    const l2 = len * 0.3 * rel[i]!
    const bx = x + Math.cos(a0) * pw * 0.8
    const by = y + Math.sin(a0) * pw * 0.8
    const mx = bx + Math.cos(a0) * l1
    const my = by + Math.sin(a0) * l1
    // Curl happens at the middle joint, which is what "gripping" looks like.
    const a1 = a0 + grip * 1.55 + (noise2(i * 1.7, seed, seed) - 0.5) * 0.28
    const tx = mx + Math.cos(a1) * l2
    const ty = my + Math.sin(a1) * l2
    phalanx([bx, by], [mx, my], len * 0.105, len * 0.08, seed + 10 + i * 2)
    joint(mx, my, len * 0.058, seed + 30 + i)
    phalanx([mx, my], [tx, ty], len * 0.08, len * 0.028, seed + 50 + i * 2)
  }

  // Thumb: set back along the palm and on its own axis. Without the offset axis
  // it just reads as a fifth finger.
  const ta = angle - Math.PI * 0.55
  const bx = x + Math.cos(ta) * pw * 0.75
  const by = y + Math.sin(ta) * pw * 0.75
  const ta2 = ta + (0.75 + grip * 0.7)
  const mx = bx + Math.cos(ta2) * len * 0.26
  const my = by + Math.sin(ta2) * len * 0.26
  const ta3 = ta2 + 0.45 + grip * 0.8
  phalanx([bx, by], [mx, my], len * 0.11, len * 0.085, seed + 70)
  joint(mx, my, len * 0.055, seed + 72)
  phalanx([mx, my], [mx + Math.cos(ta3) * len * 0.2, my + Math.sin(ta3) * len * 0.2],
    len * 0.085, len * 0.03, seed + 74)
}

/**
 * A thin bone limb — two tapered segments meeting at a joint swelling.
 *
 * Used for every skeletal arm and leg in the cast, so they all articulate the
 * same way.
 */
export const boneLimb = (
  ctx: CanvasRenderingContext2D, a: Pt, mid: Pt, b: Pt,
  w: number, t: CelTones, seed = 1
): void => {
  const bleed = w * 0.32
  for (const [p, q, w0, w1, sd] of [
    [a, mid, w, w * 0.86, seed],
    [mid, b, w * 0.86, w * 0.74, seed + 2]
  ] as const) {
    stroke(ctx, [p, q], w0 + bleed, w1 + bleed, INK, sd)
    stroke(ctx, [p, q], w0, w1, t.base, sd)
    stroke(ctx, [[p[0] - w0 * 0.22, p[1] - w0 * 0.2], [q[0] - w1 * 0.22, q[1] - w1 * 0.2]],
      w0 * 0.34, w1 * 0.3, t.lit ?? t.base, sd + 1)
  }
  const k = blob(mid[0], mid[1], w * 0.72, w * 0.66, seed + 4, 0.16)
  fillShape(ctx, shrink(k, 1 + bleed / (w * 0.72), mid[0], mid[1]), INK)
  cel(ctx, k, t, { shade: terminator(k, SHADOW_DIR, SHADE, 0.16, seed + 4) })
}

/** A contact shadow, so nothing floats unintentionally. */
export const groundShadow = (
  ctx: CanvasRenderingContext2D, S: number, w: number, y = 1.02, a = 0.28
): void => {
  ctx.save()
  ctx.globalAlpha = a
  fillShape(ctx, blob(0, y * S, w * S, 0.1 * S, 21, 0.14), '#20141c')
  ctx.restore()
}

// ─── Locomotion ─────────────────────────────────────────────────────────────

/**
 * Walking is animated by MOVING parts, never by reshaping them.
 *
 * Every contour in this cast is generated from a seed and a handful of
 * constants. If `t` leaks into a seed, a radius or a wobble amplitude, the
 * silhouette boils from frame to frame — the body stops being the same body,
 * which is far more distracting than any stiffness in the gait. So the rule for
 * everything below is: the cycle produces TRANSLATIONS and JOINT ANGLES, and
 * the shapes they move are identical on every frame.
 */

/** Cycle position, 0..1. `offset` shifts one limb against another. */
export const gait = (t: number, periodMs: number, offset = 0): number =>
  (((t / periodMs + offset) % 1) + 1) % 1

/**
 * Where a foot sits relative to its neutral stance position.
 *
 * Stance takes 60% of the cycle — planted, sliding backwards at a CONSTANT
 * rate, because the ground does not accelerate. Swing takes the other 40%,
 * lifted and eased forward. The uneven split is what separates a walk from a
 * scissor motion: feet spend noticeably longer down than up.
 */
export const footStep = (phase: number, stride: number, lift: number): Pt => {
  const u = (((phase % 1) + 1) % 1)
  if (u < 0.6) {
    const k = u / 0.6
    return [stride * (0.5 - k), 0]
  }
  // Swing, as a cubic Hermite whose END TANGENTS MATCH the stance slide.
  //
  // Smoothstep was continuous in position but not in velocity: it has zero
  // slope at both ends, so the foot arrived at the plant already stationary
  // and then snapped to full ground speed in a single frame, and stopped dead
  // at toe-off. That discontinuity lands on exactly the two moments the eye is
  // watching the foot, and it is the classic "foot hitch". Matching tangents
  // lets the foot carry on backwards briefly as it lifts, then decelerate into
  // the plant.
  const k = (u - 0.6) / 0.4
  const k2 = k * k
  const k3 = k2 * k
  const m = -stride * (0.4 / 0.6)
  const x =
    (2 * k3 - 3 * k2 + 1) * (-0.5 * stride) +
    (k3 - 2 * k2 + k) * m +
    (-2 * k3 + 3 * k2) * (0.5 * stride) +
    (k3 - k2) * m
  return [x, -Math.sin(k * Math.PI) * lift]
}

/**
 * Vertical travel of the body over a cycle. Positive is DOWN, in canvas units.
 *
 * Two oscillations per cycle — the body dips once per footfall. A bob at leg
 * frequency reads as a limp.
 *
 * The phase matters and is easy to get wrong. Gait measurement puts the LOWEST
 * point at ~10% of the cycle (just after contact, during double support) and
 * the HIGHEST at ~35% (midstance, over the planted leg) — not at the contact
 * pose itself. Anchoring the dip to contact makes the character bounce on the
 * wrong beat, which reads as skipping rather than walking.
 *
 * Amplitude is the half-excursion. Measured human walking is ~2.5% of leg
 * length; stylised work runs 2–3× that, so ~4–5% of the hip-to-foot span here.
 */
export const bodyBob = (phase: number, amp: number): number =>
  amp * Math.cos(4 * Math.PI * (phase - 0.1))

/** Counter-swing for an arm or a head, at leg frequency. */
export const swing = (phase: number, amp: number): number =>
  Math.sin(phase * Math.PI * 2) * amp

/**
 * Lateral weight shift: which side the body has committed to, −1..1.
 *
 * ONE oscillation per cycle — half the bob's frequency, which is why a front
 * view reads as a slow roll under a faster bounce. It peaks over the planted
 * foot at ~30% of that foot's cycle, a quarter-cycle after its contact.
 *
 * A walk is a series of controlled falls: the body drops sideways onto the
 * landing leg and catches itself. Without the shift a front-view walk is two
 * legs pumping under a torso that never commits to either — the thing that
 * reads as marching in place. It is the single most-cited omission in bad
 * front-view walks.
 *
 * Counter-intuitively, sway DECREASES with speed while bob increases: heavy,
 * slow characters get more roll and less bounce.
 */
export const weightShift = (phase: number, amp: number): number =>
  Math.sin((phase - 0.05) * Math.PI * 2) * amp

/**
 * Pelvic obliquity for one hip, given ITS leg's phase. Positive is down.
 *
 * The pelvis tilts so the unsupported side drops — about 5° in a real walk.
 * Getting the sign backwards lifts the hip of the leg that is in the air,
 * which reads as a hitch.
 */
export const hipDrop = (phase: number, amp: number): number =>
  -Math.sin((phase - 0.05) * Math.PI * 2) * amp

/**
 * Knee position for a two-bone limb.
 *
 * Standard two-bone IK, with the reach clamped so the solution always exists.
 * A leg drawn through a FIXED mid-point stretches and snaps as the foot travels
 * — the most obvious artefact a procedural walk can have, and the reason this
 * is worth the trigonometry.
 */
export const ik = (hip: Pt, foot: Pt, l1: number, l2: number, bend = 1): Pt => {
  const dx = foot[0] - hip[0]
  const dy = foot[1] - hip[1]
  const raw = Math.hypot(dx, dy) || 1e-4
  const d = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(raw, l1 + l2 - 1e-4))
  const ux = dx / raw
  const uy = dy / raw
  const a = (d * d + l1 * l1 - l2 * l2) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  return [hip[0] + ux * a - uy * h * bend, hip[1] + uy * a + ux * h * bend]
}

export interface LimbStyle {
  /** Width at the hip, in world units. */
  width: number
  /** Width at the foot as a fraction of `width`. */
  taper?: number
  /** Dark bleed drawn under the limb — thin bone needs it to hold an edge. */
  outline?: number
  /** Joint swelling radius as a fraction of `width`. 0 omits it. */
  joint?: number
}

/**
 * A two-bone limb solved to reach `foot`. Returns the knee, so a caller can
 * hang a greave or a knee spike off it.
 *
 * `bend` sets which side of the hip→foot line the knee falls on. For a leg
 * hanging straight down, **+1 puts the knee to the LEFT (−x) and −1 to the
 * right**. Use `-Math.sign(hipX)` to bulge knees outward, which is what a
 * front-facing biped needs: get the sign backwards and both knees swing across
 * the centre line, and the character walks with its legs crossed.
 *
 * **Sizing the bones matters as much as the sign.** The knee is thrown
 * sideways by `sqrt(l² − (d/2)²)` where `d` is the hip-to-foot distance, so
 * slack bones do not read as "relaxed" — they read as a zigzag. For a gentle,
 * natural bend of about `0.09` units, size each bone to
 * `sqrt(0.09² + (d/2)²)`, i.e. only a few percent longer than half the span.
 * Bones at `0.6 × d` throw the knee out by a quarter of the leg's length, which
 * is what makes procedural legs look broken even when the gait timing is right.
 */
export const limb = (
  ctx: CanvasRenderingContext2D, hip: Pt, foot: Pt,
  l1: number, l2: number, bend: number,
  t: CelTones, seed: number, style: LimbStyle
): Pt => {
  const knee = ik(hip, foot, l1, l2, bend)
  const w = style.width
  const taper = style.taper ?? 0.62
  const ol = style.outline ?? 0
  const mid = w * (1 + taper) / 2

  for (const [p, q, w0, w1, sd] of [
    [hip, knee, w, mid, seed],
    [knee, foot, mid, w * taper, seed + 2]
  ] as const) {
    if (ol > 0) stroke(ctx, [p, q], w0 + ol, w1 + ol, INK, sd)
    stroke(ctx, [p, q], w0, w1, t.base, sd)
    stroke(ctx, [
      [p[0] - w0 * 0.22, p[1] - w0 * 0.2],
      [q[0] - w1 * 0.22, q[1] - w1 * 0.2]
    ], w0 * 0.34, w1 * 0.3, t.lit ?? t.base, sd + 1)
  }

  const jr = (style.joint ?? 0.6) * w
  if (jr > 0) {
    const k = blob(knee[0], knee[1], jr, jr * 0.92, seed + 4, 0.16)
    if (ol > 0) fillShape(ctx, shrink(k, 1 + ol / jr, knee[0], knee[1]), INK)
    cel(ctx, k, t, { shade: terminator(k, SHADOW_DIR, SHADE, 0.16, seed + 4) })
  }
  return knee
}

/**
 * A foot: a pad with toes fanned along `dir`.
 *
 * A limb that ends in a point reads as a stilt. Whatever else a character has,
 * something has to sit ON the ground.
 */
export const clawFoot = (
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number,
  dir: number, t: CelTones, seed: number, toes = 3, claw = '#f0e6d0'
): void => {
  const cx = x + Math.cos(dir) * size * 0.18
  const pad = blob(cx, y - size * 0.1, size * 0.52, size * 0.34, seed, 0.16)
  for (let i = 0; i < toes; i++) {
    const a = dir + ((i - (toes - 1) / 2) / Math.max(1, toes - 1)) * 1.1
    const tip: Pt = [cx + Math.cos(a) * size * 0.9, y + Math.abs(Math.sin(a)) * size * 0.12]
    stroke(ctx, [[cx, y - size * 0.06], tip], size * 0.28, size * 0.13, t.base, seed + 10 + i)
    stroke(ctx, [tip, [tip[0] + Math.cos(a) * size * 0.26, tip[1] + size * 0.06]],
      size * 0.12, size * 0.02, claw, seed + 20 + i)
  }
  cel(ctx, pad, t, { shade: terminator(pad, SHADOW_DIR, SHADE, 0.16, seed + 1) })
  ink(ctx, pad, { width: size * 0.14, color: INK, seed: seed + 2, breakUp: 0.3 })
}

/** A point on a contour, with the outward normal there. */
export interface OnContour { p: Pt; n: Pt }

/**
 * Sample positions and outward normals along part of a contour.
 *
 * Anything that grows out of a body — spines, bristles, flames, fur, feathers —
 * has to be anchored to the silhouette. Laying such things out along a straight
 * line and hoping it tracks the back is what leaves them floating off the form,
 * or worse, sunk inside it: the line and the contour diverge the moment the
 * body curves, and they diverge differently on every frame of a walk.
 *
 * The winding is detected rather than assumed. `blob` runs one way round and an
 * authored polygon may run the other; a hard-coded normal formula silently
 * points INWARD for half the shapes in the cast, which is a bug that looks like
 * an art problem.
 *
 * `from`/`to` are normalised positions around the contour.
 */
export const contourPoints = (
  pts: Pt[], from: number, to: number, count: number
): OnContour[] => {
  const dense = densify(pts, 6)
  const n = dense.length
  // Shoelace sign tells us which way this contour is wound.
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = dense[i]!
    const b = dense[(i + 1) % n]!
    area += a[0] * b[1] - b[0] * a[1]
  }
  const flip = area > 0 ? 1 : -1

  const out: OnContour[] = []
  for (let i = 0; i < count; i++) {
    const u = from + (to - from) * ((i + 0.5) / count)
    const idx = Math.round((((u % 1) + 1) % 1) * n) % n
    const prev = dense[(idx - 3 + n) % n]!
    const next = dense[(idx + 3) % n]!
    const tx = next[0] - prev[0]
    const ty = next[1] - prev[1]
    const l = Math.hypot(tx, ty) || 1
    out.push({ p: dense[idx]!, n: [(ty / l) * flip, (-tx / l) * flip] })
  }
  return out
}

/** Spikes, bristles or quills placed ON a contour and aimed along its normal. */
export const spines = (
  ctx: CanvasRenderingContext2D, pts: Pt[],
  from: number, to: number, count: number,
  len: number, width: number, color: (i: number) => string,
  seed: number, jitter = 0.45, sink = 0.25
): void => {
  contourPoints(pts, from, to, count).forEach(({ p, n }, i) => {
    const [nx, ny] = n
    const h = len * (0.55 + noise2(i * 1.9, seed, seed) * 0.85)
    const lean = (noise2(i * 2.7, seed + 3, seed) - 0.5) * jitter
    // Root the base slightly INSIDE the body, so no spine shows daylight under
    // it when the contour wobbles.
    stroke(ctx, [
      [p[0] - nx * width * sink, p[1] - ny * width * sink],
      [p[0] + (nx - lean * ny) * h, p[1] + (ny + lean * nx) * h]
    ], width, width * 0.1, color(i), seed + i)
  })
}

/**
 * Rigidly transform authored points into world space.
 *
 * Mirroring here rather than with `ctx.scale(-1, 1)` matters: a mirrored canvas
 * also mirrors the shading, so a left wing ends up lit from the right and the
 * cast's shared key light breaks on exactly the characters where it shows most.
 */
export const pivot = (pts: Pt[], cx: number, cy: number, a: number, mirror = 1): Pt[] =>
  pts.map(([x, y]) => {
    const lx = x * mirror
    return [
      cx + lx * Math.cos(a) - y * Math.sin(a),
      cy + lx * Math.sin(a) + y * Math.cos(a)
    ] as Pt
  })
