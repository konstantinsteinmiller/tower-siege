/**
 * ─── Balance replay harness ─────────────────────────────────────────────────
 *
 * Plays a whole run against the REAL wave director, enemy table and difficulty
 * curve, with a scripted "reasonable new player" build policy, and prints the
 * wave-by-wave picture: what the director sent, what the tower could kill, what
 * it lost, and what the income could rebuild.
 *
 * It exists because `expectedPower` and the wave-budget curve cannot be tuned by
 * eye — they are two multiplicative terms feeding a third that feeds back into
 * the first. The only honest way to change them is to replay the run before and
 * after and compare the columns.
 *
 * This is a MODEL, not the simulation. It deliberately does not resolve
 * placement, projectile flight or targeting; it resolves the three quantities a
 * balance pass actually turns on:
 *
 *   • can the tower kill the wave before the wave kills the tower,
 *   • how many blocks does that cost,
 *   • can the income rebuild them.
 *
 * Where it approximates, it approximates PESSIMISTICALLY toward the player
 * having less than they really would, so a run that clears here clears in game.
 *
 * Run:  node tools/balance-replay.ts [--waves 25] [--policy naive|greedy]
 */

import { planWave, waveBudget, waveReward, enemyHpScale, BUILD_TIME_MS } from '../src/game/waves.ts'
import { enemyDef } from '../src/game/enemies.ts'
import { adaptiveFactor, towerPower, expectedPower, FlawlessTracker } from '../src/game/difficulty.ts'
import { BLOCK_DEFS } from '../src/game/blocks.ts'

// ─── The tower model ────────────────────────────────────────────────────────
//
// A bag of blocks, not a grid. Placement decides WHERE damage lands, and this
// harness is about how MUCH — modelling the grid would add a second layer of
// guesswork on top of an already approximate combat resolution.

interface Tower {
  /** One entry per placed block: its type and its current hit points. */
  blocks: { id: string; hp: number; maxHp: number }[]
  wood: number
  stone: number
  gold: number
}

const START = { wood: 120, stone: 40 }

/** The free scripted fort, per `seedScriptedOpening`. */
const OPENING = ['wood', 'wood', 'cannon']

const mk = (id: string): Tower['blocks'][number] => {
  const hp = BLOCK_DEFS[id]!.hp
  return { id, hp, maxHp: hp }
}

const newTower = (): Tower => ({
  blocks: [mk('gate'), ...OPENING.map(mk)],
  wood: START.wood,
  stone: START.stone,
  gold: 0
})

const towerHp = (t: Tower): number =>
  t.blocks.reduce((n, b) => n + b.hp + (BLOCK_DEFS[b.id]!.armor ?? 0) * 6, 0)

/** The same shape `measureTower` hands the difficulty director. */
const strength = (t: Tower) => ({
  hp: towerHp(t),
  dps: towerDps(t),
  antiAir: t.blocks.filter((b) => BLOCK_DEFS[b.id]!.weapon?.hitsAir).length,
  height: Math.max(1, Math.ceil(t.blocks.length / 5)),
  blocks: t.blocks.length
})

/** Mirrors `measureTower`'s dps term, including its splash/chain heuristic. */
const towerDps = (t: Tower): number =>
  t.blocks.reduce((n, b) => {
    const w = BLOCK_DEFS[b.id]!.weapon
    if (!w) return n
    const multi = 1 + (w.splash ?? 0) * 0.6 + (w.chain ?? 0) * 0.4
    return n + (w.damage / Math.max(120, w.cooldownMs)) * 1000 * multi
  }, 0)

// ─── The build policy ───────────────────────────────────────────────────────
//
// What a competent-but-new player does: keep roughly two structure blocks per
// gun, buy the cheapest gun that fits, and spend the rest on wall. It is
// deliberately NOT optimal — the audit's question is what an ordinary player
// experiences, and an optimal policy answers a different question.

const spend = (t: Tower, policy: 'naive' | 'greedy'): void => {
  const guns = () => t.blocks.filter((b) => BLOCK_DEFS[b.id]!.weapon).length
  const walls = () => t.blocks.filter((b) => !BLOCK_DEFS[b.id]!.weapon).length
  let guard = 0
  for (;;) {
    if (guard++ > 400) break
    const wantGun = policy === 'greedy' ? true : walls() > guns() * 2
    // cannon first when affordable — it is the better gold-per-effective-DPS.
    if (wantGun && t.wood >= 25 && t.stone >= 10) {
      t.wood -= 25; t.stone -= 10; t.blocks.push(mk('cannon')); continue
    }
    if (wantGun && t.wood >= 20) { t.wood -= 20; t.blocks.push(mk('archer')); continue }
    if (t.stone >= 16) { t.stone -= 16; t.blocks.push(mk('stone')); continue }
    if (t.wood >= 10) { t.wood -= 10; t.blocks.push(mk('wood')); continue }
    break
  }
}

// ─── Wave resolution ────────────────────────────────────────────────────────

interface WaveOutcome {
  wave: number
  mul: number
  adaptive: number
  flawless: number
  power: number
  expected: number
  ratio: number
  units: number
  enemyHp: number
  enemyDps: number
  burst: number
  towerHp: number
  towerDps: number
  killMs: number
  damage: number
  lost: number
  rebuilt: number
  survived: boolean
}

/** Damage a wave lands before it dies, and what that costs in blocks. */
const resolve = (t: Tower, wave: number, mul: number): WaveOutcome | null => {
  const plan = planWave(wave, mul)
  const hpScale = enemyHpScale(wave)
  // `waveHpMul` in the sim is `difficultyFactor() * dynamic^0.45`; difficulty
  // factor is 1 on Medium.
  const hpMul = Math.pow(mul, 0.45)

  let enemyHp = 0
  let enemyDps = 0
  let burst = 0
  const units = plan.orders.length
  for (const order of plan.orders) {
    const def = enemyDef(order.typeId)
    enemyHp += Math.round(def.hp * hpMul * hpScale)
    if (def.suicide) burst += def.suicide.damage
    else enemyDps += (def.damage / def.attackCooldownMs) * 1000
  }

  const dps = towerDps(t)
  const hp = towerHp(t)

  // Time to clear. Only a fraction of the tower's guns bear on the lane at any
  // moment — enemies arrive from both sides and range is finite — so the model
  // credits 60 % of nominal DPS.
  const effDps = Math.max(1, dps * 0.6)
  const killMs = (enemyHp / effDps) * 1000

  // Damage taken.
  //
  // Enemies spawn off-screen and have to walk in, so nothing is in contact for
  // the first few seconds; and the wave thins as it dies, so the DPS in contact
  // decays roughly linearly. Both matter: charging the full roster for the whole
  // clear made every wave past 5 unsurvivable, which is not what the game does.
  const TRAVEL_MS = 5200
  const contactMs = Math.max(0, killMs - TRAVEL_MS)
  const damage = enemyDps * (contactMs / 1000) * 0.5 + burst

  return {
    wave, mul, adaptive: 0, flawless: 0, power: towerPower(strength(t)),
    expected: expectedPower(wave), ratio: 0,
    units, enemyHp, enemyDps, burst,
    towerHp: hp, towerDps: dps, killMs, damage,
    lost: 0, rebuilt: 0, survived: true
  }
}

/** Apply damage to the tower, cheapest blocks first — the wall is the shield. */
const applyDamage = (t: Tower, damage: number): number => {
  let left = damage
  let lost = 0
  // The wall eats first. A player puts structure between the lane and their
  // guns, so ordering by raw hit points — which sorts a 50-hp archer ahead of a
  // 170-hp stone block — models a tower nobody builds.
  const order = [...t.blocks]
    .filter((b) => b.id !== 'gate')
    .sort((a, z) => {
      const aw = BLOCK_DEFS[a.id]!.weapon ? 1 : 0
      const zw = BLOCK_DEFS[z.id]!.weapon ? 1 : 0
      return aw - zw || a.maxHp - z.maxHp
    })
  for (const b of order) {
    if (left <= 0) break
    const armor = BLOCK_DEFS[b.id]!.armor ?? 0
    // Armour is flat per hit with a 1-damage floor; approximate as a 15 % cut
    // per point, which is what it works out to against the early roster.
    const soak = b.hp / Math.max(0.4, 1 - armor * 0.15)
    if (left >= soak) { left -= soak; b.hp = 0; lost++ } else { b.hp -= left * (1 - armor * 0.15); left = 0 }
  }
  t.blocks = t.blocks.filter((b) => b.hp > 0)
  // Whatever is left over lands on the Gate.
  if (left > 0) {
    const gate = t.blocks.find((b) => b.id === 'gate')
    if (gate) gate.hp -= left * 0.25
  }
  return lost
}

// ─── The run ────────────────────────────────────────────────────────────────

const replay = (maxWave: number, policy: 'naive' | 'greedy'): WaveOutcome[] => {
  const t = newTower()
  const flawless = new FlawlessTracker()
  const out: WaveOutcome[] = []

  for (let wave = 1; wave <= maxWave; wave++) {
    // Build phase: spend everything, then measure — the order the game uses.
    spend(t, policy)

    const power = towerPower(strength(t))
    const adaptive = adaptiveFactor(wave, power)
    const fl = flawless.multiplier
    const mul = adaptive * fl

    const r = resolve(t, wave, mul)!
    r.adaptive = adaptive
    r.flawless = fl
    r.ratio = power / expectedPower(wave)

    r.lost = applyDamage(t, r.damage)
    const gate = t.blocks.find((b) => b.id === 'gate')
    r.survived = !!gate && gate.hp > 0
    flawless.recordWave(r.lost > 0)

    // Payout. Kill gold is the sum of the plan's `coins`; wood/stone come from
    // `waveReward`. No early-call bonus, no ads, no tech multipliers.
    const reward = waveReward(wave)
    t.wood += reward.wood
    t.stone += reward.stone
    for (const o of planWave(wave, mul).orders) {
      t.gold += Math.max(1, enemyDef(o.typeId).coins)
    }

    const before = t.blocks.length
    spend(t, policy)
    r.rebuilt = t.blocks.length - before

    out.push(r)
    if (!r.survived) break
  }
  return out
}

// ─── Report ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const argOf = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1]! : dflt
}
const maxWave = Number(argOf('waves', '25'))
const policy = argOf('policy', 'naive') as 'naive' | 'greedy'

const rows = replay(maxWave, policy)

const pad = (s: string | number, n: number): string => String(s).padStart(n)
console.log(`\nBalance replay — policy=${policy}, build phase ${BUILD_TIME_MS} ms\n`)
console.log(
  'w   ratio  adapt  flaw   mul  budget  units   eHP   eDPS  burst |  tHP   tDPS  kill_s  dmg  lost  rebuilt'
)
console.log('-'.repeat(104))
for (const r of rows) {
  console.log([
    pad(r.wave, 2),
    pad(r.ratio.toFixed(2), 7),
    pad(r.adaptive.toFixed(2), 6),
    pad(r.flawless.toFixed(2), 6),
    pad(r.mul.toFixed(2), 5),
    pad(Math.round(waveBudget(r.wave)), 7),
    pad(r.units, 6),
    pad(Math.round(r.enemyHp), 6),
    pad(Math.round(r.enemyDps), 6),
    pad(Math.round(r.burst), 6),
    ' |',
    pad(Math.round(r.towerHp), 5),
    pad(Math.round(r.towerDps), 6),
    pad((r.killMs / 1000).toFixed(1), 7),
    pad(Math.round(r.damage), 5),
    pad(r.lost, 5),
    pad(r.rebuilt, 8)
  ].join(''))
}

const last = rows[rows.length - 1]!
console.log('-'.repeat(104))
console.log(
  last.survived
    ? `\nSurvived all ${maxWave} waves.`
    : `\nDIED on wave ${last.wave}.`
)
const meanRatio = rows.reduce((n, r) => n + r.ratio, 0) / rows.length
const meanMul = rows.reduce((n, r) => n + r.mul, 0) / rows.length
console.log(
  `mean power/expected ratio ${meanRatio.toFixed(2)}  (target 1.00)\n` +
  `mean difficulty multiplier ${meanMul.toFixed(2)}  (target 1.00)\n` +
  `blocks lost ${rows.reduce((n, r) => n + r.lost, 0)}, ` +
  `rebuilt ${rows.reduce((n, r) => n + r.rebuilt, 0)}\n`
)
