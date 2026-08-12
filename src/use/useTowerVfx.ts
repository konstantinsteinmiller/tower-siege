import { ref } from 'vue'

/**
 * ─── VFX: event bus + pooled particle system ────────────────────────────────
 *
 * The simulation never touches pixels. It pushes semantic events ("a block
 * shattered here", "lightning forked along these points") into a ring buffer;
 * the renderer drains that buffer once per frame and converts events into
 * particles, decals, screen shake and sound.
 *
 * PERFORMANCE: particles live in flat typed arrays with a free-list, so a
 * 900-particle burst allocates nothing. Draw order is bucketed by blend mode so
 * the canvas context switches `globalCompositeOperation` exactly twice per
 * frame instead of once per particle.
 */

// ─── Events ─────────────────────────────────────────────────────────────────

export type FxEvent =
  | { kind: 'place'; x: number; y: number; palette: string }
  | { kind: 'sell'; x: number; y: number }
  | { kind: 'blockHit'; x: number; y: number; amount: number }
  | { kind: 'shatter'; x: number; y: number; palette: string }
  | { kind: 'explosion'; x: number; y: number; radius: number }
  | { kind: 'impact'; x: number; y: number; kindOf: string; angle: number }
  | { kind: 'muzzle'; x: number; y: number; angle: number; palette: string }
  | { kind: 'lightning'; x: number; y: number; points: number[] }
  | { kind: 'enemyHit'; x: number; y: number; amount: number; gore: string; dir: number }
  | { kind: 'enemyDie'; x: number; y: number; palette: string; coins: number; boss: boolean }
  | { kind: 'enemyAttack'; x: number; y: number; tx: number; ty: number; ranged: boolean; gore: string }
  | { kind: 'collapse'; x: number; y: number; count: number }
  | { kind: 'waveStart'; x: number; y: number; wave: number; boss: boolean }
  | { kind: 'waveClear'; x: number; y: number; wave: number }
  | { kind: 'coinPayout'; x: number; y: number; amount: number }
  | { kind: 'thorns'; x: number; y: number }
  /** A round bounced off something immune to it — the "arrows do nothing" tell. */
  | { kind: 'deflect'; x: number; y: number }
  /** Orphaned rubble hit something. `impact` is 0..1 of a lethal fall. */
  | { kind: 'blockLand'; x: number; y: number; impact: number; palette: string }
  /** Falling rubble caught an enemy. A boss is shoved clear; anything else dies. */
  | { kind: 'crush'; x: number; y: number; palette: string; boss: boolean }
  /** A bomber released a round; `fire` distinguishes a molotov from a bomb. */
  | { kind: 'bombDrop'; x: number; y: number; fire: boolean }
  /** A molotov landed: blast plus a lingering pool of flame. */
  | { kind: 'firebomb'; x: number; y: number; radius: number }
  | { kind: 'siegeShot'; x: number; y: number; tx: number; ty: number }
  | { kind: 'cavalryOut'; x: number; y: number; dir: 1 | -1 }
  | { kind: 'allyStrike'; x: number; y: number; tx: number; ty: number }
  | { kind: 'allyDown'; x: number; y: number }
  | { kind: 'allyLeave'; x: number; y: number }
  | { kind: 'gateFell'; x: number; y: number }

// Ring buffer. Events are produced during a tick and consumed the same frame;
// a generous cap means a catastrophic collapse can't drop the events that
// matter while still bounding memory.
const FX_CAPACITY = 512
const fxQueue: FxEvent[] = []

export const pushFx = (event: FxEvent): void => {
  if (fxQueue.length >= FX_CAPACITY) fxQueue.shift()
  fxQueue.push(event)
}

/** Drain every queued event. The renderer calls this once per frame. */
export const drainFx = (): FxEvent[] => {
  if (fxQueue.length === 0) return EMPTY_FX
  const out = fxQueue.slice()
  fxQueue.length = 0
  return out
}
const EMPTY_FX: FxEvent[] = []

// ─── Quality tiers ──────────────────────────────────────────────────────────

export type QualityTier = 'high' | 'medium' | 'low'

/** Live quality tier, driven by a rolling FPS average. Exposed so the HUD can
 *  surface it in debug mode and the renderer can skip expensive passes. */
export const quality = ref<QualityTier>('high')

const TIER_CAPACITY: Record<QualityTier, number> = { high: 900, medium: 500, low: 220 }

let fpsAccum = 0
let fpsFrames = 0
let tierHoldUntil = 0

/**
 * Feed the frame time; every 60 frames, re-evaluate the tier. Hysteresis (a
 * 2.5 s hold after any change) stops the renderer oscillating between tiers on
 * a device sitting right at a threshold, which would look worse than either
 * tier on its own.
 */
export const sampleFrame = (dtMs: number): void => {
  if (dtMs <= 0) return
  fpsAccum += 1000 / dtMs
  fpsFrames++
  if (fpsFrames < 60) return

  const avg = fpsAccum / fpsFrames
  fpsAccum = 0
  fpsFrames = 0

  const now = Date.now()
  if (now < tierHoldUntil) return

  const next: QualityTier = avg >= 55 ? 'high' : avg >= 40 ? 'medium' : 'low'
  if (next !== quality.value) {
    quality.value = next
    tierHoldUntil = now + 2500
  }
}

// ─── Particle pool ──────────────────────────────────────────────────────────

const MAX_PARTICLES = 900

// Structure-of-arrays: one contiguous buffer per attribute keeps the hot loop
// cache-friendly and free of per-particle object churn.
const px = new Float32Array(MAX_PARTICLES)
const py = new Float32Array(MAX_PARTICLES)
const pvx = new Float32Array(MAX_PARTICLES)
const pvy = new Float32Array(MAX_PARTICLES)
const plife = new Float32Array(MAX_PARTICLES)
const pmax = new Float32Array(MAX_PARTICLES)
const psize = new Float32Array(MAX_PARTICLES)
const pgrav = new Float32Array(MAX_PARTICLES)
const pdrag = new Float32Array(MAX_PARTICLES)
const prot = new Float32Array(MAX_PARTICLES)
const pvrot = new Float32Array(MAX_PARTICLES)
/** 0 = normal blend, 1 = additive. */
const padd = new Uint8Array(MAX_PARTICLES)
/** 0 = soft round, 1 = shard/quad, 2 = spark streak, 3 = smoke puff. */
const pshape = new Uint8Array(MAX_PARTICLES)
const pr = new Uint8Array(MAX_PARTICLES)
const pg = new Uint8Array(MAX_PARTICLES)
const pb = new Uint8Array(MAX_PARTICLES)
const palpha = new Float32Array(MAX_PARTICLES)

let liveCount = 0

export interface EmitOptions {
  x: number
  y: number
  vx?: number
  vy?: number
  life: number
  size: number
  color: [number, number, number]
  alpha?: number
  gravity?: number
  drag?: number
  additive?: boolean
  shape?: 0 | 1 | 2 | 3
  rot?: number
  vrot?: number
}

/**
 * Spawn one particle. Over-capacity spawns recycle the OLDEST slot rather than
 * being dropped, so a big explosion always reads as a big explosion — it just
 * cuts the tail of whatever came before it.
 */
export const emit = (o: EmitOptions): void => {
  const cap = TIER_CAPACITY[quality.value]
  let i: number
  if (liveCount < cap) {
    i = liveCount++
  } else {
    i = oldestIndex()
  }
  px[i] = o.x
  py[i] = o.y
  pvx[i] = o.vx ?? 0
  pvy[i] = o.vy ?? 0
  plife[i] = o.life
  pmax[i] = o.life
  psize[i] = o.size
  pgrav[i] = o.gravity ?? 0
  pdrag[i] = o.drag ?? 0
  prot[i] = o.rot ?? 0
  pvrot[i] = o.vrot ?? 0
  padd[i] = o.additive ? 1 : 0
  pshape[i] = o.shape ?? 0
  pr[i] = o.color[0]
  pg[i] = o.color[1]
  pb[i] = o.color[2]
  palpha[i] = o.alpha ?? 1
}

const oldestIndex = (): number => {
  let best = 0
  let bestLife = Infinity
  for (let i = 0; i < liveCount; i++) {
    if (plife[i]! < bestLife) { bestLife = plife[i]!; best = i }
  }
  return best
}

/** Integrate every live particle and compact dead ones out with a swap-remove
 *  (O(1) per removal, no array churn). */
export const stepParticles = (dtMs: number): void => {
  const dt = dtMs / 1000
  for (let i = liveCount - 1; i >= 0; i--) {
    plife[i]! -= dtMs
    if (plife[i]! <= 0) {
      // Swap-remove: move the last live particle into this slot.
      const last = liveCount - 1
      if (i !== last) {
        px[i] = px[last]!; py[i] = py[last]!
        pvx[i] = pvx[last]!; pvy[i] = pvy[last]!
        plife[i] = plife[last]!; pmax[i] = pmax[last]!
        psize[i] = psize[last]!; pgrav[i] = pgrav[last]!
        pdrag[i] = pdrag[last]!; prot[i] = prot[last]!
        pvrot[i] = pvrot[last]!; padd[i] = padd[last]!
        pshape[i] = pshape[last]!
        pr[i] = pr[last]!; pg[i] = pg[last]!; pb[i] = pb[last]!
        palpha[i] = palpha[last]!
      }
      liveCount--
      continue
    }
    pvy[i]! -= pgrav[i]! * dt
    if (pdrag[i]! > 0) {
      const d = Math.max(0, 1 - pdrag[i]! * dt)
      pvx[i]! *= d
      pvy[i]! *= d
    }
    px[i]! += pvx[i]! * dt
    py[i]! += pvy[i]! * dt
    prot[i]! += pvrot[i]! * dt
  }
}

export const particleCount = (): number => liveCount

export const clearParticles = (): void => { liveCount = 0 }

/**
 * Draw every particle. `toX` / `toY` project world→screen and `scale` is
 * px-per-cell, so particles live in world space and zoom correctly with the
 * camera.
 *
 * Two passes: normal-blend first, then a single switch to `lighter` for the
 * additive bucket. Sorting by blend mode rather than by depth costs nothing
 * visually here (particles are short-lived and overlapping) and saves ~N
 * context state changes per frame.
 */
export const drawParticles = (
  ctx: CanvasRenderingContext2D,
  toX: (wx: number) => number,
  toY: (wy: number) => number,
  scale: number
): void => {
  if (liveCount === 0) return
  drawBucket(ctx, toX, toY, scale, 0)
  ctx.globalCompositeOperation = 'lighter'
  drawBucket(ctx, toX, toY, scale, 1)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

const drawBucket = (
  ctx: CanvasRenderingContext2D,
  toX: (wx: number) => number,
  toY: (wy: number) => number,
  scale: number,
  additive: 0 | 1
): void => {
  for (let i = 0; i < liveCount; i++) {
    if (padd[i] !== additive) continue
    const t = plife[i]! / pmax[i]!
    // Ease-out fade so particles thin gracefully instead of blinking out.
    const a = palpha[i]! * (t < 0.25 ? t / 0.25 : 1) * Math.min(1, t * 1.6)
    if (a <= 0.01) continue

    const sx = toX(px[i]!)
    const sy = toY(py[i]!)
    const size = Math.max(0.6, psize[i]! * scale * (0.55 + t * 0.45))

    ctx.globalAlpha = a
    const col = `rgb(${pr[i]},${pg[i]},${pb[i]})`

    switch (pshape[i]) {
      case 1: { // shard — a rotated quad, used for block debris
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(prot[i]!)
        ctx.fillStyle = col
        ctx.fillRect(-size / 2, -size / 2, size, size * 0.78)
        ctx.restore()
        break
      }
      case 2: { // spark — a velocity-aligned streak
        const vlen = Math.hypot(pvx[i]!, pvy[i]!) || 1
        const nx = (pvx[i]! / vlen) * size * 1.9
        const ny = (-pvy[i]! / vlen) * size * 1.9
        ctx.strokeStyle = col
        ctx.lineWidth = Math.max(0.8, size * 0.4)
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx - nx, sy - ny)
        ctx.stroke()
        break
      }
      case 3: { // smoke — a soft, expanding, low-alpha puff
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, size)
        g.addColorStop(0, `rgba(${pr[i]},${pg[i]},${pb[i]},0.55)`)
        g.addColorStop(1, `rgba(${pr[i]},${pg[i]},${pb[i]},0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(sx, sy, size, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      default: { // soft round dot
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.arc(sx, sy, size * 0.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

// ─── Floating combat text ───────────────────────────────────────────────────
//
// Damage numbers and coin pops. Kept separate from the particle pool because
// they carry a string payload and are drawn in SCREEN space with a font, which
// doesn't fit the typed-array model.

export interface FloatText {
  x: number
  y: number
  vy: number
  life: number
  maxLife: number
  text: string
  color: string
  size: number
  crit: boolean
}

const MAX_TEXTS = 60
const texts: FloatText[] = []

export const emitText = (t: Omit<FloatText, 'maxLife'> & { maxLife?: number }): void => {
  if (texts.length >= MAX_TEXTS) texts.shift()
  texts.push({ ...t, maxLife: t.maxLife ?? t.life })
}

export const stepTexts = (dtMs: number): void => {
  const dt = dtMs / 1000
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i]!
    t.life -= dtMs
    if (t.life <= 0) { texts.splice(i, 1); continue }
    t.y += t.vy * dt
    t.vy *= Math.max(0, 1 - 1.6 * dt)
  }
}

export const getTexts = (): FloatText[] => texts
export const clearTexts = (): void => { texts.length = 0 }

// ─── Ground decals ──────────────────────────────────────────────────────────
//
// Craters and scorch marks that outlive their explosion. Capped and drawn under
// everything, so the battlefield accumulates history without cost.

export interface Decal { x: number; y: number; r: number; life: number; maxLife: number; dark: number }
const MAX_DECALS = 28
const decals: Decal[] = []

export const emitDecal = (x: number, y: number, r: number, dark = 0.5): void => {
  if (decals.length >= MAX_DECALS) decals.shift()
  decals.push({ x, y, r, life: 9000, maxLife: 9000, dark })
}

export const stepDecals = (dtMs: number): void => {
  for (let i = decals.length - 1; i >= 0; i--) {
    decals[i]!.life -= dtMs
    if (decals[i]!.life <= 0) decals.splice(i, 1)
  }
}

export const getDecals = (): Decal[] => decals
export const clearDecals = (): void => { decals.length = 0 }

/** Reset every transient visual. Called when a run starts so the previous
 *  siege's rubble doesn't bleed into the new one. */
export const resetVfx = (): void => {
  clearParticles()
  clearTexts()
  clearDecals()
  fxQueue.length = 0
}
