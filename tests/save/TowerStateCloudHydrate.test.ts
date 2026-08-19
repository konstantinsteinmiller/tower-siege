import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// ─── Cloud → composable hydrate (the "fresh user" regression) ───────────────
//
// THE BUG THIS FILE EXISTS TO PREVENT:
//   A returning player reloads. The platform SDK's cloud read is async. The
//   Vue module graph evaluates first, every composable reads an empty blob and
//   initialises to defaults, and the player is rendered as a brand-new install:
//   wave 0, no coins, no tech. The next write then commits those defaults over
//   the real cloud save and the loss becomes permanent.
//
// The whole game state lives in ONE `tower_state` blob (an allowlisted payload
// key), so the strategy mirrors it verbatim. `reloadTowerState()` is wired into
// the `saveDataVersion` bump inside `useSaveStatus` — and the ORDER matters:
// the blob must be re-read BEFORE the bump, or every `watch(saveDataVersion)`
// consumer re-reads the stale pre-hydrate snapshot and the bug survives.

const MANIFEST_KEY = '__save_internal__crazy_keys'
const STATE_KEY = 'tower_state'

const makeFakeData = (seed: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(seed))
  return {
    store,
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    removeItem: vi.fn(async (key: string) => { store.delete(key) })
  }
}

const flush = async (): Promise<void> => { await nextTick(); await nextTick() }

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

/** A cloud snapshot for a player who is deep into the game, plus the meta blob
 *  the merge resolver needs in order to pick remote over an empty local. */
const seededCloud = async () => {
  const { META_KEY } = await import('@/utils/save/SaveMergePolicy')
  const cloudBlob = {
    ts_coins: 1250,
    ts_best_wave: 14,
    ts_runs: 9,
    ts_total_kills: 4200,
    ts_total_waves: 61,
    ts_best_height: 12,
    ts_tech: { levels: { foundations: 1, sharpBolts: 3, unlockBrace: 1, lumberStock: 2 } },
    ts_user_sound_volume: 0.4,
    ts_user_language: 'es',
    ts_battle_pass: { xp: 40, unlockedStages: 3, claimedStages: [1, 2], seasonStartedAt: null },
    ts_run: {
      wave: 14, wood: 310, stone: 180, runCoins: 96, kills: 220, killsByType: { grunt: 180, brute: 40 },
      blocks: [[0, 0, 'gate', 300], [1, 0, 'stone', 170], [1, 1, 'cannon', 60]],
      offers: ['w2h', 'cannon1', 'wO', 'spikes1'],
      startedAt: 1_700_000_000_000
    }
  }
  const meta = {
    savedAt: '2026-05-19T00:00:00.000Z',
    // bestWave 14 × 500 + 7 tech levels × 150 + 9 runs × 10
    progressScore: 14 * 500 + 7 * 150 + 9 * 10,
    schemaVersion: 1,
    maxStage: 14
  }
  return makeFakeData({
    [MANIFEST_KEY]: JSON.stringify([STATE_KEY, META_KEY]),
    [STATE_KEY]: JSON.stringify(cloudBlob),
    [META_KEY]: JSON.stringify(meta)
  })
}

/** Boot the CrazyGames cloud-only configuration: gameplay state lives in memory
 *  only and `sdk.data` is the sole persistence backend. */
const bootCloudOnly = async (data: ReturnType<typeof makeFakeData>) => {
  const { SaveManager } = await import('@/utils/save/SaveManager')
  const { CrazyGamesStrategy } = await import('@/utils/save/CrazyGamesStrategy')
  const { installSaveStatus } = await import('@/use/useSaveStatus')
  const manager = new SaveManager(
    new CrazyGamesStrategy(() => data),
    window.localStorage,
    { blob: { persistToRaw: false } }
  )
  installSaveStatus(manager)
  await manager.init()
  await flush()
  return manager
}

describe('tower_state cloud hydrate → composable refresh', () => {
  it('hydrates the blob into localStorage before the app graph reads it', async () => {
    const data = await seededCloud()
    await bootCloudOnly(data)

    const blob = JSON.parse(window.localStorage.getItem(STATE_KEY) || '{}')
    expect(blob.ts_best_wave).toBe(14)
    expect(blob.ts_coins).toBe(1250)
  })

  it('refreshes the economy composable — the player is NOT a fresh user', async () => {
    const data = await seededCloud()
    await bootCloudOnly(data)

    const { default: useTowerEconomy } = await import('@/use/useTowerEconomy')
    expect(useTowerEconomy().coins.value).toBe(1250)
  })

  it('refreshes tech levels and every lifetime counter', async () => {
    const data = await seededCloud()
    await bootCloudOnly(data)

    const { default: useTowerProgress } = await import('@/use/useTowerProgress')
    const p = useTowerProgress()
    expect(p.bestWave.value).toBe(14)
    expect(p.runs.value).toBe(9)
    expect(p.totalKills.value).toBe(4200)
    expect(p.levelOf('sharpBolts')).toBe(3)
    // A tech-gated block must be unlocked by the hydrated levels, or the
    // player's purchased content silently disappears on every reload.
    expect(p.availableBlocks.value.has('brace')).toBe(true)
  })

  it('refreshes user settings so the player keeps their language and volume', async () => {
    const data = await seededCloud()
    await bootCloudOnly(data)

    const { default: useUser } = await import('@/use/useUser')
    const u = useUser()
    expect(u.userLanguage.value).toBe('es')
    expect(u.userSoundVolume.value).toBe(0.4)
  })

  it('restores the in-progress siege rather than starting an empty tower', async () => {
    const data = await seededCloud()
    await bootCloudOnly(data)

    const game = await import('@/use/useTowerGame')
    expect(game.hasSavedRun()).toBe(true)
    expect(game.resumeRun()).toBe(true)
    expect(game.wave.value).toBe(14)
    expect(game.wood.value).toBe(310)
    expect(game.getBlocks().size).toBe(3)
    expect(game.getBlocks().get('1,1')?.typeId).toBe('cannon')
  })

  it('restores the exact hand of build shapes', async () => {
    // A reload must not reroll the offers — otherwise refreshing becomes a way
    // to fish for a better hand.
    const data = await seededCloud()
    await bootCloudOnly(data)

    const game = await import('@/use/useTowerGame')
    const { OFFER_SLOTS } = await import('@/game/shapes')
    expect(game.resumeRun()).toBe(true)
    // The saved hand is honoured exactly; slots the snapshot predates (the
    // support slot) are topped up with a fresh roll rather than rerolling the
    // whole hand, which would make a reload a way to fish for a better one.
    expect(game.offers.value.slice(0, 4)).toEqual(['w2h', 'cannon1', 'wO', 'spikes1'])
    expect(game.offers.value).toHaveLength(OFFER_SLOTS)
  })

  it('keeps nothing but the two blobs in raw localStorage on a cloud-only build', async () => {
    const data = await seededCloud()
    await bootCloudOnly(data)

    // Cloud-only mode: gameplay state is in-memory; the proxy serves reads.
    // Nothing must leak into the raw store.
    const raw: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) raw.push(k)
    }
    expect(raw.filter((k) => k.startsWith('ts_'))).toEqual([])
  })
})

describe('hydrate failure modes', () => {
  it('does NOT overwrite a real cloud save when the local snapshot is empty', async () => {
    const data = await seededCloud()
    const manager = await bootCloudOnly(data)

    // A trivial post-boot write must not clobber the hydrated fields.
    const { setState } = await import('@/use/useTowerState')
    const { flushSaveNow } = await import('@/use/useSaveStatus')
    setState('ts_onboarded', true)
    await flushSaveNow()
    await manager.flush()

    const cloudBlob = JSON.parse(data.store.get(STATE_KEY) || '{}')
    expect(cloudBlob.ts_best_wave).toBe(14)
    expect(cloudBlob.ts_coins).toBe(1250)
    expect(cloudBlob.ts_onboarded).toBe(true)
  })

  it('retries a transient SDK failure before letting a returning player boot fresh', async () => {
    vi.useFakeTimers()
    try {
      const data = await seededCloud()
      const snapshot = new Map(data.store)
      let calls = 0
      data.getItem.mockImplementation(async (key: string) => {
        calls++
        // Fail the very first manifest read — the transient-blip failure mode.
        if (key === MANIFEST_KEY && calls === 1) throw new Error('transient SDK error')
        return snapshot.get(key) ?? null
      })

      const { SaveManager } = await import('@/utils/save/SaveManager')
      const { CrazyGamesStrategy } = await import('@/utils/save/CrazyGamesStrategy')
      const manager = new SaveManager(
        new CrazyGamesStrategy(() => data),
        window.localStorage,
        { blob: { persistToRaw: false } }
      )
      const init = manager.init()
      await vi.advanceTimersByTimeAsync(1_500)
      await init

      expect(manager.hydrateState).toBe('success-with-data')
      const blob = JSON.parse(window.localStorage.getItem(STATE_KEY) || '{}')
      expect(blob.ts_best_wave).toBe(14)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('treats a genuinely empty cloud as a real fresh install', async () => {
    const data = makeFakeData()
    await bootCloudOnly(data)

    const { default: useTowerProgress } = await import('@/use/useTowerProgress')
    const { default: useTowerEconomy } = await import('@/use/useTowerEconomy')
    expect(useTowerProgress().bestWave.value).toBe(0)
    expect(useTowerEconomy().coins.value).toBe(0)

    const game = await import('@/use/useTowerGame')
    expect(game.hasSavedRun()).toBe(false)
  })

  it('survives a corrupt cloud blob without wiping the player', async () => {
    const { META_KEY } = await import('@/utils/save/SaveMergePolicy')
    const data = makeFakeData({
      [MANIFEST_KEY]: JSON.stringify([STATE_KEY, META_KEY]),
      [STATE_KEY]: '{not json at all',
      [META_KEY]: JSON.stringify({
        savedAt: '2026-05-19T00:00:00.000Z',
        progressScore: 5000, schemaVersion: 1, maxStage: 10
      })
    })
    // A corrupt blob must degrade to defaults, not throw during boot.
    await expect(bootCloudOnly(data)).resolves.toBeDefined()
    const { default: useTowerEconomy } = await import('@/use/useTowerEconomy')
    expect(useTowerEconomy().coins.value).toBe(0)
  })
})

describe('reload round-trip', () => {
  it('a wave cleared before the reload is still there after it', async () => {
    // ── Session 1: play, then flush at the checkpoint. ──
    const data = makeFakeData()
    const m1 = await bootCloudOnly(data)
    const { default: useTowerProgress } = await import('@/use/useTowerProgress')
    const { default: useTowerEconomy } = await import('@/use/useTowerEconomy')

    useTowerEconomy().addCoins(640)
    useTowerProgress().recordRunEnd({
      wave: 11, kills: 300, wavesCleared: 11, height: 8, blocks: 24, blocksPlaced: 24
    })
    await m1.flush()

    // ── Session 2: a cold boot against the same cloud store. ──
    vi.resetModules()
    localStorage.clear()
    const data2 = makeFakeData(Object.fromEntries(data.store))
    await bootCloudOnly(data2)

    const { default: progress2 } = await import('@/use/useTowerProgress')
    const { default: economy2 } = await import('@/use/useTowerEconomy')
    expect(progress2().bestWave.value).toBe(11)
    expect(progress2().totalKills.value).toBe(300)
    expect(economy2().coins.value).toBe(640)
  })
})
