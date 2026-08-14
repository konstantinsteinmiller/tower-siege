import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The drop-in art override probe, and its off switch.
 *
 * The probe is designed around a miss being free — and for the GAME it is, the
 * procedural renderer draws either way. It is not free for a PORTAL: every miss
 * shows up in CrazyGames' QA console as
 * `Missing resource detected: …/images/blocks/wood.webp`, one line per block and
 * per enemy, which reads as a broken build to a reviewer.
 *
 * So the thing worth testing is a NEGATIVE: with the flag off, not one request
 * is made. That is invisible in play — the game looks identical either way —
 * which is exactly why it needs a test rather than a look.
 */

/** Records every `new Image()` and the src it was pointed at. */
const trackImages = (): string[] => {
  const requested: string[] = []
  class FakeImage {
    decoding = 'auto'
    naturalWidth = 0
    addEventListener(): void { /* never fires: nothing is really loaded */ }
    set src(value: string) { requested.push(value) }
    get src(): string { return '' }
  }
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
  return requested
}

const loadArt = async (enabled: boolean) => {
  vi.resetModules()
  vi.stubEnv('VITE_ENABLE_ART_OVERRIDES', enabled ? 'true' : '')
  return import('@/game/art')
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('art overrides, off', () => {
  it('requests nothing at all', async () => {
    const requested = trackImages()
    const art = await loadArt(false)

    expect(art.artOverridesEnabled).toBe(false)
    expect(art.spriteFor('block', 'wood')).toBeNull()
    expect(art.spriteFor('enemy', 'grunt')).toBeNull()
    art.warmSpriteProbes(['wood', 'stone', 'cannon'], ['grunt', 'bat'])

    // The exact CG QA complaint: not one of these may be asked for.
    expect(requested).toEqual([])
  })
})

describe('art overrides, on', () => {
  it('probes the documented paths so dropping art in still works', async () => {
    const requested = trackImages()
    const art = await loadArt(true)

    expect(art.artOverridesEnabled).toBe(true)
    art.spriteFor('block', 'wood')
    art.spriteFor('enemy', 'grunt')

    expect(requested.some((u) => u.endsWith('images/blocks/wood.webp'))).toBe(true)
    expect(requested.some((u) => u.endsWith('images/enemies/grunt.webp'))).toBe(true)
  })

  it('asks for each id once, however often it is drawn', async () => {
    const requested = trackImages()
    const art = await loadArt(true)

    for (let i = 0; i < 20; i++) art.spriteFor('block', 'wood')

    expect(requested).toHaveLength(1)
  })

  it('falls back to drawing until a probe actually decodes', async () => {
    trackImages()
    const art = await loadArt(true)
    // The fake never fires `load`, which is the same state as a 404: the
    // caller gets null and the renderer draws the block itself.
    expect(art.spriteFor('block', 'wood')).toBeNull()
  })
})
