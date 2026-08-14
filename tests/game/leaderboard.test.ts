import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Leaderboard ────────────────────────────────────────────────────────────
//
// Two rules carry the whole design, and both are invisible from the screen:
// what a score IS, and how rarely the client is allowed to talk to the server.
// A regression in either is silent — the game plays identically while the free
// tier drains or the board fills with wrong numbers — so they are pinned here.

/**
 * Fresh module graph with the endpoint configured.
 *
 * `alreadyPosted` seeds the high-water mark the client persists — the value it
 * compares a best against to decide whether the server has anything to learn.
 * Seeded BEFORE the import, because the state layer reads the blob once at
 * module load.
 */
const loadBoard = async (state: Record<string, unknown> = {}) => {
  vi.resetModules()
  localStorage.clear()
  vi.stubEnv('VITE_LEADERBOARD_URL', 'https://board.test')
  vi.stubEnv('VITE_LEADERBOARD_SECRET', '')
  const mod = await import('@/use/useLeaderboard')
  // Seeded through the in-memory ref rather than through localStorage, and
  // AFTER the import. `await import()` yields, so a debounced persist left
  // pending by an earlier test's module graph can fire in between and hand the
  // fresh graph a stale blob — which made this file flaky in a full run.
  const { towerState } = await import('@/use/useTowerState')
  towerState.value = { ...state }
  return mod
}

/** The common case: a device that has already posted this score. */
const posted = (score: number) => ({ ts_submitted_score: score })

const boardPayload = {
  updatedAt: 1,
  total: 500,
  entries: [
    { rank: 1, name: 'A', score: 900, wave: 30 },
    { rank: 2, name: 'B', score: 500, wave: 20 },
    { rank: 3, name: 'C', score: 100, wave: 9 }
  ]
}

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('run score', () => {
  it('counts one point per kill and five for a boss', async () => {
    vi.resetModules()
    localStorage.clear()
    const game = await import('@/use/useTowerGame')
    game.killsByType.value = { grunt: 3, runner: 2 }
    expect(game.runScore.value).toBe(5)

    // `golem` is the only `boss: true` type in the catalogue.
    game.killsByType.value = { grunt: 3, golem: 2 }
    expect(game.runScore.value).toBe(3 + 2 * game.BOSS_SCORE)
  })

  it('survives a resumed run, because it is derived from the kill tally', async () => {
    vi.resetModules()
    localStorage.clear()
    const game = await import('@/use/useTowerGame')
    game.startRun()
    expect(game.runScore.value).toBe(0)
    // The tally is what the run snapshot persists; the score rides along with
    // it rather than needing a field of its own.
    game.killsByType.value = { grunt: 7, golem: 1 }
    expect(game.runScore.value).toBe(7 + game.BOSS_SCORE)
  })
})

describe('quota discipline', () => {
  it('does NOT write when the best is already on the board', async () => {
    const board = await loadBoard(posted(500))
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(boardPayload), {
      status: 200, headers: { 'content-type': 'application/json' }
    }))
    vi.stubGlobal('fetch', fetchMock)

    await board.reportRun(120, 10)

    // One GET for the table, and no POST at all.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined]
    expect(url).toContain('/top')
    expect(init?.method ?? 'GET').toBe('GET')
  })

  it('does not re-fetch the table once it is cached', async () => {
    const board = await loadBoard(posted(500))
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(boardPayload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await board.reportRun(120, 10)
    await board.reportRun(80, 8)
    await board.reportRun(40, 4)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('posts exactly once when the best improves, and takes the rank from the reply', async () => {
    const board = await loadBoard(posted(120))
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ rank: 42, best: 700, total: 501, board: boardPayload }), { status: 200 }
    ))
    vi.stubGlobal('fetch', fetchMock)

    await board.reportRun(700, 25)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/score')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({ score: 700, wave: 25 })
    expect(board.playerRank.value).toBe(42)
    expect(board.playerTotal.value).toBe(501)
  })
})

describe('player identity', () => {
  it('keeps one row per player: the same id every time', async () => {
    const board = await loadBoard()
    const posts: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init?.body) posts.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ rank: 1, best: 1, total: 1, board: boardPayload }), { status: 200 })
    }))

    await board.reportRun(100, 5)
    await board.reportRun(300, 12)
    await board.reportRun(900, 30)

    expect(posts).toHaveLength(3)
    // Three records, three writes, ONE row — every submission carries the same
    // id. A drifting id is what fills the table with copies of one player.
    expect(new Set(posts.map((p) => p.id)).size).toBe(1)
  })

  it('survives the save blob being replaced under it', async () => {
    const board = await loadBoard()
    const posts: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init?.body) posts.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ rank: 1, best: 1, total: 1, board: boardPayload }), { status: 200 })
    }))
    await board.reportRun(100, 5)

    // A cloud hydrate lands an older blob with no id in it — the exact case
    // that used to mint a second identity and a second row.
    const { towerState } = await import('@/use/useTowerState')
    towerState.value = { ts_coins: 40 }

    await board.reportRun(700, 25)

    expect(posts).toHaveLength(2)
    expect(posts[1].id).toBe(posts[0].id)
  })

  it('never posts the placeholder name', async () => {
    const board = await loadBoard()
    const posts: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init?.body) posts.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ rank: 1, best: 1, total: 1, board: boardPayload }), { status: 200 })
    }))

    await board.reportRun(100, 5)

    // A board of "Anon" tells a player nothing, not even which row is theirs.
    expect(posts[0].name).not.toBe('Anon')
    expect(String(posts[0].name).length).toBeGreaterThan(0)
  })

  it('prefers a name the player set over the derived one', async () => {
    const board = await loadBoard()
    const identity = await import('@/use/usePlayerIdentity')
    identity.setPlayerName('Konstantin')
    const posts: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init?.body) posts.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ rank: 1, best: 1, total: 1, board: boardPayload }), { status: 200 })
    }))

    await board.reportRun(100, 5)
    expect(posts[0].name).toBe('Konstantin')
  })
})

describe('anonymous usernames', () => {
  /** The identity module on a build with no SDK of any kind. */
  const loadIdentity = async () => {
    vi.resetModules()
    localStorage.clear()
    vi.stubEnv('VITE_APP_CRAZY_WEB', 'false')
    vi.stubEnv('VITE_APP_PLAYGAMA', 'false')
    vi.stubEnv('VITE_APP_YANDEX', 'false')
    return import('@/use/usePlayerIdentity')
  }

  const ANON = /^(Anonymous|Warden|Bastion|Rampart|Sentinel|Bulwark|Keeper|Vanguard|Watcher|Mason)\d{6}$/

  it('generates a word plus six digits', async () => {
    const identity = await loadIdentity()
    const who = await identity.resolveIdentity()
    expect(who.name).toMatch(ANON)
    expect(who.name.length).toBeLessThanOrEqual(16)
  })

  it('caches it — the same player keeps the same name', async () => {
    const identity = await loadIdentity()
    const first = (await identity.resolveIdentity()).name
    const second = (await identity.resolveIdentity()).name
    const third = (await identity.resolveIdentity()).name
    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  it('keeps the name when the save blob is replaced under it', async () => {
    const identity = await loadIdentity()
    const before = (await identity.resolveIdentity()).name

    // A cloud hydrate lands a blob that predates the name.
    const { towerState } = await import('@/use/useTowerState')
    towerState.value = { ts_coins: 12 }

    expect((await identity.resolveIdentity()).name).toBe(before)
  })

  it('gives two players different names', async () => {
    const names = new Set<string>()
    for (let i = 0; i < 8; i++) {
      const identity = await loadIdentity()
      names.add((await identity.resolveIdentity()).name)
    }
    // Not a uniqueness guarantee — the board keys on id, not name — but a
    // generator that produced one value would be a broken generator.
    expect(names.size).toBeGreaterThan(1)
  })

  it('lets a chosen name win, and survives being cleared again', async () => {
    const identity = await loadIdentity()
    const generated = (await identity.resolveIdentity()).name

    identity.setPlayerName('Konstantin')
    expect((await identity.resolveIdentity()).name).toBe('Konstantin')

    // Clearing it falls back to the SAME generated name, not a new one.
    identity.setPlayerName('')
    expect((await identity.resolveIdentity()).name).toBe(generated)
  })

  it('refuses a name that is only invisible characters', async () => {
    const identity = await loadIdentity()
    const generated = (await identity.resolveIdentity()).name
    // Zero-width spaces and a bidi override: a row label that renders as
    // nothing, or scrambles the row beside it.
    identity.setPlayerName('​​‮')
    expect((await identity.resolveIdentity()).name).toBe(generated)
  })

  it('caps an over-long chosen name at what a board cell holds', async () => {
    const identity = await loadIdentity()
    identity.setPlayerName('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    expect((await identity.resolveIdentity()).name).toBe('ABCDEFGHIJKLMNOP')
  })
})

describe('SDK names take over', () => {
  const loadWithCrazyName = async (name: string | null) => {
    vi.resetModules()
    vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
    vi.stubEnv('VITE_APP_PLAYGAMA', 'false')
    vi.stubEnv('VITE_APP_YANDEX', 'false')
    vi.doMock('@/use/useCrazyGames', () => ({ crazyPlayerName: { value: name } }))
    return import('@/use/usePlayerIdentity')
  }

  it('overwrites the generated name once the SDK answers', async () => {
    localStorage.clear()
    const anon = await loadWithCrazyName(null)
    const generated = (await anon.resolveIdentity()).name
    expect(generated).toMatch(/\d{6}$/)

    // Same storage, but the SDK now has a username — the late-resolve case.
    const withName = await loadWithCrazyName('RealPlayer')
    expect((await withName.resolveIdentity()).name).toBe('RealPlayer')
  })

  it('does not fall back to the anonymous name when the SDK goes quiet', async () => {
    localStorage.clear()
    const online = await loadWithCrazyName('RealPlayer')
    await online.resolveIdentity()

    // Offline, signed out, or `getUser()` simply slower this time.
    const offline = await loadWithCrazyName(null)
    // Flipping back would rename the player's board row on the next submission.
    expect((await offline.resolveIdentity()).name).toBe('RealPlayer')
  })

  it('ignores an SDK name that sanitises to nothing', async () => {
    localStorage.clear()
    const identity = await loadWithCrazyName('   ')
    expect((await identity.resolveIdentity()).name).toMatch(/\d{6}$/)
  })

  it('still lets the player override the SDK name', async () => {
    localStorage.clear()
    const identity = await loadWithCrazyName('RealPlayer')
    identity.setPlayerName('Konstantin')
    expect((await identity.resolveIdentity()).name).toBe('Konstantin')
  })
})

describe('best score, not this run', () => {
  it('posts a best raised elsewhere, even though this run was no record', async () => {
    // The device last posted 100; a cloud save has since brought a best of 400
    // from another device. Without this, that best never reaches the board.
    const board = await loadBoard(posted(100))
    const posts: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init?.body) posts.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ rank: 7, best: 400, total: 90, board: boardPayload }), { status: 200 })
    }))

    await board.reportRun(400, 18)

    expect(posts).toHaveLength(1)
    expect(posts[0].score).toBe(400)
  })

  it('sends a better name up even when the score has not moved', async () => {
    // A previous session posted 500 under the generated name; since then the
    // portal SDK has resolved a real username.
    const board = await loadBoard({
      ts_submitted_score: 500,
      ts_posted_name: 'Anonymous123456',
      ts_sdk_name: 'RealPlayer'
    })

    const posts: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init?.body) posts.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ rank: 4, best: 500, total: 90, board: boardPayload }), { status: 200 })
    }))

    await board.reportRun(500, 20)

    // One write, same score, new label — otherwise the row keeps the generated
    // name until the player beats their own record, which might be never.
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ score: 500, name: 'RealPlayer' })
  })

  it('remembers what it posted, so the next run stays quiet', async () => {
    const board = await loadBoard()
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ rank: 3, best: 500, total: 90, board: boardPayload }), { status: 200 }
    ))
    vi.stubGlobal('fetch', fetchMock)

    await board.reportRun(500, 20)   // improves → POST
    await board.reportRun(500, 21)   // same best → nothing new to say
    await board.reportRun(500, 22)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('the portal\'s own board', () => {
  /** Load the native-board module as a Playgama build, with a fake bridge. */
  const loadNative = async (leaderboard: unknown) => {
    vi.resetModules()
    vi.stubEnv('VITE_APP_PLAYGAMA', 'true')
    vi.doMock('@/utils/playgamaPlugin', () => ({
      getPlaygamaBridge: () => (leaderboard === undefined ? null : { leaderboard })
    }))
    return import('@/use/useNativeLeaderboard')
  }

  it('sends the score when the bridge says it can', async () => {
    const setScore = vi.fn(async () => undefined)
    const native = await loadNative({ isSupported: true, isSetScoreSupported: true, setScore })

    expect(await native.submitNativeScore(412)).toBe('sent')
    expect(setScore).toHaveBeenCalledWith({ score: 412 })
  })

  it('names the board only where more than one exists', async () => {
    const setScore = vi.fn(async () => undefined)
    const native = await loadNative({
      isSupported: true, isSetScoreSupported: true, isMultipleBoardsSupported: true, setScore
    })

    await native.submitNativeScore(412)
    // Passing a name to a single-board platform is how you earn an "unknown
    // leaderboard" rejection, so it is only sent when asked for.
    expect(setScore).toHaveBeenCalledWith({ score: 412, leaderboardName: 'score' })
  })

  it('skips a platform that says it cannot set scores', async () => {
    const setScore = vi.fn()
    const native = await loadNative({ isSupported: true, isSetScoreSupported: false, setScore })

    expect(await native.submitNativeScore(412)).toBe('unsupported')
    expect(setScore).not.toHaveBeenCalled()
  })

  it('treats an older bridge without the flags as capable', async () => {
    // Absent is not the same as `false`: refusing on a missing flag would skip
    // every platform whose bridge predates the capability API.
    const setScore = vi.fn(async () => undefined)
    const native = await loadNative({ setScore })
    expect(await native.submitNativeScore(412)).toBe('sent')
  })

  it('survives a board that was never created in the portal console', async () => {
    const native = await loadNative({
      isSupported: true,
      isSetScoreSupported: true,
      setScore: async () => { throw new Error('leaderboard not found') }
    })
    // The whole reason this is feature-detected AND wrapped: no support ticket,
    // no broken run, and the Worker board still has the score.
    expect(await native.submitNativeScore(412)).toBe('failed')
  })

  it('does nothing at all when the bridge has no leaderboard module', async () => {
    const native = await loadNative(undefined)
    expect(await native.submitNativeScore(412)).toBe('unsupported')
  })

  it('is inert off Playgama', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_APP_PLAYGAMA', 'false')
    const native = await import('@/use/useNativeLeaderboard')
    expect(await native.submitNativeScore(412)).toBe('unsupported')
  })

  it('still tracks improvements on a build with no Worker endpoint', async () => {
    // The portal board is then the only one there is, and it is gated on the
    // same high-water mark — which nothing else would move.
    vi.resetModules()
    localStorage.clear()
    vi.stubEnv('VITE_LEADERBOARD_URL', '')
    const board = await import('@/use/useLeaderboard')

    await board.reportRun(500, 20)

    const stored = JSON.parse(localStorage.getItem('tower_state') ?? '{}')
    expect(stored.ts_submitted_score).toBe(500)
  })
})

describe('rank without asking the server', () => {
  it('derives a rank from the cached table', async () => {
    const board = await loadBoard()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(boardPayload), { status: 200 })))
    await board.ensureBoard()

    // Table is 900 / 500 / 100: only the 900 beats 600, so it lands second.
    expect(board.rankFor(600)).toBe(2)
    // Beats everything.
    expect(board.rankFor(1000)).toBe(1)
    // Ties do not displace the incumbent — 500 sits behind the existing 500.
    expect(board.rankFor(500)).toBe(2)
  })

  it('reports a score below the whole table as outside it, not as unranked', async () => {
    const board = await loadBoard()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(boardPayload), { status: 200 })))
    await board.ensureBoard()
    expect(board.rankFor(10)).toBe(board.OUTSIDE_BOARD)
  })

  it('says nothing at all when there is no table', async () => {
    const board = await loadBoard()
    expect(board.rankFor(500)).toBe(0)
  })

  it('does not reuse a record rank for a later, weaker run', async () => {
    const board = await loadBoard()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ rank: 2, best: 700, total: 500, board: boardPayload }), { status: 200 }
    )))
    // A record run: the server places it 2nd.
    await board.reportRun(700, 25)
    expect(board.rankFor(700)).toBe(2)

    // The next run scores 50. Printing "#2" beside it would attach the standing
    // of the good run to the bad one; 50 is below the whole cached table.
    expect(board.rankFor(50)).toBe(board.OUTSIDE_BOARD)
  })
})

describe('degradation', () => {
  it('stays silent when the endpoint is not configured', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_LEADERBOARD_URL', '')
    const board = await import('@/use/useLeaderboard')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await board.reportRun(700, 25)

    expect(board.leaderboardEnabled).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows a dead endpoint instead of throwing into the defeat screen', async () => {
    const board = await loadBoard()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    await expect(board.reportRun(700, 25)).resolves.toBeUndefined()
    expect(board.leaderboardFailed.value).toBe(true)
    expect(board.rankFor(700)).toBe(0)
  })
})
