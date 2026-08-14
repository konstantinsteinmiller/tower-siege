import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import TutorialOverlay, { type TutorialStep } from '@/components/game/TutorialOverlay.vue'
import en from '@/i18n/locales/en'

/**
 * The coach marks must describe the board that is actually on screen.
 *
 * The first-session scripted opening seeds a free starter fort onto the
 * foundation, which makes "Place it next to the Gate" a lie — those cells are
 * full. Two beats therefore have a `*Seeded` variant, and this pins both halves
 * of that contract: the right key is chosen, and the key EXISTS. vue-i18n
 * silently renders a missing key as its own path, so a typo in either the
 * component or the locale file would otherwise ship as literal
 * "tutorial.gateSeeded" text on a brand-new player's first screen.
 */

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en }
})

const textFor = (step: TutorialStep, seeded: boolean): string => {
  const wrapper = mount(TutorialOverlay, {
    props: { step, target: { x: 100, y: 100, w: 50, h: 50 }, seeded },
    global: { plugins: [i18n] }
  })
  const text = wrapper.get('.tutorial__text').text()
  wrapper.unmount()
  return text
}

describe('tutorial copy on a seeded opening', () => {
  it.each<TutorialStep>(['gate', 'place'])('%s reads differently once the fort stands', (step) => {
    const bare = textFor(step, false)
    const seeded = textFor(step, true)
    expect(seeded).not.toBe(bare)
  })

  it.each<TutorialStep>(['pick', 'call'])('%s is unchanged — it describes no cell', (step) => {
    expect(textFor(step, true)).toBe(textFor(step, false))
  })

  it.each<[TutorialStep, boolean]>([
    ['gate', false], ['gate', true],
    ['pick', false], ['pick', true],
    ['place', false], ['place', true],
    ['call', false], ['call', true]
  ])('%s (seeded: %s) resolves to real copy, not a missing-key path', (step, seeded) => {
    const text = textFor(step, seeded)
    expect(text).not.toMatch(/^tutorial\./)
    expect(text.length).toBeGreaterThan(4)
  })
})
