import {
  rough, hard, fillShape, ink, stroke, tones, trace, blob,
  type Pt, type CelTones
} from '@/game/inkArt'
import { INK, LINE, paint, groundShadow, eye, limb, gait } from '@/game/monsterKit'
import type { Palette } from '@/game/art'

/**
 * ─── Cavalry ────────────────────────────────────────────────────────────────
 *
 * The player's own unit, and the only friendly body on the field — so it has to
 * be the best-drawn thing on it. It is what they bought with the gold they were
 * saving for the tech tree, at the moment a trebuchet parked out of reach; the
 * charge arriving should feel like relief.
 *
 * Built on the same kit as the monster cast — one key light, the kit's three
 * line weights, cel tone cuts — and then pushed past it, because a friendly
 * unit that reads worse than the things it kills is a purchase the player
 * regrets looking at.
 *
 * What "better" means here, concretely:
 *
 *   * **A horse, anatomically.** Point of shoulder, withers, loin, croup,
 *     point of buttock, gaskin, stifle, hock, cannon, fetlock. Every one of
 *     those is a named landmark on a real animal, and the silhouette is wrong
 *     without them — which is why the first pass, an ellipse with four sticks,
 *     read as a dog with a stick through it.
 *   * **A gallop, not a trot.** Four beats in the order a horse actually uses
 *     — near hind, far hind, far fore, near fore — then a suspension phase with
 *     every hoof off the ground and the body at its highest. Each hoof follows
 *     a real stance-and-swing path: back along the ground while it carries
 *     weight, lifted and forward while it does not.
 *   * **Harness, not decoration.** Bridle and reins that run from the bit to
 *     the hand. A saddle with a cantle, a stirrup leather, and a sabaton
 *     actually in the stirrup. Barding in three pieces — chanfron, criniere,
 *     peytral — each sitting where its real counterpart does.
 *   * **A knight in plate.** Great helm with a visor slit and breaths,
 *     pauldron, couter at the elbow, gauntlet on the lance, cuisse and poleyn
 *     on the leg, a heater shield with a charge on it, and a lance couched
 *     under the arm behind a vamplate.
 *   * **The livery is the loudest thing.** A caparison in the player's blue
 *     with a scalloped hem and a gold trim, plus a matching surcoat, pennon and
 *     plume. From across the battlefield at any zoom, the blue shape says
 *     "mine" before any of the detail resolves.
 *
 * Convention, shared with the caller: origin at the horse's centre of mass, `S`
 * is the unit scale, hooves land on the ground line at `y = +0.5`, and the
 * whole rider is authored FACING +X.
 */

/** Where the hooves land, in units of S. Ground units sit at `y = scale / 2`. */
const GROUND = 0.5

const STEEL = tones('#9aa4b0', 1.3)
const IRON = tones('#5c646f', 1.25)
const LEATHER = tones('#6b5238', 1.05)

/**
 * Warhorse coat — a warm bay.
 *
 * Deliberately NOT the livery colour: the blue has to belong to the cloth and
 * the rider, or the whole unit flattens into one blue mass. And deliberately
 * mid-value rather than the near-black it started as, because the battlefield's
 * middle distance is a dark treeline and a dark horse loses its legs against it
 * at the zoom the game is actually played at.
 */
const COAT = tones('#7b6450', 1.2)
/** The far pair, a full tone down. Depth by value, never by outline. */
const COAT_BACK = tones('#54432f', 1.1)
/** Mane, tail and lower legs: the black points a bay horse actually has. */
const POINTS = tones('#332a24', 1.05)

/**
 * A plate: steel with a bright chamfer along its lit edge.
 *
 * Armour reads as armour because of the HIGHLIGHT, not the grey — one hard
 * bright line down the lit side does more than any amount of tonal work. The
 * contour goes through `hard` first: plate is beaten out of flat stock, and
 * `trace` would otherwise round a cuirass into a pebble.
 */
const plate = (
  ctx: CanvasRenderingContext2D, S: number, authored: Pt[], t: CelTones, seed: number
): void => {
  const shape = rough(hard(authored), S * 0.004, seed)
  paint(ctx, S, shape, t, seed, { line: LINE.mid, amp: 0.05 })
  ctx.save()
  ctx.beginPath(); trace(ctx, shape); ctx.clip()
  const a = authored[0]!
  const b = authored[1] ?? a
  stroke(ctx, [
    [a[0] + S * 0.008, a[1] + S * 0.01],
    [b[0] + S * 0.008, b[1] + S * 0.01]
  ], S * 0.018, S * 0.009, t.lit ?? '#ffffff', seed + 1)
  ctx.restore()
}

/**
 * Where one hoof is in the cycle.
 *
 * Two distinct halves, because that is what a leg does: STANCE, where the hoof
 * is planted and travels backwards under the body carrying weight, and SWING,
 * where it leaves the ground and is thrown forward. A hoof moved on a sine wave
 * skates — it is never actually still against the earth, and the eye reads the
 * whole animal as sliding rather than running.
 */
const hoofPath = (k: number, reach: number, lift: number): Pt => {
  const STANCE = 0.42
  if (k < STANCE) {
    const u = k / STANCE
    return [(0.5 - u) * reach, 0]
  }
  const u = (k - STANCE) / (1 - STANCE)
  return [(-0.5 + u) * reach, -Math.sin(u * Math.PI) * lift]
}

/**
 * One leg, solved to its hoof, with a fetlock and a hoof capsule.
 *
 * The bones are sized only a few percent longer than half the hip-to-hoof span,
 * per the note on `limb`: slack bones throw the joint sideways and the leg
 * reads as broken rather than as relaxed.
 */
const leg = (
  ctx: CanvasRenderingContext2D, S: number,
  hip: Pt, hoof: Pt, bend: number, w: number,
  t: CelTones, point: CelTones, seed: number
): void => {
  const d = Math.hypot(hoof[0] - hip[0], hoof[1] - hip[1])
  const bone = Math.sqrt((0.08 * S) ** 2 + (d / 2) ** 2)
  limb(ctx, hip, hoof, bone, bone, bend, t, seed,
    { width: w * S, taper: 0.42, joint: 0.44, outline: S * 0.012 })

  // Cannon bone and fetlock — the dark "points" a bay horse carries, and the
  // detail that makes the bottom of a leg read as a leg rather than a stick.
  stroke(ctx, [
    [hoof[0], hoof[1] - 0.13 * S], [hoof[0], hoof[1] - 0.02 * S]
  ], w * 0.62 * S, w * 0.5 * S, point.base, seed + 30)
  paint(ctx, S, rough([
    [hoof[0] - 0.036 * S, hoof[1] - 0.03 * S],
    [hoof[0] + 0.042 * S, hoof[1] - 0.035 * S],
    [hoof[0] + 0.048 * S, hoof[1] + 0.028 * S],
    [hoof[0] - 0.042 * S, hoof[1] + 0.028 * S]
  ], 0.005 * S, seed + 40), POINTS, seed + 41, { line: LINE.hair, amp: 0.05 })
}

/**
 * Draw one rider.
 *
 * `phase` is the individual's gait offset so a squad of three never moves in
 * lockstep; `striking` couches the lance and drives the thrust.
 */
export const drawCavalry = (
  ctx: CanvasRenderingContext2D, S: number, p: Palette,
  opts: { phase: number; striking: boolean; t: number }
): void => {
  const { phase, striking, t } = opts

  // Livery from the ally palette, so a theme change carries the whole unit.
  const CLOTH = tones(p.mid, 1.15)
  const TRIM = p.accent

  // ── The gallop ──
  const CYCLE = 500
  const g = gait(t, CYCLE, phase)
  // Suspension: every hoof clear of the ground, body at its highest.
  const airborne = Math.max(0, Math.sin(g * Math.PI * 2 + 0.6))
  const bob = -airborne * 0.07 * S
  // The spine flexes — the horse gathers under itself, then extends.
  const gather = Math.cos(g * Math.PI * 2) * 0.028 * S

  groundShadow(ctx, S, 0.5 - airborne * 0.13, GROUND + 0.04, 0.26 - airborne * 0.1)

  // Dust, thickest at push-off. Behind everything, so it never veils the unit.
  const kick = Math.max(0, -Math.sin(g * Math.PI * 2))
  ctx.save()
  ctx.globalAlpha = 0.26
  for (let i = 0; i < 4; i++) {
    const d = 0.4 + i * 0.24
    const r = (0.16 - i * 0.028) * (0.55 + 0.55 * kick) * S
    fillShape(ctx, blob(-d * S, GROUND * S - r * 0.35, r, r * 0.6, 300 + i, 0.24), '#c9bb9c')
  }
  ctx.restore()

  ctx.save()
  ctx.translate(0, bob)

  /** Transverse gallop: near hind, far hind, far fore, near fore. */
  const hoofAt = (offset: number, atX: number, reach: number, lift: number): Pt => {
    const st = hoofPath(gait(t, CYCLE, phase + offset), reach * S, lift * S)
    return [atX * S + st[0], GROUND * S + st[1]]
  }

  // ── Far pair, a full tone down ──
  leg(ctx, S, [-0.24 * S, 0.06 * S], hoofAt(0.1, -0.3, 0.34, 0.16), 1, 0.1, COAT_BACK, POINTS, 310)
  leg(ctx, S, [0.28 * S, 0.04 * S], hoofAt(0.55, 0.3, 0.32, 0.15), 1, 0.09, COAT_BACK, POINTS, 316)

  // ── Tail, streaming off the croup ──
  const tail = Math.sin(t / 280 + phase * 6) * 0.05 * S
  for (let i = 0; i < 4; i++) {
    stroke(ctx, [
      [-0.4 * S, -0.06 * S],
      [-0.56 * S, 0.02 * S + tail * 0.5 + i * 0.018 * S],
      [-0.68 * S, 0.16 * S + tail + i * 0.028 * S]
    ], 0.055 * S, 0.01 * S, i === 1 ? POINTS.base : POINTS.shade, 340 + i)
  }

  // ── Barrel ──
  //
  // Every vertex here is a landmark: point of shoulder, withers, back, loin,
  // croup, point of buttock, gaskin, belly, girth. Get those and the animal is
  // a horse in silhouette; miss them and no amount of shading rescues it.
  const barrel = rough([
    [0.38 * S, -0.08 * S],   // point of shoulder
    [0.30 * S, -0.26 * S],   // withers
    [0.08 * S, -0.28 * S],   // back
    [-0.16 * S, -0.24 * S + gather], // loin
    [-0.34 * S, -0.14 * S],  // croup
    [-0.42 * S, 0.04 * S],   // point of buttock
    [-0.3 * S, 0.2 * S],     // gaskin
    [-0.08 * S, 0.24 * S],   // flank
    [0.16 * S, 0.22 * S],    // belly
    [0.36 * S, 0.1 * S]      // girth / elbow
  ], 0.014 * S, 320)
  paint(ctx, S, barrel, COAT, 321, { line: LINE.major, breakUp: 0.24 })

  // Muscle: shoulder, ribs and the seam in front of the haunch. Marks, not a
  // gradient — a painter draws three lines here, not an airbrush pass.
  ctx.save()
  ctx.beginPath(); trace(ctx, barrel); ctx.clip()
  stroke(ctx, [[0.3 * S, -0.2 * S], [0.2 * S, 0.1 * S]], 0.012 * S, 0.03 * S, COAT.deep!, 322)
  stroke(ctx, [[-0.24 * S, -0.18 * S], [-0.16 * S, 0.14 * S]], 0.014 * S, 0.034 * S, COAT.deep!, 323)
  for (let i = 0; i < 3; i++) {
    stroke(ctx, [
      [(0.1 - i * 0.07) * S, -0.14 * S], [(0.06 - i * 0.07) * S, 0.12 * S]
    ], 0.006 * S, 0.016 * S, 'rgba(30,20,16,0.24)', 324 + i)
  }
  ctx.restore()

  // ── Caparison ──
  //
  // The livery skirt, with a scalloped hem that flies against the stride. This
  // is the shape that has to survive being twenty pixels tall.
  const fly = Math.sin(g * Math.PI * 2 + 1.2) * 0.045 * S
  const hem: Pt[] = []
  for (let i = 0; i <= 5; i++) {
    const u = i / 5
    hem.push([(0.28 - u * 0.66) * S, (0.2 + Math.sin(u * Math.PI) * 0.11) * S - fly * u])
  }
  const skirt = rough([
    [0.3 * S, -0.06 * S],
    [-0.02 * S, -0.16 * S],
    [-0.36 * S, -0.06 * S],
    ...hem.slice().reverse()
  ], 0.014 * S, 326)
  paint(ctx, S, skirt, CLOTH, 327, { line: LINE.mid, breakUp: 0.3, amp: 0.16 })
  stroke(ctx, hem, 0.03 * S, 0.024 * S, TRIM, 328)
  // A repeated device down the cloth: three lozenges, which is enough pattern
  // to read as heraldry without becoming noise.
  for (let i = 0; i < 3; i++) {
    const dx = (0.14 - i * 0.18) * S
    fillShape(ctx, [
      [dx, -0.02 * S], [dx + 0.045 * S, 0.06 * S],
      [dx, 0.14 * S], [dx - 0.045 * S, 0.06 * S]
    ], TRIM)
  }

  // ── Near hind leg, over the cloth ──
  leg(ctx, S, [-0.24 * S, 0.06 * S], hoofAt(0, -0.24, 0.36, 0.18), 1, 0.115, COAT, POINTS, 330)

  // ── Neck: arched, crest up. A straight neck is a cart horse ──
  const neck = rough([
    [0.24 * S, -0.24 * S],
    [0.44 * S, -0.48 * S],
    [0.62 * S, -0.6 * S],
    [0.7 * S, -0.48 * S],
    [0.52 * S, -0.3 * S],
    [0.4 * S, -0.06 * S]
  ], 0.012 * S, 344)
  paint(ctx, S, neck, COAT, 345, { line: LINE.major, breakUp: 0.26 })

  // Criniere — the articulated neck barding, drawn as overlapping lames.
  for (let i = 0; i < 4; i++) {
    const u = i / 3
    const cx = (0.32 + u * 0.28) * S
    const cy = (-0.32 - u * 0.24) * S
    plate(ctx, S, [
      [cx - 0.04 * S, cy - 0.06 * S], [cx + 0.05 * S, cy - 0.09 * S],
      [cx + 0.07 * S, cy + 0.02 * S], [cx - 0.02 * S, cy + 0.05 * S]
    ], IRON, 346 + i)
  }

  // Mane, in locks. A fringe reads as a helmet; locks read as hair.
  for (let i = 0; i < 6; i++) {
    const u = i / 5
    const bx = (0.3 + u * 0.32) * S
    const by = (-0.3 - u * 0.28) * S
    stroke(ctx, [
      [bx, by],
      [bx - 0.1 * S, by + 0.03 * S + Math.sin(t / 220 + i + phase * 4) * 0.018 * S],
      [bx - 0.17 * S, by + 0.13 * S]
    ], 0.032 * S, 0.007 * S, i % 2 ? POINTS.base : POINTS.shade, 350 + i)
  }

  // ── Head, in a chanfron ──
  //
  // Short and deep. A narrow muzzle plus the chanfron's ridge read as one long
  // beak, and the horse turns into a bird.
  const head = rough([
    [0.6 * S, -0.62 * S], [0.8 * S, -0.58 * S],
    [0.88 * S, -0.46 * S], [0.84 * S, -0.36 * S],
    [0.68 * S, -0.34 * S], [0.58 * S, -0.44 * S]
  ], 0.009 * S, 356)
  paint(ctx, S, head, COAT, 357, { line: LINE.mid, breakUp: 0.22 })
  // Face plate with a raised centre ridge.
  plate(ctx, S, [
    [0.62 * S, -0.62 * S], [0.81 * S, -0.57 * S],
    [0.87 * S, -0.45 * S], [0.7 * S, -0.42 * S]
  ], STEEL, 359)
  stroke(ctx, [[0.66 * S, -0.6 * S], [0.86 * S, -0.5 * S]],
    0.02 * S, 0.008 * S, STEEL.lit!, 360)
  // Muzzle and nostril.
  stroke(ctx, [[0.82 * S, -0.38 * S], [0.87 * S, -0.42 * S]],
    0.03 * S, 0.02 * S, POINTS.shade, 361)
  eye(ctx, 0.71 * S, -0.5 * S, 0.021 * S, { iris: '#241d18', brow: 0.35, seed: 362 })
  // Ears, one flicking back to listen.
  for (const [ex, ey, k] of [[0.6, -0.66, 0], [0.65, -0.64, 1]] as const) {
    stroke(ctx, [
      [ex * S, ey * S],
      [(ex - 0.02) * S, (ey - 0.1) * S + Math.sin(t / 620 + k * 2) * 0.012 * S]
    ], 0.042 * S, 0.005 * S, COAT.shade, 363 + k)
  }

  // Bridle: cheek strap and browband, then the reins back to the hand.
  stroke(ctx, [[0.66 * S, -0.6 * S], [0.78 * S, -0.4 * S]], 0.014 * S, 0.014 * S, LEATHER.base, 365)
  stroke(ctx, [
    [0.8 * S, -0.4 * S], [0.5 * S, -0.34 * S], [0.24 * S, -0.36 * S]
  ], 0.013 * S, 0.013 * S, LEATHER.shade, 366)

  // ── Peytral: the chest plate ──
  plate(ctx, S, [
    [0.3 * S, -0.14 * S], [0.44 * S, -0.04 * S],
    [0.42 * S, 0.14 * S], [0.24 * S, 0.06 * S]
  ], STEEL, 367)

  // ── Near fore leg, in front of everything on the horse ──
  leg(ctx, S, [0.3 * S, 0.02 * S], hoofAt(0.48, 0.34, 0.34, 0.17), 1, 0.105, COAT, POINTS, 336)

  // ── Saddle ──
  const seatY = -0.34 * S + gather * 0.5
  paint(ctx, S, rough([
    [-0.14 * S, seatY + 0.02 * S], [-0.08 * S, seatY - 0.06 * S],
    [0.16 * S, seatY - 0.02 * S], [0.2 * S, seatY + 0.12 * S],
    [-0.12 * S, seatY + 0.16 * S]
  ], 0.008 * S, 368), LEATHER, 369, { line: LINE.fine, amp: 0.08 })

  // ── Rider ──
  //
  // Far arm and leg first, a tone down, so the near side reads in front.
  stroke(ctx, [[0.02 * S, seatY + 0.02 * S], [0.0 * S, seatY + 0.24 * S]],
    0.055 * S, 0.045 * S, IRON.shade, 370)

  // Stirrup leather and iron, with the sabaton in it.
  stroke(ctx, [[-0.02 * S, seatY + 0.1 * S], [-0.03 * S, seatY + 0.3 * S]],
    0.016 * S, 0.016 * S, LEATHER.shade, 371)
  stroke(ctx, [
    [-0.08 * S, seatY + 0.3 * S], [-0.03 * S, seatY + 0.34 * S], [0.03 * S, seatY + 0.3 * S]
  ], 0.018 * S, 0.018 * S, IRON.base, 372)

  // Near leg: cuisse on the thigh, poleyn at the knee, greave below.
  plate(ctx, S, [
    [-0.06 * S, seatY + 0.02 * S], [0.08 * S, seatY + 0.04 * S],
    [0.06 * S, seatY + 0.18 * S], [-0.08 * S, seatY + 0.16 * S]
  ], STEEL, 373)
  plate(ctx, S, [
    [-0.07 * S, seatY + 0.16 * S], [0.05 * S, seatY + 0.18 * S],
    [0.03 * S, seatY + 0.26 * S], [-0.07 * S, seatY + 0.25 * S]
  ], IRON, 374)
  plate(ctx, S, [
    [-0.05 * S, seatY + 0.25 * S], [0.03 * S, seatY + 0.26 * S],
    [0.02 * S, seatY + 0.33 * S], [-0.06 * S, seatY + 0.32 * S]
  ], STEEL, 375)

  // Cuirass, with a fauld of lames below it.
  plate(ctx, S, [
    [-0.08 * S, seatY - 0.26 * S], [0.1 * S, seatY - 0.24 * S],
    [0.14 * S, seatY - 0.02 * S], [-0.1 * S, seatY + 0.02 * S]
  ], STEEL, 376)
  for (let i = 0; i < 2; i++) {
    const fy = seatY + (0.0 + i * 0.05) * S
    plate(ctx, S, [
      [-0.1 * S, fy], [0.13 * S, fy - 0.02 * S],
      [0.13 * S, fy + 0.04 * S], [-0.1 * S, fy + 0.06 * S]
    ], IRON, 377 + i)
  }
  // Surcoat panel in the livery, so the rider carries the colour too.
  paint(ctx, S, rough(hard([
    [-0.04 * S, seatY - 0.14 * S], [0.1 * S, seatY - 0.13 * S],
    [0.12 * S, seatY - 0.02 * S], [-0.06 * S, seatY + 0.0 * S]
  ]), 0.005 * S, 379), CLOTH, 380, { line: LINE.hair, amp: 0.08 })

  // Pauldron, then the arm: rerebrace, couter at the elbow, gauntlet.
  plate(ctx, S, [
    [-0.04 * S, seatY - 0.3 * S], [0.14 * S, seatY - 0.26 * S],
    [0.16 * S, seatY - 0.12 * S], [-0.06 * S, seatY - 0.16 * S]
  ], STEEL, 381)
  stroke(ctx, [[0.06 * S, seatY - 0.2 * S], [0.14 * S, seatY - 0.06 * S]],
    0.05 * S, 0.042 * S, IRON.base, 382)
  plate(ctx, S, [
    [0.1 * S, seatY - 0.1 * S], [0.19 * S, seatY - 0.08 * S],
    [0.18 * S, seatY - 0.0 * S], [0.09 * S, seatY - 0.02 * S]
  ], STEEL, 383)

  // Great helm: skull, visor slit, breaths, and a comb along the crown.
  const helmY = seatY - 0.32 * S
  plate(ctx, S, [
    [-0.04 * S, helmY - 0.12 * S], [0.1 * S, helmY - 0.11 * S],
    [0.13 * S, helmY + 0.02 * S], [0.08 * S, helmY + 0.08 * S],
    [-0.03 * S, helmY + 0.07 * S], [-0.06 * S, helmY - 0.02 * S]
  ], STEEL, 384)
  fillShape(ctx, [
    [0.0 * S, helmY - 0.03 * S], [0.13 * S, helmY - 0.02 * S],
    [0.13 * S, helmY + 0.01 * S], [0.0 * S, helmY - 0.0 * S]
  ], '#0b0e14')
  for (const bx of [0.04, 0.08]) {
    fillShape(ctx, [
      [bx * S, helmY + 0.03 * S], [(bx + 0.012) * S, helmY + 0.03 * S],
      [(bx + 0.012) * S, helmY + 0.06 * S], [bx * S, helmY + 0.06 * S]
    ], '#0b0e14')
  }
  stroke(ctx, [[-0.03 * S, helmY - 0.11 * S], [0.1 * S, helmY - 0.1 * S]],
    0.018 * S, 0.012 * S, STEEL.lit!, 385)

  // Plume, streaming back with the charge.
  const plume = Math.sin(t / 190 + phase * 5) * 0.035 * S
  paint(ctx, S, rough([
    [0.03 * S, helmY - 0.13 * S],
    [-0.1 * S, helmY - 0.26 * S + plume],
    [-0.28 * S, helmY - 0.2 * S + plume * 1.7],
    [-0.16 * S, helmY - 0.12 * S],
    [-0.04 * S, helmY - 0.09 * S]
  ], 0.012 * S, 386), tones(TRIM, 1.1), 387, { line: LINE.hair, amp: 0.22 })

  // Heater shield on the near side, with a bold charge on it.
  const shield = [
    [-0.2 * S, seatY - 0.14 * S], [-0.04 * S, seatY - 0.18 * S],
    [-0.03 * S, seatY + 0.04 * S], [-0.12 * S, seatY + 0.2 * S],
    [-0.21 * S, seatY + 0.04 * S]
  ] as Pt[]
  paint(ctx, S, rough(hard(shield), 0.006 * S, 388), CLOTH, 389, { line: LINE.mid, amp: 0.05 })
  ctx.save()
  ctx.beginPath(); trace(ctx, rough(hard(shield), 0.006 * S, 388)); ctx.clip()
  // A bend and a boss: two marks, legible at any size, unmistakably a device.
  stroke(ctx, [[-0.22 * S, seatY - 0.1 * S], [-0.04 * S, seatY + 0.12 * S]],
    0.05 * S, 0.05 * S, TRIM, 390)
  ctx.restore()
  fillShape(ctx, blob(-0.12 * S, seatY - 0.02 * S, 0.028 * S, 0.028 * S, 391, 0.1), STEEL.lit!)

  // ── Lance, couched under the arm ──
  //
  // The thrust is a short forward jab on the attack beat, not a continuous
  // wave: a lance that oscillates reads as a fishing rod.
  const thrust = striking ? Math.max(0, Math.sin(t / 110)) * 0.16 * S : 0
  const buttX = -0.3 * S
  const tipX = 0.96 * S + thrust
  const lanceY = seatY - 0.06 * S
  stroke(ctx, [[buttX, lanceY + 0.05 * S], [tipX, lanceY - 0.06 * S]],
    0.042 * S, 0.026 * S, LEATHER.base, 392)
  // Vamplate: the cone at the grip that protects the hand — historically the
  // most recognisable thing on a couched lance.
  paint(ctx, S, rough([
    [0.1 * S + thrust, lanceY - 0.11 * S],
    [0.19 * S + thrust, lanceY - 0.02 * S],
    [0.1 * S + thrust, lanceY + 0.06 * S],
    [0.04 * S + thrust, lanceY - 0.02 * S]
  ], 0.006 * S, 393), STEEL, 394, { line: LINE.hair, amp: 0.05 })
  // Head.
  const headPts: Pt[] = [
    [tipX + 0.15 * S, lanceY - 0.07 * S],
    [tipX - 0.02 * S, lanceY - 0.13 * S],
    [tipX - 0.02 * S, lanceY - 0.01 * S]
  ]
  fillShape(ctx, headPts, STEEL.lit!)
  ink(ctx, headPts, { width: 0.012 * S, color: INK, seed: 395, breakUp: 0.1 })
  // Pennon just behind the head.
  const flick = Math.sin(t / 150 + phase * 7) * 0.022 * S
  fillShape(ctx, [
    [tipX - 0.07 * S, lanceY - 0.07 * S],
    [tipX - 0.24 * S, lanceY - 0.15 * S + flick],
    [tipX - 0.19 * S, lanceY - 0.06 * S],
    [tipX - 0.24 * S, lanceY + 0.02 * S + flick]
  ], TRIM)

  ctx.restore()
}
