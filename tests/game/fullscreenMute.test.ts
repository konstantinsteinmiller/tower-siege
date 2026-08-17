import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The CrazyGames mute rule: the platform toolbar owns muting while the game is
 * embedded, so the in-game button is hidden there — but the toolbar is gone in
 * fullscreen, so the button has to come back. Everything therefore hangs off
 * this one flag being right, and being CONSERVATIVE when it isn't sure: a false
 * "fullscreen" ships the duplicate mute button QA rejects.
 */

const loadWatch = async () => {
  vi.resetModules()
  return import('@/use/useFullscreen')
}

const setViewport = (w: number, h: number): void => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true })
  window.dispatchEvent(new Event('resize'))
}

const setScreen = (w: number, h: number): void => {
  Object.defineProperty(window.screen, 'width', { value: w, configurable: true })
  Object.defineProperty(window.screen, 'height', { value: h, configurable: true })
}

beforeEach(() => {
  setScreen(1600, 900)
})

describe('fullscreen detection', () => {
  it('does not claim fullscreen just because the window is big', async () => {
    // A maximised window, a page at 80 % zoom, or a debugging viewport override
    // can all match the screen size exactly. None of them is fullscreen, and
    // reporting one as such is the expensive mistake.
    const fs = await loadWatch()
    Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true, writable: true })
    fs.installFullscreenWatch()
    expect(fs.isFullscreen.value).toBe(false)
  })

  it('catches the viewport GROWING to fill the screen', async () => {
    const fs = await loadWatch()
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 620, configurable: true, writable: true })
    fs.installFullscreenWatch()
    expect(fs.isFullscreen.value).toBe(false)

    // What a parent-driven iframe fullscreen looks like from inside the frame:
    // no `fullscreenchange`, just a resize to the size of the display.
    setViewport(1600, 900)
    expect(fs.isFullscreen.value).toBe(true)
  })

  it('goes back to windowed when the viewport shrinks again', async () => {
    const fs = await loadWatch()
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 620, configurable: true, writable: true })
    fs.installFullscreenWatch()

    setViewport(1600, 900)
    expect(fs.isFullscreen.value).toBe(true)
    setViewport(1000, 620)
    expect(fs.isFullscreen.value).toBe(false)
    // ...and a SECOND fullscreen is detected too, so the baseline re-arms.
    setViewport(1600, 900)
    expect(fs.isFullscreen.value).toBe(true)
  })

  it('trusts the fullscreen API outright when it is available', async () => {
    const fs = await loadWatch()
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true, writable: true })
    fs.installFullscreenWatch()
    expect(fs.isFullscreen.value).toBe(false)

    // A same-document `requestFullscreen()` is exact — no size guessing needed,
    // even though the viewport here is nowhere near the screen.
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.body, configurable: true
    })
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(fs.isFullscreen.value).toBe(true)

    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(fs.isFullscreen.value).toBe(false)
  })
})
