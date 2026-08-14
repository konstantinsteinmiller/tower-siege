import { MONSTERS, type MonsterDef } from '@/game/monsters'

/**
 * ─── Baked monster frames ───────────────────────────────────────────────────
 *
 * The cast in `monsters.ts` is drawn for a design bench: one character per
 * canvas, a hundred-odd path operations each, at whatever cost looks best. The
 * battlefield asks a different question — twenty of them at once, on a phone,
 * next to a tower, particles and projectiles.
 *
 * So each design is rendered ONCE into a short strip of frames covering exactly
 * one locomotion cycle, and the battlefield blits from that strip. Two things
 * follow from "exactly one cycle":
 *
 *   * the loop closes, so a unit can play the strip forever without a pop;
 *   * playback is decoupled from authoring — a strip baked over an 880 ms cycle
 *     can be played at any speed, which is what lets a fast enemy and a slow
 *     one share a body and still move at their own rates.
 *
 * Baking runs in IDLE time, not in the render loop. One frame of the heaviest
 * design costs ~10 ms — over half a frame budget — so any per-frame allowance
 * small enough to be safe would be too small to ever bake it. A wave never
 * arrives during the build phase, so the strips are always ready by the time
 * anything needs them, and a design that has not finished baking simply falls
 * back to the older procedural body instead of stalling the frame.
 */

/** The slice of `IdleDeadline` we use; not in every TS lib target. */
interface IdleTime { timeRemaining: () => number }

/** Frames per cycle. Sixteen is the low end of what still reads as a walk. */
const FRAMES = 16

/**
 * Baked frame size, px.
 *
 * Big enough that a unit at maximum zoom on a 3× screen is still downsampling,
 * small enough that the whole cast fits in a sane amount of canvas memory
 * (13 designs × 16 frames × 156² × 4 B ≈ 14 MB, and most runs never unlock all
 * thirteen).
 */
const PX = 156

/**
 * Character scale inside a frame.
 *
 * The drawing convention is feet at y = +1, crown at −1.05, and up to ±1.05
 * wide, so 2.25 units across the frame leaves a hair of margin for the ink to
 * bleed into without clipping.
 */
const SPRITE_S = PX / 2.25

/** Where the character's feet sit inside a frame, in px from the top. */
export const SPRITE_FOOT = PX * 0.52 + SPRITE_S

/** Total character height inside a frame, in px. */
export const SPRITE_HEIGHT = 2.05 * SPRITE_S

const CACHE = new Map<string, HTMLCanvasElement[]>()
const DEFS = new Map<string, MonsterDef>(MONSTERS.map((m) => [m.id, m]))

let queue: string[] = []
let building: { id: string; def: MonsterDef; frames: HTMLCanvasElement[] } | null = null

let scheduled = false

/**
 * Ask for designs to be baked. Cheap and idempotent — safe to call every time a
 * wave is composed.
 */
export const primeMonsterSprites = (ids: readonly string[]): void => {
  for (const id of ids) {
    if (CACHE.has(id) || queue.includes(id) || building?.id === id) continue
    if (DEFS.has(id)) queue.push(id)
  }
  schedule()
}

const bakeFrame = (def: MonsterDef, i: number): HTMLCanvasElement => {
  const c = document.createElement('canvas')
  c.width = PX
  c.height = PX
  const ctx = c.getContext('2d')
  if (ctx) {
    ctx.translate(PX / 2, PX * 0.52)
    def.draw(ctx, SPRITE_S, (i / FRAMES) * def.cycleMs)
  }
  return c
}

/**
 * Bake while the browser says it has room, then hand control back.
 *
 * Progress is measured per FRAME, not per design: a treant costs five times
 * what an imp does, so committing to a whole design in one slice would blow any
 * deadline. The 12 ms floor is the cost of the most expensive single frame in
 * the cast, so we never START one we cannot finish inside the slice.
 */
const pump = (deadline?: IdleTime): void => {
  scheduled = false
  do {
    if (!building) {
      const id = queue.shift()
      if (!id) return
      const def = DEFS.get(id)
      if (!def) continue
      building = { id, def, frames: [] }
    }
    building.frames.push(bakeFrame(building.def, building.frames.length))
    if (building.frames.length >= FRAMES) {
      CACHE.set(building.id, building.frames)
      building = null
    }
  } while ((deadline?.timeRemaining() ?? 0) > 12)
  schedule()
}

const schedule = (): void => {
  if (scheduled || (queue.length === 0 && !building)) return
  scheduled = true
  const ric = (globalThis as { requestIdleCallback?: (cb: (d: IdleTime) => void, o?: { timeout: number }) => void })
    .requestIdleCallback
  // Without idle scheduling, fall back to one frame per macrotask — slower to
  // finish, but it still never lands inside a paint.
  if (typeof ric === 'function') ric(pump, { timeout: 2000 })
  else setTimeout(() => pump(), 0)
}

/**
 * The frame for a design at a normalised cycle position, or `null` if it has
 * not been baked yet.
 */
export const monsterFrame = (id: string, cycle01: number): HTMLCanvasElement | null => {
  const frames = CACHE.get(id)
  if (!frames) return null
  const i = Math.floor((((cycle01 % 1) + 1) % 1) * FRAMES) % FRAMES
  return frames[i] ?? null
}

/** Which way a design is drawn, for the battlefield's mirroring. */
export const monsterFaces = (id: string): 'left' | 'right' | 'front' =>
  DEFS.get(id)?.faces ?? 'front'

/** How a design hangs off its position — by the feet, or by the body's middle. */
export const monsterAnchor = (id: string): 'feet' | 'centre' =>
  DEFS.get(id)?.anchor ?? 'feet'

/**
 * Pick one design for a unit from its type's binding.
 *
 * Keyed on the uid so an individual keeps the same body for its whole life —
 * picking per frame would make it flicker between species.
 */
export const pickMonster = (binding: string | string[] | undefined, uid: number): string | null => {
  if (!binding) return null
  if (typeof binding === 'string') return binding
  if (binding.length === 0) return null
  return binding[Math.abs(uid) % binding.length] ?? null
}

/** Every design any enemy type can use — for priming at load. */
export const allMonsterIds = (): string[] => [...DEFS.keys()]
