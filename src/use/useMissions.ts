import { ref, computed, watch, type Ref } from 'vue'
import { getState, setState, towerState } from '@/use/useTowerState'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { MISSIONS_KEY } from '@/keys'
import useTowerEconomy from '@/use/useTowerEconomy'
import useBattlePass from '@/use/useBattlePass'

// ─── Daily mission triplet ──────────────────────────────────────────────────
//
// Three rotating goals, regenerated each local day, that give a reason to open
// the game daily beyond the login chest. Completing one pays coins + a chunk of
// battle-pass XP. State persists in the single `tower_state` blob under
// `MISSIONS_KEY` as `{ day, missions }`, so it round-trips through cloud save.
//
// PROGRESS IS CREDITED IN DELTAS, and that is the whole design of `recordRun`.
//
// It used to be called exactly once, when the Gate fell, with the run's totals.
// That made the panel a liar: a player forty kills into a siege opened it —
// which is precisely when they would — and saw 0/120, because nothing had
// finished yet. With runs now lasting many minutes, "your dailies update when
// you die" is indistinguishable from "the dailies are broken".
//
// So `recordRun` takes the run's CUMULATIVE totals and credits only what has
// not been credited yet. That makes it idempotent and safe to call as often as
// the caller likes — every wave clear, whenever the panel opens, and at the end
// of the run — without any risk of counting the same kill twice.

export type MissionType = 'coins' | 'waves' | 'kills' | 'blocks'

export interface Mission {
  type: MissionType
  /** Goal value; semantics depend on `type` (see MISSION_DEFS). */
  target: number
  /** Current progress toward `target`. */
  progress: number
  /** Coins granted on claim. */
  reward: number
  claimed: boolean
}

interface MissionState { day: string; missions: Mission[] }

/** One finished siege's contribution to the daily goals. */
export interface MissionRun {
  waves: number
  kills: number
  coins: number
  blocks: number
  height: number
}

/** Per-type config: a few candidate targets (a daily seed picks one) and the
 *  matching coin reward. `waves` is a BEST-SINGLE-RUN goal — "survive to wave
 *  8" should mean one good siege, not eight scrappy ones — while coins, kills
 *  and blocks accumulate across the day. */
const MISSION_DEFS: Record<MissionType, { targets: number[]; reward: number }> = {
  coins: { targets: [120, 200, 300], reward: 60 },
  waves: { targets: [5, 8, 12], reward: 90 },
  kills: { targets: [60, 120, 200], reward: 70 },
  blocks: { targets: [15, 25, 40], reward: 50 }
}
const ALL_TYPES: MissionType[] = ['coins', 'waves', 'kills', 'blocks']

const todayKey = (): string => new Date().toISOString().slice(0, 10)

/** Deterministic 32-bit hash of a string (so a given day yields stable goals). */
const hashStr = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Build the day's three missions deterministically from the date string, so
 *  the same day always shows the same goals (even across reloads / devices). */
const generateMissions = (day: string): Mission[] => {
  const seed = hashStr(day)
  // Pick 3 distinct types: drop one type based on the seed.
  const dropped = ALL_TYPES[seed % ALL_TYPES.length]!
  const types = ALL_TYPES.filter((t) => t !== dropped)
  return types.map((type, i) => {
    const def = MISSION_DEFS[type]
    const target = def.targets[(seed >> (i * 3)) % def.targets.length]!
    return { type, target, progress: 0, reward: def.reward, claimed: false }
  })
}

const loadState = (): MissionState => {
  const v = getState<Partial<MissionState> | null>(MISSIONS_KEY, null)
  const day = todayKey()
  if (!v || v.day !== day || !Array.isArray(v.missions) || v.missions.length === 0) {
    return { day, missions: generateMissions(day) }
  }
  // Sanitize persisted missions against the current defs.
  const missions = v.missions
    .filter((m): m is Mission => !!m && ALL_TYPES.includes(m.type as MissionType))
    .map((m) => ({
      type: m.type,
      target: Number(m.target) > 0 ? Number(m.target) : (MISSION_DEFS[m.type].targets[0] ?? 1),
      progress: Number.isFinite(Number(m.progress)) ? Math.max(0, Number(m.progress)) : 0,
      reward: Number(m.reward) || MISSION_DEFS[m.type].reward,
      claimed: m.claimed === true
    }))
  return { day, missions: missions.length ? missions : generateMissions(day) }
}

const state: Ref<MissionState> = ref(loadState())

/**
 * The run totals already credited to today's missions.
 *
 * Module-level rather than per-composable-call: `useMissions()` is invoked from
 * several components, and a per-instance baseline would let each of them credit
 * the same kills again.
 */
let credited = { coins: 0, kills: 0, blocks: 0 }

/** Re-baseline the delta tracker. Call when a fresh run starts. */
export const beginMissionRun = (): void => {
  credited = { coins: 0, kills: 0, blocks: 0 }
}

const refresh = (): void => {
  const next = loadState()
  // Only replace when the day rolled over or the blob changed identity, so we
  // don't clobber in-memory progress mid-session on unrelated state bumps.
  if (next.day !== state.value.day) state.value = next
}
watch(saveDataVersion, refresh)
watch(towerState, refresh, { deep: false })

const persist = (): void => {
  setState(MISSIONS_KEY, state.value)
  void flushSaveNow()
}

/** Count of completed-but-unclaimed missions — drives the HUD button badge. */
export const claimableMissionCount = computed(
  () => state.value.missions.filter((m) => !m.claimed && m.progress >= m.target).length
)

const useMissions = () => {
  const { addCoins } = useTowerEconomy()
  const { awardXp } = useBattlePass()

  // Roll the day over if needed (e.g. the app was left open past midnight).
  const ensureToday = (): void => {
    if (state.value.day !== todayKey()) state.value = loadState()
  }

  const missions = computed(() => state.value.missions)

  /**
   * Feed the CURRENT run's cumulative totals into the daily missions.
   *
   * Safe to call at any cadence — only the increment since the last call is
   * credited. `waves` is a best-single-run goal and therefore a `max`, which is
   * naturally idempotent already.
   */
  const recordRun = (run: MissionRun): void => {
    ensureToday()
    // Coerce every input to a finite, non-negative number. A stale field
    // (undefined) or a NaN that crept into the persisted blob would otherwise
    // poison `progress` permanently via `+=`, surfacing as "NaN /" in the UI.
    const waves = Math.max(0, Number(run.waves) || 0)
    const coins = Math.max(0, Number(run.coins) || 0)
    const kills = Math.max(0, Number(run.kills) || 0)
    const blocks = Math.max(0, Number(run.blocks) || 0)

    // A counter going backwards means a new run began without anyone telling
    // us — a fresh start, or a resumed snapshot. Re-baseline rather than
    // crediting a negative delta or, worse, silently crediting nothing for the
    // rest of the day.
    if (coins < credited.coins || kills < credited.kills || blocks < credited.blocks) {
      credited = { coins: 0, kills: 0, blocks: 0 }
    }

    const dCoins = coins - credited.coins
    const dKills = kills - credited.kills
    const dBlocks = blocks - credited.blocks
    credited = { coins, kills, blocks }

    let changed = false
    for (const m of state.value.missions) {
      if (m.claimed) continue
      // Self-heal any already-corrupt progress before accumulating.
      const cur = Number.isFinite(m.progress) ? m.progress : 0
      const before = cur
      if (m.type === 'coins') m.progress = cur + dCoins
      else if (m.type === 'kills') m.progress = cur + dKills
      else if (m.type === 'blocks') m.progress = cur + dBlocks
      else if (m.type === 'waves') m.progress = Math.max(cur, waves)
      if (m.progress !== before) changed = true
    }
    if (changed) {
      state.value = { ...state.value } // trigger reactivity
      persist()
    }
  }

  /** Claim a completed mission's reward (coins + battle-pass XP). */
  const claim = (index: number): boolean => {
    ensureToday()
    const m = state.value.missions[index]
    if (!m || m.claimed || m.progress < m.target) return false
    m.claimed = true
    addCoins(m.reward)
    awardXp(20)
    state.value = { ...state.value }
    persist()
    return true
  }

  return { missions, recordRun, claim, claimableMissionCount }
}

export default useMissions
