import { isPlaygama } from '@/use/useUser'

/**
 * ─── The portal's own leaderboard ───────────────────────────────────────────
 *
 * Playgama Bridge exposes `bridge.leaderboard`, which forwards to whatever
 * board the underlying platform actually has. Where it works it is strictly
 * better than our own table — the portal knows who the player is, shows the
 * board in its own UI, and it costs us no quota — so on Playgama builds the
 * best score goes to BOTH: the portal board and the Worker.
 *
 * Everything here is feature-detected rather than assumed, because bridge
 * support varies per underlying platform and some of them require the board to
 * be created in a developer console first. That is the case this module is
 * built to survive: if the capability flags say no, or the call throws because
 * no such board exists, we skip silently and the Worker board — which needs no
 * portal cooperation at all — carries on being the one the death screen reads.
 *
 * Deliberately NOT done here:
 *
 *   * **No `authorizePlayer()`.** Several platforms only accept a score from a
 *     signed-in player, and the bridge can prompt for that — but a login dialog
 *     thrown in the player's face on the defeat screen is a far worse trade
 *     than a missing row on a board they never asked about.
 *   * **No reading back.** The rank on the death screen comes from the Worker,
 *     which answers the same way on every platform. Two rank sources that
 *     disagree is a worse screen than one that is merely ours.
 */

/**
 * Board name, for the platforms that keep more than one.
 *
 * Overridable because a console-created board has whatever name the console
 * gave it, and that is not knowable from here. Set
 * `VITE_PLAYGAMA_LEADERBOARD_NAME` to match if you ever create one.
 */
const BOARD_NAME = import.meta.env.VITE_PLAYGAMA_LEADERBOARD_NAME || 'score'

export type NativeSubmitResult = 'sent' | 'unsupported' | 'failed'

/** Last outcome, so a dev build can see what the portal did with the score. */
export const lastNativeResult = { value: 'unsupported' as NativeSubmitResult }

/**
 * Mirror a score into the portal's board. Never throws, never blocks anything.
 *
 * Returns what happened, mostly so tests and the console can tell "the platform
 * does not do this" apart from "the platform does this and it broke".
 */
export const submitNativeScore = async (score: number): Promise<NativeSubmitResult> => {
  const done = (r: NativeSubmitResult): NativeSubmitResult => {
    lastNativeResult.value = r
    return r
  }

  // `isPlaygama` is inlined from `import.meta.env` at build time, so for every
  // other platform this whole module tree-shakes out of the bundle.
  if (!isPlaygama || !Number.isFinite(score) || score <= 0) return done('unsupported')

  try {
    const { getPlaygamaBridge } = await import('@/utils/playgamaPlugin')
    const board = getPlaygamaBridge()?.leaderboard
    if (!board || typeof board.setScore !== 'function') return done('unsupported')

    // The flags are tri-state in practice: `true`, `false`, or absent on an
    // older bridge. Only an explicit `false` is a refusal — treating "absent"
    // as unsupported would skip platforms that do support it.
    if (board.isSupported === false) return done('unsupported')
    if (board.isSetScoreSupported === false) return done('unsupported')

    const params: Record<string, unknown> = { score }
    // Only platforms with more than one board want a name; passing one to a
    // platform that keeps a single board is how you get an "unknown
    // leaderboard" rejection.
    if (board.isMultipleBoardsSupported === true) params.leaderboardName = BOARD_NAME

    await board.setScore(params)
    return done('sent')
  } catch (e) {
    // A board that was never created in the portal console lands here. Nothing
    // to do about it from inside the game, and nothing worth breaking a run
    // over — the Worker board already has the score.
    console.info('[playgama] leaderboard.setScore skipped', e)
    return done('failed')
  }
}
