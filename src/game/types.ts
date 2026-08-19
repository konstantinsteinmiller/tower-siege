// ─── Tower Siege — core domain types ────────────────────────────────────────
//
// Pure data. No Vue, no DOM, no side effects — so the simulation is unit
// testable in isolation and the renderer can consume snapshots without
// reaching back into reactive state.
//
// World space: a cell is 1×1 world unit. `(c, r)` with `r = 0` on the ground
// and `+r` pointing UP. `c = 0` is the tower's centre column (where the Gate
// sits). The renderer owns the world→screen transform; nothing in here knows
// about pixels.

// ─── Blocks ─────────────────────────────────────────────────────────────────

export type BlockKind =
  | 'core' | 'structure' | 'weapon' | 'economy' | 'utility' | 'ship' | 'buff'

/** `bomb` and `fire` are dropped BY enemies onto the tower, not fired at them. */
export type ProjectileKind = 'bolt' | 'ball' | 'shell' | 'zap' | 'frost' | 'bomb' | 'fire'

export type TargetingMode = 'nearest' | 'strongest' | 'lowest-hp'

export interface WeaponSpec {
  /** Damage per shot (before tech multipliers). */
  damage: number
  /** Milliseconds between shots (before fire-rate tech). */
  cooldownMs: number
  /** Reach in CELLS, measured from the block's centre. */
  range: number
  projectile: ProjectileKind
  /** Muzzle velocity in cells/second. `shell` ignores this (ballistic arc). */
  speed: number
  /** Splash radius in cells. Omitted = single target. */
  splash?: number
  /** Lightning only: how many extra enemies the bolt forks to. */
  chain?: number
  /** Frost only: slow strength (0..1) and duration. */
  slowPct?: number
  slowMs?: number
  targeting: TargetingMode
  /** Can this weapon hit flying enemies? Mortars cannot (they arc to ground). */
  hitsAir: boolean
  /**
   * Can this weapon hit a sea creature that has NOT surfaced?
   *
   * Everything on land is refused a submerged target — that is the sea lane's
   * whole threat. A hull sitting on the water is the exception: it is the one
   * platform with anything pointed downward, which is the entire reason to buy
   * a harbour.
   */
  hitsSubmerged?: boolean
}

export interface EconomySpec {
  /** Yield granted at the END of each cleared wave. */
  wood?: number
  stone?: number
  /**
   * META wallet coins — the tech-tree currency, banked immediately.
   *
   * Distinct from `gold` on purpose. These two are the game's two balances and
   * a producer has to say which one it fills; `mint` prints wallet coins and
   * `coffer` mints run gold, and reading them off one field would make the
   * difference invisible at the only place it is authored.
   */
  coins?: number
  /** RUN gold — the in-run currency that pays for block ranks. */
  gold?: number
}

/**
 * What a BUFF block does to the blocks around it.
 *
 * Applied to every orthogonal neighbour of the buff block's footprint, and
 * MULTIPLICATIVELY across however many of them a block is touching: two banners
 * either side of a cannon give 1.25² = 1.56, four give 2.44. That curve is the
 * whole point — it turns "where does this go" into the interesting question,
 * and rewards a tower built as a shape rather than as a pile.
 *
 * Armour is the exception and stacks ADDITIVELY, because armour is already a
 * flat subtraction with a 1-damage floor: multiplying it would either do
 * nothing or make a block immune, with very little in between.
 */
export interface BuffSpec {
  /** Multiplier applied to a neighbour's max HP and damage output. */
  statMul: number
  /** Flat armour added to a neighbour, summed across adjacent buffs. */
  armor: number
}

export interface UtilitySpec {
  /** Detonates when the block is destroyed. */
  deathExplosion?: { damage: number; radius: number }
  /** Heals every orthogonally adjacent block at the end of each wave. */
  repairPerWave?: number
  /** Reflects this much damage back at anything that melees the block. The
   *  spiked wall's entire identity — it does not shoot, it punishes contact. */
  thorns?: number
}

export interface BlockDef {
  id: string
  kind: BlockKind
  /**
    * Build cost. A missing resource means "free of that resource".
    *
    * `coins` is the RUN currency (kill drops), not the meta wallet. It is
    * carried only by the tech-gated blocks — see the note in `blocks.ts`.
    */
  cost: { wood?: number; stone?: number; coins?: number }
  hp: number
  /** Flat damage reduction applied to every incoming hit (min 1 damage). */
  armor?: number
  weapon?: WeaponSpec
  economy?: EconomySpec
  utility?: UtilitySpec
  buff?: BuffSpec
  /** Tech-tree node id that unlocks this block. Absent = available at start. */
  unlockNode?: string
  /**
   * Floats: may ONLY be placed on the water row, needs no support under it,
   * and holds nothing up. The tower's structural rules simply do not apply to
   * a hull, so it is flagged rather than special-cased at every call site.
   */
  waterOnly?: boolean
  /** Ordering weight in the build tray (lower = further left). */
  order: number
  /** Base palette key — the active theme remaps these. */
  palette: string
}

/** A placed block instance inside the live tower. */
export interface Block {
  /** Stable id, monotonically assigned. Used as a render/VFX correlation key. */
  uid: number
  c: number
  r: number
  typeId: string
  /** Capped with a gable — nothing may be placed in the cell directly above.
   *  Carried by the shape that placed it, not by the block type. */
  roof?: boolean
  /** Reinforced variant from the rewarded-ad hand: more HP, more damage, and a
   *  moving sheen so it is obvious which parts of the tower are the good ones. */
  enhanced?: boolean
  /** Ranks bought with run gold from the inspector. Raises HP, output and
   *  armour; dies with the run. Absent is the same as 0. */
  level?: number
  /**
   * Merge tier: 1 (a plain block), 2 or 3.
   *
   * Two adjacent blocks of the SAME type and SAME tier fuse into one of the
   * next tier. Absent is the same as 1.
   */
  tier?: number
  /**
   * Footprint in cells, anchored at `(c, r)` as the LOW corner.
   *
   * A merged block keeps every cell its halves occupied — it grows sideways or
   * upwards rather than collapsing into one square — so the tower never loses
   * frontage to a merge and WHERE the halves sat decides the shape you get.
   * Absent is the same as 1.
   */
  /**
   * Cached neighbour-buff multiplier and flat armour bonus.
   *
   * Derived, not authored: `refreshBuffs` recomputes both whenever the tower's
   * shape changes. Cached rather than queried per frame because the turret loop
   * and every damage calculation read them, and walking four neighbours per
   * block per hit is work the tower's shape has already decided.
   */
  buffMul?: number
  buffArmor?: number
  w?: number
  h?: number
  hp: number
  maxHp: number
  /** Weapon cooldown remaining, ms. */
  cd: number
  /** Set while the block is airborne after being orphaned by a collapse. */
  falling?: {
    /** Vertical offset from the grid position, in cells (negative = below). */
    dy: number
    vy: number
    /** Rotation for the tumble, radians. */
    rot: number
    vrot: number
    /** Horizontal drift. Kept at zero for orphan falls, which land back on the
     *  grid — a block that drifted sideways would settle in a column it never
     *  fell down. */
    dx: number
    vx: number
    /** Row the block fell FROM, so the landing damage knows the drop height. */
    fromRow?: number
  }
  /** 0..1 — 1 right after taking a hit, decays. Drives the white hit flash. */
  flash: number
  /** Remaining burn time in ms, set by a molotov. Ticks damage on its own. */
  burnMs?: number
  /** Burn damage per second while `burnMs` lasts. */
  burnDps?: number
  /** Placement animation clock in ms; drives the squash-stretch pop-in. */
  bornAt: number
  /** Recoil offset for weapons, in cells along the aim direction. Decays. */
  recoil: number
  /** Last aim angle in radians, kept so idle turrets don't snap back to 0. */
  aim: number
}

// ─── Enemies ────────────────────────────────────────────────────────────────

/** `sea` swims in the water in front of the tower and rears up to strike —
 *  it is neither walking on the ground nor flying, and weapons treat it as a
 *  surface target only while it is out of the water. */
export type EnemyMovement = 'ground' | 'air' | 'sea'

export interface EnemyDef {
  id: string
  hp: number
  /** Cells per second. */
  speed: number
  /** Damage per attack. */
  damage: number
  /** Milliseconds between attacks. */
  attackCooldownMs: number
  /** How close (in cells) the enemy must be to a block to attack it. */
  reach: number
  movement: EnemyMovement
  /** Coins dropped on death. */
  coins: number
  /** Wave-budget cost — the director spends its budget on these. */
  cost: number
  /** Earliest wave this enemy can appear in. */
  minWave: number
  /**
   * Which monster design draws this enemy.
   *
   * An array gives one type more than one body — the common ranks read as a
   * crowd rather than as a row of clones — picked deterministically from the
   * unit's uid so an individual never changes species mid-life.
   */
  monster?: string | string[]
  /** Suicide bomber: explodes on contact instead of attacking. */
  suicide?: { damage: number; radius: number }
  /** Fraction of incoming damage ignored when hit from the front. */
  frontArmorPct?: number
  /**
   * Projectile kinds this enemy simply shrugs off.
   *
   * Distinct from armour, which only scales damage: an immunity is absolute, so
   * it invalidates a whole weapon rather than making it worse. Weapons retarget
   * away from anything they cannot hurt (see `pickTarget`) so a tower of
   * archers does not stand there plinking uselessly — and the shot that does
   * land plays a deflect, which is how the player learns the rule.
   */
  immuneTo?: ProjectileKind[]
  /**
   * Air bombardment.
   *
   * Ordinary flyers close to melee range, so a tall tower with anti-air on the
   * crown is safe from them. A bomber never descends: it cruises `altitude`
   * cells ABOVE the highest block and drops ordnance, which means height alone
   * stops being protection and the crown needs real coverage of its own.
   */
  bombRun?: {
    /** Cruising height above the target block, in cells. */
    altitude: number
    /** Splash radius of one dropped round. */
    splash: number
    /** Molotovs only: how long struck blocks burn, ms. */
    burnMs?: number
    /** Molotovs only: burn damage per second. */
    burnDps?: number
    /** Which projectile it drops. */
    ordnance: ProjectileKind
  }
  /** Draw scale relative to a 1-cell body. */
  scale: number
  palette: string
  /** Sea creatures only: how long the rear-up animation takes, ms. */
  surfaceMs?: number
  /**
   * Siege engine. These do not behave like infantry: they out-range the tower,
   * ignore the ground frontier, or carry other units up it — and each one has a
   * specific answer the player is expected to reach for.
   */
  siege?: {
    /** Stops this far out and bombards, instead of walking into contact. */
    standoff?: number
    /** Ignores the frontier and drives straight for the Gate. */
    targetsGate?: boolean
    /** Lets the units escorting it attack blocks this many rows up. */
    ladderHeight?: number
    /** Splash radius of its shot, in cells. */
    splash?: number
  }
  /** True for the every-10th-wave boss (drives the boss banner + music). */
  boss?: boolean
}

export interface Enemy {
  uid: number
  typeId: string
  /** World position — x in cells (can be fractional / off-grid), y in cells. */
  x: number
  y: number
  hp: number
  maxHp: number
  /** −1 = spawned on the right and walks left; +1 = spawned left, walks right. */
  dir: 1 | -1
  /** Attack cooldown remaining, ms. */
  cd: number
  /** uid of the block currently being attacked, or -1 while travelling. */
  targetUid: number
  /** Slow effect: remaining ms and strength (0..1). */
  slowMs: number
  slowPct: number
  /** 0..1 hit flash, decays. */
  flash: number
  /** Walk-cycle phase so legs/wings animate out of sync between individuals. */
  phase: number
  /** Death animation clock; > 0 means the enemy is dying and non-interactive. */
  dying: number
  /** Sea creatures only: 0 = fully submerged, 1 = fully reared up. Drives both
   *  the strike animation and whether land weapons can hit it. */
  surfaced?: number
  /** Wheel / arm rotation for siege engines, radians. */
  spin?: number
  /**
   * Horizontal displacement still owed from a shove, in cells (signed).
   *
   * Applied over a few frames rather than instantly: a boss that teleported two
   * cells sideways the moment a wall landed on it reads as a glitch, not as
   * being knocked back.
   */
  knockback?: number
}

// ─── Allies ─────────────────────────────────────────────────────────────────

/**
 * A friendly unit bought with coins and sent out of the Gate.
 *
 * Cavalry exist because siege engines stand off beyond every turret's reach —
 * a purely static defence has no answer to a trebuchet parked at 20 cells. The
 * counter has to be something that LEAVES the tower.
 */
export interface Ally {
  uid: number
  typeId: string
  x: number
  y: number
  hp: number
  maxHp: number
  /** Travel direction: +1 right, -1 left. */
  dir: 1 | -1
  cd: number
  /** uid of the enemy being engaged, or -1 while riding out. */
  targetUid: number
  flash: number
  phase: number
  dying: number
  /** Remaining lifetime in ms — cavalry are a sortie, not a permanent army. */
  life: number
}

export interface AllyDef {
  id: string
  hp: number
  speed: number
  damage: number
  attackCooldownMs: number
  reach: number
  /** Coin price. */
  cost: number
  /** How long the sortie lasts before the riders return, ms. */
  lifeMs: number
  scale: number
  palette: string
}

// ─── Projectiles ────────────────────────────────────────────────────────────

export interface Projectile {
  uid: number
  kind: ProjectileKind
  x: number
  y: number
  vx: number
  vy: number
  damage: number
  splash: number
  /** Ballistic shells integrate gravity; direct-fire rounds do not. */
  ballistic: boolean
  /** Homing target uid for direct fire (-1 = dumb-fire toward last position). */
  targetUid: number
  /** Remaining lifetime in ms — a safety net so strays never leak. */
  life: number
  slowPct: number
  slowMs: number
  /** Source block, for attributing kills to the right turret (VFX + stats). */
  sourceUid: number
  /**
   * Dropped BY an enemy at the tower, rather than fired at one.
   *
   * A hostile round damages blocks and is ignored by the tower's own collision
   * checks — it is the same integrator running in the opposite direction, which
   * is why bomber ordnance gets a real falling arc instead of teleporting
   * damage onto the crown.
   */
  hostile?: boolean
  /** Hostile rounds only: burn to apply to whatever the blast catches. */
  burnMs?: number
  burnDps?: number
  /** Trail sample ring for the renderer (x,y pairs). */
  trail: number[]
}

// ─── Waves ──────────────────────────────────────────────────────────────────

/** One scheduled spawn: enemy type, which side, and when (ms into the wave). */
export interface SpawnOrder {
  typeId: string
  side: 1 | -1
  atMs: number
}

export interface WavePlan {
  wave: number
  orders: SpawnOrder[]
  /** Total enemies in the wave — drives the "ENEMIES: n" HUD counter. */
  total: number
  boss: boolean
}

// ─── Run / phase ────────────────────────────────────────────────────────────

export type Phase = 'build' | 'battle' | 'defeat'

/** Per-enemy-type kill tallies, shown on the wave-clear toast and the run
 *  summary (reference images 2 and 7). */
export type KillTally = Record<string, number>

/** The serialisable snapshot persisted under `ts_run`, so a reload (or a
 *  cross-device cloud hydrate) resumes the exact siege in progress. */
export interface RunSnapshot {
  wave: number
  wood: number
  stone: number
  runCoins: number
  kills: number
  killsByType: KillTally
  /** Compact tuples keep the blob small:
   *  `[c, r, typeId, hp, roof, enhanced, level, tier, w, h]`.
   *  The trailing fields are optional so older snapshots still load. */
  blocks: Array<[
    number, number, string, number,
    (0 | 1)?, (0 | 1)?, number?, number?, number?, number?
  ]>
  /** The four shape ids currently on offer. Persisted so a reload cannot be
   *  used to reroll a hand the player doesn't like. */
  offers: string[]
  startedAt: number
}

// ─── Tech tree ──────────────────────────────────────────────────────────────

export type TechEffect =
  | { kind: 'unlock'; blockId: string }
  | { kind: 'damage'; pct: number }
  | { kind: 'fireRate'; pct: number }
  | { kind: 'range'; pct: number }
  | { kind: 'splash'; pct: number }
  | { kind: 'chain'; add: number }
  | { kind: 'blockHp'; pct: number }
  | { kind: 'armor'; add: number }
  | { kind: 'gateHp'; pct: number }
  | { kind: 'startWood'; add: number }
  | { kind: 'startStone'; add: number }
  | { kind: 'waveReward'; pct: number }
  | { kind: 'coinDrop'; pct: number }
  | { kind: 'buildWidth'; add: number }
  | { kind: 'waveRepair'; pct: number }
  | { kind: 'thorns'; pct: number }
  | { kind: 'cavalryPower'; pct: number }
  | { kind: 'navalDamage'; pct: number }
  | { kind: 'navalHp'; pct: number }
  | { kind: 'dockWidth'; add: number }
  /** Permits merging at all. Binary. */
  | { kind: 'mergeUnlock' }
  /** Extra damage for MERGED blocks only (tier 2 and 3). */
  | { kind: 'mergePower'; pct: number }
  /** Strengthens what a BUFF block's aura is worth, not how many it reaches. */
  | { kind: 'buffPower'; pct: number }
  /** Raises every economy block's end-of-wave yield. */
  | { kind: 'economyYield'; pct: number }

export interface TechNode {
  id: string
  /** Tier drives the vertical position in the tree layout. */
  tier: number
  /** Column within the tier — the layout is a hand-authored grid. */
  col: number
  maxLevel: number
  costBase: number
  costGrowth: number
  /** Node ids that must have at least level 1 before this one can be bought. */
  requires: string[]
  effect: TechEffect
  /** Glyph key the renderer maps to an inline SVG path. */
  icon: string
}
