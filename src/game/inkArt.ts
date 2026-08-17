/**
 * ─── Hand-drawn ink & cel-shading toolkit ───────────────────────────────────
 *
 * Everything in `useTowerArt.ts` is drawn with clean primitives — perfect arcs,
 * even strokes, smooth gradients. That is fast and readable at 20 px, and it is
 * also exactly why it reads as PROGRAMMATIC. A machine draws a circle; a person
 * draws a nearly-circle, with a line that swells where the hand pressed and
 * thins where it lifted, and a shadow that was decided rather than derived.
 *
 * This module supplies the four tells that actually sell "hand-drawn":
 *
 *   1. **Variable-weight ink.** Outlines are not strokes — they are filled
 *      ribbons whose width is a function of position, so a line can be heavy
 *      under a jaw and hairline over a brow. This is the single biggest
 *      difference between an illustration and a diagram.
 *   2. **Line breaks.** Real ink lifts. Outlines drop out on the lit side and
 *      reconnect, which reads as a confident stroke rather than a border.
 *   3. **Wobble.** Every contour is perturbed by smooth, deterministic noise,
 *      so nothing is a true ellipse and no two edges are parallel.
 *   4. **Cel shading with AUTHORED shadow shapes.** Shadows are hard-edged and
 *      drawn as their own geometry, not computed from a light vector. That is
 *      what an animation cel painter does, and it is why cel art looks designed
 *      instead of lit.
 *
 * All noise is seeded and deterministic: a monster looks the same every frame
 * and on every device, so an idle animation doesn't shimmer.
 */

export type Pt = [number, number]

// ─── Noise ──────────────────────────────────────────────────────────────────

const hash2 = (x: number, y: number, seed: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number): number => t * t * (3 - 2 * t)

/** Smooth 2-D value noise in 0..1. Sampled on a circle to make a seamless loop. */
export const noise2 = (x: number, y: number, seed = 0): number => {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = smooth(x - xi)
  const yf = smooth(y - yi)
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf
}

/** Signed wobble in −1..1. */
const wob = (x: number, y: number, seed: number): number => noise2(x, y, seed) * 2 - 1

// ─── Contours ───────────────────────────────────────────────────────────────

/**
 * A closed, wobbled blob.
 *
 * Noise is sampled on a CIRCLE of radius `freq` rather than on the angle, so the
 * first and last samples agree and the contour closes without a seam — the give
 * -away that a shape was generated rather than drawn.
 */
export const blob = (
  cx: number, cy: number, rx: number, ry: number,
  seed: number, amount = 0.07, freq = 1.9, n = 72
): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = 1 + wob(Math.cos(a) * freq + 8, Math.sin(a) * freq + 8, seed) * amount
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r])
  }
  return pts
}

/** An egg / teardrop: `taper` < 1 pinches the top, > 1 pinches the bottom. */
export const egg = (
  cx: number, cy: number, rx: number, ry: number,
  taper: number, seed: number, amount = 0.06, n = 72
): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const sy = Math.sin(a)
    // Narrow the horizontal radius as we climb, which is what turns a circle
    // into something with a jaw and a crown.
    const squeeze = 1 - (1 - taper) * Math.max(0, -sy)
    const r = 1 + wob(Math.cos(a) * 1.7 + 3, sy * 1.7 + 3, seed) * amount
    pts.push([cx + Math.cos(a) * rx * squeeze * r, cy + sy * ry * r])
  }
  return pts
}

/** Wobble an authored polygon along its own normals. */
export const rough = (pts: Pt[], amount: number, seed: number, freq = 0.9): Pt[] => {
  const n = pts.length
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n]!
    const next = pts[(i + 1) % n]!
    const tx = next[0] - prev[0]
    const ty = next[1] - prev[1]
    const len = Math.hypot(tx, ty) || 1
    const d = wob(i * freq, seed * 0.37, seed) * amount
    return [p[0] - (ty / len) * d, p[1] + (tx / len) * d] as Pt
  })
}

/**
 * Sharpen an authored polygon so `trace` keeps its corners.
 *
 * `trace` runs a quadratic through the MIDPOINT of each edge using the vertex
 * as the control point, which rounds every corner by half the edge length.
 * That is exactly right for a jaw or a haunch, and exactly wrong for anything
 * built by hand out of straight timber: a four-point casemate comes out as an
 * oval and a plank tower as a brown egg.
 *
 * Doubling a point in close on either side of each vertex leaves the smoothing
 * almost no distance to work with, so the curve hugs the corner. That lets hard
 * subjects — siege engines, armour plate — share every other primitive here
 * with the creature cast instead of needing a parallel set of their own.
 */
export const hard = (pts: Pt[], k = 0.1): Pt[] => {
  const n = pts.length
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!
    const cur = pts[i]!
    const next = pts[(i + 1) % n]!
    out.push([cur[0] + (prev[0] - cur[0]) * k, cur[1] + (prev[1] - cur[1]) * k])
    out.push([cur[0], cur[1]])
    out.push([cur[0] + (next[0] - cur[0]) * k, cur[1] + (next[1] - cur[1]) * k])
  }
  return out
}

/** Uniform scale about a point — used to derive shadow / highlight shapes. */
export const shrink = (pts: Pt[], k: number, ox = 0, oy = 0): Pt[] =>
  pts.map(([x, y]) => [ox + (x - ox) * k, oy + (y - oy) * k] as Pt)

export const shift = (pts: Pt[], dx: number, dy: number): Pt[] =>
  pts.map(([x, y]) => [x + dx, y + dy] as Pt)

// ─── Tracing ────────────────────────────────────────────────────────────────

/**
 * Trace a point list as a smooth closed curve.
 *
 * Quadratics through the midpoints: every authored point becomes a control
 * point rather than a vertex, so the contour has no corners unless one was
 * asked for. Straight polylines are the other classic "generated" tell.
 */
export const trace = (ctx: CanvasRenderingContext2D, pts: Pt[]): void => {
  const n = pts.length
  if (n < 3) return
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const start = mid(pts[n - 1]!, pts[0]!)
  ctx.moveTo(start[0], start[1])
  for (let i = 0; i < n; i++) {
    const cur = pts[i]!
    const nxt = pts[(i + 1) % n]!
    const m = mid(cur, nxt)
    ctx.quadraticCurveTo(cur[0], cur[1], m[0], m[1])
  }
  ctx.closePath()
}

/**
 * Resample a contour along the curve `trace` would draw.
 *
 * Authored polygons are deliberately sparse — a jaw is five points — but that
 * makes any per-point operation (accents, partial runs) snap to straight
 * chords, which is exactly the machine-drawn look this module exists to avoid.
 */
export const densify = (pts: Pt[], per = 6): Pt[] => {
  const n = pts.length
  if (n < 3) return pts.slice()
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const c = pts[i]!
    const a = mid(pts[(i - 1 + n) % n]!, c)
    const b = mid(c, pts[(i + 1) % n]!)
    for (let k = 0; k < per; k++) {
      const u = k / per
      const v = 1 - u
      out.push([
        v * v * a[0] + 2 * v * u * c[0] + u * u * b[0],
        v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]
      ])
    }
  }
  return out
}

export const fillShape = (ctx: CanvasRenderingContext2D, pts: Pt[], color: string): void => {
  ctx.beginPath()
  trace(ctx, pts)
  ctx.fillStyle = color
  ctx.fill()
}

// ─── Ink ────────────────────────────────────────────────────────────────────

export interface InkOptions {
  /** Peak line width, in the same units as the points. */
  width: number
  color?: string
  /**
   * Weight profile. Receives the normalised position around the contour and the
   * outward normal angle; returns a multiplier. The default swings roughly 6×
   * between the lit crown and the shadowed underside.
   *
   * The RANGE is what matters. A line that varies 2× still reads as a border
   * with a wobble; one that varies 6× reads as a nib under changing pressure.
   */
  weight?: (t: number, normalAngle: number) => number
  /** 0 = unbroken line. Higher lifts the pen more often on the lit side. */
  breakUp?: number
  seed?: number
}

/**
 * Draw a contour as INK: a filled ribbon of varying width, with gaps.
 *
 * A stroked path has one weight everywhere and closes perfectly. Neither is
 * true of a drawn line, and the eye notices — that uniformity is most of what
 * makes procedural art feel procedural.
 */
export const ink = (ctx: CanvasRenderingContext2D, pts: Pt[], o: InkOptions): void => {
  const n = pts.length
  if (n < 3) return
  const seed = o.seed ?? 1
  const color = o.color ?? '#1a1220'
  const breakUp = o.breakUp ?? 0
  // Down-facing normals carry the weight (the form's underside), and a slow
  // noise term keeps the swell from tracking the geometry too obediently.
  const weight = o.weight ?? ((t, na) => {
    const down = (Math.sin(na) + 1) / 2
    return 0.12 + 1.05 * down * down + noise2(t * 5.5, seed * 0.7, seed) * 0.28
  })

  // Per-point half-width and outward normal.
  const half: number[] = []
  const nrm: Pt[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!
    const next = pts[(i + 1) % n]!
    const tx = next[0] - prev[0]
    const ty = next[1] - prev[1]
    const len = Math.hypot(tx, ty) || 1
    const nx = ty / len
    const ny = -tx / len
    nrm.push([nx, ny])
    const t = i / n
    const jitter = 0.7 + noise2(i * 0.9, seed * 1.3, seed) * 0.7
    half.push(Math.max(0, (o.width * weight(t, Math.atan2(ny, nx)) * jitter) / 2))
  }

  // Where the pen lifts. Gaps are biased to the lit side (normal pointing up),
  // which is where an inker naturally lets the form open out.
  const keep: boolean[] = []
  for (let i = 0; i < n; i++) {
    if (breakUp <= 0) { keep.push(true); continue }
    const up = Math.max(0, -nrm[i]![1])
    const g = noise2(i * 0.31, seed * 2.1 + 5, seed)
    keep.push(g > breakUp * up * 0.9)
  }

  ctx.fillStyle = color
  let i = 0
  let guard = 0
  while (i < n && guard++ < n * 2) {
    if (!keep[i]) { i++; continue }
    // Collect a contiguous run.
    const run: number[] = []
    let j = i
    while (j < n && keep[j]) { run.push(j); j++ }
    i = j
    if (run.length < 2) continue

    // Taper each run to nothing at both ends. A ribbon that stops at full width
    // reads as a chopped segment; one that thins away reads as the pen lifting,
    // which is the single cheapest way to make a break look intentional.
    const fade = (k: number): number => {
      const ramp = Math.min(5, Math.floor(run.length / 2))
      if (ramp <= 0) return 1
      const d = Math.min(k, run.length - 1 - k)
      const u = Math.min(1, d / ramp)
      return u * u * (3 - 2 * u)
    }

    ctx.beginPath()
    // Outward edge forward…
    for (let k = 0; k < run.length; k++) {
      const idx = run[k]!
      const hw = half[idx]! * fade(k)
      const x = pts[idx]![0] + nrm[idx]![0] * hw
      const y = pts[idx]![1] + nrm[idx]![1] * hw
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    // …inward edge back, closing the ribbon.
    for (let k = run.length - 1; k >= 0; k--) {
      const idx = run[k]!
      const hw = half[idx]! * fade(k)
      ctx.lineTo(pts[idx]![0] - nrm[idx]![0] * hw, pts[idx]![1] - nrm[idx]![1] * hw)
    }
    ctx.closePath()
    ctx.fill()
  }

}

/**
 * A heavy accent line along PART of a contour.
 *
 * Where two forms meet — an ear against a skull, a limb against a torso — an
 * illustrator lays in a thick dark note rather than relying on the outline of
 * each piece. Without it, overlapping shapes read as stickers on top of one
 * another instead of as one body.
 *
 * `from`/`to` are normalised positions around the contour.
 */
export const occlude = (
  ctx: CanvasRenderingContext2D, pts: Pt[],
  from: number, to: number, width: number, color = 'rgba(28,20,24,0.85)', seed = 5
): void => {
  const dense = densify(pts, 8)
  const n = dense.length
  const a = Math.round(from * n)
  const b = Math.round(to * n)
  const run: Pt[] = []
  for (let i = a; i <= b; i++) run.push(dense[((i % n) + n) % n]!)
  if (run.length < 2) return
  // Thin at both ends: an accent that starts and stops at full weight reads as
  // a seam between two shapes, which is the opposite of the intent.
  const h = Math.floor(run.length / 2)
  stroke(ctx, run.slice(0, h + 1), width * 0.12, width, color, seed)
  stroke(ctx, run.slice(h), width, width * 0.12, color, seed + 1)
}

/**
 * A free ink stroke through a point list (open, not closed).
 *
 * `t0`/`t1` are the half-widths at each end, so a stroke can be nocked thin and
 * swell into the body of the line — the mark a real nib leaves.
 */
export const stroke = (
  ctx: CanvasRenderingContext2D, pts: Pt[],
  w0: number, w1: number, color = '#1a1220', seed = 3
): void => {
  const n = pts.length
  if (n < 2) return
  const half: number[] = []
  const nrm: Pt[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)]!
    const next = pts[Math.min(n - 1, i + 1)]!
    const tx = next[0] - prev[0]
    const ty = next[1] - prev[1]
    const len = Math.hypot(tx, ty) || 1
    nrm.push([ty / len, -tx / len])
    const t = i / (n - 1)
    // Ease the taper so the swell sits in the belly of the stroke, and let the
    // noise bite so no two strokes share a profile.
    const belly = Math.sin(Math.PI * t) * 0.35 + 1
    const j = 0.85 + noise2(i * 0.7, seed * 3.1, seed) * 0.3
    half.push(Math.max(0.0004, ((w0 + (w1 - w0) * t) * belly * j) / 2))
  }
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const x = pts[i]![0] + nrm[i]![0] * half[i]!
    const y = pts[i]![1] + nrm[i]![1] * half[i]!
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  for (let i = n - 1; i >= 0; i--) {
    ctx.lineTo(pts[i]![0] - nrm[i]![0] * half[i]!, pts[i]![1] - nrm[i]![1] * half[i]!)
  }
  ctx.closePath()
  ctx.fill()
}

// ─── Cel painting ───────────────────────────────────────────────────────────

export interface CelTones {
  base: string
  shade: string
  deep?: string
  lit?: string
}

/**
 * Paint one body part.
 *
 * Shadow and highlight are passed in as AUTHORED shapes rather than derived
 * from a light vector. That is the whole difference between cel art and a
 * shader: a painter decides where the shadow reads best, and it lands on a hard
 * edge that follows the drawing rather than the geometry.
 */
export const cel = (
  ctx: CanvasRenderingContext2D,
  shape: Pt[],
  tones: CelTones,
  parts?: { shade?: Pt[]; deep?: Pt[]; lit?: Pt[] }
): void => {
  ctx.save()
  ctx.beginPath()
  trace(ctx, shape)
  ctx.clip()
  fillShape(ctx, shape, tones.base)
  if (parts?.shade) fillShape(ctx, parts.shade, tones.shade)
  if (parts?.deep && tones.deep) fillShape(ctx, parts.deep, tones.deep)
  if (parts?.lit && tones.lit) fillShape(ctx, parts.lit, tones.lit)
  ctx.restore()
}

/**
 * The shadow side of a form, as a hard-edged region.
 *
 * `shrink`+`shift` gives a crescent hugging the contour — a rim shadow, which
 * reads as an airbrushed blob because it follows the outline instead of
 * crossing the form. What a cel painter actually draws is a TERMINATOR: one
 * decisive wobbled line cutting the shape into lit and unlit, with the value
 * jump landing mid-form where the eye reads it as structure.
 *
 * Returns a half-plane polygon; `cel` clips it to the part, so the boundary is
 * the only edge that shows.
 *
 * @param angle  direction the shadow lies in, radians (π/2 ≈ below).
 * @param offset −1..1 along that axis; higher pushes the shadow back, so less
 *               of the form is dark.
 */
export const terminator = (
  shape: Pt[], angle: number, offset = 0, amp = 0.1, seed = 11, n = 20
): Pt[] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of shape) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const R = Math.max(x1 - x0, y1 - y0) * 0.8 || 1
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  // Perpendicular: the axis the boundary runs along.
  const px = -dy
  const py = dx

  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const k = (i / n) * 2 - 1
    const d = (offset + wob(k * 2.1 + 4, seed * 0.53, seed) * amp) * R
    pts.push([cx + px * k * R * 1.6 + dx * d, cy + py * k * R * 1.6 + dy * d])
  }
  // Sweep far out on the shadow side and close.
  pts.push([cx + px * R * 1.6 + dx * R * 2.5, cy + py * R * 1.6 + dy * R * 2.5])
  pts.push([cx - px * R * 1.6 + dx * R * 2.5, cy - py * R * 1.6 + dy * R * 2.5])
  return pts
}

// ─── Palette ────────────────────────────────────────────────────────────────

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

const toHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number]
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  const d = mx - mn
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  let h: number
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (mx === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

const fromHsl = (h: number, s: number, l: number): string => {
  const hh = ((h % 360) + 360) % 360 / 360
  if (s === 0) return rgbToHex(l * 255, l * 255, l * 255)
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const ch = (t: number): number => {
    let u = t
    if (u < 0) u += 1
    if (u > 1) u -= 1
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  return rgbToHex(ch(hh + 1 / 3) * 255, ch(hh) * 255, ch(hh - 1 / 3) * 255)
}

/** Rotate a hue toward `target` by `amount` degrees, along the shorter arc. */
const towardHue = (h: number, target: number, amount: number): number => {
  let d = ((target - h + 540) % 360) - 180
  if (Math.abs(d) < amount) return target
  return h + Math.sign(d) * amount
}

/**
 * Derive a four-step cel ramp from ONE base colour.
 *
 * Hand-picking `shade`/`deep`/`lit` per character is how a cast ends up with
 * ten different lighting models — one creature's shadow a flat darkening, the
 * next's a hue shift, a third's barely there. Deriving them fixes the step
 * sizes, and fixes the two rules that make painted shadows look painted:
 *
 *   * shadows rotate toward violet and gain saturation;
 *   * light rotates toward warm yellow and loses it.
 *
 * `contrast` scales the value steps — lower for translucent or hazy subjects
 * that should stay soft, higher for hard surfaces like plate and bone.
 */
export const tones = (base: string, contrast = 1): Required<CelTones> => {
  const [h, s, l] = toHsl(base)
  return {
    base,
    shade: fromHsl(towardHue(h, 268, 10), Math.min(1, s + 0.05), Math.max(0.02, l - 0.13 * contrast)),
    deep: fromHsl(towardHue(h, 268, 20), Math.min(1, s + 0.09), Math.max(0.01, l - 0.23 * contrast)),
    lit: fromHsl(towardHue(h, 46, 9), Math.max(0, s - 0.07), Math.min(0.97, l + 0.12 * contrast))
  }
}

/**
 * Cross-hatching inside a shape.
 *
 * Hand-drawn shading reads as MARKS, not as a tint. A few strokes in the core
 * shadow do more for the illustrated feel than another tone band would.
 */
export const hatch = (
  ctx: CanvasRenderingContext2D, region: Pt[],
  angle: number, spacing: number, width: number, color: string, seed = 7
): void => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const [x, y] of region) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const span = Math.hypot(maxX - minX, maxY - minY)

  ctx.save()
  ctx.beginPath()
  trace(ctx, region)
  ctx.clip()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.fillStyle = color
  let k = 0
  for (let y = -span; y <= span; y += spacing) {
    k++
    // Vary weight and length per line, and skip the odd one — a ruled grid is
    // the fastest way to lose the hand-drawn read.
    if (noise2(k * 1.7, seed, seed) < 0.18) continue
    const w = width * (0.65 + noise2(k * 0.9, seed + 3, seed) * 0.8)
    const inset = span * noise2(k * 2.3, seed + 9, seed) * 0.25
    ctx.fillRect(-span + inset, y, span * 2 - inset * 2, w)
  }
  ctx.restore()
}

// ─── Paper ──────────────────────────────────────────────────────────────────

/** Speckled grain over the whole card, so flat fills read as printed ink. */
export const grain = (
  ctx: CanvasRenderingContext2D, w: number, h: number, amount = 0.05, seed = 11
): void => {
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  const step = 3
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const v = noise2(x * 0.21, y * 0.21, seed)
      if (v > 0.62) continue
      ctx.fillStyle = `rgba(90,70,60,${(0.62 - v) * amount})`
      ctx.fillRect(x, y, step, step)
    }
  }
  ctx.restore()
}
