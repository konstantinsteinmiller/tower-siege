import type { EnemyDef, ProjectileKind } from './types'

// ─── Enemy catalogue ────────────────────────────────────────────────────────
//
// Every enemy walks in from one side of the screen toward the tower, stops at
// the first block it can reach, and chews. The design job of each type is to
// punish a different lazy tower:
//
//   grunt    baseline pressure — the thing your DPS is measured against
//   runner   punishes long-range-only towers (closes before you can whittle it)
//   slinger  punishes short-range-only towers (out-ranges melee-tier turrets)
//   brute    punishes low single-target DPS (splash alone won't cut it)
//   bomber   punishes stacking cheap wood at the base (one blast, big hole)
//   bat      punishes mortar-heavy builds (mortars can't hit air at all)
//   bulwark  punishes single-direction defence (frontal armour)
//   wyvern   the late-game air threat — fast, tanky, and hits hard
//   eel      punishes towers with no low coverage — swims in, rears up, bites
//   kraken   the deep-water bruiser, arrives with the late sea waves
//   golem    the wave-10 wall — needs real accumulated damage
//
// SIEGE ENGINES (wave 14+) break the rules infantry follow, and each one has a
// specific answer:
//   ram        ignores the frontier and drives at the Gate — needs the Gate
//              itself defended, not just the flanks
//   ballista   stands off at 9 cells and snipes turrets — out-ranges most guns
//   catapult   stands off at 13 and lobs splash — must be reached, not out-shot
//   siegeTower rolls in and lets escorts strike three rows up
//   trebuchet  stands off at 20, hits like a truck, and NOTHING in the tower
//              reaches it. The only counter is cavalry.
// Standoff engines are why cavalry exist: a purely static defence has no answer
// to a machine parked beyond every turret's reach.
//
// `cost` is the wave director's currency; `minWave` gates introductions so the
// player meets one new idea at a time.

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  grunt: {
    id: 'grunt',
    monster: ['grumpling', 'rattlejack'],
    hp: 22,
    speed: 1.0,
    damage: 5,
    attackCooldownMs: 850,
    reach: 0.85,
    movement: 'ground',
    coins: 1,
    cost: 10,
    minWave: 1,
    scale: 0.62,
    palette: 'grunt'
  },
  runner: {
    id: 'runner',
    monster: 'cinderhound',
    hp: 13,
    speed: 1.9,
    damage: 4,
    attackCooldownMs: 620,
    reach: 0.85,
    movement: 'ground',
    coins: 1,
    cost: 9,
    minWave: 3,
    scale: 0.55,
    palette: 'runner'
  },
  slinger: {
    id: 'slinger',
    monster: 'bonecap',
    hp: 20,
    speed: 0.9,
    damage: 6,
    attackCooldownMs: 1400,
    // Stops well back and lobs rocks — the reach IS the threat.
    reach: 4.2,
    movement: 'ground',
    coins: 2,
    cost: 16,
    minWave: 5,
    scale: 0.6,
    palette: 'slinger'
  },
  brute: {
    id: 'brute',
    monster: 'snaggletusk',
    hp: 100,
    speed: 0.6,
    damage: 15,
    attackCooldownMs: 1200,
    reach: 1.0,
    movement: 'ground',
    coins: 4,
    cost: 34,
    minWave: 6,
    scale: 0.85,
    palette: 'brute'
  },
  bomber: {
    id: 'bomber',
    monster: 'blorp',
    hp: 34,
    speed: 1.15,
    damage: 0,
    attackCooldownMs: 1,
    reach: 0.9,
    movement: 'ground',
    coins: 3,
    cost: 24,
    minWave: 8,
    suicide: { damage: 45, radius: 1.7 },
    scale: 0.66,
    palette: 'bomber'
  },
  bat: {
    id: 'bat',
    monster: ['nibbler', 'wispling'],
    hp: 24,
    speed: 1.4,
    damage: 6,
    attackCooldownMs: 700,
    reach: 0.9,
    movement: 'air',
    coins: 2,
    cost: 20,
    minWave: 9,
    scale: 0.5,
    palette: 'bat'
  },
  bulwark: {
    id: 'bulwark',
    monster: 'marrowknight',
    hp: 70,
    speed: 0.75,
    damage: 11,
    attackCooldownMs: 1000,
    reach: 0.95,
    movement: 'ground',
    coins: 4,
    cost: 32,
    minWave: 12,
    frontArmorPct: 0.6,
    scale: 0.78,
    palette: 'bulwark'
  },
  // ── Air ────────────────────────────────────────────────────────────────
  // Flyers ignore the ground frontier entirely and go for the crown, so a
  // tower that put every gun at the base has nothing pointed at them. Their
  // share of each wave ramps with the wave index (see `waves.ts`).
  wyvern: {
    id: 'wyvern',
    monster: 'skewer',
    hp: 70,
    speed: 1.25,
    damage: 14,
    attackCooldownMs: 850,
    reach: 1.0,
    movement: 'air',
    coins: 5,
    cost: 40,
    minWave: 16,
    scale: 0.8,
    palette: 'wyvern'
  },

  // ── Bombers ────────────────────────────────────────────────────────────
  // Ordinary flyers close to melee range, which means a tall tower with a
  // couple of Archery blocks on the crown is safe from them. Bombers never
  // descend: they cruise above the highest block and drop ordnance straight
  // down, so height stops being protection in itself and the crown needs
  // coverage that can actually reach UP.
  bombardier: {
    id: 'bombardier',
    monster: 'gloomcrow',
    hp: 58,
    speed: 1.05,
    damage: 22,
    attackCooldownMs: 2100,
    // Never used for contact — a bomb run stops at `bombRun.altitude`.
    reach: 0.9,
    movement: 'air',
    coins: 5,
    cost: 34,
    minWave: 11,
    bombRun: { altitude: 3.2, splash: 1.3, ordnance: 'bomb' },
    scale: 0.82,
    palette: 'bombardier'
  },
  firebug: {
    id: 'firebug',
    monster: 'dustmoth',
    hp: 86,
    speed: 0.95,
    damage: 16,
    attackCooldownMs: 2600,
    reach: 0.9,
    movement: 'air',
    coins: 8,
    cost: 52,
    minWave: 18,
    // Molotovs: a modest impact, then a fire that keeps eating the crown long
    // after the thrower is dead. Repair Bays and Frost are the real answers.
    bombRun: { altitude: 3.6, splash: 1.5, burnMs: 5200, burnDps: 9, ordnance: 'fire' },
    scale: 0.9,
    palette: 'firebug'
  },

  // ── Sea ────────────────────────────────────────────────────────────────
  // Swim in from the water in front of the tower, then rear up to strike the
  // lowest blocks. While submerged they cannot be hit — so a tower needs
  // something that covers the shoreline, not just the horizon.
  eel: {
    id: 'eel',
    hp: 45,
    speed: 1.1,
    damage: 12,
    attackCooldownMs: 1100,
    reach: 1.2,
    movement: 'sea',
    coins: 4,
    cost: 26,
    minWave: 12,
    scale: 0.85,
    palette: 'eel',
    surfaceMs: 520
  },
  kraken: {
    id: 'kraken',
    hp: 190,
    speed: 0.7,
    damage: 34,
    attackCooldownMs: 1500,
    reach: 1.6,
    movement: 'sea',
    coins: 10,
    cost: 70,
    minWave: 20,
    scale: 1.25,
    palette: 'kraken',
    surfaceMs: 720
  },

  // ── Siege engines ──────────────────────────────────────────────────────
  ram: {
    id: 'ram',
    hp: 320,
    speed: 0.55,
    damage: 55,
    attackCooldownMs: 1700,
    reach: 1.1,
    movement: 'ground',
    coins: 12,
    cost: 60,
    minWave: 14,
    siege: { targetsGate: true },
    scale: 1.55,
    palette: 'ram'
  },
  ballista: {
    id: 'ballista',
    hp: 130,
    speed: 0.7,
    damage: 34,
    attackCooldownMs: 2000,
    reach: 9,
    movement: 'ground',
    coins: 9,
    cost: 48,
    minWave: 15,
    siege: { standoff: 9 },
    scale: 1.35,
    palette: 'ballista'
  },
  catapult: {
    id: 'catapult',
    hp: 200,
    speed: 0.5,
    damage: 46,
    attackCooldownMs: 3000,
    reach: 13,
    movement: 'ground',
    coins: 14,
    cost: 70,
    minWave: 17,
    siege: { standoff: 13, splash: 1.6 },
    scale: 1.7,
    palette: 'catapult'
  },
  siegeTower: {
    id: 'siegeTower',
    hp: 420,
    speed: 0.42,
    damage: 26,
    attackCooldownMs: 1300,
    reach: 1.3,
    movement: 'ground',
    coins: 16,
    cost: 85,
    minWave: 19,
    // Escorts swarm up it and strike three rows above the ground line.
    siege: { ladderHeight: 3 },
    scale: 2.05,
    palette: 'siegeTower'
  },
  trebuchet: {
    id: 'trebuchet',
    hp: 300,
    speed: 0.34,
    damage: 90,
    attackCooldownMs: 4200,
    reach: 20,
    movement: 'ground',
    coins: 24,
    cost: 120,
    minWave: 22,
    siege: { standoff: 20, splash: 2.2 },
    scale: 2.1,
    palette: 'trebuchet'
  },
  ironRam: {
    id: 'ironRam',
    hp: 620,
    speed: 0.36,
    damage: 105,
    attackCooldownMs: 2200,
    reach: 1.2,
    movement: 'ground',
    coins: 26,
    cost: 135,
    minWave: 24,
    // Iron-plated and roofed: arrows glance straight off it. A tower that
    // answered every previous threat with cheap Archery towers has nothing at
    // all for this, and has to actually own a cannon, a coil or some cavalry.
    immuneTo: ['bolt'],
    siege: { targetsGate: true },
    scale: 1.85,
    palette: 'ironRam'
  },

  golem: {
    id: 'golem',
    monster: 'thornwick',
    hp: 900,
    speed: 0.45,
    damage: 50,
    attackCooldownMs: 1500,
    reach: 1.3,
    movement: 'ground',
    coins: 40,
    cost: 200,
    minWave: 10,
    scale: 1.45,
    palette: 'golem',
    boss: true
  }
}

export const enemyDef = (id: string): EnemyDef => ENEMY_DEFS[id] ?? ENEMY_DEFS.grunt!

/** Non-boss types available at (or before) a given wave. The director samples
 *  from this pool; the boss is added separately on boss waves. */
export const enemyPool = (wave: number): EnemyDef[] =>
  Object.values(ENEMY_DEFS).filter((d) => !d.boss && d.minWave <= wave)

/** Siege engines available at a wave — the director reserves a share for them
 *  exactly as it does for air and sea. */
export const siegePool = (wave: number): EnemyDef[] =>
  Object.values(ENEMY_DEFS).filter((d) => !d.boss && !!d.siege && d.minWave <= wave)

export const isSiege = (id: string): boolean => !!ENEMY_DEFS[id]?.siege

/** Does this enemy shrug off a given projectile entirely? */
export const isImmuneTo = (id: string, kind: ProjectileKind): boolean =>
  ENEMY_DEFS[id]?.immuneTo?.includes(kind) === true
