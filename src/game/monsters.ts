import {
  blob, egg, rough, shrink, trace, fillShape, ink, stroke, cel, hatch,
  terminator, occlude, noise2, tones, type Pt, type CelTones
} from '@/game/inkArt'
import {
  INK, SHADOW_DIR, LINE, SHADE, paint, breathe, blink, eye, socket, horn,
  boneHand, boneLimb, groundShadow, SPORE_LIGHT, SOUL_LIGHT,
  gait, footStep, bodyBob, swing, weightShift, hipDrop, limb, clawFoot, spines,
  contourPoints, pivot
} from '@/game/monsterKit'
import { drawDustmoth, drawSkewer, drawGloomcrow } from '@/game/monstersAir'
import { drawSliverfin, drawGnashfin, drawTidewyrm, drawBrinemaw } from '@/game/monstersSea'

/**
 * ─── Monster designs ────────────────────────────────────────────────────────
 *
 * Ten characters, drawn from the shared vocabulary in `monsterKit`. Each is
 * AUTHORED — silhouette, asymmetries and the placement of every shadow cut are
 * decisions, not derivations.
 *
 * Drawing convention: origin at the character's centre of mass, unit `S`, feet
 * at roughly `y = +1`, crown at roughly `y = -1.05`. The view scales and
 * positions; nothing here knows about pixels.
 *
 * Three rules hold across all ten, because they are what makes a cast read as
 * ONE cast:
 *
 *   * **Silhouette first.** Every monster is identifiable as a black shape, and
 *     no two share a footprint — round, tall, wide, floating, hunched, winged,
 *     lanky, domed, branching.
 *   * **Asymmetry everywhere.** Paired features differ: one ear droops lower,
 *     one eye is bigger, one horn is chipped. Perfect mirroring is the single
 *     loudest "this was generated" signal a character can send.
 *   * **Nothing re-decides the shared rules.** Light direction, tonal steps and
 *     line weights come from the kit. A character that picks its own drops out
 *     of the family immediately, however good it looks alone.
 *
 * Every character has a locomotion cycle, and every cycle obeys one constraint:
 * it MOVES parts, it never reshapes them. Contours are seeded on constants
 * only, so the body is bit-identical from frame to frame and the animation is
 * pure translation and joint angle. The moment `t` reaches a seed or a radius,
 * the silhouette boils and the character stops being the same character —
 * which reads far worse than any stiffness in the walk.
 */

/**
 * What a body sheds when struck. Drives the hit particles.
 *
 * `none` is for things with no substance to lose — a ghost takes the hit and
 * the tell is entirely in the flash.
 */
export type GoreKind = 'blood' | 'bone' | 'ooze' | 'sap' | 'ember' | 'spectral' | 'metal' | 'none'

export interface MonsterDef {
  id: string
  name: string
  /** One line of design intent, shown under the portrait. */
  tagline: string
  /** Card backdrop, so each character sits in its own light. */
  backdrop: [string, string]
  /**
   * Length of one locomotion cycle, ms.
   *
   * Only the bench plays these at their authored speed. In game the frames are
   * baked over exactly this window and then replayed at whatever rate the unit
   * is actually moving — so the loop has to close at `cycleMs`, or the sprite
   * pops every time it wraps.
   */
  cycleMs: number
  /**
   * What comes out of it when it is hit.
   *
   * A skeleton that sprays blood is the sort of detail nobody articulates and
   * everybody notices. This lives on the DESIGN rather than the enemy type
   * because one rank can field more than one body — a grunt is a Grumpling or a
   * Rattlejack depending on its uid, and those two should not bleed alike.
   */
  gore: GoreKind
  /**
   * Which way the character is drawn.
   *
   * The battlefield authors every unit facing RIGHT and mirrors by travel
   * direction, so anything drawn facing left needs one more flip or it walks
   * backwards into the tower.
   */
  faces: 'left' | 'right' | 'front'
  /**
   * Where the design hangs off its position on the battlefield.
   *
   * A walker is placed by its FEET, because the cast varies in how much
   * headroom it uses and centring them would leave the tall ones hovering and
   * the short ones sunk. A swimmer has no feet: it is placed by the middle of
   * its body, which is also the point the water line is measured against.
   * Defaults to `feet`.
   */
  anchor?: 'feet' | 'centre'
  draw: (ctx: CanvasRenderingContext2D, S: number, t: number) => void
}

// ─── 1 · Grumpling ──────────────────────────────────────────────────────────

const drawGrumpling = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  // Short legs take short, fast steps.
  const g = gait(t, 880)
  const b = breathe(t, 1.1, 0.01) * S + bodyBob(g, 0.011) * S
  // Weight shifts onto whichever foot is down. Seen from the front that lean
  // is most of what sells the walk.
  const sway = Math.sin(t / 1400) * 0.02 * S + weightShift(g + 0.5, 0.016) * S
  // Ears are light and hinged: they arrive late. The lag is the DIFFERENCE
  // between the body's bob now and where it was a moment ago, which is what
  // secondary motion actually is.
  const earLag = (bodyBob(g - 0.12, 0.011) - bodyBob(g, 0.011)) * S * 2.4

  groundShadow(ctx, S, 0.44)

  const TONES = tones('#6ea63f')
  const BELLY = tones('#dcd484', 0.85)

  // ── Legs: stubby, bowed, oversized feet ──
  for (const side of [-1, 1] as const) {
    const ph = side > 0 ? 0.5 : 0
    // A front view foreshortens fore/aft travel almost to nothing, so the step
    // is mostly lift. A big horizontal stride here just swings the feet past
    // each other.
    const st = footStep(g + ph, 0.13 * S, 0.12 * S)
    const hip: Pt = [sway + side * 0.15 * S, 0.7 * S + b + hipDrop(g + ph, 0.013) * S]
    const foot: Pt = [side * 0.12 * S + st[0], 0.92 * S + st[1]]
    // Knees bulge outward — `-side` — which is bowed, and is most of why this
    // one walks like a toddler rather than like a soldier.
    limb(ctx, hip, foot, 0.17 * S, 0.17 * S, -side, TONES, 28 + side,
      { width: 0.125 * S, taper: 0.74, joint: 0.4 })
    const pad = blob(foot[0] + side * 0.05 * S, foot[1] + 0.02 * S, 0.18 * S, 0.095 * S, 30 + side, 0.13)
    paint(ctx, S, pad, TONES, 30 + side, { line: LINE.mid, breakUp: 0.2, deep: false })
    for (let i = -1; i <= 1; i++) {
      const tx = foot[0] + side * 0.05 * S + i * 0.06 * S
      stroke(ctx, [[tx, foot[1] - 0.01 * S], [tx + i * 0.02 * S, foot[1] + 0.08 * S]],
        0.03 * S, 0.006 * S, '#f0e6c8', 40 + i)
    }
  }

  // ── Body: small and pear-shaped, dwarfed by the head ──
  const body = egg(sway, 0.62 * S + b, 0.3 * S, 0.29 * S, 0.72, 12, 0.07)
  cel(ctx, body, TONES, {
    shade: terminator(body, SHADOW_DIR, 0.06, 0.13, 12),
    // Contact shadow where the head will land. Painted BEFORE the head, so only
    // the fringe survives — which is exactly how the two forms end up looking
    // attached instead of stacked.
    deep: blob(sway + 0.02 * S, 0.42 * S + b, 0.3 * S, 0.13 * S, 13, 0.18)
  })
  // Pale belly patch, drawn as its own shape rather than a gradient.
  const belly = blob(sway - 0.02 * S, 0.7 * S + b, 0.19 * S, 0.16 * S, 14, 0.13)
  ctx.save()
  ctx.beginPath(); trace(ctx, body); ctx.clip()
  paint(ctx, S, belly, BELLY, 15, {
    line: LINE.fine, inkColor: 'rgba(28,20,24,0.5)', breakUp: 0.6, deep: false
  })
  ctx.restore()
  ink(ctx, body, { width: 0.05 * S, color: INK, seed: 16, breakUp: 0.22 })

  // ── Arms ──
  for (const side of [-1, 1] as const) {
    const sx = side * 0.26 * S + sway
    const droop = side === 1 ? 0.1 : 0
    // Counter-swing: the arm opposes the leg on its own side. Arms and legs
    // moving together is the classic broken-walk tell.
    const aw = swing(g + (side > 0 ? 0.5 : 0) + 0.7, 0.055) * S
    const arm: Pt[] = [
      [sx, 0.52 * S + b],
      [sx + side * 0.13 * S + aw, 0.66 * S + b + droop * S * 0.2],
      [sx + side * 0.09 * S + aw * 1.7, 0.82 * S + b + droop * S * 0.3]
    ]
    stroke(ctx, arm, 0.128 * S, 0.09 * S, INK, 50 + side)
    stroke(ctx, arm, 0.105 * S, 0.07 * S, TONES.base, 50 + side)
    const hand = blob(arm[2]![0], arm[2]![1] + 0.03 * S, 0.075 * S, 0.07 * S, 52 + side, 0.14)
    paint(ctx, S, hand, TONES, 52 + side, { line: LINE.mid, breakUp: 0.25, deep: false })
  }

  // ── Head: the whole character. Huge, tilted, top-heavy ──
  const hy = 0.06 * S + b * 1.6
  const hx = sway * 1.4
  const head = egg(hx, hy, 0.46 * S, 0.42 * S, 0.86, 20, 0.055)

  // Ears: enormous, and deliberately mismatched — one perked, one folded.
  const earL: Pt[] = rough([
    [hx - 0.4 * S, hy - 0.06 * S],
    [hx - 0.78 * S, hy - 0.34 * S + earLag],
    [hx - 0.92 * S, hy - 0.1 * S + earLag * 1.4],
    [hx - 0.7 * S, hy + 0.16 * S + earLag],
    [hx - 0.42 * S, hy + 0.16 * S]
  ], 0.02 * S, 60)
  const earR: Pt[] = rough([
    [hx + 0.4 * S, hy - 0.1 * S],
    [hx + 0.74 * S, hy - 0.04 * S + earLag * 1.1],
    [hx + 0.86 * S, hy + 0.22 * S + earLag * 1.5],
    [hx + 0.6 * S, hy + 0.26 * S + earLag],
    [hx + 0.41 * S, hy + 0.12 * S]
  ], 0.02 * S, 61)
  // Ears sit mostly in shadow — they are thin, so light passes them by. The
  // inner ear is scaled about the EAR's own centre; scaling it about the head
  // (the obvious thing) drags it under the skull, which is drawn after.
  for (const [e, ax, ay, s] of [
    [earL, hx - 0.68 * S, hy - 0.02 * S, 62],
    [earR, hx + 0.6 * S, hy + 0.08 * S, 63]
  ] as const) {
    cel(ctx, e, TONES, { shade: terminator(e, SHADOW_DIR, -0.16, 0.16, s) })
    const inner = shrink(e, 0.62, ax, ay)
    cel(ctx, inner, tones('#b9695c', 0.9), {
      shade: terminator(inner, SHADOW_DIR, -0.14, 0.18, s + 20)
    })
    ink(ctx, inner, { width: 0.018 * S, color: 'rgba(28,20,24,0.45)', seed: s + 30, breakUp: 0.5 })
    ink(ctx, e, { width: 0.042 * S, color: INK, seed: s, breakUp: 0.25 })
  }

  cel(ctx, head, TONES, {
    shade: terminator(head, SHADOW_DIR, 0.14, 0.16, 22),
    // Core shadow: a narrower cut inside the first, so the dark has structure
    // rather than being one flat field.
    deep: terminator(head, SHADOW_DIR, 0.46, 0.13, 23),
    lit: terminator(head, SHADOW_DIR + Math.PI, 0.52, 0.14, 24)
  })
  hatch(ctx, blob(hx + 0.24 * S, hy + 0.2 * S, 0.2 * S, 0.16 * S, 24, 0.16),
    -0.7, 0.03 * S, 0.007 * S, 'rgba(28,20,24,0.22)', 25)
  ink(ctx, head, { width: 0.052 * S, color: INK, seed: 26, breakUp: 0.28 })
  // Where each ear meets the skull.
  occlude(ctx, head, 0.44, 0.56, 0.05 * S, 'rgba(28,20,24,0.7)', 27)
  occlude(ctx, head, 0.94, 1.06, 0.045 * S, 'rgba(28,20,24,0.7)', 28)

  // ── Face ──
  const bl = blink(t, 300)
  // Deliberately mismatched: a big staring eye and a mean squint.
  eye(ctx, hx - 0.15 * S, hy - 0.02 * S, 0.145 * S, {
    iris: '#ffcf3f', glow: '#ffd76a', pupil: 0.42, lid: bl, brow: 0.42, seed: 70
  })
  eye(ctx, hx + 0.16 * S, hy + 0.01 * S, 0.1 * S, {
    iris: '#ffcf3f', glow: '#ffd76a', pupil: 0.5, lid: Math.max(0.42, bl), brow: -0.5, seed: 74
  })

  // Snub nose: two nostril flicks, no rendered nose. Less is more at this size.
  stroke(ctx, [[hx - 0.04 * S, hy + 0.14 * S], [hx - 0.06 * S, hy + 0.18 * S]], 0.026 * S, 0.014 * S, INK, 80)
  stroke(ctx, [[hx + 0.06 * S, hy + 0.15 * S], [hx + 0.08 * S, hy + 0.19 * S]], 0.026 * S, 0.014 * S, INK, 81)

  // Wide, lopsided grin, OPEN. A drawn line with teeth floating above it reads
  // as a face with tusks; a dark cavity gives the fangs somewhere to grow from
  // and gives the whole face a third value to sit against.
  ctx.save()
  ctx.beginPath(); trace(ctx, head); ctx.clip()
  const mouth = rough([
    [hx - 0.25 * S, hy + 0.21 * S],
    [hx - 0.04 * S, hy + 0.26 * S],
    [hx + 0.15 * S, hy + 0.23 * S],
    [hx + 0.27 * S, hy + 0.18 * S],
    [hx + 0.13 * S, hy + 0.39 * S],
    [hx - 0.11 * S, hy + 0.38 * S]
  ], 0.012 * S, 82)
  cel(ctx, mouth, tones('#571d29'), {
    shade: terminator(mouth, SHADOW_DIR + Math.PI, 0.34, 0.16, 83)
  })
  fillShape(ctx, blob(hx + 0.02 * S, hy + 0.36 * S, 0.1 * S, 0.045 * S, 84, 0.18), '#a34a52')
  // Lower fangs standing out of the jaw, mismatched.
  for (const [fx, fh] of [[-0.17, 0.11], [0.07, 0.08]] as const) {
    const f: Pt[] = [
      [hx + fx * S, hy + 0.38 * S],
      [hx + (fx + 0.03) * S, hy + (0.38 - fh) * S],
      [hx + (fx + 0.064) * S, hy + 0.39 * S]
    ]
    cel(ctx, f, tones('#f6eeda', 0.9), { shade: terminator(f, SHADOW_DIR, 0.0, 0.14, 86) })
    ink(ctx, f, { width: 0.015 * S, color: INK, seed: 87 })
  }
  ink(ctx, mouth, { width: 0.032 * S, color: INK, seed: 85, breakUp: 0.12 })
  ctx.restore()

  // A single crooked tooth wart / mole for character.
  fillShape(ctx, blob(hx + 0.3 * S, hy - 0.16 * S, 0.026 * S, 0.022 * S, 90, 0.2), TONES.deep)
}

// ─── 2 · Bonecap ────────────────────────────────────────────────────────────

const drawBonecap = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  const g = gait(t, 1300)
  const b = breathe(t, 0.7, 0.008) * S + bodyBob(g, 0.018) * S
  const sway = Math.sin(t / 2100) * 0.025 * S + weightShift(g + 0.5, 0.024) * S
  // The cap is heavy and sits on a neck: it lags the body and overshoots.
  const capLag = (bodyBob(g - 0.14, 0.018) - bodyBob(g, 0.018)) * S * 2.6

  groundShadow(ctx, S, 0.4, 1.0, 0.24)

  const BONE = tones('#efe6d0', 1.05)
  const CAP = tones('#8e5bb5')

  // ── Legs: two, articulated, ending in root-feet ──
  // These were five splayed sticks with a claw fan on each, which read as a
  // bundle of twigs rather than as something holding a body up. A leg needs a
  // knee and a foot; the fungal character comes from the ROOT TOES, not from
  // leaving the anatomy out.
  for (const side of [-1, 1] as const) {
    const ph = side > 0 ? 0.5 : 0
    const st = footStep(g + ph, 0.12 * S, 0.1 * S)
    const hip: Pt = [sway + side * 0.09 * S, 0.58 * S + b + hipDrop(g + ph, 0.014) * S]
    const foot: Pt = [side * 0.085 * S + st[0], 0.96 * S + st[1]]
    limb(ctx, hip, foot, 0.21 * S, 0.21 * S, -side, BONE, 100 + side * 4,
      { width: 0.05 * S, taper: 0.82, outline: 0.019 * S, joint: 0.72 })
    clawFoot(ctx, foot[0], foot[1] + 0.04 * S, 0.14 * S, side > 0 ? 0.1 : Math.PI - 0.1,
      BONE, 108 + side * 4, 3, '#c8b78d')
  }

  // ── Ribcage torso: an open basket, which is the whole silhouette gag ──
  const spineTop = -0.1 * S + b
  const torso = egg(sway, 0.42 * S + b, 0.24 * S, 0.3 * S, 0.7, 110, 0.08)
  cel(ctx, torso, tones('#2a2130'), {})
  ink(ctx, torso, { width: 0.03 * S, color: INK, seed: 111, breakUp: 0.4 })
  // Ribs, thinning and tightening downward.
  for (let i = 0; i < 5; i++) {
    const k = i / 4
    const ry = 0.22 * S + k * 0.36 * S + b
    const rw = (0.25 - k * 0.075) * S
    for (const side of [-1, 1] as const) {
      const rib: Pt[] = []
      for (let j = 0; j <= 8; j++) {
        const u = j / 8
        rib.push([
          sway + side * rw * Math.sin(u * 1.5),
          ry + u * 0.075 * S * (1 + k)
        ])
      }
      stroke(ctx, rib, 0.05 * S, 0.022 * S, i % 2 ? BONE.shade : BONE.base, 112 + i * 2 + side)
    }
  }
  // Spine.
  stroke(ctx, [
    [sway, spineTop + 0.14 * S], [sway + 0.01 * S, 0.42 * S + b], [sway, 0.62 * S + b]
  ], 0.055 * S, 0.04 * S, BONE.shade, 120)

  // ── Arms: long and loose, hanging open ──
  // One elbow drops further than the other, and the two hands are splayed by
  // different amounts — a matched pair of limbs is the fastest way to make a
  // character look like a paper doll.
  for (const side of [-1, 1] as const) {
    const droop = side === 1 ? 0.06 : -0.02
    const aw = swing(g + (side > 0 ? 0.5 : 0) + 0.7, 0.05) * S
    const wrist: Pt = [sway + side * 0.3 * S + aw * 1.4, 0.78 * S + b]
    boneLimb(ctx,
      [sway + side * 0.2 * S, 0.26 * S + b],
      [sway + side * 0.38 * S + aw, 0.5 * S + b + droop * S],
      wrist,
      0.042 * S, BONE, 130 + side * 3)
    boneHand(ctx, wrist[0], wrist[1] + 0.05 * S, 0.15 * S, side > 0 ? 1.35 : 1.75,
      BONE, 134 + side * 3, side > 0 ? 0.18 : 0.05)
  }

  // ── Skull ──
  const hy = -0.16 * S + b * 1.5
  const hx = sway * 1.3
  const skull = egg(hx, hy, 0.3 * S, 0.31 * S, 0.78, 140, 0.05)
  cel(ctx, skull, BONE, {
    // The cap overhangs, so the skull is in its shadow from above — the
    // terminator is pushed up past centre and the lit sliver is small.
    shade: terminator(skull, SHADOW_DIR, -0.14, 0.14, 141),
    deep: terminator(skull, SHADOW_DIR, 0.34, 0.12, 142),
    lit: terminator(skull, SHADOW_DIR + Math.PI, 0.66, 0.1, 143)
  })
  // A crack across the cranium — bone with a history.
  stroke(ctx, [
    [hx - 0.2 * S, hy - 0.12 * S], [hx - 0.08 * S, hy - 0.2 * S],
    [hx + 0.02 * S, hy - 0.08 * S], [hx + 0.12 * S, hy - 0.14 * S]
  ], 0.016 * S, 0.006 * S, 'rgba(90,76,58,0.75)', 143)
  ink(ctx, skull, { width: 0.04 * S, color: INK, seed: 144, breakUp: 0.3 })

  // Jaw, hanging slightly open and off-square.
  const jaw = rough([
    [hx - 0.21 * S, hy + 0.16 * S],
    [hx - 0.17 * S, hy + 0.34 * S],
    [hx + 0.02 * S, hy + 0.39 * S],
    [hx + 0.2 * S, hy + 0.31 * S],
    [hx + 0.22 * S, hy + 0.14 * S]
  ], 0.012 * S, 145)
  cel(ctx, jaw, BONE, { shade: terminator(jaw, SHADOW_DIR, -0.2, 0.14, 145) })
  ink(ctx, jaw, { width: 0.032 * S, color: INK, seed: 146, breakUp: 0.25 })
  for (let i = 0; i < 5; i++) {
    const tx = hx + (-0.14 + i * 0.07) * S
    stroke(ctx, [[tx, hy + 0.18 * S], [tx, hy + 0.27 * S]], 0.02 * S, 0.014 * S, 'rgba(120,104,80,0.6)', 147 + i)
  }

  // Sockets: hollow, with a spore-light burning deep inside. The ramp is the
  // cast's shared one — only the hue says "fungus" rather than "soul".
  socket(ctx, hx - 0.115 * S, hy + 0.02 * S, 0.098 * S, SPORE_LIGHT, 150, 0.38, blink(t, 1200))
  socket(ctx, hx + 0.12 * S, hy + 0.02 * S, 0.085 * S, SPORE_LIGHT, 154, 0.38, blink(t, 1200))

  // Nasal cavity — a small inverted heart, the classic skull read.
  fillShape(ctx, rough([
    [hx, hy + 0.1 * S], [hx - 0.045 * S, hy + 0.2 * S], [hx + 0.045 * S, hy + 0.2 * S]
  ], 0.008 * S, 160), '#241a2c')

  // ── The cap: a heavy mushroom crown, the reason the silhouette works ──
  const capY = hy - 0.24 * S + capLag
  const cap = rough([
    [hx - 0.56 * S, capY + 0.1 * S],
    [hx - 0.48 * S, capY - 0.16 * S],
    [hx - 0.22 * S, capY - 0.3 * S],
    [hx + 0.1 * S, capY - 0.33 * S],
    [hx + 0.42 * S, capY - 0.2 * S],
    [hx + 0.56 * S, capY + 0.04 * S],
    [hx + 0.5 * S, capY + 0.14 * S],
    [hx + 0.2 * S, capY + 0.09 * S],
    [hx - 0.16 * S, capY + 0.11 * S],
    [hx - 0.44 * S, capY + 0.16 * S]
  ], 0.016 * S, 170)
  cel(ctx, cap, CAP, {
    shade: terminator(cap, SHADOW_DIR, 0.1, 0.14, 171),
    deep: terminator(cap, SHADOW_DIR, 0.44, 0.11, 172),
    lit: terminator(cap, SHADOW_DIR + Math.PI, 0.5, 0.13, 173)
  })
  // Pale warts, uneven in size and spacing.
  for (let i = 0; i < 7; i++) {
    const u = noise2(i * 3.1, 5, 173)
    const v = noise2(i * 1.7, 9, 174)
    const wx = hx + (u - 0.5) * 0.9 * S
    const wy = capY - 0.05 * S - v * 0.2 * S
    const wr = (0.018 + v * 0.028) * S
    ctx.save()
    ctx.beginPath(); trace(ctx, cap); ctx.clip()
    cel(ctx, blob(wx, wy, wr, wr * 0.85, 175 + i, 0.16), tones('#e8dcf2', 0.8), {
      shade: blob(wx + wr * 0.3, wy + wr * 0.3, wr * 0.7, wr * 0.6, 176 + i, 0.2)
    })
    ctx.restore()
  }
  ink(ctx, cap, { width: 0.05 * S, color: INK, seed: 177, breakUp: 0.26 })
  // The rim's underside — the heaviest line on the character, and the reason
  // the cap reads as sitting ON the skull rather than behind it.
  occlude(ctx, cap, 0.62, 1.0, 0.05 * S, 'rgba(24,12,34,0.85)', 178)
  // Gills under the rim.
  for (let i = 0; i < 9; i++) {
    const gx = hx + (-0.44 + i * 0.11) * S
    stroke(ctx, [[gx, capY + 0.09 * S], [gx + 0.01 * S, capY + 0.17 * S]],
      0.014 * S, 0.008 * S, 'rgba(50,26,72,0.7)', 180 + i)
  }

  // ── Drifting spores ──
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 9; i++) {
    const ph = (t / 2600 + i * 0.37) % 1
    const sx = hx + (noise2(i * 2.3, 1, 190) - 0.5) * 1.1 * S
    const sy = capY + 0.2 * S - ph * 0.9 * S
    const r = (0.012 + noise2(i, 3, 191) * 0.012) * S
    ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.75
    ctx.fillStyle = '#c9ff6a'
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

// ─── 3 · Snaggletusk ────────────────────────────────────────────────────────

const drawSnaggletusk = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  // A four-beat walk: each foot lands a quarter-cycle after the last, so the
  // body dips four times per cycle rather than twice.
  const g = gait(t, 1350)
  const b = breathe(t, 1.4, 0.012) * S + bodyBob(g * 2, 0.012) * S
  const huff = Math.max(0, Math.sin(t / 1100)) ** 3

  groundShadow(ctx, S, 0.62, 1.0, 0.3)

  const HIDE = tones('#8f6340', 1.05)
  const TUSK = tones('#f2e7cc', 0.95)

  // ── Hind quarters: lower and further back, so the pose leans forward ──
  const rump = blob(0.34 * S, 0.6 * S + b * 0.5, 0.31 * S, 0.28 * S, 200, 0.08)
  // Behind the shoulder, so it stays a tone down throughout — depth by value,
  // not by outline.
  cel(ctx, rump, { base: HIDE.shade, shade: HIDE.deep!, lit: HIDE.base }, {
    shade: terminator(rump, SHADOW_DIR, 0.02, 0.13, 200),
    lit: terminator(rump, SHADOW_DIR + Math.PI, 0.62, 0.12, 201)
  })
  ink(ctx, rump, { width: 0.042 * S, color: INK, seed: 201, breakUp: 0.3 })
  const HIDE_FAR: CelTones = { base: HIDE.shade, shade: HIDE.deep, lit: HIDE.base }
  const HOOF = tones('#3a2a20')
  /** One leg of the four, solved to its stepped foot. */
  const legStep = (
    hipX: number, hipY: number, footX: number, phase: number,
    bend: number, w: number, tone: CelTones, sd: number, hw: number, bone = 0.2
  ): void => {
    const st = footStep(g + phase, 0.16 * S, 0.055 * S)
    const foot: Pt = [footX + st[0], 1.0 * S + st[1]]
    limb(ctx, [hipX, hipY], foot, bone * S, bone * S, bend, tone, sd,
      { width: w, taper: 0.66, joint: 0.42 })
    const hoof = blob(foot[0], foot[1], hw, hw * 0.6, sd + 1, 0.12)
    paint(ctx, S, hoof, HOOF, sd + 1, { line: LINE.fine, deep: false })
  }
  legStep(0.42 * S, 0.76 * S + b * 0.5, 0.42 * S, 0.0, 1, 0.155 * S, HIDE, 202, 0.078 * S, 0.142)
  legStep(0.24 * S, 0.78 * S + b * 0.5, 0.24 * S, 0.5, 1, 0.135 * S, HIDE_FAR, 206, 0.072 * S, 0.142)

  // ── Shoulders: the mass of the animal, hunched high ──
  const hump = blob(-0.08 * S, 0.36 * S + b, 0.42 * S, 0.36 * S, 210, 0.07)
  cel(ctx, hump, HIDE, {
    shade: terminator(hump, SHADOW_DIR, 0.1, 0.15, 211),
    deep: terminator(hump, SHADOW_DIR, 0.5, 0.12, 212),
    // A long rake of light down the top of the shoulder — the single read that
    // tells you where the mass of this animal is.
    lit: terminator(hump, SHADOW_DIR + Math.PI, 0.44, 0.14, 213)
  })
  hatch(ctx, blob(0.18 * S, 0.54 * S + b, 0.18 * S, 0.14 * S, 213, 0.16),
    -0.5, 0.032 * S, 0.008 * S, 'rgba(28,20,24,0.26)', 214)
  ink(ctx, hump, { width: 0.055 * S, color: INK, seed: 215, breakUp: 0.24 })

  // Bristles along the spine.
  // They used to be laid out on a straight line with a V-shaped fudge to
  // approximate the back, which left them floating off the silhouette wherever
  // the two diverged. Sampling the shoulder's ACTUAL contour and aiming each
  // one down its own normal attaches them by construction — and keeps them
  // attached as the body bobs through the walk.
  spines(ctx, hump, 0.6, 0.95, 14, 0.19 * S, 0.036 * S,
    (i) => (i % 3 ? '#1d1310' : '#33220f'), 220, 0.5)

  // ── Front legs: heavier than the hind pair, quarter-cycle offset ──
  legStep(-0.12 * S, 0.66 * S + b, -0.11 * S, 0.75, -1, 0.175 * S, HIDE, 230, 0.09 * S, 0.19)
  legStep(-0.3 * S, 0.68 * S + b, -0.29 * S, 0.25, -1, 0.155 * S, HIDE_FAR, 234, 0.085 * S, 0.19)

  // ── Neck mane: coarser, darker hide bridging skull to shoulder ──
  // Drawn BEFORE the head so the head overlaps it. Two shapes that merely abut
  // read as two shapes; one that tucks under another reads as an animal.
  const mane = rough([
    [-0.34 * S, 0.0 * S + b],
    [0.0 * S, -0.04 * S + b],
    [0.08 * S, 0.5 * S + b],
    [-0.32 * S, 0.54 * S + b]
  ], 0.022 * S, 236)
  cel(ctx, mane, { base: HIDE.shade, shade: HIDE.deep! }, {
    shade: terminator(mane, SHADOW_DIR, 0.08, 0.16, 237)
  })

  const hy = 0.22 * S + b * 1.2
  const hx = -0.44 * S

  // ── A torn ear, tucked behind the skull ──
  const ear = rough([
    [hx + 0.16 * S, hy - 0.26 * S],
    [hx + 0.3 * S, hy - 0.52 * S],
    [hx + 0.44 * S, hy - 0.44 * S],
    [hx + 0.37 * S, hy - 0.33 * S],
    [hx + 0.45 * S, hy - 0.26 * S],
    [hx + 0.3 * S, hy - 0.16 * S]
  ], 0.014 * S, 290)
  cel(ctx, ear, HIDE, { shade: terminator(ear, SHADOW_DIR, -0.24, 0.16, 291) })
  ink(ctx, ear, { width: 0.032 * S, color: INK, seed: 292, breakUp: 0.3 })

  // ── Head: a WEDGE — broad at the shoulder, tapering into a heavy muzzle ──
  // The previous head was a rounded lump, which is why it read as a plate stuck
  // on the side. A boar in profile is a triangle; the silhouette has to say so.
  const head = rough([
    [hx + 0.36 * S, hy - 0.26 * S],
    [hx + 0.06 * S, hy - 0.38 * S],
    [hx - 0.18 * S, hy - 0.3 * S],
    [hx - 0.36 * S, hy - 0.1 * S],
    [hx - 0.47 * S, hy + 0.1 * S],
    [hx - 0.38 * S, hy + 0.28 * S],
    [hx - 0.1 * S, hy + 0.38 * S],
    [hx + 0.2 * S, hy + 0.36 * S],
    [hx + 0.38 * S, hy + 0.16 * S]
  ], 0.016 * S, 240)
  cel(ctx, head, HIDE, {
    shade: terminator(head, SHADOW_DIR, 0.14, 0.15, 241),
    deep: terminator(head, SHADOW_DIR, 0.52, 0.12, 242),
    lit: terminator(head, SHADOW_DIR + Math.PI, 0.44, 0.13, 243)
  })
  // Cheekbone: one line, and the flat side of the head gains a plane.
  stroke(ctx, [
    [hx + 0.1 * S, hy - 0.02 * S], [hx - 0.06 * S, hy + 0.14 * S], [hx - 0.04 * S, hy + 0.3 * S]
  ], 0.006 * S, 0.026 * S, 'rgba(40,24,16,0.45)', 244)
  ink(ctx, head, { width: 0.055 * S, color: INK, seed: 245, breakUp: 0.26 })

  // ── Snout: a blunt disc on the end of the muzzle, huffing on the beat ──
  const snout = blob(hx - 0.44 * S, hy + 0.08 * S - huff * 0.014 * S, 0.135 * S, 0.125 * S, 250, 0.1)
  cel(ctx, snout, tones('#7a5138'), {
    shade: terminator(snout, SHADOW_DIR, 0.0, 0.16, 250),
    lit: terminator(snout, SHADOW_DIR + Math.PI, 0.56, 0.14, 251)
  })
  ink(ctx, snout, { width: 0.036 * S, color: INK, seed: 252, breakUp: 0.2 })
  for (const dy of [-0.042, 0.042]) {
    fillShape(ctx, blob(hx - 0.48 * S, hy + (0.07 + dy) * S, 0.028 * S, 0.021 * S, 253 + dy * 100, 0.2), '#1e1209')
  }
  // Huff puffs.
  if (huff > 0.15) {
    ctx.save()
    ctx.globalAlpha = huff * 0.45
    for (let i = 0; i < 3; i++) {
      fillShape(ctx, blob(hx - (0.62 + i * 0.11) * S, hy + (0.04 + i * 0.03) * S,
        (0.045 + i * 0.022) * S, (0.032 + i * 0.016) * S, 260 + i, 0.25), '#e8dcc8')
    }
    ctx.restore()
  }

  // ── Mouth line and tusks ──
  stroke(ctx, [
    [hx - 0.42 * S, hy + 0.22 * S], [hx - 0.24 * S, hy + 0.29 * S], [hx - 0.04 * S, hy + 0.28 * S]
  ], 0.03 * S, 0.014 * S, 'rgba(30,18,12,0.8)', 265)
  // Tusks grow out of the LOWER JAW and sweep up past the cheek toward the eye.
  // They were starting further back and leaning left, which swept them straight
  // across the snout — the tusk crossed the nose instead of framing it.
  // Far tusk first and a tone down, so the pair reads as depth rather than as a
  // symmetrical moustache.
  horn(ctx, hx - 0.19 * S, hy + 0.32 * S, 0.26 * S, 0.044 * S, -1.62, 1.0,
    { base: TUSK.shade, shade: TUSK.deep! }, 274)
  horn(ctx, hx - 0.33 * S, hy + 0.29 * S, 0.36 * S, 0.058 * S, -1.78, 1.15, TUSK, 270)

  // Iron nose ring — a bit of story: something owned this thing once.
  ctx.save()
  ctx.strokeStyle = '#8f959e'
  ctx.lineWidth = 0.022 * S
  ctx.beginPath()
  ctx.ellipse(hx - 0.46 * S, hy + 0.2 * S, 0.055 * S, 0.065 * S, 0.2, 0.15, Math.PI * 1.8)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(28,20,24,0.5)'
  ctx.lineWidth = 0.008 * S
  ctx.stroke()
  ctx.restore()

  // ── Brow and eyes: sunk under a heavy ridge, low on the skull ──
  // They sat up near the crown before, which reads as a dog. Small eyes set
  // deep and forward are most of what makes a boar look mean.
  const browRidge = rough([
    [hx - 0.24 * S, hy - 0.12 * S],
    [hx + 0.06 * S, hy - 0.2 * S],
    [hx + 0.3 * S, hy - 0.14 * S],
    [hx + 0.28 * S, hy - 0.02 * S],
    [hx + 0.02 * S, hy - 0.06 * S],
    [hx - 0.22 * S, hy - 0.0 * S]
  ], 0.012 * S, 276)
  fillShape(ctx, browRidge, 'rgba(38,22,14,0.55)')

  const bl = blink(t, 900)
  eye(ctx, hx - 0.11 * S, hy + 0.0 * S, 0.058 * S, {
    iris: '#ff6a2a', glow: '#ff8a3a', pupil: 0.5, lid: bl, brow: 0.8, seed: 280, sclera: '#f7e6cf'
  })
  eye(ctx, hx + 0.09 * S, hy - 0.04 * S, 0.048 * S, {
    iris: '#e05a22', glow: '#ff8a3a', pupil: 0.5, lid: Math.max(0.15, bl), brow: 0.62, seed: 284, sclera: '#d9c3aa'
  })
}

// ─── 4 · Wispling ───────────────────────────────────────────────────────────

const drawWispling = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  // Its locomotion cycle is a hover: rise, drift, settle. The horizontal drift
  // trails the vertical by about a fifth of a cycle, which is what turns two
  // sine waves into something that looks like it is swimming rather than
  // orbiting.
  const g = gait(t, 2600)
  const bob = Math.sin(g * Math.PI * 2) * 0.07 * S
  const sway = Math.sin((g - 0.2) * Math.PI * 2) * 0.06 * S

  // No ground shadow — it floats, and the absence is the point. A faint pool of
  // its own light instead.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const gp = ctx.createRadialGradient(0, 1.0 * S, 0, 0, 1.0 * S, 0.5 * S)
  gp.addColorStop(0, 'rgba(126,240,224,0.3)')
  gp.addColorStop(1, 'rgba(126,240,224,0)')
  ctx.fillStyle = gp
  ctx.beginPath(); ctx.ellipse(0, 1.0 * S, 0.5 * S, 0.12 * S, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  const GHOST = tones('#d3ecf5', 0.8)

  // ── Outer glow ──
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const og = ctx.createRadialGradient(sway, 0.1 * S + bob, 0, sway, 0.1 * S + bob, 0.95 * S)
  og.addColorStop(0, 'rgba(126,240,224,0.3)')
  og.addColorStop(0.5, 'rgba(90,190,220,0.12)')
  og.addColorStop(1, 'rgba(90,190,220,0)')
  ctx.fillStyle = og
  ctx.beginPath(); ctx.arc(sway, 0.1 * S + bob, 0.95 * S, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  // ── Body: a teardrop that frays into ribbons at the bottom ──
  const bodyPts: Pt[] = []
  const n = 84
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const sy = Math.sin(a)
    const cx0 = Math.cos(a)
    if (sy > 0.15) {
      // Lower third: the dissolving tail, waving on its own clock.
      const k = (sy - 0.15) / 0.85
      const wave = Math.sin(a * 5 + t / 320) * 0.09 * k
      const taper = 1 - k * 0.55
      bodyPts.push([
        sway + cx0 * 0.42 * S * taper + wave * S,
        0.1 * S + bob + sy * 0.78 * S
      ])
    } else {
      const r = 1 + (noise2(cx0 * 1.8 + 2, sy * 1.8 + 2, 300) - 0.5) * 0.09
      bodyPts.push([sway + cx0 * 0.44 * S * r, 0.1 * S + bob + sy * 0.56 * S * r])
    }
  }
  cel(ctx, bodyPts, GHOST, {
    shade: terminator(bodyPts, SHADOW_DIR, 0.16, 0.14, 301),
    deep: terminator(bodyPts, SHADOW_DIR, 0.5, 0.12, 302),
    lit: terminator(bodyPts, SHADOW_DIR + Math.PI, 0.46, 0.13, 303)
  })
  ink(ctx, bodyPts, { width: 0.04 * S, color: '#2c4a58', seed: 303, breakUp: 0.45 })

  // ── Stubby arms ──
  for (const side of [-1, 1] as const) {
    // Arms trail the body by a quarter cycle — they are being dragged, not
    // driven.
    const wobArm = Math.sin((g - 0.25) * Math.PI * 2 + side) * 0.045 * S
    const arm: Pt[] = [
      [sway + side * 0.34 * S, 0.14 * S + bob],
      [sway + side * 0.5 * S, 0.24 * S + bob + wobArm],
      [sway + side * 0.54 * S, 0.36 * S + bob + wobArm]
    ]
    // Right arm is the shadow side, so it drops a full tone — otherwise the two
    // arms read as one symmetrical pair of nubs.
    stroke(ctx, arm, 0.095 * S, 0.05 * S, side > 0 ? GHOST.shade : GHOST.base, 310 + side)
    const mitt = blob(arm[2]![0], arm[2]![1] + 0.01 * S, 0.058 * S, 0.055 * S, 312 + side, 0.15)
    cel(ctx, mitt, GHOST, { shade: terminator(mitt, SHADOW_DIR, 0.05, 0.16, 313 + side) })
    ink(ctx, mitt, { width: 0.026 * S, color: '#2c4a58', seed: 313 + side, breakUp: 0.35 })
    ink(ctx, arm.concat([arm[0]!]), { width: 0.02 * S, color: 'rgba(44,74,88,0.55)', seed: 315 + side, breakUp: 0.6 })
  }

  // ── Face: huge hollow eyes, tiny pupils. Cute until you look at it ──
  const bl = blink(t, 1500)
  const fy = -0.04 * S + bob
  for (const [ex, er, sd] of [[-0.155, 0.125, 320], [0.16, 0.11, 326]] as const) {
    const socket = blob(sway + ex * S, fy, er * S, er * 1.25 * S * Math.max(0.1, 1 - bl), sd, 0.08)
    fillShape(ctx, socket, '#16323f')
    // The pupil drifts, never quite settling — the unsettling half of "cute".
    const dx = Math.sin(t / 900 + sd) * 0.02 * S
    const dy = Math.cos(t / 1150 + sd) * 0.015 * S
    if (bl < 0.5) {
      fillShape(ctx, blob(sway + ex * S + dx, fy + dy, er * 0.3 * S, er * 0.34 * S, sd + 1, 0.15), '#eafcff')
    }
    ink(ctx, socket, { width: 0.02 * S, color: '#25404e', seed: sd + 2, breakUp: 0.5 })
  }
  // A small open "oh" of a mouth.
  const mouth = blob(sway + 0.01 * S, 0.19 * S + bob, 0.055 * S, 0.07 * S, 330, 0.16)
  fillShape(ctx, mouth, '#16323f')
  ink(ctx, mouth, { width: 0.016 * S, color: '#25404e', seed: 331, breakUp: 0.5 })
  // Cheek blushes, because it is meant to be endearing.
  ctx.save()
  ctx.globalAlpha = 0.5
  fillShape(ctx, blob(sway - 0.3 * S, 0.11 * S + bob, 0.07 * S, 0.045 * S, 332, 0.2), '#8fd8e8')
  fillShape(ctx, blob(sway + 0.31 * S, 0.12 * S + bob, 0.065 * S, 0.042 * S, 333, 0.2), '#8fd8e8')
  ctx.restore()

  // ── Its little lantern ──
  const lx = sway + 0.56 * S
  const ly = 0.46 * S + bob + Math.sin(t / 700 + 1) * 0.03 * S
  stroke(ctx, [[sway + 0.54 * S, 0.36 * S + bob], [lx, ly - 0.08 * S]], 0.012 * S, 0.01 * S, '#2c4a58', 340)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 0.3 * S)
  lg.addColorStop(0, 'rgba(255,220,130,0.85)')
  lg.addColorStop(1, 'rgba(255,190,90,0)')
  ctx.fillStyle = lg
  ctx.beginPath(); ctx.arc(lx, ly, 0.3 * S, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  const lamp = rough([
    [lx - 0.055 * S, ly - 0.07 * S], [lx + 0.055 * S, ly - 0.07 * S],
    [lx + 0.045 * S, ly + 0.07 * S], [lx - 0.045 * S, ly + 0.07 * S]
  ], 0.006 * S, 341)
  paint(ctx, S, lamp, tones('#ffd76a', 0.9), 341, {
    line: LINE.fine, inkColor: '#3a2a18', deep: false
  })

  // ── Trailing motes ──
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 7; i++) {
    const ph = (t / 2200 + i * 0.29) % 1
    const mx = sway + (noise2(i * 2.7, 2, 350) - 0.5) * 0.8 * S
    const my = 0.6 * S + bob + ph * 0.5 * S
    ctx.globalAlpha = (1 - ph) * 0.55
    ctx.fillStyle = '#9ef2e4'
    ctx.beginPath(); ctx.arc(mx, my, (0.01 + noise2(i, 7, 351) * 0.012) * S, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

// ─── 5 · Marrow Knight ──────────────────────────────────────────────────────

const drawMarrowKnight = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  // Heavy and unhurried: a long cycle with a shallow bob. Rank is pace.
  const g = gait(t, 1700)
  const b = breathe(t, 0.55, 0.006) * S + bodyBob(g, 0.022) * S
  const sway = Math.sin(t / 2600) * 0.012 * S + weightShift(g + 0.5, 0.03) * S

  groundShadow(ctx, S, 0.46, 1.04, 0.34)

  const BONE = tones('#e6d9bd', 1.05)
  const IRON = tones('#525a66', 1.1)
  const CAPE = tones('#a3261f')

  // ── Cape ──
  // Narrower at the shoulders than at the hem, and TORN — a rectangle of red
  // behind a figure is a background, whereas a shape with a silhouette of its
  // own is a garment.
  const capePts: Pt[] = [
    [sway - 0.26 * S, -0.14 * S + b],
    [sway - 0.38 * S, 0.24 * S],
    [sway - 0.46 * S, 0.66 * S]
  ]
  for (let i = 0; i <= 9; i++) {
    const k = i / 9
    const x = sway + (-0.47 + k * 0.94) * S
    // The hem answers the stride as well as the breeze.
    const drift = Math.sin(t / 1500 + k * 5) * 0.018 * S + swing(g - 0.18, 0.03) * S
    // Doubling the tip pinches the quadratic, so the hem ends in points rather
    // than in scallops.
    const tip: Pt = [x + drift, (0.96 - (i % 2 ? 0 : 0.11) - noise2(i * 1.7, 3, 400) * 0.05) * S]
    capePts.push(tip, tip)
  }
  capePts.push([sway + 0.46 * S, 0.66 * S], [sway + 0.38 * S, 0.24 * S], [sway + 0.26 * S, -0.14 * S + b])
  cel(ctx, capePts, CAPE, {
    shade: terminator(capePts, SHADOW_DIR, 0.06, 0.16, 401),
    deep: terminator(capePts, SHADOW_DIR, 0.44, 0.13, 402),
    lit: terminator(capePts, SHADOW_DIR + Math.PI, 0.6, 0.12, 403)
  })
  // Folds: long tapered strokes radiating from the shoulders. A few marks say
  // "cloth" far more clearly than any amount of tone does.
  for (const [fx, fx2, fs] of [[-0.14, -0.34, 402], [0.0, 0.06, 403], [0.15, 0.3, 404]] as const) {
    stroke(ctx, [
      [sway + fx * S, -0.06 * S + b],
      [sway + (fx + fx2) * 0.5 * S, 0.36 * S],
      [sway + fx2 * S, 0.86 * S]
    ], 0.008 * S, 0.045 * S, 'rgba(58,10,10,0.5)', fs)
  }
  ink(ctx, capePts, { width: 0.034 * S, color: '#380c0b', seed: 405, breakUp: 0.35 })

  // ── Legs: bare femurs into armoured shins ──
  // Greave and boot are positioned FROM the solved joints rather than from
  // fixed coordinates, so the armour travels with the leg instead of the leg
  // sliding through the armour.
  for (const [lx, ph, sd] of [[-0.15, 0.0, 410], [0.16, 0.5, 414]] as const) {
    const st = footStep(g + ph, 0.13 * S, 0.085 * S)
    const foot: Pt = [lx * S * 0.72 + st[0], 0.99 * S + st[1]]
    const knee = limb(ctx, [sway + lx * S, 0.46 * S + b + hipDrop(g + ph, 0.015) * S], foot,
      0.285 * S, 0.285 * S, lx < 0 ? 1 : -1, BONE, sd,
      { width: 0.072 * S, taper: 0.76, outline: 0.026 * S, joint: 0.62 })
    const gx = knee[0] * 0.42 + foot[0] * 0.58
    const gy = knee[1] * 0.42 + foot[1] * 0.58
    const greave = rough([
      [gx - 0.082 * S, gy - 0.13 * S], [gx + 0.082 * S, gy - 0.14 * S],
      [gx + 0.072 * S, gy + 0.12 * S], [gx - 0.072 * S, gy + 0.11 * S]
    ], 0.008 * S, sd + 1)
    cel(ctx, greave, IRON, {
      shade: terminator(greave, SHADOW_DIR, 0.02, 0.12, sd + 1),
      lit: terminator(greave, SHADOW_DIR + Math.PI, 0.6, 0.1, sd + 2)
    })
    ink(ctx, greave, { width: 0.028 * S, color: INK, seed: sd + 3, breakUp: 0.28 })
    const boot = rough([
      [foot[0] - 0.085 * S, foot[1] - 0.04 * S], [foot[0] + 0.125 * S, foot[1] - 0.05 * S],
      [foot[0] + 0.14 * S, foot[1] + 0.05 * S], [foot[0] - 0.095 * S, foot[1] + 0.06 * S]
    ], 0.007 * S, sd + 4)
    cel(ctx, boot, IRON, { shade: terminator(boot, SHADOW_DIR, -0.05, 0.12, sd + 4) })
    ink(ctx, boot, { width: 0.028 * S, color: INK, seed: sd + 5 })
  }

  // ── Faulds: overlapping skirt plates over the hips ──
  for (let i = 0; i < 3; i++) {
    const w = (0.28 - i * 0.035) * S
    const y = 0.42 * S + i * 0.055 * S + b
    const lame = rough([
      [sway - w, y], [sway + w, y],
      [sway + w * 0.92, y + 0.075 * S], [sway - w * 0.92, y + 0.075 * S]
    ], 0.008 * S, 416 + i)
    cel(ctx, lame, IRON, {
      shade: terminator(lame, SHADOW_DIR, 0.1, 0.1, 416 + i),
      lit: terminator(lame, SHADOW_DIR + Math.PI, 0.66, 0.08, 418 + i)
    })
    ink(ctx, lame, { width: 0.026 * S, color: INK, seed: 419 + i, breakUp: 0.3 })
  }

  // ── Cuirass, broken open over the ribs ──
  const chest = rough([
    [sway - 0.26 * S, -0.06 * S + b], [sway - 0.1 * S, -0.12 * S + b],
    [sway + 0.1 * S, -0.12 * S + b], [sway + 0.26 * S, -0.06 * S + b],
    [sway + 0.29 * S, 0.24 * S + b], [sway + 0.2 * S, 0.46 * S + b],
    [sway - 0.2 * S, 0.46 * S + b], [sway - 0.29 * S, 0.24 * S + b]
  ], 0.012 * S, 420)
  cel(ctx, chest, IRON, {
    shade: terminator(chest, SHADOW_DIR, 0.12, 0.12, 421),
    deep: terminator(chest, SHADOW_DIR, 0.5, 0.1, 422),
    // Plate takes a narrow, hard hit rather than a broad wash — that sliver is
    // most of what separates steel from cloth in cel art.
    lit: terminator(chest, SHADOW_DIR + Math.PI, 0.68, 0.09, 423)
  })

  // The breach, and the ribcage inside it. Drawn as a cavity — dark, with the
  // bone catching light only along the top of each rib.
  const hole = rough([
    [sway - 0.13 * S, 0.06 * S + b], [sway + 0.02 * S, 0.03 * S + b],
    [sway + 0.16 * S, 0.1 * S + b], [sway + 0.12 * S, 0.36 * S + b],
    [sway - 0.06 * S, 0.4 * S + b], [sway - 0.16 * S, 0.26 * S + b]
  ], 0.014 * S, 424)
  ctx.save()
  ctx.beginPath(); trace(ctx, chest); ctx.clip()
  fillShape(ctx, hole, '#120e16')
  ctx.save()
  ctx.beginPath(); trace(ctx, hole); ctx.clip()
  for (let i = 0; i < 4; i++) {
    const ry = 0.1 * S + i * 0.08 * S + b
    for (const side of [-1, 1] as const) {
      const rib: Pt[] = [
        [sway + side * 0.02 * S, ry - 0.01 * S],
        [sway + side * 0.11 * S, ry + 0.012 * S],
        [sway + side * 0.17 * S, ry + 0.06 * S]
      ]
      stroke(ctx, rib, 0.032 * S, 0.016 * S, BONE.deep, 425 + i * 2 + side)
      stroke(ctx, rib.map(([x, y]) => [x, y - 0.011 * S] as Pt), 0.016 * S, 0.007 * S, BONE.shade, 435 + i)
    }
  }
  stroke(ctx, [[sway, 0.05 * S + b], [sway + 0.005 * S, 0.4 * S + b]], 0.038 * S, 0.026 * S, BONE.shade, 439)
  ctx.restore()
  // Torn metal edge around the breach.
  ink(ctx, hole, { width: 0.03 * S, color: '#0f0d13', seed: 428, breakUp: 0.15 })
  ctx.restore()
  ink(ctx, chest, { width: 0.05 * S, color: INK, seed: 429, breakUp: 0.24 })

  // ── Pauldrons: layered lames, spiked, and NOT a matched pair ──
  for (const [side, rx, spikes, sd] of [[-1, 0.2, 3, 430], [1, 0.17, 2, 436]] as const) {
    const px = sway + side * 0.3 * S
    const py = 0.0 * S + b
    for (let i = 0; i < 2; i++) {
      const lame = blob(px + side * i * 0.02 * S, py + i * 0.085 * S,
        (rx - i * 0.018) * S, (0.11 - i * 0.02) * S, sd + i * 7, 0.09)
      cel(ctx, lame, IRON, {
        shade: terminator(lame, SHADOW_DIR, i === 0 ? 0.12 : -0.02, 0.13, sd + i),
        deep: terminator(lame, SHADOW_DIR, 0.5, 0.1, sd + i + 2),
        lit: terminator(lame, SHADOW_DIR + Math.PI, 0.6, 0.11, sd + i + 4)
      })
      ink(ctx, lame, { width: 0.038 * S, color: INK, seed: sd + i + 6, breakUp: 0.26 })
    }
    for (let i = 0; i < spikes; i++) {
      const a = -Math.PI / 2 + side * (0.5 + i * 0.5)
      horn(ctx, px + Math.cos(a) * rx * 0.85 * S, py + Math.sin(a) * 0.1 * S,
        (0.15 - i * 0.025) * S, 0.024 * S, a, side * 0.2, { base: IRON.lit, shade: IRON.deep }, sd + 3 + i)
    }
  }

  // ── Arms ──
  // Drawn AFTER the pauldrons: a forearm emerging from under a shoulder plate
  // reads as an arm, whereas one drawn behind it reads as a floating fist.
  const arm = (sx: number, hand: Pt, angle: number, grip: number, sd: number): void => {
    boneLimb(ctx,
      [sway + sx * S, 0.08 * S + b],
      [sway + sx * S * 1.18, 0.26 * S + b],
      hand,
      0.046 * S, BONE, sd)
    boneHand(ctx, hand[0], hand[1], 0.16 * S, angle, BONE, sd + 6, grip)
  }
  // Off hand open and relaxed; sword hand closed. Armour stops at the wrist —
  // bare bone at the extremities is what keeps this a skeleton in plate rather
  // than a suit of armour with lights in it.
  arm(-0.3, [sway - 0.34 * S, 0.42 * S + b], 1.45, 0.12, 460)

  // ── Greatsword, planted point-down: the pose reads "waiting", not "charging" ──
  const swx = sway + 0.44 * S
  const blade = rough([
    [swx - 0.052 * S, 0.08 * S], [swx + 0.052 * S, 0.08 * S],
    [swx + 0.036 * S, 0.78 * S], [swx, 1.02 * S], [swx - 0.036 * S, 0.78 * S]
  ], 0.007 * S, 440)
  cel(ctx, blade, tones('#96a1ae', 1.15), {
    shade: terminator(blade, 0, 0.0, 0.02, 441),
    lit: terminator(blade, Math.PI, 0.62, 0.02, 442)
  })
  ink(ctx, blade, { width: 0.024 * S, color: INK, seed: 443, breakUp: 0.32 })
  const guard = rough([
    [swx - 0.16 * S, 0.0 * S], [swx + 0.16 * S, 0.0 * S],
    [swx + 0.125 * S, 0.09 * S], [swx - 0.125 * S, 0.09 * S]
  ], 0.007 * S, 444)
  cel(ctx, guard, tones('#c09a45'), {
    shade: terminator(guard, SHADOW_DIR, 0.06, 0.1, 444),
    lit: terminator(guard, SHADOW_DIR + Math.PI, 0.62, 0.08, 445)
  })
  ink(ctx, guard, { width: 0.026 * S, color: INK, seed: 445 })
  stroke(ctx, [[swx, -0.02 * S], [swx, -0.22 * S]], 0.05 * S, 0.044 * S, '#3a2a1c', 446)
  const pommel = blob(swx, -0.25 * S, 0.045 * S, 0.042 * S, 447, 0.15)
  cel(ctx, pommel, tones('#c09a45'), { shade: terminator(pommel, SHADOW_DIR, 0.05, 0.14, 447) })
  ink(ctx, pommel, { width: 0.02 * S, color: INK, seed: 448 })

  // Sword hand last, closing over the grip.
  arm(0.32, [swx - 0.01 * S, -0.09 * S], -1.62, 0.92, 464)

  // ── Skull ──
  // The helm is a BAND, not a hood. Covering the cranium while leaving the face
  // bare is what keeps this a skeleton wearing armour rather than an anonymous
  // silhouette with two lights in it.
  const hy = -0.34 * S + b * 1.4
  const hx = sway
  const skull = egg(hx, hy, 0.215 * S, 0.235 * S, 0.82, 450, 0.05)
  cel(ctx, skull, BONE, {
    shade: terminator(skull, SHADOW_DIR, 0.16, 0.13, 451),
    deep: terminator(skull, SHADOW_DIR, 0.54, 0.11, 452),
    lit: terminator(skull, SHADOW_DIR + Math.PI, 0.56, 0.11, 453)
  })
  ink(ctx, skull, { width: 0.036 * S, color: INK, seed: 454, breakUp: 0.3 })
  // Cheekbones: two short accents, and the flat oval becomes a face.
  stroke(ctx, [[hx - 0.185 * S, hy + 0.02 * S], [hx - 0.1 * S, hy + 0.07 * S]], 0.006 * S, 0.02 * S, 'rgba(110,94,70,0.7)', 455)
  stroke(ctx, [[hx + 0.185 * S, hy + 0.02 * S], [hx + 0.1 * S, hy + 0.07 * S]], 0.02 * S, 0.006 * S, 'rgba(110,94,70,0.7)', 456)
  // Nasal cavity.
  fillShape(ctx, rough([
    [hx, hy + 0.03 * S], [hx - 0.032 * S, hy + 0.11 * S], [hx + 0.032 * S, hy + 0.11 * S]
  ], 0.006 * S, 457), '#3a2f24')

  // Jaw: narrower than the cranium, with a dark mouth line so the teeth read as
  // TEETH and not as a grille.
  const jaw = rough([
    [hx - 0.115 * S, hy + 0.13 * S], [hx + 0.115 * S, hy + 0.13 * S],
    [hx + 0.095 * S, hy + 0.27 * S], [hx - 0.095 * S, hy + 0.27 * S]
  ], 0.007 * S, 458)
  cel(ctx, jaw, BONE, { shade: terminator(jaw, SHADOW_DIR, -0.1, 0.12, 458) })
  stroke(ctx, [[hx - 0.11 * S, hy + 0.2 * S], [hx + 0.11 * S, hy + 0.2 * S]], 0.022 * S, 0.022 * S, 'rgba(46,36,26,0.85)', 459)
  for (let i = 0; i < 5; i++) {
    const tx = hx + (-0.075 + i * 0.037) * S
    stroke(ctx, [[tx, hy + 0.14 * S], [tx, hy + 0.26 * S]], 0.012 * S, 0.01 * S, 'rgba(110,94,70,0.65)', 460 + i)
  }
  ink(ctx, jaw, { width: 0.026 * S, color: INK, seed: 466, breakUp: 0.3 })

  // ── Helm: a brow band with a nasal bar, sitting ON the skull ──
  const helm = rough([
    [hx - 0.25 * S, hy - 0.06 * S], [hx - 0.245 * S, hy - 0.2 * S],
    [hx - 0.11 * S, hy - 0.3 * S], [hx + 0.12 * S, hy - 0.3 * S],
    [hx + 0.25 * S, hy - 0.19 * S], [hx + 0.26 * S, hy - 0.05 * S],
    [hx + 0.16 * S, hy - 0.08 * S], [hx + 0.035 * S, hy - 0.06 * S],
    [hx + 0.03 * S, hy + 0.05 * S], [hx - 0.03 * S, hy + 0.05 * S],
    [hx - 0.035 * S, hy - 0.06 * S], [hx - 0.16 * S, hy - 0.08 * S]
  ], 0.008 * S, 470)
  cel(ctx, helm, IRON, {
    shade: terminator(helm, SHADOW_DIR, 0.08, 0.12, 471),
    deep: terminator(helm, SHADOW_DIR, 0.48, 0.1, 472),
    lit: terminator(helm, SHADOW_DIR + Math.PI, 0.64, 0.1, 473)
  })
  ink(ctx, helm, { width: 0.036 * S, color: INK, seed: 474, breakUp: 0.24 })
  // The band overhangs the sockets — the darkest note on the figure, and what
  // makes the eye-flames read as burning INSIDE something.
  occlude(ctx, helm, 0.5, 0.98, 0.045 * S, 'rgba(12,10,16,0.9)', 475)

  // Horns: one long and swept, one snapped short.
  horn(ctx, hx - 0.22 * S, hy - 0.16 * S, 0.4 * S, 0.05 * S, -2.55, -0.85, tones('#8b96a4', 1.1), 480)
  horn(ctx, hx + 0.22 * S, hy - 0.17 * S, 0.19 * S, 0.048 * S, -0.6, 0.55, tones('#8b96a4', 1.1), 484)

  // ── Socket flames: the cast's shared socket, with a lick rising out of it ──
  for (const [ex, er, sd] of [[-0.098, 0.05, 490], [0.1, 0.045, 494]] as const) {
    const sy2 = hy - 0.06 * S
    socket(ctx, hx + ex * S, sy2, er * S, SOUL_LIGHT, sd, 0.34)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const fl = 0.5 + Math.sin(t / 180 + sd) * 0.5
    fillShape(ctx, [
      [hx + ex * S - 0.018 * S, sy2],
      [hx + ex * S, sy2 - (0.045 + fl * 0.045) * S],
      [hx + ex * S + 0.018 * S, sy2]
    ], 'rgba(190,244,255,0.9)')
    ctx.restore()
  }
}


// ─── 6 · Nibbler ────────────────────────────────────────────────────────────

const drawNibbler = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  // For a flyer the wingbeat is the locomotion cycle. The body rises a beat
  // AFTER the downstroke, not during it — lift arrives late, and animating it
  // in phase is what makes procedural flight look like a bouncing sticker.
  const g = gait(t, 860)
  const flap = Math.sin(g * Math.PI * 2)
  const bob = Math.cos((g - 0.12) * Math.PI * 2) * 0.07 * S

  const FUR = tones('#7c5c90')
  const WING = tones('#9c5670', 0.9)
  const EAR = tones('#c5828f', 0.9)

  groundShadow(ctx, S, 0.2, 1.02, 0.16)

  const cy = 0.14 * S + bob

  // ── Wings, behind everything. The right one lags, so the flap has a beat ──
  for (const side of [-1, 1] as const) {
    const f = flap * (side === 1 ? 1 : 0.82)
    const shoulder: Pt = [side * 0.2 * S, cy - 0.14 * S]
    const tipX = side * (1.02 - Math.abs(f) * 0.12) * S
    const tipY = cy - 0.1 * S + f * 0.3 * S
    // Three finger struts fan from the shoulder; the membrane is slung BETWEEN
    // their tips. Drawing the bays from the struts is what stops a bat wing
    // from looking like a cape.
    const strut = (k: number): Pt => [
      shoulder[0] + (tipX - shoulder[0]) * k,
      shoulder[1] + (tipY - shoulder[1]) * k + Math.sin(k * Math.PI) * side * 0.04 * S
    ]
    const knuckles: Pt[] = [strut(1), strut(0.72), strut(0.46)]
    const heel: Pt = [side * 0.26 * S, cy + 0.3 * S]

    const wing: Pt[] = [shoulder, [shoulder[0] + (tipX - shoulder[0]) * 0.5, tipY - 0.12 * S], knuckles[0]!]
    // Scalloped trailing edge: one sagging bay per gap, the doubled point
    // pinching the quadratic so each bay ends in a claw rather than a scallop.
    const bays: Pt[] = [knuckles[0]!, knuckles[1]!, knuckles[2]!, heel]
    for (let i = 0; i < 3; i++) {
      const a = bays[i]!
      const bpt = bays[i + 1]!
      const mx = (a[0] + bpt[0]) / 2 - side * 0.02 * S
      const my = (a[1] + bpt[1]) / 2 + 0.16 * S
      wing.push([mx, my], [mx, my], bpt)
    }
    paint(ctx, S, wing, WING, 600 + side * 9, { line: LINE.mid, breakUp: 0.3, amp: 0.09 })
    // Seed from the knuckle INDEX, never from its position: that position
    // depends on `flap`, so the seed changed every frame and the struts' width
    // jitter was re-randomised — they boiled. It also scaled with `S`, so the
    // same character looked different at every render size.
    knuckles.forEach((k, ki) => {
      stroke(ctx, [shoulder, k], 0.03 * S, 0.008 * S, 'rgba(52,22,34,0.5)', 612 + ki + (side > 0 ? 0 : 3))
    })
    // Thumb claw on the leading edge — the detail that says "bat", not "bird".
    stroke(ctx, [strut(0.46), [strut(0.46)[0] + side * 0.03 * S, strut(0.46)[1] - 0.07 * S]],
      0.02 * S, 0.005 * S, '#f0e6d0', 616 + side)
  }

  // ── Body: one round fuzzy ball. High noise frequency at the contour reads as
  // fur without drawing a single hair ──
  const body = blob(0, cy + 0.14 * S, 0.31 * S, 0.33 * S, 620, 0.055, 7.5, 96)
  paint(ctx, S, body, FUR, 621, { line: LINE.major, breakUp: 0.22 })
  const chest = blob(-0.01 * S, cy + 0.24 * S, 0.17 * S, 0.15 * S, 622, 0.14)
  ctx.save()
  ctx.beginPath(); trace(ctx, body); ctx.clip()
  paint(ctx, S, chest, tones('#d8c4a6', 0.85), 623, {
    line: LINE.hair, inkColor: 'rgba(28,20,24,0.4)', breakUp: 0.6, deep: false
  })
  ctx.restore()

  // ── Feet: tiny, tucked up, entirely out of proportion ──
  for (const side of [-1, 1] as const) {
    // Feet dangle and trail — they are cargo, not landing gear.
    const tr = swing(g - 0.3, 0.035) * S
    const fx = side * 0.13 * S
    stroke(ctx, [[fx, cy + 0.4 * S], [fx + side * 0.03 * S + tr, cy + 0.5 * S]], 0.045 * S, 0.03 * S, FUR.shade, 626 + side)
    for (let i = -1; i <= 1; i++) {
      stroke(ctx, [
        [fx + side * 0.03 * S + tr, cy + 0.5 * S],
        [fx + side * 0.03 * S + tr * 1.5 + i * 0.03 * S, cy + 0.56 * S]
      ], 0.016 * S, 0.004 * S, '#f0e6d0', 628 + i)
    }
  }

  // ── Ears: enormous, one cocked further back than the other ──
  const hy = cy - 0.14 * S
  for (const [dx, dy, tilt, h, sd] of [
    [-0.2, -0.18, -0.36, 0.4, 630], [0.21, -0.16, 0.48, 0.33, 636]
  ] as const) {
    const ex = dx * S
    const ey = hy + dy * S
    // Broad leaves, not spikes — width is what separates a bat ear from a hare's.
    const ear = rough([
      [ex - 0.15 * S, ey + 0.04 * S],
      [ex - 0.17 * S + Math.sin(tilt) * h * S * 0.5, ey - h * 0.5 * S],
      [ex - 0.02 * S + Math.sin(tilt) * h * S, ey - h * S],
      [ex + 0.17 * S + Math.sin(tilt) * h * S * 0.45, ey - h * 0.4 * S],
      [ex + 0.15 * S, ey + 0.07 * S]
    ], 0.016 * S, sd)
    paint(ctx, S, ear, FUR, sd + 1, { line: LINE.mid, breakUp: 0.28 })
    const inner = shrink(ear, 0.62, ex, ey - h * 0.34 * S)
    paint(ctx, S, inner, EAR, sd + 2, {
      line: LINE.hair, inkColor: 'rgba(28,20,24,0.4)', breakUp: 0.5, deep: false
    })
  }

  // ── Face ──
  const bl = blink(t, 700)
  eye(ctx, -0.115 * S, hy + 0.02 * S, 0.105 * S, {
    iris: '#ffd24a', glow: '#ffdc78', pupil: 0.46, lid: bl, brow: 0.3, seed: 640
  })
  eye(ctx, 0.12 * S, hy + 0.04 * S, 0.088 * S, {
    iris: '#ffd24a', glow: '#ffdc78', pupil: 0.5, lid: bl, brow: 0.22, seed: 646
  })
  fillShape(ctx, rough([
    [0, hy + 0.13 * S], [-0.038 * S, hy + 0.19 * S], [0, hy + 0.24 * S], [0.038 * S, hy + 0.19 * S]
  ], 0.006 * S, 650), '#54303f')
  stroke(ctx, [
    [-0.085 * S, hy + 0.25 * S], [0, hy + 0.29 * S], [0.085 * S, hy + 0.24 * S]
  ], 0.02 * S, 0.014 * S, INK, 651)
  for (const [fx, fh] of [[-0.055, 0.062], [0.04, 0.05]] as const) {
    const f: Pt[] = [
      [fx * S, hy + 0.26 * S],
      [(fx + 0.022) * S, hy + (0.26 + fh) * S],
      [(fx + 0.044) * S, hy + 0.255 * S]
    ]
    paint(ctx, S, f, tones('#f6eeda', 0.9), 652, { line: LINE.hair, deep: false })
  }
}

// ─── 7 · Cinderhound ────────────────────────────────────────────────────────

const drawCinderhound = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  // A trot, not a walk: diagonal pairs land together, so the cycle has two
  // beats instead of four. It is the gait of something covering ground.
  const g = gait(t, 620)
  const b = breathe(t, 1.7, 0.008) * S + bodyBob(g, 0.016) * S

  groundShadow(ctx, S, 0.5, 1.02, 0.3)

  // Charcoal, not brown: it must not be mistaken for Snaggletusk at a glance.
  const HIDE = tones('#4a4048', 1.15)
  const DARK = tones('#332b33', 1.1)
  // The skull runs a step lighter than the body so the face is the brightest
  // non-fire thing on the animal.
  const HEAD = tones('#61535f', 1.15)

  /**
   * A lick of flame — three nested tongues, hottest and smallest last.
   *
   * The previous mane was one tongue per position at even spacing, which reads
   * as birthday candles. Fire reads as fire when the licks OVERLAP and no two
   * are the same height.
   */
  const flame = (x: number, y: number, h: number, w: number, phase: number): void => {
    const f = 0.62 + Math.sin(t / 140 + phase) * 0.38
    const lean = Math.sin(t / 380 + phase) * 0.35
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    // Each lick carries its own falloff, so the bloom is the sum of many soft
    // sources rather than one shape with an edge.
    const g = ctx.createRadialGradient(x, y - h * f * 0.3 * S, 0, x, y - h * f * 0.3 * S, h * f * 1.1 * S)
    g.addColorStop(0, 'rgba(255,140,40,0.3)')
    g.addColorStop(1, 'rgba(255,120,30,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(x, y - h * f * 0.3 * S, h * f * 1.1 * S, 0, Math.PI * 2); ctx.fill()
    for (const [k, color] of [
      [1, 'rgba(214,62,14,0.42)'], [0.66, 'rgba(255,150,40,0.55)'], [0.32, 'rgba(255,238,180,0.75)']
    ] as const) {
      const hh = h * f * k * S
      fillShape(ctx, [
        [x - w * S * k, y],
        [x - w * 0.5 * S * k, y - hh * 0.5],
        [x + lean * hh * 0.35, y - hh],
        [x + w * 0.5 * S * k, y - hh * 0.45],
        [x + w * S * k, y]
      ], color)
    }
    ctx.restore()
  }

  /** One leg, solved to its stepped foot. Straight tubes read as furniture. */
  const leg = (
    hip: Pt, footX: number, phase: number, bend: number,
    w: number, tone: CelTones, sd: number
  ): void => {
    const st = footStep(g + phase, 0.17 * S, 0.09 * S)
    const foot: Pt = [footX + st[0], 1.0 * S + st[1]]
    limb(ctx, hip, foot, 0.365 * S, 0.365 * S, bend, tone, sd,
      { width: w * S, taper: 0.62, joint: 0.42 })
    const paw = blob(foot[0], foot[1], w * 0.72 * S, w * 0.42 * S, sd + 20, 0.14)
    paint(ctx, S, paw, DARK, sd + 20, { line: LINE.fine, deep: false })
  }

  // ── Far legs first, a full tone down: depth by value, not by outline ──
  // Diagonal pairs share a phase — near-front with far-hind, and vice versa.
  leg([-0.14 * S, 0.3 * S + b], -0.1 * S, 0.5, -1, 0.115, DARK, 700)
  leg([0.46 * S, 0.28 * S + b], 0.56 * S, 0.0, 1, 0.12, DARK, 706)

  // ── Torso: deep narrow chest, tucked waist, high haunch. A sighthound
  // silhouette — the exact inverse of Snaggletusk's low heavy mass ──
  const torso = rough([
    [-0.32 * S, 0.08 * S + b],
    [-0.04 * S, -0.04 * S + b],
    [0.3 * S, 0.0 * S + b],
    [0.5 * S, 0.12 * S + b],
    [0.52 * S, 0.4 * S + b],
    [0.34 * S, 0.46 * S + b],
    [0.1 * S, 0.34 * S + b],
    [-0.14 * S, 0.44 * S + b],
    [-0.32 * S, 0.36 * S + b]
  ], 0.02 * S, 720)
  paint(ctx, S, torso, HIDE, 721, { line: LINE.major, breakUp: 0.26 })
  // Ribs showing through a starved hide, and a hollow behind the shoulder.
  ctx.save()
  ctx.beginPath(); trace(ctx, torso); ctx.clip()
  for (let i = 0; i < 4; i++) {
    stroke(ctx, [
      [(-0.22 + i * 0.08) * S, 0.06 * S + b],
      [(-0.27 + i * 0.08) * S, 0.34 * S]
    ], 0.007 * S, 0.024 * S, 'rgba(20,14,20,0.42)', 724 + i)
  }
  ctx.restore()

  // ── Cracks: molten seams that follow the form, with the glow bleeding out ──
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const [cx, cy, dx, dy, sd] of [
    [0.3, 0.14, 0.06, 0.14, 730], [0.06, 0.28, 0.07, 0.07, 732]
  ] as const) {
    const g = ctx.createRadialGradient(cx * S, cy * S + b, 0, cx * S, cy * S + b, 0.11 * S)
    g.addColorStop(0, 'rgba(255,120,30,0.34)')
    g.addColorStop(1, 'rgba(255,120,30,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(cx * S, cy * S + b, 0.11 * S, 0, Math.PI * 2); ctx.fill()
    stroke(ctx, [
      [cx * S, cy * S + b],
      [(cx + dx * 0.5) * S, (cy + dy * 0.6) * S + b],
      [(cx + dx) * S, (cy + dy) * S]
    ], 0.009 * S, 0.003 * S, 'rgba(255,200,120,0.7)', sd)
  }
  ctx.restore()

  // ── Tail: a thin whip that ends in fire ──
  const wag = Math.sin(t / 620) * 0.07 * S
  stroke(ctx, [
    [0.5 * S, 0.12 * S + b], [0.68 * S, -0.06 * S + wag], [0.74 * S, -0.32 * S + wag * 1.6]
  ], 0.05 * S, 0.012 * S, HIDE.shade, 740)
  flame(0.74 * S, -0.3 * S + wag * 1.6, 0.3, 0.04, 1.8)

  // ── Neck: a wedge running DOWN and forward off a high shoulder. Carrying the
  // head below the withers is the whole difference between a dog standing and
  // a predator closing ──
  const hx = -0.5 * S
  const hy = 0.24 * S + b
  const neck = rough([
    [-0.3 * S, -0.02 * S + b],
    [hx + 0.16 * S, hy - 0.16 * S],
    [hx + 0.2 * S, hy + 0.12 * S],
    [-0.2 * S, 0.28 * S + b]
  ], 0.016 * S, 745)
  paint(ctx, S, neck, HIDE, 746, { line: LINE.mid, breakUp: 0.3 })

  // ── Near legs, over the body ──
  leg([-0.26 * S, 0.3 * S + b], -0.32 * S, 0.0, -1, 0.125, HIDE, 750)
  leg([0.34 * S, 0.28 * S + b], 0.36 * S, 0.5, 1, 0.13, HIDE, 756)

  // ── Head: a long narrow wedge with the muzzle clearly its own form ──
  const skull = rough([
    [hx + 0.2 * S, hy - 0.18 * S],
    [hx - 0.04 * S, hy - 0.22 * S],
    [hx - 0.16 * S, hy - 0.1 * S],
    [hx - 0.12 * S, hy + 0.1 * S],
    [hx + 0.06 * S, hy + 0.18 * S],
    [hx + 0.22 * S, hy + 0.12 * S]
  ], 0.012 * S, 760)
  paint(ctx, S, skull, HEAD, 761, { line: LINE.mid, breakUp: 0.26 })
  // Firelight spilling onto the top of the skull. The mane is a light source;
  // if nothing catches it, it reads as a decal instead of as flame.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  occlude(ctx, skull, 0.03, 0.28, 0.018 * S, 'rgba(255,150,60,0.3)', 762)
  ctx.restore()

  const muzzle = rough([
    [hx - 0.12 * S, hy - 0.11 * S],
    [hx - 0.32 * S, hy - 0.06 * S],
    [hx - 0.37 * S, hy + 0.05 * S],
    [hx - 0.3 * S, hy + 0.14 * S],
    [hx - 0.08 * S, hy + 0.14 * S]
  ], 0.01 * S, 764)
  paint(ctx, S, muzzle, HIDE, 765, { line: LINE.fine, breakUp: 0.3 })
  fillShape(ctx, blob(hx - 0.35 * S, hy - 0.02 * S, 0.042 * S, 0.033 * S, 766, 0.18), '#120d14')
  // Bared teeth: four, not a zip of five.
  for (let i = 0; i < 4; i++) {
    const tx = hx - (0.28 - i * 0.055) * S
    fillShape(ctx, [
      [tx, hy + 0.1 * S],
      [tx + 0.015 * S, hy + (0.1 + 0.042 - i * 0.005) * S],
      [tx + 0.03 * S, hy + 0.1 * S]
    ], '#f2e8d2')
  }
  stroke(ctx, [[hx - 0.31 * S, hy + 0.11 * S], [hx - 0.06 * S, hy + 0.15 * S]],
    0.014 * S, 0.02 * S, 'rgba(16,10,16,0.75)', 767)

  // Ears swept flat back — an animal that is not asking a question.
  for (const [ex, ey, len2, sd] of [[0.08, -0.16, 0.28, 770], [0.16, -0.1, 0.22, 774]] as const) {
    const ear = rough([
      [hx + ex * S, hy + ey * S],
      [hx + (ex + len2) * S, hy + (ey - 0.14) * S],
      [hx + (ex + len2 * 0.85) * S, hy + (ey + 0.04) * S]
    ], 0.01 * S, sd)
    paint(ctx, S, ear, DARK, sd + 1, { line: LINE.fine, deep: false })
  }

  const bl = blink(t, 400)
  eye(ctx, hx - 0.05 * S, hy - 0.02 * S, 0.048 * S, {
    iris: '#ffb020', glow: '#ff8c18', pupil: 0.32, lid: bl, brow: 0.9, seed: 780, sclera: '#f6d8a8'
  })
  eye(ctx, hx + 0.11 * S, hy - 0.06 * S, 0.04 * S, {
    iris: '#ffb020', glow: '#ff8c18', pupil: 0.32, lid: bl, brow: 0.75, seed: 784, sclera: '#dcbe96'
  })

  // ── Mane: a dense run of overlapping licks along the neck's top edge, which
  // is a DIAGONAL. Anchoring fire to the true topline is what makes it look
  // like it is growing out of the animal ──
  // The mane was laid out along a straight line, so half the licks were rooted
  // INSIDE the body — which, being drawn additively, made them glow through the
  // hide as pale vertical bars. Sampling the neck's and the back's own contours
  // roots every flame exactly on the silhouette, and keeps it there while the
  // animal trots.
  // The ranges matter as much as the anchoring: `torso` is authored top-edge
  // first, so its spine runs u 0…0.33 — sampling 0.6…0.86 walked the BELLY,
  // which is how the licks ended up in the middle of the animal.
  const mane = contourPoints(skull, 0.03, 0.3, 3)
    .concat(contourPoints(neck, 0.82, 0.99, 2))
    .concat(contourPoints(torso, 0.0, 0.33, 10))
  mane.forEach(({ p, n }, i) => {
    const k = i / (mane.length - 1)
    // Sink the base a touch so no flame floats clear of the hide.
    const h = 0.12 + noise2(i * 1.7, 5, 791) * 0.16 + Math.sin(k * Math.PI) * 0.14
    flame(
      p[0] - n[0] * 0.025 * S,
      p[1] - n[1] * 0.025 * S,
      h, 0.026 + noise2(i, 9, 792) * 0.014, i * 1.9
    )
  })

  // Warm rim along the lit topline: the fire is a light source, and nothing
  // sells that faster than the edge it catches.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  occlude(ctx, torso, 0.05, 0.2, 0.014 * S, 'rgba(255,150,60,0.22)', 795)
  ctx.restore()
}

// ─── 8 · Blorp ──────────────────────────────────────────────────────────────

const drawBlorp = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  // A slime's walk is a hop, and a hop is squash-and-stretch on a timer:
  // compress on the ground, extend through the launch, hang, then land hard.
  // The KEY is that squash lasts a short time and hang lasts a long one — even
  // timing reads as a bouncing ball rather than as an animal deciding to move.
  const g = gait(t, 1250)
  const air = g < 0.42 ? 0 : Math.sin((g - 0.42) / 0.58 * Math.PI)
  const land = g < 0.16 ? Math.sin((1 - g / 0.16) * Math.PI * 0.5) : 0
  const hop = -air * 0.2 * S
  // Stretch in the air, squash on impact. One number drives both.
  const squash = land * 0.14 - air * 0.07
  const GEL = tones('#79c25a', 0.72)
  const SUNK = tones('#cfc3a4', 0.8)

  groundShadow(ctx, S, 0.56 - air * 0.1, 1.03, 0.28 - air * 0.1)

  // ── The sword it failed to digest, sticking out of the top ──
  // Pure silhouette work: a dome is a dome, but a dome with a sword in it has
  // a読み — and it explains the character in one glance.
  const swx = 0.3 * S
  const hilt = rough([
    [swx - 0.03 * S, -0.34 * S + hop], [swx + 0.03 * S, -0.34 * S + hop],
    [swx + 0.024 * S, 0.24 * S + hop], [swx - 0.024 * S, 0.24 * S + hop]
  ], 0.006 * S, 850)
  paint(ctx, S, hilt, tones('#9aa5b2', 1.15), 851, { line: LINE.hair, amp: 0.03 })
  const cross = rough([
    [swx - 0.11 * S, -0.4 * S + hop], [swx + 0.11 * S, -0.4 * S + hop],
    [swx + 0.085 * S, -0.33 * S + hop], [swx - 0.085 * S, -0.33 * S + hop]
  ], 0.005 * S, 852)
  paint(ctx, S, cross, tones('#b08a3c'), 853, { line: LINE.hair, deep: false })
  stroke(ctx, [[swx, -0.42 * S + hop], [swx, -0.56 * S + hop]], 0.036 * S, 0.03 * S, '#3d2a1a', 854)
  fillShape(ctx, blob(swx, -0.59 * S + hop, 0.036 * S, 0.034 * S, 855, 0.15), '#b08a3c')

  // ── Body: a low wide dome that settles and rebounds ──
  // Low contrast on purpose — a translucent thing with hard shadow bands reads
  // as painted plastic. `tones(…, 0.72)` is doing that work.
  const cy = 0.56 * S + hop
  const rx = (0.56 + squash * 0.9) * S
  const ry = (0.45 - squash * 1.1) * S
  const body: Pt[] = []
  const n = 84
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const sy = Math.sin(a)
    const cx0 = Math.cos(a)
    // Spread flat where it meets the ground; peak into a drip up top-left.
    const flat = sy > 0.3 ? 1 + (sy - 0.3) * 0.34 : 1
    const squat = sy > 0.55 ? 1 - (sy - 0.55) * 0.5 : 1
    // Drip on the top-left, weighted smoothly by how far up and how far left
    // the sample is. A hard `if` on the angle leaves a visible step in the
    // contour — the one thing a blob silhouette cannot survive.
    const up = Math.max(0, -sy - 0.3) / 0.7
    const left = Math.max(0, -cx0 - 0.05) / 0.95
    const peak = 1 + up * up * left * 0.5
    const wobble = 1 + Math.sin(a * 4 + t / 620) * 0.035
    body.push([cx0 * rx * flat * wobble, cy + sy * ry * squat * peak * wobble])
  }
  cel(ctx, body, GEL, {
    shade: terminator(body, SHADOW_DIR, 0.24, 0.16, 800),
    deep: terminator(body, SHADOW_DIR, 0.64, 0.12, 801)
  })

  // ── What it has eaten, seen THROUGH the gel ──
  ctx.save()
  ctx.beginPath(); trace(ctx, body); ctx.clip()
  ctx.globalAlpha = 0.5
  // A skull, tipped over, big enough to actually read.
  const sunk = egg(-0.18 * S, cy + 0.26 * S, 0.16 * S, 0.17 * S, 0.8, 810, 0.06)
  paint(ctx, S, sunk, SUNK, 811, { line: LINE.fine, inkColor: 'rgba(28,44,22,0.7)', deep: false })
  for (const [ex, er] of [[-0.06, 0.045], [0.06, 0.038]] as const) {
    fillShape(ctx, blob(-0.18 * S + ex * S, cy + 0.23 * S, er * S, er * 1.1 * S, 812 + ex * 100, 0.12), '#33421f')
  }
  fillShape(ctx, rough([
    [-0.17 * S, cy + 0.3 * S], [-0.2 * S, cy + 0.37 * S], [-0.13 * S, cy + 0.37 * S]
  ], 0.005 * S, 813), '#33421f')
  // A femur and a coin.
  stroke(ctx, [[0.06 * S, cy + 0.34 * S], [0.26 * S, cy + 0.28 * S]], 0.05 * S, 0.042 * S, SUNK.base, 814)
  fillShape(ctx, blob(0.05 * S, cy + 0.35 * S, 0.036 * S, 0.05 * S, 815, 0.2), SUNK.base)
  fillShape(ctx, blob(0.27 * S, cy + 0.27 * S, 0.036 * S, 0.05 * S, 816, 0.2), SUNK.base)
  const coin = blob(0.12 * S, cy + 0.06 * S, 0.06 * S, 0.058 * S, 817, 0.1)
  paint(ctx, S, coin, tones('#d9a83a'), 818, { line: LINE.hair, deep: false })
  ctx.restore()

  // ── Rim light along the lit edge: the read that says "wet" ──
  occlude(ctx, body, 0.56, 0.88, 0.05 * S, 'rgba(226,255,206,0.6)', 802)
  fillShape(ctx, blob(-0.24 * S, cy - 0.3 * S, 0.11 * S, 0.05 * S, 803, 0.2), 'rgba(240,255,220,0.65)')
  fillShape(ctx, blob(-0.06 * S, cy - 0.34 * S, 0.04 * S, 0.022 * S, 804, 0.2), 'rgba(240,255,220,0.5)')
  ink(ctx, body, { width: LINE.major * S, color: '#26401c', seed: 805, breakUp: 0.3 })

  // ── Face, up in the drip where the light is ──
  const bl = blink(t, 1900)
  const fy = cy - 0.18 * S
  eye(ctx, -0.17 * S, fy, 0.1 * S, { iris: '#1d3316', pupil: 0.62, lid: bl, seed: 820, sclera: '#f2ffe4' })
  eye(ctx, 0.12 * S, fy + 0.02 * S, 0.088 * S, { iris: '#1d3316', pupil: 0.62, lid: bl, seed: 826, sclera: '#f2ffe4' })
  const grin: Pt[] = []
  for (let i = 0; i <= 12; i++) {
    const k = i / 12
    grin.push([(-0.21 + k * 0.4) * S, fy + 0.19 * S + Math.sin(k * Math.PI) * 0.075 * S])
  }
  stroke(ctx, grin, 0.024 * S, 0.016 * S, '#26401c', 830)

  // ── Drips: one leaving the body, one already on the ground ──
  const dp = (t / 1700) % 1
  ctx.save()
  ctx.globalAlpha = 0.85
  fillShape(ctx, blob(0.4 * S, cy + 0.34 * S + dp * 0.4 * S, (0.035 - dp * 0.012) * S, (0.05 - dp * 0.016) * S, 840, 0.18), GEL.base)
  ctx.restore()
}

// ─── 9 · Thornwick ──────────────────────────────────────────────────────────

const drawThornwick = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  // Very slow, and it leans into each step. A tree that walks should look like
  // it is deciding to.
  const g = gait(t, 3200)
  const b = bodyBob(g, 0.019) * S
  const creak = Math.sin(t / 2400) * 0.018 * S + weightShift(g + 0.5, 0.05) * S

  const BARK = tones('#6d4f37', 1.05)
  const BARK_D = tones('#4a3423', 1.05)
  const LEAF = tones('#5d8f38')
  const LEAF_D = tones('#3d6b26')
  const MOSS = tones('#6f8f3c', 0.9)
  const BERRY = tones('#b83a44')

  groundShadow(ctx, S, 0.52, 1.03, 0.3)

  // ── Vocabulary ──

  /** A single leaf: pointed oval, authored once along +x. */
  const LEAF_SHAPE: Pt[] = [
    [0.0, 0.0], [0.28, -0.21], [0.7, -0.17], [1.0, 0.0], [0.7, 0.18], [0.28, 0.21]
  ]
  const leaf = (
    x: number, y: number, len: number, a: number, tone: CelTones, sd: number, outline = true
  ): void => {
    const pts = pivot(LEAF_SHAPE.map(([lx, ly]) => [lx * len, ly * len] as Pt), x, y, a)
    paint(ctx, S, pts, tone, sd, {
      line: outline ? LINE.hair : false, deep: false, breakUp: 0.35, amp: 0.1
    })
    if (outline) {
      const tip = pivot([[len * 0.92, 0]], x, y, a)[0]!
      stroke(ctx, [[x, y], tip], len * 0.055, len * 0.015, 'rgba(28,44,16,0.4)', sd + 1)
    }
  }

  /**
   * A leaf cluster.
   *
   * A blob of green has a smooth silhouette, and a smooth silhouette is the one
   * thing foliage never has. The mass behind is only there to stop daylight
   * showing through; the read comes entirely from individual leaves breaking
   * the edge.
   */
  const cluster = (cx: number, cy: number, r: number, sd: number): void => {
    fillShape(ctx, blob(cx, cy + r * 0.12, r * 0.86, r * 0.62, sd, 0.26, 3.4), LEAF_D.deep)
    const n = 9
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + noise2(i, sd, sd) * 0.6
      const d = r * (0.34 + noise2(i * 1.7, sd + 2, sd) * 0.5)
      const len = r * (0.6 + noise2(i * 2.3, sd + 4, sd) * 0.5)
      leaf(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, len, a,
        i % 3 === 0 ? LEAF_D : LEAF, sd + 10 + i)
    }
    for (let i = 0; i < 2; i++) {
      const bx = cx + (noise2(i * 3.1, sd, sd) - 0.5) * r * 0.9
      const by = cy + (noise2(i * 1.9, sd + 3, sd) - 0.5) * r * 0.6
      const berry = blob(bx, by, r * 0.13, r * 0.125, sd + 30 + i, 0.14)
      paint(ctx, S, berry, BERRY, sd + 32 + i, { line: LINE.hair, deep: false })
    }
  }

  /** A woody limb: tapered, with a lit top edge and a shadowed underside. */
  const wood = (pts: Pt[], w0: number, w1: number, tone: CelTones, sd: number): void => {
    stroke(ctx, pts, w0, w1, tone.base, sd)
    stroke(ctx, pts.map(([x, y]) => [x - w0 * 0.16, y - w0 * 0.24] as Pt),
      w0 * 0.36, w1 * 0.3, tone.lit, sd + 1)
    stroke(ctx, pts.map(([x, y]) => [x + w0 * 0.22, y + w0 * 0.2] as Pt),
      w0 * 0.26, w1 * 0.2, tone.shade, sd + 2)
  }

  const thorn = (x: number, y: number, a: number, len: number, sd: number): void => {
    horn(ctx, x, y, len, len * 0.24, a, 0.22, { base: BARK.lit, shade: BARK.deep }, sd)
  }

  // ── Roots ──
  // Six of them, splaying wide and curving as they go. A trunk that meets the
  // ground as a straight cut reads as a fence post; the flare and the overlap
  // are what make it a tree.
  for (const [rx, ry, w, sd, tone] of [
    [-0.54, 0.32, 0.1, 900, BARK_D], [-0.34, 0.4, 0.075, 903, BARK],
    [0.5, 0.3, 0.095, 906, BARK_D], [0.3, 0.4, 0.07, 909, BARK]
  ] as const) {
    wood([
      [rx * S * 0.24, 0.6 * S + b],
      [rx * S * 0.66, (0.78 + ry * 0.3) * S],
      [rx * S, (0.7 + ry) * S],
      [rx * S * 1.24, (0.74 + ry * 0.95) * S]
    ], 0.12 * S, w * S * 0.3, tone, sd)
  }

  // Two of the roots take the weight and walk.
  for (const [rx, ph, sd] of [[-0.28, 0.0, 912], [0.26, 0.5, 918]] as const) {
    const st = footStep(g + ph, 0.13 * S, 0.075 * S)
    const foot: Pt = [rx * S * 0.95 + st[0], 1.0 * S + st[1]]
    limb(ctx, [rx * S * 0.4, 0.54 * S + b + hipDrop(g + ph, 0.016) * S], foot,
      0.255 * S, 0.255 * S, rx < 0 ? 1 : -1,
      BARK, sd, { width: 0.115 * S, taper: 0.55, joint: 0.52 })
    clawFoot(ctx, foot[0], foot[1] + 0.02 * S, 0.16 * S, rx < 0 ? Math.PI : 0,
      BARK, sd + 3, 3, BARK.lit)
  }

  // ── Trunk ──
  // Built from a continuous profile rather than from ten authored corners: a
  // width that tapers on a curve and a centre-line that leans. The old version
  // was a polygon with parallel sides, which is why it read as a plank.
  const V = 22
  const trunkX = (v: number): number =>
    Math.sin(v * 2.3 + 0.3) * 0.085 * S + creak * (0.35 + v * 1.0)
  const trunkY = (v: number): number => (0.82 - v * 1.56) * S + b * (0.3 + v * 0.7)
  const trunkW = (v: number): number =>
    (0.105 + 0.21 * (1 - v) ** 2.5) * S * (1 + (noise2(v * 7.5, 3, 920) - 0.5) * 0.16)

  const trunkL: Pt[] = []
  const trunkR: Pt[] = []
  for (let i = 0; i <= V; i++) {
    const v = i / V
    trunkL.push([trunkX(v) - trunkW(v), trunkY(v)])
    trunkR.unshift([trunkX(v) + trunkW(v), trunkY(v)])
  }
  const trunk = trunkL.concat(trunkR)
  paint(ctx, S, trunk, BARK, 921, { line: LINE.major, breakUp: 0.24, amp: 0.3 })

  // Bark: long fissures that FOLLOW the lean, plus a few raised plates. Grain
  // drawn on a straight line across a curved trunk is the same mistake as
  // spines on a straight line across a curved back.
  ctx.save()
  ctx.beginPath(); trace(ctx, trunk); ctx.clip()
  for (let f = 0; f < 4; f++) {
    const off = (-0.55 + f * 0.38) + (noise2(f * 2.1, 1, 922) - 0.5) * 0.2
    const line: Pt[] = []
    for (let i = 0; i <= 10; i++) {
      const v = 0.04 + (i / 10) * 0.92
      line.push([trunkX(v) + off * trunkW(v), trunkY(v)])
    }
    stroke(ctx, line, 0.008 * S, 0.028 * S,
      f % 2 ? 'rgba(30,18,10,0.62)' : 'rgba(166,130,86,0.4)', 923 + f)
  }
  for (let i = 0; i < 4; i++) {
    const v = 0.12 + i * 0.22
    const plate = rough([
      [trunkX(v) + 0.1 * trunkW(v), trunkY(v)],
      [trunkX(v) + 0.95 * trunkW(v), trunkY(v) - 0.02 * S],
      [trunkX(v + 0.14) + 0.9 * trunkW(v), trunkY(v + 0.14)],
      [trunkX(v + 0.14) + 0.05 * trunkW(v), trunkY(v + 0.14) + 0.02 * S]
    ], 0.014 * S, 928 + i)
    paint(ctx, S, plate, BARK_D, 930 + i, {
      line: LINE.hair, inkColor: 'rgba(30,18,10,0.5)', breakUp: 0.45, deep: false
    })
  }
  // Moss, only on the shadow side — where moss actually grows.
  ctx.save()
  ctx.globalAlpha = 0.65
  for (let i = 0; i < 7; i++) {
    const v = 0.08 + i * 0.13
    const patch = blob(
      trunkX(v) + trunkW(v) * (0.42 + noise2(i, 7, 936) * 0.4), trunkY(v),
      (0.04 + noise2(i * 1.7, 2, 937) * 0.04) * S,
      (0.05 + noise2(i * 2.3, 5, 938) * 0.06) * S,
      936 + i, 0.42, 4.2
    )
    paint(ctx, S, patch, i % 2 ? MOSS : tones('#556f2c', 0.85), 939 + i, { line: false })
  }
  ctx.restore()
  ctx.restore()

  // ── Branches ──
  // Each one forks: a limb that ends in a single point reads as a stick, and a
  // tree is nothing but repeated forking.
  interface Twig {
    /** Direction out of the branch tip, radians. */
    a: number
    /** Length of the twig, in world units. */
    len: number
    /** Radius of the leaf cluster on its end. */
    r: number
    /** How far behind the trunk this twig's motion runs, in cycles. */
    lag: number
  }

  const branch = (joints: Pt[], w: number, tone: CelTones, sd: number, twigs: Twig[]): void => {
    wood(joints, w, w * 0.22, tone, sd)
    const last = joints[joints.length - 1]!
    twigs.forEach((tw, i) => {
      // Foliage is light, hinged and far from the trunk, so it whips: it lags
      // the body and it travels further the longer the twig. Each cluster gets
      // its own lag, because a canopy moving in lockstep reads as a printed
      // backdrop rather than as part of the creature.
      const k = tw.len / S
      const amp = 0.05 + k * 0.22
      const sx = swing(g - tw.lag, amp) * S
      const sy = bodyBob(g - tw.lag, amp * 0.7) * S * 1.4
      const end: Pt = [
        last[0] + Math.cos(tw.a + 0.16) * tw.len + sx,
        last[1] + Math.sin(tw.a + 0.16) * tw.len + sy
      ]
      const mid: Pt = [
        last[0] + Math.cos(tw.a) * tw.len * 0.52 + sx * 0.35,
        last[1] + Math.sin(tw.a) * tw.len * 0.52 + sy * 0.35
      ]
      // The twig is drawn to the cluster's own centre, so the two can never
      // drift apart no matter how hard the canopy is swinging.
      wood([last, mid, end], w * 0.36, w * 0.09, tone, sd + 4 + i)
      cluster(end[0], end[1], tw.r, sd + 20 + i * 7)
    })
  }

  // High left arm, raised.
  //
  // The reach of this arm and of the crown below is capped, not chosen freely.
  // A twig's leaf mass ends up at roughly `joint + sin(a) * len + sway + r`,
  // and the cast's contract is a crown at −1.05 — this arm used to land its
  // topmost cluster near −1.34, which is outside the baked frame. It came out
  // of the strip with its foliage sliced flat, and no amount of drawing fixes
  // a shape that was never rendered.
  branch([
    [trunkX(0.7) - 0.1 * S, trunkY(0.7)],
    [-0.42 * S + creak, -0.44 * S + b],
    [-0.62 * S + creak, -0.66 * S + b]
  ], 0.115 * S, BARK, 940, [
    { a: -1.9, len: 0.2 * S, r: 0.15 * S, lag: 0.1 },
    { a: -1.15, len: 0.19 * S, r: 0.13 * S, lag: 0.17 },
    { a: -2.7, len: 0.22 * S, r: 0.14 * S, lag: 0.13 }
  ])

  // Low right arm, reaching out.
  branch([
    [trunkX(0.48) + 0.1 * S, trunkY(0.48)],
    [0.42 * S + creak * 0.6, -0.04 * S + b],
    [0.66 * S + creak * 0.6, -0.14 * S + b]
  ], 0.1 * S, BARK_D, 950, [
    { a: -0.85, len: 0.24 * S, r: 0.16 * S, lag: 0.12 },
    { a: 0.3, len: 0.18 * S, r: 0.11 * S, lag: 0.2 }
  ])

  // Crown, straight up out of the top. Same cap as the left arm — see there.
  branch([
    [trunkX(0.95), trunkY(0.95)],
    [0.06 * S + creak * 1.1, -0.66 * S + b],
    [0.16 * S + creak * 1.1, -0.76 * S + b]
  ], 0.08 * S, BARK, 960, [
    { a: -1.35, len: 0.15 * S, r: 0.12 * S, lag: 0.08 },
    { a: -2.35, len: 0.14 * S, r: 0.1 * S, lag: 0.15 }
  ])

  thorn(-0.34 * S + creak, -0.44 * S + b, -2.3, 0.13 * S, 970)
  thorn(-0.56 * S + creak, -0.7 * S + b, -2.0, 0.1 * S, 971)
  thorn(0.36 * S + creak * 0.6, -0.02 * S + b, -1.2, 0.11 * S, 972)
  thorn(0.6 * S + creak * 0.6, -0.14 * S + b, -1.5, 0.09 * S, 973)

  // ── Face: a knot hollow under a heavy bark brow ──
  const fy = -0.34 * S + b
  const fx = trunkX(0.72)
  // Callus: the swollen bark the tree grew AROUND the wound. Drawn first and
  // wider than the hollow, so the hollow ends up sunk in a raised rim.
  const callus = rough([
    [fx - 0.25 * S, fy - 0.2 * S],
    [fx - 0.04 * S, fy - 0.29 * S],
    [fx + 0.22 * S, fy - 0.16 * S],
    [fx + 0.26 * S, fy + 0.1 * S],
    [fx + 0.08 * S, fy + 0.29 * S],
    [fx - 0.19 * S, fy + 0.22 * S],
    [fx - 0.26 * S, fy + 0.02 * S]
  ], 0.018 * S, 978)
  paint(ctx, S, callus, tones('#7a5a3c', 1.05), 979, {
    line: LINE.fine, inkColor: 'rgba(28,16,8,0.6)', breakUp: 0.4, amp: 0.22
  })

  // The hollow itself: narrower, taller, and off-centre. A circle reads as a
  // mask; a split in the grain reads as damage.
  const knot = rough([
    [fx - 0.15 * S, fy - 0.14 * S],
    [fx + 0.02 * S, fy - 0.19 * S],
    [fx + 0.16 * S, fy - 0.09 * S],
    [fx + 0.13 * S, fy + 0.13 * S],
    [fx - 0.03 * S, fy + 0.21 * S],
    [fx - 0.17 * S, fy + 0.06 * S]
  ], 0.016 * S, 980)
  cel(ctx, knot, tones('#2b1c0d', 1.1), {
    shade: terminator(knot, SHADOW_DIR, -0.34, 0.16, 981)
  })
  occlude(ctx, knot, 0.02, 0.4, 0.026 * S, 'rgba(186,148,96,0.75)', 982)
  ink(ctx, knot, { width: LINE.fine * S, color: 'rgba(22,12,6,0.85)', seed: 983, breakUp: 0.3 })

  const bl = blink(t, 2600)
  eye(ctx, fx - 0.075 * S, fy - 0.01 * S, 0.055 * S, {
    iris: '#ffb43a', glow: '#ff9a2a', pupil: 0.38, lid: bl, seed: 984, sclera: 'none'
  })
  eye(ctx, fx + 0.08 * S, fy - 0.03 * S, 0.046 * S, {
    iris: '#ffb43a', glow: '#ff9a2a', pupil: 0.38, lid: bl, seed: 988, sclera: 'none'
  })
  // Mouth: a split in the bark, not a drawn smile.
  stroke(ctx, [
    [fx - 0.1 * S, fy + 0.11 * S], [fx - 0.01 * S, fy + 0.17 * S], [fx + 0.1 * S, fy + 0.1 * S]
  ], 0.01 * S, 0.026 * S, '#150c05', 990)
  // Brows: two separate bark knots over the sockets. A single shelf across the
  // whole face read as the brim of a hat.
  for (const [bx, by, bw, sd] of [
    [-0.11, -0.15, 0.16, 991], [0.09, -0.17, 0.13, 993]
  ] as const) {
    const brow = blob(fx + bx * S, fy + by * S, bw * S, 0.045 * S, sd, 0.22)
    paint(ctx, S, brow, tones('#8a6845', 1.05), sd + 1, {
      line: LINE.hair, inkColor: 'rgba(28,16,8,0.5)', breakUp: 0.5, deep: false
    })
  }

  // ── Drifting pollen ──
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 8; i++) {
    const ph = (t / 3400 + i * 0.29) % 1
    const px = (noise2(i * 2.7, 2, 992) - 0.5) * 1.7 * S
    const py = 0.5 * S - ph * 1.4 * S
    ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.5
    ctx.fillStyle = '#e8d47a'
    ctx.beginPath(); ctx.arc(px, py, (0.008 + noise2(i, 5, 993) * 0.01) * S, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

// ─── 10 · Rattlejack ────────────────────────────────────────────────────────

const drawRattlejack = (ctx: CanvasRenderingContext2D, S: number, t: number): void => {
  // Light bones, short legs, no dignity: the quickest cycle in the cast, with
  // the biggest bob relative to its height.
  const g = gait(t, 760)
  const b = breathe(t, 1.5, 0.008) * S + bodyBob(g, 0.024) * S
  const jig = weightShift(g + 0.5, 0.03) * S
  // The skull is on a loose neck and swings a beat behind everything else.
  const skullLag = (bodyBob(g - 0.13, 0.024) - bodyBob(g, 0.024)) * S * 2.4

  groundShadow(ctx, S, 0.38, 1.02, 0.3)

  const BONE = tones('#e3d6bb', 1.05)
  const IRON = tones('#5c6472', 1.1)
  const WOOD = tones('#8a5f36')

  // ── Legs ──
  for (const [lx, ph, sd] of [[-0.14, 0.0, 1000], [0.15, 0.5, 1006]] as const) {
    const st = footStep(g + ph, 0.14 * S, 0.11 * S)
    const foot: Pt = [lx * S * 0.72 + st[0], 0.98 * S + st[1]]
    limb(ctx, [lx * S + jig * 0.4, 0.48 * S + b + hipDrop(g + ph, 0.016) * S], foot,
      0.272 * S, 0.272 * S, lx < 0 ? 1 : -1, BONE, sd,
      { width: 0.04 * S, taper: 0.85, outline: 0.016 * S, joint: 0.72 })
    const sole = rough([
      [foot[0] - 0.05 * S, foot[1] - 0.02 * S],
      [foot[0] + 0.09 * S, foot[1] - 0.03 * S],
      [foot[0] + 0.1 * S, foot[1] + 0.04 * S],
      [foot[0] - 0.06 * S, foot[1] + 0.05 * S]
    ], 0.006 * S, sd + 1)
    paint(ctx, S, sole, BONE, sd + 2, { line: LINE.fine, deep: false })
  }

  // ── Pelvis and spine ──
  const pelvis = rough([
    [-0.15 * S + jig, 0.38 * S + b], [0.15 * S + jig, 0.38 * S + b],
    [0.11 * S + jig, 0.52 * S + b], [-0.11 * S + jig, 0.52 * S + b]
  ], 0.01 * S, 1012)
  paint(ctx, S, pelvis, BONE, 1013, { line: LINE.fine })
  stroke(ctx, [[jig, 0.4 * S + b], [jig * 0.6, 0.18 * S + b]], 0.045 * S, 0.036 * S, BONE.shade, 1014)

  // ── Ribcage: an open basket, tilted, because this one is scrap ──
  const tilt = 0.06
  for (let i = 0; i < 4; i++) {
    const k = i / 3
    const ry = (0.02 + k * 0.3) * S + b
    const rw = (0.2 - k * 0.05) * S
    for (const side of [-1, 1] as const) {
      const rib: Pt[] = []
      for (let j = 0; j <= 8; j++) {
        const u = j / 8
        rib.push([
          jig + side * rw * Math.sin(u * 1.5),
          ry + u * 0.07 * S * (1 + k) + side * tilt * S * u
        ])
      }
      stroke(ctx, rib, 0.042 * S, 0.018 * S, i % 2 ? BONE.shade : BONE.base, 1020 + i * 2 + side)
    }
  }
  stroke(ctx, [[jig, -0.02 * S + b], [jig * 0.8, 0.4 * S + b]], 0.05 * S, 0.038 * S, BONE.shade, 1030)

  // ── Left arm: a pot-lid shield strapped to it ──
  const armSw = swing(g + 0.7, 0.05) * S
  boneLimb(ctx,
    [-0.17 * S + jig, 0.02 * S + b],
    [-0.34 * S + armSw, 0.16 * S + b],
    [-0.4 * S + armSw, 0.36 * S + b],
    0.036 * S, BONE, 1040)
  const shield = blob(-0.48 * S + armSw, 0.34 * S + b, 0.23 * S, 0.25 * S, 1044, 0.06)
  paint(ctx, S, shield, WOOD, 1045, { line: LINE.mid, breakUp: 0.24 })
  for (let i = 0; i < 3; i++) {
    stroke(ctx, [
      [-0.68 * S + armSw, (0.2 + i * 0.11) * S + b], [-0.28 * S + armSw, (0.18 + i * 0.11) * S + b]
    ], 0.008 * S, 0.014 * S, 'rgba(48,28,12,0.45)', 1046 + i)
  }
  const boss = blob(-0.48 * S + armSw, 0.33 * S + b, 0.07 * S, 0.072 * S, 1050, 0.12)
  paint(ctx, S, boss, IRON, 1051, { line: LINE.fine })
  // A bite taken out of the rim, so it reads as scavenged.
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  fillShape(ctx, blob(-0.6 * S + armSw, 0.16 * S + b, 0.06 * S, 0.055 * S, 1052, 0.24), '#000')
  ctx.restore()
  boneHand(ctx, -0.4 * S + armSw, 0.36 * S + b, 0.13 * S, 1.5, BONE, 1054, 0.75)

  // ── Right arm: shortsword up ──
  const swSw = swing(g + 0.2, 0.04) * S
  boneLimb(ctx,
    [0.17 * S + jig, 0.0 * S + b],
    [0.38 * S + swSw, -0.06 * S + b],
    [0.46 * S + swSw, -0.24 * S + b],
    0.036 * S, BONE, 1060)
  const grip: Pt = [0.47 * S + swSw, -0.28 * S + b]
  const sword = rough([
    [grip[0] - 0.035 * S, -0.34 * S + b], [grip[0] + 0.035 * S, -0.34 * S + b],
    [grip[0] + 0.028 * S, -0.78 * S + b], [grip[0], -0.9 * S + b], [grip[0] - 0.03 * S, -0.78 * S + b]
  ], 0.006 * S, 1064)
  paint(ctx, S, sword, tones('#9aa5b2', 1.1), 1065, { line: LINE.fine, amp: 0.03, breakUp: 0.3 })
  const cross = rough([
    [grip[0] - 0.1 * S, -0.36 * S + b], [grip[0] + 0.1 * S, -0.36 * S + b],
    [grip[0] + 0.08 * S, -0.3 * S + b], [grip[0] - 0.08 * S, -0.3 * S + b]
  ], 0.005 * S, 1068)
  paint(ctx, S, cross, IRON, 1069, { line: LINE.hair, deep: false })
  stroke(ctx, [[grip[0], -0.3 * S + b], [grip[0], -0.18 * S + b]], 0.032 * S, 0.028 * S, '#3d2a1a', 1070)
  boneHand(ctx, grip[0], grip[1], 0.12 * S, -1.9, BONE, 1072, 0.85)

  // ── Skull, cocked to one side ──
  const hy = -0.28 * S + b * 0.7 + skullLag
  const hx = jig * 0.6 - skullLag * 0.4
  const skull = egg(hx, hy, 0.19 * S, 0.2 * S, 0.82, 1080, 0.05)
  paint(ctx, S, skull, BONE, 1081, { line: LINE.mid, breakUp: 0.3 })
  stroke(ctx, [[hx - 0.16 * S, hy + 0.02 * S], [hx - 0.08 * S, hy + 0.06 * S]], 0.005 * S, 0.017 * S, 'rgba(110,94,70,0.7)', 1082)
  fillShape(ctx, rough([
    [hx + 0.01 * S, hy + 0.03 * S], [hx - 0.026 * S, hy + 0.1 * S], [hx + 0.038 * S, hy + 0.1 * S]
  ], 0.005 * S, 1083), '#3a2f24')

  const jaw = rough([
    [hx - 0.1 * S, hy + 0.12 * S], [hx + 0.1 * S, hy + 0.12 * S],
    [hx + 0.085 * S, hy + 0.24 * S], [hx - 0.08 * S, hy + 0.25 * S]
  ], 0.006 * S, 1084)
  paint(ctx, S, jaw, BONE, 1085, { line: LINE.fine, deep: false })
  stroke(ctx, [[hx - 0.095 * S, hy + 0.18 * S], [hx + 0.095 * S, hy + 0.18 * S]], 0.018 * S, 0.018 * S, 'rgba(46,36,26,0.85)', 1086)
  // Four teeth, and a gap where the fifth used to be.
  for (const i of [0, 1, 3, 4]) {
    const tx = hx + (-0.066 + i * 0.033) * S
    stroke(ctx, [[tx, hy + 0.13 * S], [tx, hy + 0.23 * S]], 0.011 * S, 0.009 * S, 'rgba(110,94,70,0.65)', 1088 + i)
  }

  socket(ctx, hx - 0.075 * S, hy - 0.03 * S, 0.045 * S, SOUL_LIGHT, 1094, 0.36, blink(t, 2100))
  socket(ctx, hx + 0.08 * S, hy - 0.04 * S, 0.04 * S, SOUL_LIGHT, 1098, 0.36, blink(t, 2100))

  // ── Cooking-pot helm, dented and worn at an angle ──
  const pot = rough([
    [hx - 0.24 * S, hy - 0.08 * S],
    [hx - 0.21 * S, hy - 0.24 * S],
    [hx - 0.02 * S, hy - 0.32 * S],
    [hx + 0.18 * S, hy - 0.26 * S],
    [hx + 0.24 * S, hy - 0.12 * S],
    [hx + 0.26 * S, hy - 0.03 * S],
    [hx - 0.22 * S, hy - 0.01 * S]
  ], 0.012 * S, 1100)
  paint(ctx, S, pot, IRON, 1101, { line: LINE.mid, breakUp: 0.24 })
  // The dent, and the rivet that survived it.
  stroke(ctx, [[hx - 0.12 * S, hy - 0.3 * S], [hx - 0.05 * S, hy - 0.2 * S]], 0.006 * S, 0.018 * S, 'rgba(18,20,26,0.6)', 1102)
  fillShape(ctx, blob(hx + 0.14 * S, hy - 0.16 * S, 0.018 * S, 0.017 * S, 1103, 0.14), IRON.lit)
  occlude(ctx, pot, 0.72, 1.0, 0.04 * S, 'rgba(14,12,18,0.85)', 1104)
  // A little handle sticking up, because it is a pot.
  stroke(ctx, [
    [hx - 0.06 * S, hy - 0.3 * S], [hx + 0.0 * S, hy - 0.42 * S], [hx + 0.08 * S, hy - 0.3 * S]
  ], 0.016 * S, 0.016 * S, IRON.shade, 1105)
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const MONSTERS: MonsterDef[] = [
  {
    id: 'grumpling',
    gore: 'blood',
    cycleMs: 880,
    faces: 'front',
    name: 'Grumpling',
    tagline: 'Cute-evil imp. All head, tiny body, permanently unimpressed.',
    backdrop: ['#2b3a1f', '#151d10'],
    draw: drawGrumpling
  },
  {
    id: 'bonecap',
    gore: 'bone',
    cycleMs: 1300,
    faces: 'front',
    name: 'Bonecap',
    tagline: 'Fungal undead. The mushroom is driving; the skeleton is the host.',
    backdrop: ['#2c2138', '#15101d'],
    draw: drawBonecap
  },
  {
    id: 'snaggletusk',
    gore: 'blood',
    cycleMs: 1350,
    faces: 'left',
    name: 'Snaggletusk',
    tagline: 'Boar-beast. Low, heavy, forward — built to hit a wall and keep going.',
    backdrop: ['#2f3742', '#14181e'],
    draw: drawSnaggletusk
  },
  {
    id: 'wispling',
    gore: 'spectral',
    cycleMs: 2600,
    faces: 'front',
    name: 'Wispling',
    tagline: 'Little lantern ghost. Endearing until you notice it never blinks together.',
    backdrop: ['#16303a', '#0b171d'],
    draw: drawWispling
  },
  {
    id: 'marrowknight',
    gore: 'bone',
    cycleMs: 1700,
    faces: 'front',
    name: 'Marrow Knight',
    tagline: 'Armoured skeleton. Waiting, not lurching — the one that outranks the rest.',
    backdrop: ['#26262e', '#121216'],
    draw: drawMarrowKnight
  },
  {
    id: 'nibbler',
    gore: 'blood',
    cycleMs: 860,
    faces: 'front',
    name: 'Nibbler',
    tagline: 'Cute-evil bat. Ninety per cent ears, and fully aware of it.',
    backdrop: ['#2a2340', '#141020'],
    draw: drawNibbler
  },
  {
    id: 'cinderhound',
    gore: 'ember',
    cycleMs: 620,
    faces: 'left',
    name: 'Cinderhound',
    tagline: 'Burning hound. All legs and ribs — the fast one, and it is starving.',
    backdrop: ['#3a1f1c', '#160c0b'],
    draw: drawCinderhound
  },
  {
    id: 'blorp',
    gore: 'ooze',
    cycleMs: 1250,
    faces: 'front',
    name: 'Blorp',
    tagline: 'Swamp ooze. Delighted to see you; still digesting the last one.',
    backdrop: ['#25382a', '#0f1913'],
    draw: drawBlorp
  },
  {
    id: 'thornwick',
    gore: 'sap',
    cycleMs: 3200,
    faces: 'front',
    name: 'Thornwick',
    tagline: 'Bramble treant. Slow, patient, and entirely made of thorns.',
    backdrop: ['#22322f', '#0f1817'],
    draw: drawThornwick
  },
  {
    id: 'rattlejack',
    gore: 'bone',
    cycleMs: 760,
    faces: 'front',
    name: 'Rattlejack',
    tagline: 'Scrap skeleton. A cooking pot for a helm and no plan whatsoever.',
    backdrop: ['#332b26', '#171310'],
    draw: drawRattlejack
  },
  {
    id: 'dustmoth',
    gore: 'blood',
    cycleMs: 1500,
    faces: 'front',
    name: 'Dustmoth',
    tagline: 'Plush moth. Adorable — and the spots on the wings are watching you.',
    backdrop: ['#332a3f', '#171325'],
    draw: drawDustmoth
  },
  {
    id: 'skewer',
    gore: 'blood',
    cycleMs: 480,
    faces: 'left',
    name: 'Skewer',
    tagline: 'Wyrmling. Small, fast, and almost entirely the pointy end.',
    backdrop: ['#1d3330', '#0c1615'],
    draw: drawSkewer
  },
  {
    id: 'gloomcrow',
    gore: 'bone',
    cycleMs: 780,
    faces: 'front',
    name: 'Gloomcrow',
    tagline: 'Bone crow. Carrying something gold it did not find lying around.',
    backdrop: ['#262b3a', '#10131c'],
    draw: drawGloomcrow
  },

  // ── Swimmers ─────────────────────────────────────────────────────────────
  // Authored side-on and centred, and animated by a travelling wave rather than
  // a gait. See the header of `monstersSea.ts`.
  {
    id: 'sliverfin',
    gore: 'blood',
    cycleMs: 700,
    faces: 'right',
    anchor: 'centre',
    name: 'Sliverfin',
    tagline: 'Reef eel. A ribbon with a mouth on the front, and it is always open.',
    backdrop: ['#14332f', '#081715'],
    draw: drawSliverfin
  },
  {
    id: 'gnashfin',
    gore: 'blood',
    cycleMs: 900,
    faces: 'right',
    anchor: 'centre',
    name: 'Gnashfin',
    tagline: 'Reefshark. Stiff through the shoulders, and everything else is teeth.',
    backdrop: ['#1b2c3a', '#0c141c'],
    draw: drawGnashfin
  },
  {
    id: 'tidewyrm',
    gore: 'blood',
    cycleMs: 1500,
    faces: 'right',
    anchor: 'centre',
    name: 'Tidewyrm',
    tagline: 'Sea dragon. Crested, whiskered, and the only thing down there with hands.',
    backdrop: ['#153230', '#081716'],
    draw: drawTidewyrm
  },
  {
    id: 'brinemaw',
    gore: 'ooze',
    cycleMs: 1800,
    faces: 'right',
    anchor: 'centre',
    name: 'Brinemaw',
    tagline: 'Deep kraken. Hangs a little green light out and waits for company.',
    backdrop: ['#251a3a', '#100a1c'],
    draw: drawBrinemaw
  }
]

/**
 * What a design bleeds. `none` for anything with no design bound to it.
 *
 * Deliberately here rather than in `monsterSprites`: the simulation needs the
 * answer, and it has no business importing a module that bakes canvases.
 */
export const monsterGore = (id: string | null): GoreKind =>
  (id ? MONSTERS.find((m) => m.id === id)?.gore : undefined) ?? 'none'
