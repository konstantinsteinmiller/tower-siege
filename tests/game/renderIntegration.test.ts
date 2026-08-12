import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Renderer integration ───────────────────────────────────────────────────
//
// The renderer is the largest single piece of the game and the part unit tests
// reach least, so this file drives it the way the real frame loop does: build a
// tower, call a wave, and step simulation + draw together for hundreds of
// frames against a recording 2D-context stub.
//
// It cannot assert that the picture looks right — but it catches the failures
// that actually happen in canvas code and would otherwise only surface as a
// black screen in a player's browser: a null-deref on an entity that died
// mid-frame, an unbalanced save/restore that leaks transform state forever, an
// unguarded `createLinearGradient` with NaN coordinates, or an exception thrown
// from an FX handler that kills the rAF loop for the rest of the session.

/** A Canvas 2D context stub that records what it was asked to do and, crucially,
 *  VALIDATES the numbers it receives. jsdom's canvas is a no-op that silently
 *  swallows NaN — which is exactly the class of bug we want to catch. */
const makeCtx = () => {
  const calls: Record<string, number> = {}
  let saveDepth = 0
  let maxSaveDepth = 0
  const badNumbers: string[] = []

  const track = (name: string, args: unknown[] = []): void => {
    calls[name] = (calls[name] ?? 0) + 1
    for (const a of args) {
      if (typeof a === 'number' && !Number.isFinite(a)) {
        badNumbers.push(`${name}(${args.join(', ')})`)
      }
    }
  }

  const gradient = {
    addColorStop: (offset: number) => {
      track('addColorStop', [offset])
      // A gradient stop outside [0,1] throws IndexSizeError in a real browser.
      if (!Number.isFinite(offset) || offset < 0 || offset > 1) {
        badNumbers.push(`addColorStop(${offset})`)
      }
    }
  }

  const ctx: any = {
    canvas: { width: 800, height: 600 },
    // Recorded no-ops.
    ...Object.fromEntries([
      'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse',
      'quadraticCurveTo', 'bezierCurveTo', 'rect', 'fill', 'stroke', 'clip',
      'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText',
      'drawImage', 'translate', 'rotate', 'scale', 'transform', 'setTransform',
      'setLineDash', 'measureText'
    ].map((name) => [name, (...args: unknown[]) => {
      track(name, args)
      if (name === 'measureText') return { width: 10 }
      return undefined
    }])),
    save: () => { track('save'); saveDepth++; maxSaveDepth = Math.max(maxSaveDepth, saveDepth) },
    restore: () => { track('restore'); saveDepth-- },
    createLinearGradient: (...args: number[]) => { track('createLinearGradient', args); return gradient },
    createRadialGradient: (...args: number[]) => { track('createRadialGradient', args); return gradient }
  }

  // Style properties are plain assignable fields, like the real thing.
  for (const prop of [
    'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha',
    'globalCompositeOperation', 'font', 'textAlign', 'textBaseline', 'filter'
  ]) {
    ctx[prop] = ''
  }

  return {
    ctx: ctx as CanvasRenderingContext2D,
    calls,
    badNumbers,
    get saveDepth() { return saveDepth },
    get maxSaveDepth() { return maxSaveDepth }
  }
}

const loadScene = async () => {
  vi.resetModules()
  localStorage.clear()
  // `document.createElement('canvas').getContext('2d')` is null under jsdom, so
  // the sprite cache would blow up. Give it the same recording stub.
  const realCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = realCreate(tag)
    if (tag === 'canvas') {
      ;(el as any).getContext = () => makeCtx().ctx
    }
    return el
  }) as typeof document.createElement)

  const game = await import('@/use/useTowerGame')
  const camera = await import('@/use/useTowerCamera')
  const art = await import('@/use/useTowerArt')
  const vfx = await import('@/use/useTowerVfx')
  camera.setViewport(800, 600, 60, 120)
  camera.snapToFit()
  return { game, camera, art, vfx }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('renderer survives a full siege', () => {
  it('draws hundreds of frames of live combat without throwing', async () => {
    const { game, art } = await loadScene()
    const rec = makeCtx()

    game.startRun()
    game.wood.value = 2000
    game.stone.value = 2000
    // A tower with one of every weapon, so every fixture / projectile /
    // impact path is exercised in the same run.
    game.placeBlock('stone', -2, 0)
    game.placeBlock('stone', -1, 0)
    game.placeBlock('stone', 1, 0)
    game.placeBlock('stone', 2, 0)
    game.placeBlock('cannon', 0, 1)
    game.placeBlock('archer', 1, 1)
    game.placeBlock('wood', -1, 1)
    game.placeBlock('spikes', -2, 1)
    game.placeBlock('sawmill', 2, 1)

    game.callWave()

    for (let i = 0; i < 600; i++) {
      game.step(16.67)
      art.drawScene(rec.ctx, 800, 600, 16.67, 2)
    }

    expect(rec.badNumbers).toEqual([])
    // Every `save()` must be matched — an imbalance silently corrupts the
    // transform for every subsequent frame.
    expect(rec.saveDepth).toBe(0)
    expect(rec.calls.drawImage).toBeGreaterThan(0)
    expect(rec.calls.fill).toBeGreaterThan(0)
  })

  it('draws the build phase, the overlay and the inspector range circle', async () => {
    const { game, art } = await loadScene()
    const rec = makeCtx()

    game.startRun()
    game.placeBlock('archer', 1, 0)
    art.setBuildOverlay({
      selectedShape: 'cannonMount',
      hoverC: 2,
      hoverR: 0,
      hoverValid: true,
      slots: [[2, 0], [-1, 0], [0, 1]],
      inspectC: 1,
      inspectR: 0
    })

    for (let i = 0; i < 60; i++) {
      game.step(16.67)
      art.drawScene(rec.ctx, 800, 600, 16.67, 2)
    }

    expect(rec.badNumbers).toEqual([])
    expect(rec.saveDepth).toBe(0)
  })

  it('survives a total collapse — the most VFX-dense moment in the game', async () => {
    const { game, art } = await loadScene()
    const rec = makeCtx()

    game.startRun()
    game.wood.value = 5000
    // A tall stack whose entire upper section orphans at once.
    for (let r = 0; r < 8; r++) game.placeBlock('wood', 1, r)
    for (let r = 1; r < 6; r++) game.placeBlock('wood', 2, r)

    game.sellBlock(1, 0) // pull the base out
    expect(game.getDebris().length).toBeGreaterThan(5)

    for (let i = 0; i < 180; i++) {
      game.step(16.67)
      art.drawScene(rec.ctx, 800, 600, 16.67, 2)
    }

    expect(rec.badNumbers).toEqual([])
    expect(rec.saveDepth).toBe(0)
  })

  it('renders a boss wave, including the lightning and mortar paths', async () => {
    const { game, art } = await loadScene()
    const rec = makeCtx()

    game.startRun()
    game.wood.value = 5000
    game.stone.value = 5000
    // The Tesla, Mortar and Frost blocks are bought partly with run gold, which
    // starts a run at 0. Without stocking it the three placements below fail
    // silently and this test still passes — while drawing none of the lightning
    // or mortar art it exists to cover. Hence the assertions.
    game.runCoins.value = 5000
    game.placeBlock('stone', -1, 0)
    game.placeBlock('stone', 1, 0)
    expect(game.placeBlock('tesla', 0, 1)).toBe(true)
    expect(game.placeBlock('mortar', 1, 1)).toBe(true)
    expect(game.placeBlock('frost', -1, 1)).toBe(true)

    // Jump to wave 9 so the very next call is the wave-10 boss.
    game.wave.value = 9
    game.callWave()
    expect(game.enemiesTotal.value).toBeGreaterThan(0)

    for (let i = 0; i < 600; i++) {
      game.step(16.67)
      art.drawScene(rec.ctx, 800, 600, 16.67, 2)
    }

    expect(rec.badNumbers).toEqual([])
    expect(rec.saveDepth).toBe(0)
  })

  it('renders a late wave with flyers and sea creatures without throwing', async () => {
    // Waves 20+ carry a reserved air share AND a reserved sea share, so this
    // exercises the flying-enemy path, the submerged-silhouette path and the
    // rear-up strike path in one run.
    const { game, art } = await loadScene()
    const rec = makeCtx()

    game.startRun()
    game.wood.value = 9000
    game.stone.value = 9000
    game.runCoins.value = 9000
    for (const c of [-3, -2, -1, 1, 2, 3]) game.placeBlock('stone', c, 0)
    game.placeBlock('archer', 0, 1)
    game.placeBlock('cannon', 1, 1)
    // Gold-costed, so it needs the stocked balance above to land at all.
    expect(game.placeBlock('tesla', -1, 1)).toBe(true)

    game.wave.value = 22
    game.callWave()

    for (let i = 0; i < 1400; i++) {
      game.step(16.67)
      art.drawScene(rec.ctx, 800, 600, 16.67, 2)
    }

    expect(rec.badNumbers).toEqual([])
    expect(rec.saveDepth).toBe(0)
  })

  it('renders roofed blocks and a multi-cell shape ghost', async () => {
    const { game, art } = await loadScene()
    const rec = makeCtx()

    game.startRun()
    game.wood.value = 5000
    game.offers.value = ['wRoof2', 'cannonMount', 'wO', 'spikes1']
    expect(game.placeShape(0, 1, 0)).toBe(true)

    art.setBuildOverlay({
      selectedShape: 'wO',
      hoverC: -2,
      hoverR: 0,
      hoverValid: true,
      slots: [[-2, 0], [-1, 0], [2, 0]],
      inspectC: null,
      inspectR: null
    })

    for (let i = 0; i < 90; i++) {
      game.step(16.67)
      art.drawScene(rec.ctx, 800, 600, 16.67, 2)
    }

    expect(rec.badNumbers).toEqual([])
    expect(rec.saveDepth).toBe(0)
  })

  it('renders correctly at every quality tier', async () => {
    const { game, art, vfx } = await loadScene()

    game.startRun()
    game.wood.value = 2000
    game.stone.value = 2000
    game.placeBlock('cannon', 0, 1)
    game.placeBlock('stone', 1, 0)
    game.callWave()

    for (const tier of ['high', 'medium', 'low'] as const) {
      const rec = makeCtx()
      vfx.quality.value = tier
      for (let i = 0; i < 120; i++) {
        game.step(16.67)
        art.drawScene(rec.ctx, 800, 600, 16.67, 2)
      }
      expect(rec.badNumbers, `tier ${tier}`).toEqual([])
      expect(rec.saveDepth, `tier ${tier}`).toBe(0)
    }
  })

  it('renders sanely at extreme viewports (320×658 portrait and 844×390 landscape)', async () => {
    const { game, camera, art } = await loadScene()

    game.startRun()
    game.wood.value = 2000
    for (let r = 0; r < 6; r++) game.placeBlock('wood', 0, r + 1)
    game.callWave()

    for (const [w, h] of [[320, 658], [844, 390], [1920, 1080], [768, 1024]] as const) {
      const rec = makeCtx()
      camera.setViewport(w, h, 60, 120)
      camera.snapToFit()
      for (let i = 0; i < 90; i++) {
        game.step(16.67)
        art.drawScene(rec.ctx, w, h, 16.67, 2)
      }
      expect(rec.badNumbers, `${w}x${h}`).toEqual([])
      expect(rec.saveDepth, `${w}x${h}`).toBe(0)
    }
  })
})

describe('camera', () => {
  it('keeps the tower inside the frame as it grows', async () => {
    const { game, camera } = await loadScene()
    game.startRun()
    game.wood.value = 5000

    for (let r = 1; r <= 14; r++) {
      game.placeBlock('wood', 0, r)
      // Settle the spring.
      for (let i = 0; i < 120; i++) camera.updateCamera(16.67)
    }

    const rect = camera.viewRect()
    const bounds = game.towerBounds()
    // The crown and the ground line must both be visible, or the player is
    // flying blind on the two things that matter.
    expect(rect.t).toBeGreaterThan(bounds.maxR)
    expect(rect.b).toBeLessThan(0.5)
  })

  it('round-trips screen ⇄ world coordinates', async () => {
    const { camera } = await loadScene()
    for (const [sx, sy] of [[400, 300], [0, 0], [799, 599]] as const) {
      const wx = camera.screenToWorldX(sx)
      const wy = camera.screenToWorldY(sy)
      expect(camera.worldToScreenX(wx)).toBeCloseTo(sx, 4)
      expect(camera.worldToScreenY(wy)).toBeCloseTo(sy, 4)
    }
  })

  it('zooms about the anchor point so the world under the cursor stays put', async () => {
    const { camera } = await loadScene()
    const anchor = { x: 250, y: 180 }
    const before = {
      wx: camera.screenToWorldX(anchor.x),
      wy: camera.screenToWorldY(anchor.y)
    }
    camera.zoomAt(1.5, anchor.x, anchor.y)
    expect(camera.screenToWorldX(anchor.x)).toBeCloseTo(before.wx, 3)
    expect(camera.screenToWorldY(anchor.y)).toBeCloseTo(before.wy, 3)
  })

  it('maps a screen point to the grid cell the player expects', async () => {
    const { game, camera } = await loadScene()
    game.startRun()
    camera.snapToFit()
    // The Gate's centre must hit-test back to (0, 0).
    const sx = camera.worldToScreenX(0)
    const sy = camera.worldToScreenY(0.5)
    expect(camera.screenToCell(sx, sy)).toEqual({ c: 0, r: 0 })
  })
})
