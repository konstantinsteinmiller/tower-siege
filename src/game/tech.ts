import type { TechNode, TechEffect } from './types'

// ─── Tech tree ──────────────────────────────────────────────────────────────
//
// A hand-authored DAG laid out on a (tier, col) grid; the modal renders nodes
// at those coordinates and draws SVG connectors from `requires`.
//
// NO LEVEL CAPS on stat nodes. Specialisation is the point: a player who wants
// to pour every coin into damage should be allowed to, and the only thing
// stopping them is the price curve. `costGrowth` is what balances the tree, not
// an arbitrary ceiling — a node at rank 20 costs ~40× its rank-1 price, so
// going deep on one line genuinely means going without everything else.
//
// Unlock nodes are the exception: they are binary, so they cap at 1.
//
// Layout intent — three readable lanes fanning out from a shared root:
//   col < 0   OFFENSE  (weapons, damage, range, fire rate)
//   col ≈ 0   SPINE    (structure, the Gate, armour)
//   col > 0   ECONOMY  (resource blocks, starting stock, wave rewards)

/** Sentinel for "no ceiling". Kept finite so arithmetic stays sane. */
export const UNCAPPED = 9999

export const TECH_NODES: ReadonlyArray<TechNode> = [
  // ── Tier 0 — the root ────────────────────────────────────────────────────
  {
    id: 'foundations',
    tier: 0, col: 0, maxLevel: UNCAPPED,
    costBase: 40, costGrowth: 1.28,
    requires: [],
    effect: { kind: 'blockHp', pct: 6 },
    icon: 'foundations'
  },

  // ── Tier 1 ───────────────────────────────────────────────────────────────
  {
    id: 'sharpBolts',
    tier: 1, col: -1, maxLevel: UNCAPPED,
    costBase: 60, costGrowth: 1.3,
    requires: ['foundations'],
    effect: { kind: 'damage', pct: 7 },
    icon: 'damage'
  },
  {
    id: 'unlockBrace',
    tier: 1, col: 0, maxLevel: 1,
    // 60, not 90. A first run pays out roughly 60-115 coins, and the three
    // cheapest nodes in the tree were `foundations` (+6 % block HP),
    // `sharpBolts` (+7 % damage) and `lumberStock` (+20 wood) — two of which a
    // player cannot see the effect of at all. The first purchase after a first
    // death should visibly change the next run, and a whole new block does.
    costBase: 60, costGrowth: 1,
    requires: ['foundations'],
    effect: { kind: 'unlock', blockId: 'brace' },
    icon: 'brace'
  },
  {
    id: 'lumberStock',
    tier: 1, col: 1, maxLevel: UNCAPPED,
    costBase: 55, costGrowth: 1.26,
    requires: ['foundations'],
    effect: { kind: 'startWood', add: 20 },
    icon: 'wood'
  },

  // ── Tier 2 ───────────────────────────────────────────────────────────────
  {
    id: 'longSight',
    tier: 2, col: -2, maxLevel: UNCAPPED,
    costBase: 120, costGrowth: 1.34,
    requires: ['sharpBolts'],
    effect: { kind: 'range', pct: 8 },
    icon: 'range'
  },
  {
    id: 'rapidFire',
    tier: 2, col: -1, maxLevel: UNCAPPED,
    // Re-costed from 140. Enemy armour is percentage-based, so +7 % fire rate
    // and +7 % damage are the SAME number — and this node sat a tier deeper and
    // cost 2.3x `sharpBolts` for it. Nobody should ever buy a strictly worse
    // version of something they already own. At 80 the first rank prices in
    // between `sharpBolts` r1 and r2, so which one to take next is a real
    // question rather than an arithmetic error.
    costBase: 80, costGrowth: 1.32,
    requires: ['sharpBolts'],
    effect: { kind: 'fireRate', pct: 7 },
    icon: 'fireRate'
  },
  {
    id: 'reinforced',
    tier: 2, col: 0, maxLevel: UNCAPPED,
    costBase: 110, costGrowth: 1.29,
    requires: ['unlockBrace'],
    effect: { kind: 'blockHp', pct: 7 },
    icon: 'blockHp'
  },
  {
    id: 'unlockSpikes',
    tier: 2, col: 1, maxLevel: 1,
    // 90, not 150. Spikes are the only node that fills the SUPPORT offer lane,
    // which is empty for a player with no tech — so buying it visibly changes
    // the hand they are dealt, not just a number inside a block.
    costBase: 90, costGrowth: 1,
    requires: ['foundations'],
    effect: { kind: 'unlock', blockId: 'spikes' },
    icon: 'spikes'
  },

  // ── Merging ──────────────────────────────────────────────────────────────
  //
  // Off the SPINE rather than a lane, because merging is not an offensive or
  // an economic idea — it changes how every block in the tower is placed. A
  // player who owns it stops thinking in single cells.
  {
    id: 'unlockMerge',
    tier: 1, col: 2, maxLevel: 1,
    costBase: 200, costGrowth: 1,
    requires: ['foundations'],
    effect: { kind: 'mergeUnlock' },
    icon: 'merge'
  },
  {
    id: 'forgeWelds',
    tier: 2, col: 3, maxLevel: UNCAPPED,
    costBase: 260, costGrowth: 1.31,
    requires: ['unlockMerge'],
    effect: { kind: 'mergePower', pct: 12 },
    icon: 'weld'
  },
  {
    id: 'quarryStock',
    tier: 2, col: 2, maxLevel: UNCAPPED,
    costBase: 80, costGrowth: 1.26,
    requires: ['lumberStock'],
    effect: { kind: 'startStone', add: 14 },
    icon: 'stone'
  },

  // ── Tier 3 ───────────────────────────────────────────────────────────────
  {
    id: 'unlockBombard',
    tier: 3, col: -3, maxLevel: 1,
    costBase: 260, costGrowth: 1,
    requires: ['longSight'],
    effect: { kind: 'unlock', blockId: 'bombard' },
    icon: 'bombard'
  },
  {
    id: 'unlockMortar',
    tier: 3, col: -2, maxLevel: 1,
    costBase: 320, costGrowth: 1,
    requires: ['longSight'],
    effect: { kind: 'unlock', blockId: 'mortar' },
    icon: 'mortar'
  },
  {
    id: 'unlockTesla',
    tier: 3, col: -1, maxLevel: 1,
    costBase: 380, costGrowth: 1,
    requires: ['rapidFire'],
    effect: { kind: 'unlock', blockId: 'tesla' },
    icon: 'tesla'
  },
  {
    id: 'gateArmor',
    tier: 3, col: 0, maxLevel: UNCAPPED,
    costBase: 200, costGrowth: 1.33,
    requires: ['reinforced'],
    effect: { kind: 'gateHp', pct: 15 },
    icon: 'gate'
  },
  {
    id: 'sharpSpikes',
    tier: 3, col: 1, maxLevel: UNCAPPED,
    costBase: 170, costGrowth: 1.3,
    requires: ['unlockSpikes'],
    effect: { kind: 'thorns', pct: 20 },
    icon: 'thorns'
  },
  {
    id: 'unlockSawmill',
    tier: 3, col: 2, maxLevel: 1,
    costBase: 160, costGrowth: 1,
    requires: ['quarryStock'],
    effect: { kind: 'unlock', blockId: 'sawmill' },
    icon: 'sawmill'
  },
  {
    id: 'wideFoundation',
    tier: 3, col: 3, maxLevel: UNCAPPED,
    costBase: 300, costGrowth: 1.55,
    requires: ['quarryStock'],
    effect: { kind: 'buildWidth', add: 1 },
    icon: 'width'
  },

  // ── Tier 4 ───────────────────────────────────────────────────────────────
  {
    id: 'heavyOrdnance',
    tier: 4, col: -3, maxLevel: UNCAPPED,
    costBase: 260, costGrowth: 1.33,
    requires: ['unlockBombard'],
    effect: { kind: 'splash', pct: 12 },
    icon: 'splash'
  },
  {
    id: 'unlockFrost',
    tier: 4, col: -2, maxLevel: 1,
    costBase: 460, costGrowth: 1,
    requires: ['unlockMortar'],
    effect: { kind: 'unlock', blockId: 'frost' },
    icon: 'frost'
  },
  {
    id: 'forkedBolts',
    tier: 4, col: -1, maxLevel: UNCAPPED,
    costBase: 520, costGrowth: 1.75,
    requires: ['unlockTesla'],
    effect: { kind: 'chain', add: 1 },
    icon: 'chain'
  },
  {
    id: 'ironPlating',
    tier: 4, col: 0, maxLevel: UNCAPPED,
    costBase: 380, costGrowth: 1.36,
    requires: ['gateArmor'],
    effect: { kind: 'armor', add: 1 },
    icon: 'armor'
  },
  {
    id: 'unlockRepair',
    tier: 4, col: 1, maxLevel: 1,
    costBase: 500, costGrowth: 1,
    requires: ['sharpSpikes'],
    effect: { kind: 'unlock', blockId: 'repair' },
    icon: 'repair'
  },
  {
    id: 'unlockQuarry',
    tier: 4, col: 2, maxLevel: 1,
    costBase: 280, costGrowth: 1,
    requires: ['unlockSawmill'],
    effect: { kind: 'unlock', blockId: 'quarry' },
    icon: 'quarry'
  },
  {
    id: 'richHauls',
    tier: 4, col: 3, maxLevel: UNCAPPED,
    costBase: 220, costGrowth: 1.3,
    requires: ['wideFoundation'],
    effect: { kind: 'waveReward', pct: 9 },
    icon: 'reward'
  },

  // ── Tier 5 ───────────────────────────────────────────────────────────────
  {
    id: 'siegeShells',
    tier: 5, col: -3, maxLevel: UNCAPPED,
    costBase: 420, costGrowth: 1.35,
    requires: ['heavyOrdnance'],
    effect: { kind: 'damage', pct: 9 },
    icon: 'shell'
  },
  {
    id: 'overcharge',
    tier: 5, col: -2, maxLevel: UNCAPPED,
    costBase: 620, costGrowth: 1.37,
    requires: ['unlockFrost', 'forkedBolts'],
    effect: { kind: 'fireRate', pct: 8 },
    icon: 'overcharge'
  },
  {
    id: 'masterwork',
    tier: 5, col: -1, maxLevel: UNCAPPED,
    costBase: 800, costGrowth: 1.38,
    requires: ['forkedBolts'],
    effect: { kind: 'damage', pct: 11 },
    icon: 'masterwork'
  },
  {
    id: 'fieldRepairs',
    tier: 5, col: 0, maxLevel: UNCAPPED,
    costBase: 700, costGrowth: 1.4,
    requires: ['ironPlating', 'unlockRepair'],
    effect: { kind: 'waveRepair', pct: 5 },
    icon: 'heal'
  },
  {
    id: 'unlockMint',
    tier: 5, col: 2, maxLevel: 1,
    costBase: 640, costGrowth: 1,
    requires: ['unlockQuarry'],
    effect: { kind: 'unlock', blockId: 'mint' },
    icon: 'mint'
  },
  {
    id: 'looting',
    tier: 5, col: 3, maxLevel: UNCAPPED,
    costBase: 360, costGrowth: 1.31,
    requires: ['richHauls'],
    effect: { kind: 'coinDrop', pct: 11 },
    icon: 'loot'
  },

  // ── Tier 6 — the deep specialisations ────────────────────────────────────
  {
    id: 'warChest',
    tier: 6, col: 3, maxLevel: UNCAPPED,
    costBase: 950, costGrowth: 1.36,
    requires: ['looting'],
    effect: { kind: 'waveReward', pct: 12 },
    icon: 'vault'
  },
  {
    id: 'greatFoundation',
    tier: 6, col: 2, maxLevel: UNCAPPED,
    costBase: 1200, costGrowth: 1.6,
    requires: ['unlockMint'],
    effect: { kind: 'buildWidth', add: 1 },
    icon: 'width'
  },
  {
    id: 'cavalryDrill',
    tier: 6, col: 0, maxLevel: UNCAPPED,
    // Cavalry only exist while siege engines are inbound, and `siegeShare` is
    // zero below wave 14 — so this node buys nothing at all for the first
    // thirteen waves of every run, and each sortie it improves is paid for in
    // META coins, competing with the tree it sits in. Cut from 500 so the deep
    // spine is not asking full price for a conditional effect.
    costBase: 360, costGrowth: 1.34,
    requires: ['fieldRepairs'],
    effect: { kind: 'cavalryPower', pct: 14 },
    icon: 'cavalry'
  },
  {
    id: 'artilleryDoctrine',
    tier: 6, col: -2, maxLevel: UNCAPPED,
    costBase: 900, costGrowth: 1.4,
    requires: ['siegeShells', 'overcharge'],
    effect: { kind: 'range', pct: 9 },
    icon: 'doctrine'
  },

  // ── The Harbour ──────────────────────────────────────────────────────────
  //
  // A SECOND ROOT, deliberately. It requires nothing, it is bought with its own
  // gold, and no node in it connects back to `foundations` — so it reads on the
  // board as what it is: a different place to build, not a deeper rank of the
  // tower. Column 4 is left empty as a gutter so the two trees never appear to
  // share an edge.
  //
  // What it buys is the answer to the sea lane. Everything on land is refused a
  // submerged target, so until a player owns a hull their only counter to eels
  // and krakens is to survive the bite. It is priced against that: the first
  // rank costs about what a mid-tier weapon unlock does, and the hulls
  // themselves are expensive in a currency the tower also wants.
  {
    id: 'harbour',
    tier: 0, col: 6, maxLevel: 1,
    // 210, not 140.
    //
    // At 140 this was the strongest purchase in the game by a wide margin, and
    // for reasons that read as unintended: ground infantry cannot target hulls
    // at all, and there are no sea enemies before wave 12 — so a harbour bought
    // on run 1 was seven berths of turret that nothing in waves 1-11 could
    // answer, consuming no foundation footprint. Ranged ground attackers can
    // now shoot moored hulls (see `groundFrontier`), which removes the free
    // lunch; the price puts it behind the land tree's opening as a considered
    // second purchase rather than the obvious first one.
    costBase: 210, costGrowth: 1,
    requires: [],
    effect: { kind: 'unlock', blockId: 'skiff' },
    icon: 'harbour'
  },
  {
    id: 'dockWorks',
    tier: 1, col: 5, maxLevel: UNCAPPED,
    costBase: 180, costGrowth: 1.5,
    requires: ['harbour'],
    effect: { kind: 'dockWidth', add: 1 },
    icon: 'dock'
  },
  {
    id: 'unlockLongship',
    tier: 1, col: 7, maxLevel: 1,
    costBase: 260, costGrowth: 1,
    requires: ['harbour'],
    effect: { kind: 'unlock', blockId: 'longship' },
    icon: 'longship'
  },
  {
    id: 'seasonedHulls',
    tier: 2, col: 5, maxLevel: UNCAPPED,
    costBase: 200, costGrowth: 1.3,
    requires: ['dockWorks'],
    effect: { kind: 'navalHp', pct: 12 },
    icon: 'hull'
  },
  {
    id: 'navalGunnery',
    tier: 2, col: 7, maxLevel: UNCAPPED,
    costBase: 240, costGrowth: 1.32,
    requires: ['unlockLongship'],
    effect: { kind: 'navalDamage', pct: 10 },
    icon: 'naval'
  },
  {
    id: 'unlockGalley',
    tier: 3, col: 6, maxLevel: 1,
    costBase: 620, costGrowth: 1,
    requires: ['seasonedHulls', 'navalGunnery'],
    effect: { kind: 'unlock', blockId: 'galley' },
    icon: 'galley'
  },
  {
    id: 'admiralty',
    tier: 4, col: 6, maxLevel: UNCAPPED,
    costBase: 780, costGrowth: 1.38,
    requires: ['unlockGalley'],
    effect: { kind: 'navalDamage', pct: 13 },
    icon: 'admiralty'
  },

  // ── The Works ────────────────────────────────────────────────────────────
  //
  // A THIRD ROOT, for the two block families that do not fight: producers and
  // buffs. Like the Harbour it connects to nothing, because it is not a deeper
  // rank of the tower — it is a different reason to place a block.
  //
  // The two halves answer the two things a tower made only of walls and guns
  // cannot do:
  //
  //  - ECONOMY. Wave income is the replacement rate for attrition, and past
  //    wave 12 it is roughly half what the waves destroy. A producer is a cell
  //    that neither shoots nor soaks, paid for by the cells it lets you rebuild.
  //  - BUFFS. Every optimal tower before this was a pile of the best affordable
  //    block. A banner is worth nothing on its own and multiplies with every
  //    other one touching the same block, so the question stops being WHAT to
  //    build and starts being WHERE.
  //
  // Column 8 is the gutter between this and the Harbour, for the same reason
  // column 4 is the gutter between the Harbour and the land tree — one empty
  // column each, so no two trees ever appear to share an edge.
  {
    id: 'logistics',
    tier: 0, col: 10, maxLevel: 1,
    // The cheapest root in the tree, and deliberately so: it is the one a
    // player reaches on their first or second run, and what it opens — a stone
    // producer — is legible in a way that "+6 % block HP" is not.
    costBase: 110, costGrowth: 1,
    requires: [],
    effect: { kind: 'unlock', blockId: 'stonepit' },
    icon: 'quarry'
  },
  {
    id: 'unlockCoffer',
    tier: 1, col: 9, maxLevel: 1,
    // A coffer is the only producer of RUN gold in the game. Every other source
    // is a kill drop, which is why a player whose wall held perfectly also
    // finished the run with nothing to upgrade it with.
    costBase: 230, costGrowth: 1,
    requires: ['logistics'],
    effect: { kind: 'unlock', blockId: 'coffer' },
    icon: 'mint'
  },
  {
    id: 'yields',
    tier: 1, col: 11, maxLevel: UNCAPPED,
    costBase: 150, costGrowth: 1.3,
    requires: ['logistics'],
    effect: { kind: 'economyYield', pct: 12 },
    icon: 'sawmill'
  },
  {
    id: 'unlockObelisk',
    tier: 2, col: 10, maxLevel: 1,
    // The heavy buff. 1.4 against the banner's 1.25 sounds small; two of them
    // give 1.96 where two banners give 1.56, because the auras multiply.
    costBase: 320, costGrowth: 1,
    requires: ['unlockCoffer', 'yields'],
    effect: { kind: 'unlock', blockId: 'obelisk' },
    icon: 'obelisk'
  },
  {
    id: 'rallyCry',
    tier: 3, col: 9, maxLevel: UNCAPPED,
    // Scales the aura's STRENGTH, so it compounds with itself through the
    // product — which is why its growth is the steepest in the tree.
    costBase: 300, costGrowth: 1.42,
    requires: ['unlockObelisk'],
    effect: { kind: 'buffPower', pct: 10 },
    icon: 'banner'
  },
  {
    id: 'stockpiles',
    tier: 3, col: 11, maxLevel: UNCAPPED,
    costBase: 260, costGrowth: 1.34,
    requires: ['unlockObelisk'],
    effect: { kind: 'economyYield', pct: 15 },
    icon: 'mint'
  }
]

export const TECH_BY_ID: Record<string, TechNode> = Object.fromEntries(
  TECH_NODES.map((n) => [n.id, n])
)

/**
 * Coin price of the level `lvl → lvl+1`.
 *
 * With no level ceiling the growth curve IS the balance. At `costGrowth` ≈ 1.3
 * a node's 10th rank costs ~10× its first and its 20th ~140×, so a player who
 * commits everything to one line pays for that depth by having nothing else —
 * which is exactly the specialised playstyle this is meant to allow.
 *
 * The first rank of a repeatable node is half price so the opening point in any
 * branch is an easy, satisfying commitment.
 */
export const techCost = (id: string, level: number): number => {
  const node = TECH_BY_ID[id]
  if (!node) return Infinity
  if (level >= node.maxLevel) return Infinity
  const raw = node.costBase * Math.pow(node.costGrowth, level)
  const priced = node.maxLevel > 1 && level === 0 ? raw * 0.5 : raw
  // Round to something legible — exact prices past a few thousand are noise.
  if (priced < 1000) return Math.round(priced)
  if (priced < 100_000) return Math.round(priced / 10) * 10
  return Math.round(priced / 1000) * 1000
}

/** True for nodes that are a one-off unlock rather than a repeatable rank. */
export const isUnlockNode = (id: string): boolean => TECH_BY_ID[id]?.maxLevel === 1

/** Grid extents of the authored layout — the tree modal uses these to size and
 *  centre its viewport without hard-coding magic numbers. */
export const TECH_BOUNDS = TECH_NODES.reduce(
  (acc, n) => ({
    minCol: Math.min(acc.minCol, n.col),
    maxCol: Math.max(acc.maxCol, n.col),
    minTier: Math.min(acc.minTier, n.tier),
    maxTier: Math.max(acc.maxTier, n.tier)
  }),
  { minCol: 0, maxCol: 0, minTier: 0, maxTier: 0 }
)

/** Accumulate every effect of a kind across the player's purchased levels. */
export const sumEffect = (
  levels: Record<string, number>,
  kind: TechEffect['kind']
): number => {
  let total = 0
  for (const node of TECH_NODES) {
    if (node.effect.kind !== kind) continue
    const lvl = levels[node.id] ?? 0
    if (lvl <= 0) continue
    const e = node.effect as { pct?: number; add?: number }
    total += (e.pct ?? e.add ?? 0) * lvl
  }
  return total
}

/**
 * Is any node carrying `kind` owned?
 *
 * `sumEffect` cannot answer this for a flagless effect — it adds up `pct`/`add`
 * and a switch has neither, so a bought `mergeUnlock` sums to zero exactly like
 * an unbought one.
 */
export const hasEffect = (
  levels: Record<string, number>,
  kind: TechEffect['kind']
): boolean =>
  TECH_NODES.some((n) => n.effect.kind === kind && (levels[n.id] ?? 0) > 0)

/** Set of block ids unlocked by the player's tech levels. */
export const unlockedBlocks = (levels: Record<string, number>): Set<string> => {
  const out = new Set<string>()
  for (const node of TECH_NODES) {
    if (node.effect.kind !== 'unlock') continue
    if ((levels[node.id] ?? 0) > 0) out.add(node.effect.blockId)
  }
  return out
}
