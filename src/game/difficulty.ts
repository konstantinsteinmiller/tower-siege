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
  // Fitted by REPLAY, not by hand — see `tools/balance-replay.ts`, which walks a
  // scripted "spend your income every wave" player through the real director and
  // prints `power / expectedPower` per wave.
  //
  // The previous curve (22·w^1.65 + 600) was documented as "~620 at wave 1,
  // ~1600 by wave 10, ~3600 by wave 20". The replay says that player actually
  // fields ~1050 / ~3100 / ~7600 — so the ratio never fell below ~1.5 and
  // `adaptiveFactor` sat at 1.4-1.7 for the whole run. Competent play was
  // charged a permanent +50% surcharge, and the neutral 1.0 the exponent is
  // designed around was only reachable by building badly.
  //
  // This curve tracks the measured one, so ratio ≈ 1 for a player on the
  // reference line and the adaptive term can actually move in both directions.
  return 62 * Math.pow(w, 1.52) + 980
}

/** Difficulty multiplier bounds. Wide enough to matter, narrow enough that a
 *  wave is never unrecognisable from its number.
 *
 *  These bound the COMBINED scalar — see `clampDifficulty`. Applying them to the
 *  adaptive term alone let `adaptive × flawless` reach 2.6 × 2.2 = 5.72, which
 *  is ~3.5x the units arriving ~2.4x faster: a wave entirely unrecognisable
 *  from its number, which is the exact thing this bound exists to prevent. */
export const MIN_ADAPTIVE = 0.75
export const MAX_ADAPTIVE = 2.6

/**
 * Clamp the final difficulty scalar — adaptive × flawless — into the band.
 *
 * Every caller that multiplies the two together must go through this, or the
 * ceiling above is decorative.
 */
export const clampDifficulty = (mul: number): number =>
  !Number.isFinite(mul) || mul <= 0
    ? MIN_ADAPTIVE
    : Math.max(MIN_ADAPTIVE, Math.min(MAX_ADAPTIVE, mul))

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
/** How much a wave that cost blocks gives back. Below `FLAWLESS_STEP` on
 *  purpose — see `recordWave`. */
export const FLAWLESS_DECAY = 0.1
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
      // A scratch resets the streak and BLEEDS the banked bonus back down.
      //
      // It used to be a one-way ratchet: `mul` only ever rose, on the reasoning
      // that a player could otherwise farm the reset by letting one crate die.
      // The cost of that was worse than the exploit it prevented — a player who
      // banked ten clean waves carried x2.2 forever, so once they started
      // slipping the adaptive FLOOR was no longer 0.75 but 1.65, and the
      // assist that exists to catch a struggling player could not reach them.
      //
      // Decay is deliberately slower than growth (÷1.1 against ×1.2), so
      // deliberately feeding a crate is still a losing trade: it costs a block
      // and gives back less than half of one escalation.
      this.streak = 0
      this.mul = Math.max(1, this.mul / (1 + FLAWLESS_DECAY))
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

// ─── Hoarding surcharge ─────────────────────────────────────────────────────

/**
 * How much harder the next wave gets for sitting on an unspent pile.
 *
 * The economy blocks created a player the adaptive term cannot see. `towerPower`
 * prices what is STANDING, so someone who fills the tower with sawmills and
 * banks the yield reads as a weak tower and gets a discounted wave — while
 * actually holding enough wood and stone to rebuild the whole thing twice. The
 * eco branch was meant to reward planning, not to buy an easier game.
 *
 * So the reserve itself is priced. The tiers are a ladder, not a stack: the
 * highest matching band applies and the others are ignored.
 *
 *   · over 200 wood AND over 200 stone   → +25%   a comfortable buffer
 *   · 500+ of either                     → +50%   a hoard
 *   · over 1000 of wood, stone OR coins  → +100%  a war chest
 *
 * The first band needs BOTH because holding 300 wood and no stone is mid-build,
 * not hoarding; the upper bands take either, because by then the size of the
 * pile is the point regardless of which pile it is. Coins only enter at the top
 * band — run gold is spent in lumps on ranks and is legitimately banked between
 * purchases, so taxing it earlier would punish saving up for one upgrade.
 *
 * This is the one difficulty term the player can switch off completely, and
 * they do it by playing: spend the pile and the surcharge is gone next wave.
 */
export const hoardFactor = (wood: number, stone: number, coins: number): number => {
  const w = Math.max(0, wood)
  const s = Math.max(0, stone)
  const c = Math.max(0, coins)
  if (w > 1000 || s > 1000 || c > 1000) return 2
  if (w >= 500 || s >= 500) return 1.5
  if (w > 200 && s > 200) return 1.25
  return 1
}

/** Which hoard band is in force, for the HUD warning. 0 = none. */
export const hoardTier = (wood: number, stone: number, coins: number): 0 | 1 | 2 | 3 => {
  const f = hoardFactor(wood, stone, coins)
  return f === 2 ? 3 : f === 1.5 ? 2 : f === 1.25 ? 1 : 0
}
