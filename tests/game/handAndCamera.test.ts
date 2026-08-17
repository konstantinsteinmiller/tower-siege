import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SHAPE_BY_ID, pickAffordableWeapon, WEAPON_SLOT } from '@/game/shapes'

// The simulation and the camera are module-level singletons (project
// convention), so each test re-imports them fresh.
const loadGame = async () => {
  vi.resetModules()
  localStorage.clear()
  const g = await import('@/use/useTowerGame')
  g.startRun()
  return g
}

type Game = Awaited<ReturnType<typeof loadGame>>

/** Is there a gun in the hand the player can actually pay for? */
const hasBuyableGun = (g: Game): boolean =>
  g.offers.value.some(
    (id) => SHAPE_BY_ID[id]?.lane === 'weapon' && g.canAffordShape(id)
  )

beforeEach(() => {
  localStorage.clear()
})

describe('the hand always holds a gun the player can buy', () => {
  it('deals wave 1 with an affordable weapon', async () => {
    // The whole run is decided here: a wave-1 hand with no buyable gun is a
    // loss handed to the player before they have made a decision.
    const g = await loadGame()
    expect(hasBuyableGun(g)).toBe(true)
  })

  it('swaps the weapon lane when the offered gun is out of reach', async () => {
    const g = await loadGame()
    // Enough for an Archery (20 wood), nowhere near a Cannon (25 wood + 10
    // stone) — the exact shape of the trap.
    g.wood.value = 20
    g.stone.value = 0
    g.runCoins.value = 0
    g.offers.value = ['w1', 'cannon1', 'w2h', 's1']
    expect(hasBuyableGun(g)).toBe(false)

    // Any hand mutation re-checks the guarantee.
    g.rerollOffer(0)
    expect(hasBuyableGun(g)).toBe(true)
  })

  it('leaves a hand that already works completely alone', async () => {
    const g = await loadGame()
    g.wood.value = 999
    g.stone.value = 999
    g.runCoins.value = 999
    g.offers.value = ['w1', 'cannon1', 'w2h', 's1']

    g.rerollOffer(2)
    // The net must never rearrange a hand the player can already act on.
    expect(g.offers.value[WEAPON_SLOT]).toBe('cannon1')
  })

  it('re-checks after gold is spent on a block upgrade', async () => {
    const g = await loadGame()
    g.runCoins.value = 500
    g.placeBlock('wood', 1, 0)
    // Now squeeze the purse: an Archery is affordable, a Cannon is not.
    g.wood.value = 20
    g.stone.value = 0
    g.offers.value = ['w1', 'cannon1', 'w2h', 's1']
    expect(hasBuyableGun(g)).toBe(false)

    // Spending gold is a hand-relevant event even though it touches no offer.
    expect(g.upgradeBlock(1, 0)).toBe(true)
    expect(hasBuyableGun(g)).toBe(true)
  })

  it('falls back to the cheapest gun when nothing at all is affordable', async () => {
    const unlocked = new Set(['wood', 'stone', 'archer', 'cannon'])
    const broke = pickAffordableWeapon(1, unlocked, () => false)
    // Archery is 20 wood; every other gun costs more, so it is the one the
    // player will be able to afford first.
    expect(broke).toBe('archer1')
  })

  it('returns null when the player has no weapon blocks at all', () => {
    expect(pickAffordableWeapon(1, new Set(['wood']), () => true)).toBeNull()
  })
})

describe('manual camera framing', () => {
  const loadCamera = async () => {
    vi.resetModules()
    localStorage.clear()
    const g = await import('@/use/useTowerGame')
    g.startRun()
    const cam = await import('@/use/useTowerCamera')
    cam.setViewport(1000, 700, 0, 0)
    cam.snapToFit()
    return cam
  }

  it('survives the HUD re-measuring its insets', async () => {
    // `setViewport` runs on a 1 s cadence from the scene's inset timer. It used
    // to clear manual framing every time, so a deliberate zoom was undone
    // within a second — the "it zooms back out on its own" bug.
    const cam = await loadCamera()
    cam.zoomAt(1.6, 500, 350)
    expect(cam.isManual.value).toBe(true)
    const zoomed = cam.getZoom()

    cam.setViewport(1000, 700, 0, 0)
    expect(cam.isManual.value).toBe(true)
    expect(cam.getZoom()).toBeCloseTo(zoomed, 5)
  })

  it('does not expire on its own after seconds of play', async () => {
    const cam = await loadCamera()
    cam.zoomAt(1.6, 500, 350)
    const zoomed = cam.getZoom()

    // Ten seconds of frames — well past the four-second idle timer this used
    // to have.
    for (let i = 0; i < 600; i++) cam.updateCamera(16)

    expect(cam.isManual.value).toBe(true)
    expect(cam.getZoom()).toBeCloseTo(zoomed, 5)
  })

  it('is handed back by the recenter button', async () => {
    const cam = await loadCamera()
    cam.panBy(120, 80)
    expect(cam.isManual.value).toBe(true)

    cam.recenter()
    expect(cam.isManual.value).toBe(false)
  })

  it('is dropped by a REAL viewport change', async () => {
    // A rotation or resize invalidates the framing: it was chosen for a
    // viewport that no longer exists.
    const cam = await loadCamera()
    cam.zoomAt(1.6, 500, 350)
    expect(cam.isManual.value).toBe(true)

    cam.setViewport(700, 1000, 0, 0)
    expect(cam.isManual.value).toBe(false)
  })

  it('frames a small opening tower closer than it used to', async () => {
    // The complaint: on early waves the auto-fit pulled so far back that a
    // three-block fort was a postage stamp. The floors on the framed band are
    // what decide that, so this pins them.
    const cam = await loadCamera()
    // A bare Gate — the smallest tower there is.
    expect(cam.getZoom()).toBeGreaterThan(700 / 8)
  })
})
