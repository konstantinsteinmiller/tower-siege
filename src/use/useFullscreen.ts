import { ref } from 'vue'

/**
 * ─── Is the game running fullscreen? ────────────────────────────────────────
 *
 * Needed because the CrazyGames chrome owns the mute control while the game is
 * embedded — CG QA rejects a second, competing in-game mute toggle — but that
 * chrome is GONE the moment the player goes fullscreen, and a fullscreen game
 * with no way to silence it is worse than a duplicate button.
 *
 * Two detectors, because neither is sufficient on its own:
 *
 *   • `document.fullscreenElement`, for the case where the game's own document
 *     requested fullscreen. Exact, and preferred whenever it is available.
 *   • A viewport-growth test, for the case that actually happens on a portal:
 *     the PARENT page fullscreens the iframe we live in. From inside a
 *     cross-origin frame `fullscreenElement` stays null, and the only thing we
 *     can observe is our viewport suddenly filling the display.
 *
 * The second one is deliberately conservative, because the two ways it can be
 * wrong are not equally expensive. Reporting fullscreen when we are not shows a
 * second mute button next to the platform's — the exact thing QA rejects.
 * Reporting windowed when we are not costs a fullscreen player one control they
 * can recover by leaving fullscreen. So it demands a TRANSITION: the viewport
 * must both fill the screen AND have grown to get there. Sizes alone are not
 * enough, because a maximised window on a laptop, a page at 80 % zoom, or a
 * remote-debugging viewport override can all match the screen while plainly not
 * being fullscreen — and every one of those would have shipped the duplicate.
 */

/** How far short of the screen the viewport may fall and still count, in CSS px. */
const SLACK_PX = 6
/** How much the viewport must have GROWN for this to read as entering
 *  fullscreen rather than as an already-large window. */
const GROWTH_PX = 40

export const isFullscreen = ref(false)

/**
 * The largest viewport seen while NOT fullscreen.
 *
 * Re-baselined on every windowed measurement, so leaving and re-entering
 * fullscreen is detected as many times as the player does it.
 */
let baseW = 0
let baseH = 0

const measure = (): boolean => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  if (document.fullscreenElement) return true

  const screenW = window.screen?.width ?? 0
  const screenH = window.screen?.height ?? 0
  const w = window.innerWidth
  const h = window.innerHeight
  if (screenW <= 0 || screenH <= 0) return false

  const fillsScreen = w >= screenW - SLACK_PX && h >= screenH - SLACK_PX
  const grew = w > baseW + GROWTH_PX || h > baseH + GROWTH_PX
  if (fillsScreen && grew) return true

  // Windowed: this is the size fullscreen will have to beat.
  baseW = w
  baseH = h
  return false
}

let installed = false

/**
 * Start tracking. Idempotent, and safe to call from several places — the flag
 * is a module singleton, so whoever gets there first wires the listeners.
 */
export const installFullscreenWatch = (): void => {
  if (installed || typeof window === 'undefined') return
  installed = true
  baseW = window.innerWidth
  baseH = window.innerHeight
  const sync = (): void => { isFullscreen.value = measure() }
  sync()
  document.addEventListener('fullscreenchange', sync)
  // A parent-driven iframe fullscreen arrives as a plain resize, so this is the
  // listener that does the real work on a portal.
  window.addEventListener('resize', sync)
  window.addEventListener('orientationchange', () => setTimeout(sync, 250))
}

/** Test-only: forget the installed listeners and the size baseline. */
export const __resetFullscreenWatch = (): void => {
  installed = false
  baseW = 0
  baseH = 0
  isFullscreen.value = false
}
