/**
 * ─── Adaptive difficulty ────────────────────────────────────────────────────
 *
 * A fixed wave curve cannot stay interesting. Two players reach wave 10 with
 * wildly different towers — one has spent every coin in the tech tree and
 * covered the approach in cannons, the other is still stacking wood crates —
 * and a single budget curve is either a wall for the second or a nap for the
 * first. Historically this game was the nap: the curve was tuned for the weakest
 * plausible tower, so anyone building competently coasted.
 *
 * So the director prices each wave against what the player has ACTUALLY built,
 * plus a streak term that punishes coasting.
 *
 * Three rules keep it from becoming rubber-banding, which players justly hate:
 *
 *   1. It only ever scales the wave's BUDGET. Enemy stats, unlock waves and the
 *      composition rules are untouched, so the answer to a hard wave is always
 *      "build better", never "the game cheated".
 *   2. It is bounded on both sides. A weak tower still faces a real wave; a
 *      monstrous one never faces something unbeatable.
 *   3. It is monotonic in the player's favour: building MORE never produces a
 *      wave that is proportionally harder than what you added. The response
 *      curve is deliberately sub-linear.
 */

/** A snapshot of what the player has standing when the wave is composed. */
export interface TowerStrength {
  /** Total current HP across every block, including the Gate. */
  hp: number
  /** Effective damage per second, tech multipliers already applied. */
  dps: number
  /** Number of blocks standing. */
  blocks: number
  /** Highest occupied row + 1. */
  height: number
  /** Blocks that can hit an air target — the crown-defence signal. */
  antiAir: number
}

export const EMPTY_STRENGTH: TowerStrength = {
  hp: 0, dps: 0, blocks: 0, height: 0, antiAir: 0
}

/**
 * Collapse a tower into one number.
 *
 * HP and DPS are combined multiplicatively-ish rather than added, because they
 * are not interchangeable: a tower with a lot of HP and no guns never kills
 * anything, and a tower with a lot of guns and no HP dies before it fires. The
 * geometric-ish mean punishes a lopsided build, which is exactly the tower the
 * player should feel pressure to fix.
 */
export const towerPower = (s: TowerStrength): number => {
  const hp = Math.max(0, s.hp)
  const dps = Math.max(0, s.dps)
  if (hp <= 0 || dps <= 0) return hp * 0.05 + dps * 2
  return Math.sqrt(hp * (dps * 12)) + hp * 0.05 + dps * 1.5
}

/**
 * The power a competent player is expected to have standing at a given wave.
 *
 * Calibrated against a reference build — the tower you get by spending most of
 * your resources each wave and taking the obvious tech — so `ratio = 1` means
 * "on track", not "perfect".
 */
export const expectedPower = (wave: number): number => {
  const w = Math.max(1, wave)
  // Calibrated against what a player who simply spends their income actually
  // fields. At 120·w^1.22 + 90 the reference tower measured BELOW expectation
  // from wave 6 onward, so `adaptiveFactor` pinned to its 0.75 floor and handed
  // out a permanent 25% discount — the system that is supposed to price a wave
  // against the tower standing in front of it was, in practice, switched off.
  // Fitted to the tower a player who simply spends their income actually
  // fields: ~620 power at wave 1 (the 120-wood starting build), ~1600 by wave
  // 10, ~3600 by wave 20. The large constant term matters most — with a small
  // one, the STARTING tower already measured 4x "expected" and wave 1 opened at
  // the 2.6 ceiling, which is the opposite of a teaching wave.
  return 22 * Math.pow(w, 1.65) + 600
}

/** Difficulty multiplier bounds. Wide enough to matter, narrow enough that a
 *  wave is never unrecognisable from its number. */
export const MIN_ADAPTIVE = 0.75
export const MAX_ADAPTIVE = 2.6

/**
 * How much harder this wave should be, given what is standing.
 *
 * The exponent is the whole design: 0.62 means doubling your tower's power
 * raises the wave budget by about 54%, so over-building is always rewarded —
 * you come out ahead — but never lets you switch off.
 */
export const adaptiveFactor = (wave: number, power: number): number => {
  const ratio = power / expectedPower(wave)
  if (!Number.isFinite(ratio) || ratio <= 0) return MIN_ADAPTIVE
  return Math.max(MIN_ADAPTIVE, Math.min(MAX_ADAPTIVE, Math.pow(ratio, 0.62)))
}

// ─── Flawless streak ────────────────────────────────────────────────────────

/** Consecutive untouched waves needed before the next one gets harder. */
export const FLAWLESS_STREAK_LENGTH = 2
/** How much each qualifying streak adds. */
export const FLAWLESS_STEP = 0.2
/** Ceiling on the compounding streak bonus. */
// Capped lower than it was: the streak bonus now compounds with an adaptive
// term that actually works, and 3.0 on top of that put the wave budget far
// beyond anything the player's income could answer.
export const MAX_STREAK_MUL = 2.2

/**
 * Track waves cleared without losing a single block.
 *
 * "Not a single block" is deliberately strict. A player who clears two waves
 * untouched has a tower the current curve cannot threaten, and the honest
 * response is to stop pretending it can. It compounds, so coasting escalates
 * quickly, and it resets completely on death so a punishing streak never
 * follows the player into a fresh run.
 */
export class FlawlessTracker {
  private streak = 0
  private mul = 1

  /** Multiplier the next wave should carry. */
  get multiplier(): number {
    return this.mul
  }

  /** How many flawless waves are banked toward the next escalation. */
  get progress(): number {
    return this.streak
  }

  /** Record a cleared wave. `lostBlocks` = did the tower lose anything at all. */
  recordWave(lostBlocks: boolean): void {
    if (lostBlocks) {
      // One scratch resets the count, but NOT the bonus already earned —
      // otherwise the player could farm the reset by letting one crate die.
      this.streak = 0
      return
    }
    this.streak++
    if (this.streak < FLAWLESS_STREAK_LENGTH) return
    this.streak = 0
    this.mul = Math.min(MAX_STREAK_MUL, this.mul * (1 + FLAWLESS_STEP))
  }

  /** Wipe everything — called when the run ends. */
  reset(): void {
    this.streak = 0
    this.mul = 1
  }

  /** Restore from a resumed run. */
  restore(mul: number, streak: number): void {
    this.mul = Math.max(1, Math.min(MAX_STREAK_MUL, Number.isFinite(mul) ? mul : 1))
    this.streak = Math.max(0, Math.min(FLAWLESS_STREAK_LENGTH - 1, Math.floor(streak) || 0))
  }
}
