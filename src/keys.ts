// ─── Game-state field catalogue ─────────────────────────────────────────────
//
// Field names INSIDE the single `tower_state` blob (see `useTowerState.ts`).
// These are NOT separate localStorage keys — they are properties of the one
// persisted object — but they are still a contract with the player base:
// renaming any of them strands existing players' progress on the old field.
// Treat them as load-bearing constants.
//
// Everything is `ts_`-prefixed so `SaveMergePolicy.isPayloadKey` can allowlist
// the whole surface with a single prefix.

// ─── Meta progression ───────────────────────────────────────────────────────

/** Meta currency, banked at run end and spent in the tech tree. */
export const COINS_KEY = 'ts_coins'
/** Tech-tree node levels: `{ levels: Record<nodeId, number> }`. */
export const TECH_KEY = 'ts_tech'
/** Highest wave the player has ever survived (the headline progress number). */
export const BEST_WAVE_KEY = 'ts_best_wave'
/** Tallest tower ever built, in rows. */
export const BEST_HEIGHT_KEY = 'ts_best_height'
/** Most blocks ever standing in one tower. */
export const BEST_BLOCKS_KEY = 'ts_best_blocks'
/** Lifetime enemies killed. */
export const TOTAL_KILLS_KEY = 'ts_total_kills'
/** Lifetime waves cleared (across all runs). */
export const TOTAL_WAVES_KEY = 'ts_total_waves'
/** Lifetime runs started. */
export const RUNS_KEY = 'ts_runs'
/** Lifetime blocks placed. */
export const TOTAL_BLOCKS_KEY = 'ts_total_blocks'
/** Lifetime coins earned (achievement metric, never decremented by spending). */
export const TOTAL_COINS_KEY = 'ts_total_coins'
/** Best leaderboard score ever posted: kills in one run, bosses worth five. */
export const BEST_SCORE_KEY = 'ts_best_score'
/**
 * Display name submitted with a leaderboard score.
 *
 * Three slots, deliberately separate, because they have different lifetimes and
 * a strict precedence: a name the player CHOSE outranks one a portal SDK
 * supplies, which outranks the generated fallback. Collapsing them into one
 * field means an SDK name can never take over from the generated one — the
 * first thing written wins forever.
 */
/** Chosen by the player. Highest precedence, never overwritten by us. */
export const PLAYER_NAME_KEY = 'ts_player_name'
/** Last display name a portal SDK gave us; remembered so a momentary SDK
 *  outage doesn't drop the player back to their anonymous name. */
export const SDK_NAME_KEY = 'ts_sdk_name'
/** Generated once for players with no account and no SDK: "Anonymous123456". */
export const ANON_NAME_KEY = 'ts_anon_name'
/** The name the leaderboard row currently shows, so a better one can be sent
 *  up when it finally resolves. */
export const POSTED_NAME_KEY = 'ts_posted_name'
/** Stable anonymous id for this save, used as the leaderboard row key. */
export const PLAYER_ID_KEY = 'ts_player_id'
/** Highest score this device has successfully posted to the board. Lets a best
 *  raised by a cloud hydrate reach the board without re-posting every run. */
export const SUBMITTED_SCORE_KEY = 'ts_submitted_score'

// ─── The resumable run ──────────────────────────────────────────────────────

/**
 * Snapshot of the in-progress siege, written at every build-phase entry:
 * `{ wave, wood, stone, runCoins, kills, killsByType, blocks: [[c,r,type,hp]] }`.
 * A reload (or a cross-device cloud hydrate) resumes the exact tower instead of
 * dumping the player back to a fresh foundation.
 */
export const RUN_KEY = 'ts_run'

// ─── Retention systems ──────────────────────────────────────────────────────

/** Daily missions: `{ day: 'YYYY-MM-DD', missions: Mission[] }` (regen per day). */
export const MISSIONS_KEY = 'ts_missions'
/** Achievements: `{ claimed: string[], stats: {...} }`. */
export const ACHIEVEMENTS_KEY = 'ts_achievements'
/** First-run-of-day 2× bonus bookkeeping: the local day it was last consumed. */
export const DAILY_BONUS_DAY_KEY = 'ts_daily_bonus_day'
/** Battle pass: `{ xp, claimed: number[], seasonStart }`. */
export const BATTLE_PASS_KEY = 'ts_battle_pass'
/** Daily login rewards: `{ streak, lastClaimDay }`. */
export const DAILY_REWARDS_KEY = 'ts_daily_rewards'
/** Idle treasure chest: `{ readyAt }`. */
export const CHEST_KEY = 'ts_chest'
/** Rewarded-ad button cooldown timestamp. */
export const AD_COOLDOWN_KEY = 'ts_ad_cooldown'

// ─── Onboarding / one-shot UI nudges ────────────────────────────────────────

/** First-run onboarding consumed flag (true once the first run finishes). */
export const ONBOARDED_KEY = 'ts_onboarded'
/** First-stage tutorial seen. Separate from ONBOARDED so the coach marks and
 *  the control hints can retire independently. */
export const TUTORIAL_KEY = 'ts_tutorial'
/** One-time "you can afford a tech node" spotlight on the Tech button. */
export const TECH_SPOTLIGHT_KEY = 'ts_tech_spotlight_seen'
/** Which control hints the player has already followed (bitmask-ish string[]). */
export const HINTS_SEEN_KEY = 'ts_hints_seen'

// ─── User settings ──────────────────────────────────────────────────────────

export const SOUND_KEY = 'ts_user_sound_volume'
export const MUSIC_KEY = 'ts_user_music_volume'
export const LANGUAGE_KEY = 'ts_user_language'
export const DIFFICULTY_KEY = 'ts_user_difficulty'
export const MUSIC_TRACK_KEY = 'ts_user_music_track'
/** Mobile-only hard audio mute (boolean). On phones the OS volume rocker owns
 *  the device level and the Web Audio gain has no effect, so the on-screen mute
 *  is a silence toggle instead: suspend all audio + block new music/SFX. */
export const MOBILE_MUTE_KEY = 'ts_mobile_mute'
