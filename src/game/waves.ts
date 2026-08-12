import { enemyPool, siegePool, ENEMY_DEFS, enemyDef } from './enemies'
import type { SpawnOrder, WavePlan } from './types'

// ─── Wave director ──────────────────────────────────────────────────────────
//
// Wave composition is DETERMINISTIC per (wave, difficulty): the same wave index
// always produces the same plan. That matters for two reasons —
//   1. a resumed run (`ts_run`) must not hand the player a different wave 12
//      than the one they were about to face, and
//   2. "wave 9 wrecked me, let me try a different build" is only a fair lesson
//      if wave 9 is the same wave twice.
//
// The seed is derived from the wave index alone, so it is stable across
// devices and cloud saves.

/** mulberry32 — small, fast, well-distributed 32-bit PRNG. */
export const makeRng = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every 10th wave is a boss wave. */
export const isBossWave = (wave: number): boolean => wave > 0 && wave % 10 === 0

/**
 * Total enemy "cost" the wave may spend.
 *
 * Roughly doubled from the original curve. The old one was tuned for the
 * weakest plausible tower, which meant waves 1-10 were three or four grunts
 * against a wall the player had spare resources to keep extending — nothing to
 * push against, and no reason to spend. This curve assumes the player is
 * building, and `adaptiveFactor` closes the gap for whichever way they aren't.
 *
 *   w1 → 62    w3 → 164   w5 → 292   w10 → 707   w20 → 1755   w30 → 2976
 */
export const waveBudget = (wave: number, difficulty = 1): number =>
  Math.round((30 * Math.pow(Math.max(1, wave), 1.06) + 30) * difficulty)

/**
 * How much tougher one individual enemy is at `wave` than at wave 1.
 *
 * Enemy HP used to be a per-type constant scaled only by the player's chosen
 * difficulty setting — so a grunt had 22 HP at wave 1 and 22 HP at wave 40,
 * while the tower grew from two weapons to twenty upgraded ones. The director
 * answered a strong tower by sending MORE enemies, never tougher ones, and
 * since they arrive spread over a long window the tower simply picked them off
 * one at a time at maximum range. Nothing ever reached a block; nothing was
 * ever at stake.
 *
 * The count curve above was flattened hard (1.38 → 1.06) to pay for this: the
 * same pressure delivered by fewer, tankier enemies instead of a longer queue
 * of free kills.
 *
 * Tankier is the one that generates tension, because an enemy that survives the
 * walk actually arrives. It is also the one the player can RECOVER from: block
 * losses scale with how many things are biting at once, not with how much HP
 * the wave contained, so the same difficulty delivered as 30 tough units costs
 * far fewer blocks than as 60 weak ones — and rebuilding is capped by income.
 * Simulated at exponent 1.16, waves 12-15 cost 14-17 blocks each against ~4
 * rebuilt, and the run died to attrition every time from full health.
 */
export const enemyHpScale = (wave: number): number =>
  1 + 0.135 * Math.max(0, wave - 2)

/**
 * Hard ceiling on how long one wave may last, ms.
 *
 * A wave that outstays this stops being a fight and becomes a chore: the player
 * has already made every decision it is going to ask for, and is now watching a
 * queue drain. The spawn schedule is compressed to fit inside
 * `MAX_SPAWN_WINDOW_MS`, and anything still unspawned when the wave clock
 * reaches `SPAWN_FLUSH_AT_MS` is released at once so the tail cannot run long.
 */
export const MAX_WAVE_MS = 121_000
/** All spawning is finished by here, leaving the rest for travel and killing. */
export const MAX_SPAWN_WINDOW_MS = 82_000
/** Past this, dump every remaining order onto the field immediately. */
export const SPAWN_FLUSH_AT_MS = 96_000

/**
 * Fraction of a wave's budget reserved for FLYING enemies.
 *
 * Air is the one threat a purely ground-facing tower cannot answer, so it has
 * to arrive on a schedule the player can plan around rather than at the mercy
 * of a weighted dice roll. It starts the wave after bats unlock and climbs to a
 * hard third of the wave, which is enough to punish a mortar-only build without
 * making anti-air the only thing that matters.
 *
 *   w<9 → 0    w9 → 0.10   w14 → 0.20   w20 → 0.32   w25+ → 0.35 (cap)
 */
export const airShare = (wave: number): number => {
  if (wave < 9) return 0
  return Math.min(0.35, 0.1 + (wave - 9) * 0.022)
}

/**
 * Fraction OF THE AIR BUDGET spent on bombers rather than close-in flyers.
 *
 * Bombers are carved out of the air share instead of competing inside it,
 * because they answer a different question. A bat dives into melee range and
 * dies to whatever anti-air sits on the crown; a bomber never comes down, so
 * the crown has to be defended with something that reaches UP. Left to the
 * weighted roll the cheap bats would win most of the budget and the lesson
 * would arrive at random.
 *
 *   w<11 → 0   w11 → 0.30   w20 → 0.48   w24+ → 0.55 (cap)
 */
export const bombShare = (wave: number): number => {
  if (wave < 11) return 0
  return Math.min(0.55, 0.3 + (wave - 11) * 0.02)
}

/**
 * Fraction reserved for SEA enemies. Same idea one axis down: they come out of
 * the water in front of the tower and strike its lowest blocks, so a tower that
 * only covers the horizon has a blind spot at its feet.
 *
 *   w<12 → 0   w12 → 0.08   w20 → 0.18   w28+ → 0.24 (cap)
 */
export const seaShare = (wave: number): number => {
  if (wave < 12) return 0
  return Math.min(0.24, 0.08 + (wave - 12) * 0.0125)
}

/**
 * Fraction reserved for SIEGE ENGINES.
 *
 * Same reasoning as air and sea: engines that out-range the tower are the whole
 * reason cavalry exists, so they have to arrive on a schedule the player can
 * plan a coin budget around rather than at the mercy of a weighted roll.
 *
 *   w<14 → 0   w14 → 0.10   w22 → 0.22   w30+ → 0.30 (cap)
 */
export const siegeShare = (wave: number): number => {
  if (wave < 14) return 0
  return Math.min(0.3, 0.1 + (wave - 14) * 0.015)
}

/**
 * Milliseconds between consecutive spawns.
 *
 * Waves get denser over time, and the result is then compressed so the whole
 * schedule fits inside `MAX_SPAWN_WINDOW_MS` — a 60-strong late wave at a fixed
 * cadence would take three minutes to finish arriving.
 */
export const spawnInterval = (wave: number): number =>
  Math.max(150, Math.min(900, 900 - wave * 26))

/** The cadence actually used, once the order count is known. */
export const pacedInterval = (wave: number, orderCount: number, difficulty = 1): number => {
  // Compress the cadence as the wave gets heavier, so a harder wave arrives
  // FASTER rather than merely lasting longer. Square root, not linear: the
  // schedule still stretches somewhat with size, it just stops absorbing the
  // entire difficulty increase.
  const base = spawnInterval(wave) / Math.sqrt(Math.max(1, difficulty))
  if (orderCount <= 1) return base
  return Math.min(base, MAX_SPAWN_WINDOW_MS / (orderCount - 1))
}

/**
 * How long the player gets to build before the wave auto-starts.
 *
 * A flat 15 seconds. The old curve ran from a minute down to twenty seconds,
 * which meant most of the early game was spent watching a timer with nothing
 * left to spend — the build phase is over when the resources are, and after the
 * economy rebalance that happens fast. Fifteen seconds is enough to place a
 * hand and still an opportunity cost worth converting, and it roughly halves
 * the dead time in a run.
 */
export const BUILD_TIME_MS = 15_000

export const buildTimeMs = (_wave: number): number => BUILD_TIME_MS

/**
 * Bonus multiplier for calling a wave early.
 *
 * The rate is derived from `BUILD_TIME_MS` rather than fixed, so the +40 % cap
 * stays exactly reachable by calling the instant the phase opens. Pinning it at
 * the old 1 %/second would have quietly capped the mechanic at +15 % once the
 * build phase shrank, stranding most of a reward the UI still advertises.
 */
export const EARLY_CALL_MAX_BONUS = 0.4
const EARLY_CALL_RATE = EARLY_CALL_MAX_BONUS / (BUILD_TIME_MS / 1000)

export const earlyCallBonus = (remainingMs: number): number =>
  1 + Math.min(EARLY_CALL_MAX_BONUS, Math.max(0, remainingMs / 1000) * EARLY_CALL_RATE)

/**
 * Resources granted for clearing a wave, before tech multipliers.
 *
 * Cut by roughly a third from the original. The old rates outpaced what the
 * player could usefully spend — ending a wave with 200 spare wood AND 200 spare
 * stone meant the build phase had no decision in it, because everything
 * affordable was already built. Scarcity is what makes the offer deck matter.
 *
 * Coins are NOT cut: they are the meta-progression currency and feed the tech
 * tree between runs, which is the part of the game that should feel generous.
 */
export const waveReward = (wave: number): { coins: number; wood: number; stone: number } => ({
  coins: 6 + wave * 3,
  // Trimmed ~8%, not the ~25% a naive reading of the surplus suggests.
  //
  // The old 3-6x "resource flood" was measured against a tower that never lost
  // a block. Once waves actually bite, income stops being surplus and becomes
  // the REPLACEMENT rate — and a deep cut turns the first bad wave into a death
  // spiral, because a tower losing ten blocks a wave against two blocks of
  // income can never come back. Simulated: at −25% the run died at wave 11
  // every time, from full health, purely to compounding attrition.
  wood: 15 + wave * 2.4,
  stone: 10 + wave * 1.85
})

/**
 * Build the full spawn schedule for a wave.
 *
 * Greedy weighted sampling: each candidate's weight favours types introduced
 * recently (so a new enemy actually shows up in force on its debut wave) while
 * keeping a healthy baseline of the cheap fodder that makes splash damage feel
 * good. Anything that doesn't fit the remaining budget is skipped, and the loop
 * bails once nothing affordable is left.
 */
export const planWave = (wave: number, difficulty = 1): WavePlan => {
  const rng = makeRng(wave * 2654435761)
  const boss = isBossWave(wave)
  const pool = enemyPool(wave)
  const orders: SpawnOrder[] = []

  // A boss soaks most of the wave's threat; the escort is deliberately thin so
  // the fight reads as "one huge thing" rather than a soup.
  const totalBudget = waveBudget(wave, difficulty) * (boss ? 0.6 : 1)

  // Guard against a pathological pool (shouldn't happen — grunt is minWave 1).
  if (pool.length === 0) {
    return { wave, orders: [], total: 0, boss }
  }

  /**
   * Spend `budget` on `candidates`, appending spawn orders.
   *
   * Weighting: a type in its debut window gets a ×2.2 spotlight so the player
   * actually MEETS the new idea rather than seeing one of it; otherwise weight
   * scales inversely with cost so cheap fodder stays numerous.
   */
  const spend = (budget: number, candidates: typeof pool): void => {
    if (candidates.length === 0) return
    let left = budget
    let guard = 0
    while (left > 0 && guard++ < 300) {
      const affordable = candidates.filter((d) => d.cost <= left)
      if (affordable.length === 0) break

      let totalWeight = 0
      const weights = affordable.map((d) => {
        const debut = wave - d.minWave <= 1 ? 2.2 : 1
        // Between the old 30/cost (which bought nothing but chaff) and a flat
        // roll (which flips the whole wave to heavies the moment they unlock,
        // and produced a 0-lost -> 15-lost cliff at wave 12 in simulation).
        const w = Math.pow(30 / d.cost, 0.7) * debut
        totalWeight += w
        return w
      })

      let pick = rng() * totalWeight
      let chosen = affordable[affordable.length - 1]!
      for (let i = 0; i < affordable.length; i++) {
        pick -= weights[i]!
        if (pick <= 0) { chosen = affordable[i]!; break }
      }

      left -= chosen.cost
      // Side is assigned later, once the whole wave is ordered in time.
      orders.push({ typeId: chosen.id, side: 1, atMs: 0 })
    }
  }

  // Reserve the air and sea shares FIRST, so they are never crowded out by a
  // run of cheap ground units winning the weighted roll.
  const airPool = pool.filter((d) => d.movement === 'air')
  const seaPool = pool.filter((d) => d.movement === 'sea')
  const engines = siegePool(wave)
  // Plain infantry: ground units that are NOT siege engines, so the engine
  // budget can't be spent twice.
  const groundPool = pool.filter((d) => d.movement === 'ground' && !d.siege)

  const airBudget = airPool.length > 0 ? totalBudget * airShare(wave) : 0
  const seaBudget = seaPool.length > 0 ? totalBudget * seaShare(wave) : 0
  const siegeBudget = engines.length > 0 ? totalBudget * siegeShare(wave) : 0

  // Split the air budget so bombers are never crowded out by cheap bats — the
  // two are different problems and the player has to meet both.
  const bomberPool = airPool.filter((d) => !!d.bombRun)
  const diverPool = airPool.filter((d) => !d.bombRun)
  const bombBudget = bomberPool.length > 0 ? airBudget * bombShare(wave) : 0
  spend(bombBudget, bomberPool)
  spend(airBudget - bombBudget, diverPool.length > 0 ? diverPool : airPool)

  spend(seaBudget, seaPool)
  spend(siegeBudget, engines)
  spend(totalBudget - airBudget - seaBudget - siegeBudget,
    groundPool.length > 0 ? groundPool : pool)

  // ── Schedule ──
  // Shuffle so the reserved air/sea blocks don't arrive as one clump at the
  // front, then lay the wave out in time with alternating sides.
  for (let i = orders.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[orders[i], orders[j]] = [orders[j]!, orders[i]!]
  }

  const interval = pacedInterval(wave, orders.length, difficulty)
  let t = 0
  let side: 1 | -1 = rng() < 0.5 ? 1 : -1
  for (const order of orders) {
    order.atMs = t
    order.side = side
    // Small jitter so the cadence breathes instead of ticking like a clock.
    t += interval * (0.75 + rng() * 0.5)
    side = side === 1 ? -1 : 1
  }

  if (boss) {
    // The boss enters first, alone, so the banner lands on an empty field and
    // the player registers the threat before the escort arrives.
    for (const order of orders) order.atMs += 1600
    orders.unshift({ typeId: ENEMY_DEFS.golem!.id, side: rng() < 0.5 ? 1 : -1, atMs: 0 })
  }

  orders.sort((a, b) => a.atMs - b.atMs)
  return { wave, orders, total: orders.length, boss }
}

/** How many of a planned wave are flyers — used by tests and the HUD's
 *  "incoming air" warning. */
export const countAir = (plan: WavePlan): number =>
  plan.orders.filter((o) => enemyDef(o.typeId).movement === 'air').length

/** How many of a planned wave come out of the water. */
export const countSea = (plan: WavePlan): number =>
  plan.orders.filter((o) => enemyDef(o.typeId).movement === 'sea').length

/** How many siege engines a wave carries — drives the "bring cavalry" warning. */
export const countSiege = (plan: WavePlan): number =>
  plan.orders.filter((o) => !!enemyDef(o.typeId).siege).length

/** How many bombers a wave carries — the cue that the CROWN needs cover. */
export const countBombers = (plan: WavePlan): number =>
  plan.orders.filter((o) => !!enemyDef(o.typeId).bombRun).length
