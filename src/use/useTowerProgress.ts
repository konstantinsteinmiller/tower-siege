import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { getState, setState, setStates, towerState } from '@/use/useTowerState'
import {
  TECH_KEY, BEST_WAVE_KEY, BEST_HEIGHT_KEY, BEST_BLOCKS_KEY,
  TOTAL_KILLS_KEY, TOTAL_WAVES_KEY, RUNS_KEY, TOTAL_BLOCKS_KEY, BEST_SCORE_KEY
} from '@/keys'
import useTowerEconomy from '@/use/useTowerEconomy'
import { TECH_NODES, TECH_BY_ID, techCost, sumEffect, unlockedBlocks } from '@/game/tech'
import { BLOCK_DEFS } from '@/game/blocks'

/**
 * Meta progression: permanent tech levels + lifetime statistics.
 *
 * Everything here lives inside the single `tower_state` blob and is re-read on
 * BOTH `saveDataVersion` (cloud hydrate finished) and `towerState` identity
 * changes (a cloud sync wrote back into the blob) — the two-watcher pattern is
 * what keeps a returning player from being rendered as a fresh one for the
 * frame or two between boot and hydrate.
 */

interface TechState { levels: Record<string, number> }

const readNumber = (key: string, fallback: number): number => {
  const v = getState<unknown>(key)
  if (v === undefined || v === null) return fallback
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : fallback
}

const loadTech = (): TechState => {
  const v = getState<Partial<TechState> | null>(TECH_KEY, null)
  const levels: Record<string, number> = {}
  if (v && v.levels && typeof v.levels === 'object') {
    for (const node of TECH_NODES) {
      const lvl = (v.levels as Record<string, unknown>)[node.id]
      if (typeof lvl === 'number' && Number.isFinite(lvl)) {
        // Repeatable nodes are uncapped, so the clamp only ever bites on the
        // binary unlock nodes.
        levels[node.id] = Math.max(0, Math.min(node.maxLevel, Math.floor(lvl)))
      }
    }
  }
  return { levels }
}

const tech: Ref<TechState> = ref(loadTech())
const bestWave: Ref<number> = ref(readNumber(BEST_WAVE_KEY, 0))
const bestHeight: Ref<number> = ref(readNumber(BEST_HEIGHT_KEY, 0))
const bestBlocks: Ref<number> = ref(readNumber(BEST_BLOCKS_KEY, 0))
const bestScore: Ref<number> = ref(readNumber(BEST_SCORE_KEY, 0))
const totalKills: Ref<number> = ref(readNumber(TOTAL_KILLS_KEY, 0))
const totalWaves: Ref<number> = ref(readNumber(TOTAL_WAVES_KEY, 0))
const totalBlocks: Ref<number> = ref(readNumber(TOTAL_BLOCKS_KEY, 0))
const runs: Ref<number> = ref(readNumber(RUNS_KEY, 0))

const refresh = (): void => {
  tech.value = loadTech()
  bestWave.value = readNumber(BEST_WAVE_KEY, bestWave.value)
  bestHeight.value = readNumber(BEST_HEIGHT_KEY, bestHeight.value)
  bestBlocks.value = readNumber(BEST_BLOCKS_KEY, bestBlocks.value)
  bestScore.value = readNumber(BEST_SCORE_KEY, bestScore.value)
  totalKills.value = readNumber(TOTAL_KILLS_KEY, totalKills.value)
  totalWaves.value = readNumber(TOTAL_WAVES_KEY, totalWaves.value)
  totalBlocks.value = readNumber(TOTAL_BLOCKS_KEY, totalBlocks.value)
  runs.value = readNumber(RUNS_KEY, runs.value)
}
watch(saveDataVersion, refresh)
watch(towerState, refresh, { deep: false })

// ─── Derived combat modifiers ───────────────────────────────────────────────
//
// One computed per effect kind, each read once per wave (not per frame) by the
// simulation. Percentages accumulate additively across nodes, which keeps the
// numbers legible to the player ("+8 % per level, three levels = +24 %")
// instead of compounding into something nobody can reason about.

export const levelOf = (id: string): number => tech.value.levels[id] ?? 0

export const damageMul: ComputedRef<number> = computed(() => 1 + sumEffect(tech.value.levels, 'damage') / 100)
export const fireRateMul: ComputedRef<number> = computed(() => 1 + sumEffect(tech.value.levels, 'fireRate') / 100)
export const rangeMul: ComputedRef<number> = computed(() => 1 + sumEffect(tech.value.levels, 'range') / 100)
export const splashMul: ComputedRef<number> = computed(() => 1 + sumEffect(tech.value.levels, 'splash') / 100)
export const chainBonus: ComputedRef<number> = computed(() => sumEffect(tech.value.levels, 'chain'))
export const blockHpMul: ComputedRef<number> = computed(() => 1 + sumEffect(tech.value.levels, 'blockHp') / 100)
export const gateHpMul: ComputedRef<number> = computed(() => 1 + sumEffect(tech.value.levels, 'gateHp') / 100)
export const armorBonus: ComputedRef<number> = computed(() => sumEffect(tech.value.levels, 'armor'))
export const waveRewardMul: ComputedRef<number> = computed(() => 1 + sumEffect(tech.value.levels, 'waveReward') / 100)
export const coinDropMul: ComputedRef<number> = computed(() => 1 + sumEffect(tech.value.levels, 'coinDrop') / 100)
export const waveRepairPct: ComputedRef<number> = computed(() => sumEffect(tech.value.levels, 'waveRepair') / 100)
/** Spiked-wall reflect multiplier. */
export const thornsMul: ComputedRef<number> = computed(() => 1 + sumEffect(tech.value.levels, 'thorns') / 100)
/** Cavalry HP + damage multiplier. */
export const cavalryMul: ComputedRef<number> = computed(() => 1 + sumEffect(tech.value.levels, 'cavalryPower') / 100)

/** Starting build resources for a fresh run. */
export const startWood: ComputedRef<number> = computed(() => 120 + sumEffect(tech.value.levels, 'startWood'))
export const startStone: ComputedRef<number> = computed(() => 40 + sumEffect(tech.value.levels, 'startStone'))

/**
 * Half-width of the FOUNDATION: four cells either side of the Gate at the
 * start, grown by the foundation nodes.
 *
 * This is the ground floor only — every floor above it is unbounded (see
 * `halfWidthAt`). That makes the foundation tech exactly what its name says:
 * it buys FOOTPRINT, which is the scarce thing, because ground-level cells are
 * the ones every enemy can reach and the ones everything above has to stand on.
 */
export const buildHalfWidth: ComputedRef<number> = computed(
  () => 4 + sumEffect(tech.value.levels, 'buildWidth')
)

/** Block ids the player may place right now. */
export const availableBlocks: ComputedRef<Set<string>> = computed(() => {
  const unlocked = unlockedBlocks(tech.value.levels)
  const out = new Set<string>()
  for (const def of Object.values(BLOCK_DEFS)) {
    if (def.kind === 'core') continue
    if (!def.unlockNode || unlocked.has(def.id)) out.add(def.id)
  }
  return out
})

// ─── GamePix / portal metrics ───────────────────────────────────────────────
// The GamePix toolkit reports a "level" and a lifetime play count; wave and run
// counters are the natural fit.
export const gamesPlayedTotal: ComputedRef<number> = computed(() => runs.value)
export const maxStageReached: ComputedRef<number> = computed(() => Math.max(1, bestWave.value))

const persistTech = (): void => setState(TECH_KEY, tech.value)

export default function useTowerProgress() {
  const { coins, spendCoins } = useTowerEconomy()

  /** A node is visible+purchasable once every prerequisite has ≥ 1 level. */
  const isUnlocked = (id: string): boolean => {
    const node = TECH_BY_ID[id]
    if (!node) return false
    return node.requires.every((req) => levelOf(req) > 0)
  }

  const costOf = (id: string): number => techCost(id, levelOf(id))

  const canBuy = (id: string): boolean => {
    const node = TECH_BY_ID[id]
    if (!node) return false
    if (!isUnlocked(id)) return false
    if (levelOf(id) >= node.maxLevel) return false
    return coins.value >= costOf(id)
  }

  const buyTech = (id: string): boolean => {
    if (!canBuy(id)) return false
    if (!spendCoins(costOf(id))) return false
    tech.value = { levels: { ...tech.value.levels, [id]: levelOf(id) + 1 } }
    persistTech()
    // Hard checkpoint: a purchase MUST survive an immediate reload, so bypass
    // both the blob debounce and the strategy's flush debounce.
    void flushSaveNow()
    return true
  }

  /** Count of affordable, not-yet-maxed nodes — drives the Tech button badge
   *  and the one-shot "spend your coins" spotlight. */
  const affordableCount = computed(
    () => TECH_NODES.filter((n) => canBuy(n.id)).length
  )

  /** Record a finished run. Every lifetime counter is written in ONE batched
   *  state update so the persist layer schedules a single write. */
  const recordRunEnd = (stats: {
    wave: number
    kills: number
    /** Leaderboard score for the run: kills, bosses worth five. */
    score: number
    wavesCleared: number
    height: number
    blocks: number
    blocksPlaced: number
  }): void => {
    const nextBestWave = Math.max(bestWave.value, stats.wave)
    const nextBestHeight = Math.max(bestHeight.value, stats.height)
    const nextBestBlocks = Math.max(bestBlocks.value, stats.blocks)
    const nextBestScore = Math.max(bestScore.value, Math.max(0, Math.floor(stats.score)))
    const nextKills = totalKills.value + Math.max(0, stats.kills)
    const nextWaves = totalWaves.value + Math.max(0, stats.wavesCleared)
    const nextBlocks = totalBlocks.value + Math.max(0, stats.blocksPlaced)

    bestWave.value = nextBestWave
    bestHeight.value = nextBestHeight
    bestBlocks.value = nextBestBlocks
    bestScore.value = nextBestScore
    totalKills.value = nextKills
    totalWaves.value = nextWaves
    totalBlocks.value = nextBlocks

    setStates({
      [BEST_WAVE_KEY]: nextBestWave,
      [BEST_HEIGHT_KEY]: nextBestHeight,
      [BEST_BLOCKS_KEY]: nextBestBlocks,
      [BEST_SCORE_KEY]: nextBestScore,
      [TOTAL_KILLS_KEY]: nextKills,
      [TOTAL_WAVES_KEY]: nextWaves,
      [TOTAL_BLOCKS_KEY]: nextBlocks
    })
    void flushSaveNow()
  }

  /** Count a started run (battle-pass cadence + portal "games played"). */
  const recordRunStart = (): void => {
    runs.value += 1
    setState(RUNS_KEY, runs.value)
  }

  return {
    tech,
    coins,
    bestWave,
    bestHeight,
    bestBlocks,
    bestScore,
    totalKills,
    totalWaves,
    totalBlocks,
    runs,
    levelOf,
    isUnlocked,
    canBuy,
    costOf,
    buyTech,
    affordableCount,
    availableBlocks,
    recordRunEnd,
    recordRunStart,
    TECH_NODES
  }
}

export { tech, bestWave, bestHeight, bestBlocks, bestScore, totalKills, totalWaves, totalBlocks, runs }
