import { ref } from 'vue'
import { towerBounds, towerVersion } from '@/use/useTowerGame'
import { isMobilePortrait, isMobileLandscape } from '@/use/useUser'
import { SEA_SWIM_Y } from '@/game/world'

/**
 * ─── Camera ─────────────────────────────────────────────────────────────────
 *
 * A spring-damped 2D camera over world space (cells). Two modes:
 *
 *   AUTO  — continuously frames `tower bounds ∪ the ground lane` with padding.
 *           This is the default and is what makes the game playable one-handed:
 *           as the tower grows the view pulls back on its own.
 *   MANUAL — the player dragged or pinched. Auto-fit is suspended until they
 *            stop touching for `IDLE_RETURN_MS`, or tap the recenter button.
 *
 * The transform is `screen = (world - centre) * scale + viewportCentre`, with
 * the Y axis flipped (world +Y is up, screen +Y is down).
 */

// ─── Tunables ───────────────────────────────────────────────────────────────

const MIN_ZOOM = 14   // px per cell — furthest out
const MAX_ZOOM = 120  // px per cell — closest in
/** Extra world padding around the framed content, in cells. */
const PAD_X = 3
const PAD_Y = 2.4
/**
 * How far BELOW the ground line the frame must reach, in cells.
 *
 * Sea creatures cruise at `SEA_SWIM_Y` and are as tall again, so without this
 * the auto-fit — which only ever framed the tower and the ground lane — cut
 * them off entirely and the player's first warning of a sea attack was their
 * base taking damage from something invisible.
 */
const BELOW_GROUND = Math.abs(SEA_SWIM_Y) + 1.1
/**
 * Smallest band auto-fit will ever frame, in cells.
 *
 * These are floors on the FRAMED WORLD, so they are what decides how far out
 * the camera sits while the tower is still small — which is every early wave.
 * Set too high, wave 1 is a three-block fort rendered postage-stamp size in the
 * middle of an empty sky, and the player is asked to aim taps at it.
 */
const MIN_FRAME_HALF_W = 4.5
const MIN_FRAME_TOP = 5
/** Spring stiffness — high enough to feel responsive, low enough to read as
 *  motion rather than a teleport. */
const SPRING = 7.5

// ─── State ──────────────────────────────────────────────────────────────────

/** Where the camera IS (smoothed). */
let x = 0
let y = 4
let zoom = 46
/** Where the camera WANTS to be. */
let tx = 0
let ty = 4
let tzoom = 46

let viewW = 0
let viewH = 0
/** Safe-area / HUD insets in CSS px, so the framed content avoids the chrome. */
let insetTop = 0
let insetBottom = 0

let pinchStartDist = 0
let pinchStartZoom = 0
let lastTowerVersion = -1

/**
 * True once the player has panned or zoomed for themselves.
 *
 * It STAYS true until they tap recenter (or the viewport genuinely changes).
 * It used to expire on a four-second idle timer, which meant a deliberate zoom
 * was undone a moment after the player stopped touching — and in practice much
 * sooner than four seconds, because `setViewport` also cleared it and the HUD
 * re-measures itself once a second. Zooming in was therefore impossible: the
 * view sprang back before the player could do anything with it.
 *
 * Auto-fit is a convenience, not a rule. Once the player has framed the shot
 * themselves, that framing is theirs to keep, and the recenter button — which
 * is on screen for exactly as long as this is true — hands it back.
 */
export const isManual = ref(false)

// ─── Viewport ───────────────────────────────────────────────────────────────

export const setViewport = (w: number, h: number, top = 0, bottom = 0): void => {
  // Called on a 1 s cadence by the scene's HUD-inset re-measure, so what it is
  // allowed to reset matters a great deal.
  //
  // Only a change in the VIEWPORT ITSELF drops the player's manual framing — a
  // resize or a rotation, where the pan and zoom were chosen for a window that
  // no longer exists. Inset changes must not, because they are just the HUD
  // measuring itself: a wrapping wave title, the perk row appearing, a
  // sub-pixel rect. Treating those as viewport changes is what put the manual
  // flag back on a one-second fuse after the idle timer was removed.
  const resized = w !== viewW || h !== viewH
  const insetsMoved = Math.abs(top - insetTop) > 1 || Math.abs(bottom - insetBottom) > 1
  viewW = w
  viewH = h
  insetTop = top
  insetBottom = bottom

  if (resized) {
    isManual.value = false
    lastTowerVersion = -1
    return
  }
  // Chrome grew or shrank. Auto-fit should re-derive against the new free band
  // — but only if the player has not taken the camera for themselves.
  if (insetsMoved && !isManual.value) lastTowerVersion = -1
}

// ─── World ⇄ screen ─────────────────────────────────────────────────────────

export const worldToScreenX = (wx: number): number => (wx - x) * zoom + viewW / 2
export const worldToScreenY = (wy: number): number => viewH / 2 - (wy - y) * zoom
export const screenToWorldX = (sx: number): number => (sx - viewW / 2) / zoom + x
export const screenToWorldY = (sy: number): number => y - (sy - viewH / 2) / zoom
export const getZoom = (): number => zoom
export const getCenter = (): { x: number; y: number } => ({ x, y })

/** Visible world rectangle — the renderer culls against this. */
export const viewRect = (): { l: number; r: number; b: number; t: number } => ({
  l: x - viewW / 2 / zoom,
  r: x + viewW / 2 / zoom,
  b: y - viewH / 2 / zoom,
  t: y + viewH / 2 / zoom
})

/** Nearest grid cell under a screen point — the placement hit-test. */
export const screenToCell = (sx: number, sy: number): { c: number; r: number } => ({
  c: Math.round(screenToWorldX(sx)),
  r: Math.floor(screenToWorldY(sy))
})

// ─── Auto-fit ───────────────────────────────────────────────────────────────

/**
 * Recompute the auto-fit target from the tower's extents.
 *
 * Portrait biases the tower into the UPPER part of the frame because the build
 * tray owns the bottom of the screen; landscape centres it. The vertical span
 * always includes the ground lane so approaching enemies are visible — being
 * surprised by a wave you literally could not see is not difficulty, it's a bug.
 */
const computeAutoTarget = (): void => {
  if (viewW <= 0 || viewH <= 0) return
  const b = towerBounds()

  // Always frame at least this much horizontally so a one-block tower on wave 1
  // isn't rendered at a comical 120 px/cell.
  const halfSpan = Math.max(MIN_FRAME_HALF_W, Math.max(Math.abs(b.minC), Math.abs(b.maxC)) + PAD_X)
  const worldW = halfSpan * 2
  // The framed band runs from the water below the shoreline up past the crown.
  const worldTop = Math.max(MIN_FRAME_TOP, b.maxR + 1 + PAD_Y)
  const worldH = worldTop + BELOW_GROUND

  // The usable viewport excludes the HUD insets.
  const usableH = Math.max(80, viewH - insetTop - insetBottom)
  const fit = Math.min(viewW / worldW, usableH / worldH)
  tzoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit))

  tx = 0
  // Vertical centre of the framed band (which starts at -BELOW_GROUND), then
  // nudge so the inset chrome eats dead space rather than the tower.
  //
  // The nudge is NEGATIVE. `worldToScreenY` is `viewH / 2 - (wy - y) * zoom`, so
  // raising `ty` walks the whole world DOWN the screen — straight under the
  // build tray. Centring the content band in the band the HUD leaves free means
  // shifting by `-(insetBottom - insetTop) / 2` screen pixels. With the sign
  // flipped it was survivable on desktop, where the bottom bar is thin and the
  // fit already left slack; on a phone, where the bar owns a third of the
  // screen, it buried the Gate behind the tray.
  const contentCentre = (worldTop - BELOW_GROUND) / 2 - PAD_Y * 0.35
  const insetShiftCells = (insetBottom - insetTop) / 2 / tzoom
  const portraitBias = isMobilePortrait.value ? worldH * 0.06 : 0
  ty = contentCentre - insetShiftCells + portraitBias
}

// ─── Input ──────────────────────────────────────────────────────────────────

const markManual = (): void => {
  isManual.value = true
}

/** Pan by a screen-space delta (a one-finger drag / mouse drag). */
export const panBy = (dxPx: number, dyPx: number): void => {
  tx -= dxPx / zoom
  ty += dyPx / zoom
  // Snap the smoothed position too, so a drag tracks the finger 1:1 instead of
  // lagging behind it through the spring.
  x = tx
  y = ty
  clampTarget()
  markManual()
}

/** Zoom about a screen anchor (wheel cursor / pinch centroid), so the world
 *  point under the anchor stays put — the behaviour every map app trained
 *  players to expect. */
export const zoomAt = (factor: number, anchorX: number, anchorY: number): void => {
  const before = { wx: screenToWorldX(anchorX), wy: screenToWorldY(anchorY) }
  tzoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, tzoom * factor))
  zoom = tzoom
  const after = { wx: screenToWorldX(anchorX), wy: screenToWorldY(anchorY) }
  tx += before.wx - after.wx
  ty += before.wy - after.wy
  x = tx
  y = ty
  clampTarget()
  markManual()
}

export const beginPinch = (distPx: number): void => {
  pinchStartDist = Math.max(1, distPx)
  pinchStartZoom = tzoom
  markManual()
}

export const updatePinch = (distPx: number, anchorX: number, anchorY: number): void => {
  if (pinchStartDist <= 0) return
  const desired = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartZoom * (distPx / pinchStartDist)))
  zoomAt(desired / tzoom, anchorX, anchorY)
}

export const endPinch = (): void => { pinchStartDist = 0 }

/** Return to auto-fit immediately (the recenter button). */
export const recenter = (): void => {
  isManual.value = false
  lastTowerVersion = towerVersion.value
  computeAutoTarget()
}

/** Keep manual panning within sane bounds so the player can't lose the tower
 *  off the edge of the world and be unable to find it again. */
const clampTarget = (): void => {
  const b = towerBounds()
  const halfW = viewW / 2 / zoom
  const halfH = viewH / 2 / zoom
  const limitX = Math.max(Math.abs(b.minC), Math.abs(b.maxC)) + 12
  tx = Math.max(-limitX, Math.min(limitX, tx))
  // Never let the ground scroll fully off the bottom, and cap how far above the
  // tower's crown the player can drift.
  // The lower clamp accounts for the water band, or a deliberate pan down to
  // watch the sea lane would snap straight back up.
  const lowLimit = halfH * 0.35 - BELOW_GROUND
  ty = Math.max(lowLimit, Math.min(b.maxR + 10 + halfH * 0.2, ty))
  x = Math.max(-limitX, Math.min(limitX, x))
  y = Math.max(lowLimit, Math.min(b.maxR + 10 + halfH * 0.2, y))
  void halfW
}

// ─── Per-frame update ───────────────────────────────────────────────────────

export const updateCamera = (dtMs: number): void => {
  if (!isManual.value) {
    // Recompute only when the tower actually changed — auto-fit is otherwise a
    // stable target and re-deriving it every frame is wasted work.
    if (lastTowerVersion !== towerVersion.value) {
      lastTowerVersion = towerVersion.value
      computeAutoTarget()
    }
  }

  // Critically-damped-ish exponential approach; frame-rate independent.
  const k = 1 - Math.exp(-SPRING * (dtMs / 1000))
  x += (tx - x) * k
  y += (ty - y) * k
  zoom += (tzoom - zoom) * k
}

/** Force the camera to its auto-fit target with no animation. Used on scene
 *  mount so the first painted frame is already correctly framed. */
export const snapToFit = (): void => {
  isManual.value = false
  lastTowerVersion = towerVersion.value
  computeAutoTarget()
  x = tx
  y = ty
  zoom = tzoom
}

export default function useTowerCamera() {
  return {
    isManual,
    setViewport, snapToFit, updateCamera, recenter,
    panBy, zoomAt, beginPinch, updatePinch, endPinch,
    worldToScreenX, worldToScreenY, screenToWorldX, screenToWorldY,
    screenToCell, viewRect, getZoom, getCenter
  }
}

export { isMobileLandscape }
