<script setup lang="ts">
import { computed } from 'vue'

/**
 * Per-node tech-tree glyphs.
 *
 * Every node gets a distinct pictogram rather than a generic `%` / `+`. On a
 * board of thirty nodes the icon is the only thing the player can scan at a
 * glance — if half of them share a symbol, the tree reads as noise and they
 * have to tap each one to find out what it is.
 *
 * All paths are drawn in a 24×24 box and inherit `currentColor`, so a node's
 * state colour carries straight through to its glyph.
 */

interface Props {
  icon: string
}

const props = defineProps<Props>()

interface Glyph {
  /** Stroked outlines. */
  stroke?: string[]
  /** Filled shapes. */
  fill?: string[]
}

const GLYPHS: Record<string, Glyph> = {
  // ── Structure / defence ─────────────────────────────────────────────────
  foundations: { fill: ['M3 17h18v4H3z'], stroke: ['M6 17V9h5v8', 'M13 17v-5h5v5'] },
  brace: { stroke: ['M4 4h16v16H4z', 'M4 4l16 16', 'M20 4L4 20'] },
  blockHp: { stroke: ['M4 5h16v14H4z', 'M12 8v8', 'M8 12h8'] },
  gate: { stroke: ['M5 21V10a7 7 0 0 1 14 0v11'], fill: ['M10 21v-7a2 2 0 0 1 4 0v7z'] },
  armor: { stroke: ['M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z'], fill: ['M12 7l3.5 1.4v3c0 2.4-1.5 4.4-3.5 5.3-2-.9-3.5-2.9-3.5-5.3v-3z'] },
  heal: { stroke: ['M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9z'], fill: ['M11.2 9.5h1.6v2h2v1.6h-2v2h-1.6v-2h-2v-1.6h2z'] },
  width: { stroke: ['M3 8v8', 'M21 8v8', 'M3 12h18'], fill: ['M6 9l-3 3 3 3z', 'M18 9l3 3-3 3z'] },

  // ── The Harbour ─────────────────────────────────────────────────────────
  harbour: { stroke: ['M12 3v14', 'M6 13a6 6 0 0 0 12 0'], fill: ['M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z', 'M8 7h8v2H8z'] },
  dock: { stroke: ['M2 15h20', 'M6 15v6', 'M12 15v6', 'M18 15v6'], fill: ['M4 11h16v3H4z'] },
  hull: { stroke: ['M12 4v7'], fill: ['M3 13h18l-3 7H6z', 'M12 3l5 8h-10z'] },
  naval: { stroke: ['M4 18h16'], fill: ['M6 18l-2-6h16l-2 6z', 'M11 4h2v7h-2z', 'M13 5l7 2-7 2z'] },
  longship: { stroke: ['M12 3v9'], fill: ['M2 14h20l-3 6H5z', 'M13 4l6 3-6 3z'] },
  galley: { stroke: ['M12 2v10', 'M4 20h16'], fill: ['M3 13h18l-2 5H5z', 'M13 3l7 3-7 3z', 'M20 14l3 2-3 2z'] },
  admiralty: { fill: ['M12 2l2.2 5.2 5.6.5-4.3 3.7 1.3 5.5L12 14l-4.8 2.9 1.3-5.5-4.3-3.7 5.6-.5z'], stroke: ['M4 20h16'] },

  // ── Offence ─────────────────────────────────────────────────────────────
  damage: { stroke: ['M4 20l7-7', 'M13 4l7 7'], fill: ['M13.5 3.5L20.5 10.5 18 13l-7-7z', 'M4.5 19.5l1-3 2.5 2.5z'] },
  range: { stroke: ['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3'], fill: ['M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z'] },
  fireRate: { fill: ['M13 2L4 14h6l-1 8 9-12h-6z'] },
  splash: { stroke: ['M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0', 'M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3', 'M5.6 5.6l2.1 2.1', 'M16.3 16.3l2.1 2.1', 'M18.4 5.6l-2.1 2.1', 'M7.7 16.3l-2.1 2.1'] },
  chain: { stroke: ['M9 7l-3 5h4l-2 5'], fill: ['M17 3l-5 8h3l-4 10 9-12h-4z'] },
  shell: { stroke: ['M12 21c-2.5-2-4-4.5-4-7.5S9.5 7 12 3c2.5 4 4 7.5 4 10.5S14.5 19 12 21z'], fill: ['M10.5 21h3l-1.5 2z'] },
  overcharge: { stroke: ['M6 18a8 8 0 1 1 12 0'], fill: ['M11 4L6 13h4l-1 6 6-9h-4z'] },
  masterwork: { fill: ['M12 2l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 16.3 6.2 19.8l1.6-6.6L2.6 8.8l6.8-.5z'] },
  doctrine: { stroke: ['M4 6h16', 'M4 12h16', 'M4 18h10'], fill: ['M18 15l3 3-3 3z'] },

  // ── Block unlocks ───────────────────────────────────────────────────────
  bombard: { stroke: ['M6 20h12'], fill: ['M9 20v-7l3-4 3 4v7z', 'M12 2l1.2 2.4L12 6l-1.2-1.6z'] },
  mortar: { stroke: ['M5 20h14'], fill: ['M8 20l-1-9h10l-1 9z', 'M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z'] },
  tesla: { stroke: ['M8 20h8', 'M9 16h6', 'M10 12h4'], fill: ['M12 1l-3 6h2.2L10 12l4-6h-2.3z'] },
  frost: { stroke: ['M12 2v20', 'M3.5 7l17 10', 'M20.5 7l-17 10', 'M12 6l-2.5-2.5', 'M12 6l2.5-2.5', 'M12 18l-2.5 2.5', 'M12 18l2.5 2.5'] },
  spikes: { fill: ['M2 21h20v-2H2z', 'M4 19l2-7 2 7z', 'M10 19l2-9 2 9z', 'M16 19l2-7 2 7z'] },
  repair: { stroke: ['M15 4a4 4 0 0 0-5 5L4 15l3 3 6-6a4 4 0 0 0 5-5l-2.5 2.5-2-2z'] },
  sawmill: { stroke: ['M12 12m-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0'], fill: ['M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z', 'M11 1h2v3h-2z', 'M11 20h2v3h-2z', 'M1 11h3v2H1z', 'M20 11h3v2h-3z'] },
  quarry: { stroke: ['M12 21V9'], fill: ['M4 9c2-4 14-4 16 0-3-1.5-13-1.5-16 0z', 'M10 21h4l-2-3z'] },
  mint: { stroke: ['M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0', 'M12 7v10', 'M9.5 9.5h5', 'M9.5 14.5h5'] },
  wood: { fill: ['M3 8h14v8H3z'], stroke: ['M17 12m-3 0a3 4 0 1 0 6 0 3 4 0 1 0-6 0', 'M3 12m-3 0a3 4 0 1 0 6 0 3 4 0 1 0-6 0'] },
  stone: { stroke: ['M4 16l3-8 9-1 4 8-7 4z'], fill: ['M7 8l4 3 9-1z'] },

  // ── Economy / meta ──────────────────────────────────────────────────────
  reward: { stroke: ['M3 9h18v11H3z', 'M12 9v11'], fill: ['M3 5h18v4H3z', 'M12 5c-2-3-6-2-5 0z', 'M12 5c2-3 6-2 5 0z'] },
  loot: { stroke: ['M7 8V6a5 5 0 0 1 10 0v2', 'M5 8h14l1 13H4z'], fill: ['M11 12h2v5h-2z'] },
  vault: { stroke: ['M3 4h18v16H3z', 'M12 12m-4 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0', 'M12 6v2', 'M12 16v2', 'M6 12h2', 'M16 12h2'] },
  thorns: { fill: ['M2 21h20v-2H2z'], stroke: ['M5 19l3-8 3 8', 'M13 19l3-9 3 9', 'M8 13l3-2', 'M16 12l3-2'] },
  cavalry: { stroke: ['M4 19h12'], fill: ['M6 19l1-6 4-3 2-5 3 2-1 4 4 3-1 5z', 'M15 4l3 1-1 2z'] }
}

const glyph = computed<Glyph>(() => GLYPHS[props.icon] ?? GLYPHS.damage!)
</script>

<template lang="pug">
  svg.tech-icon(viewBox="0 0 24 24" aria-hidden="true")
    path(
      v-for="(d, i) in (glyph.fill ?? [])"
      :key="'f' + i"
      :d="d"
      fill="currentColor"
    )
    path(
      v-for="(d, i) in (glyph.stroke ?? [])"
      :key="'s' + i"
      :d="d"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    )
</template>

<style scoped lang="sass">
.tech-icon
  width: 100%
  height: 100%
  // The drop shadow is what keeps a light glyph legible on the gold
  // "affordable" node body.
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.55))
</style>
