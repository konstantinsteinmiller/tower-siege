<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ENEMY_DEFS } from '@/game/enemies'
import { themedPalette } from '@/game/art'
import { canOfferReward, adInFlight } from '@/use/useAdGate'
import FRewardButton from '@/components/atoms/FRewardButton.vue'

/**
 * The "wave survived" payout toast (a compact take on reference image 7).
 *
 * Shown for a few seconds after each cleared wave: what you killed, and what it
 * paid. It auto-dismisses so the build phase isn't gated behind a click — the
 * player's attention should be back on the tower as fast as possible.
 *
 * The payout row is the LOUDEST thing on the card, deliberately. A new player
 * clears wave one, watches wood and stone jump in the top bar, and has no idea
 * why — the earlier version of this toast whispered "+12 +8 +40" in three small
 * coloured numerals with no icons, which is not an explanation of an income
 * source, it is a receipt in a language nobody was taught. So: the same glyphs
 * the resource bar uses, an oversized `+`, and a caption naming the row as the
 * reward. The eye can then travel toast → top bar and connect the two.
 */

interface Reward {
  wave: number
  coins: number
  wood: number
  stone: number
  bonusPct: number
  tally: Record<string, number>
}

interface Props {
  reward: Reward | null
}

const props = defineProps<Props>()
import { isRewardGated } from '@/use/useAdGate'

const emit = defineEmits<{ (e: 'triple'): void }>()
const { t } = useI18n()

/**
 * How long the toast lingers.
 *
 * A plain payout readout should get out of the way fast — the player's
 * attention belongs on the tower. But when the toast is also carrying the
 * triple-coins offer it is a DECISION, and a decision that expires in three
 * seconds is a decision the player will miss and resent missing.
 */
const PLAIN_MS = 3400
const OFFER_MS = 8000

const visible = ref(false)
/** Wave number whose triple has already been taken, so it cannot be re-claimed. */
const claimedWave = ref(-1)
let hideTimer: ReturnType<typeof setTimeout> | null = null

/**
 * The triple is only offered on a wave that actually paid something — and only
 * where there is a video to pay for it.
 *
 * Off-portal the reward would simply be free, and a button that triples the
 * payout for nothing is not an offer, it is a "make the game easier" toggle
 * sitting in the middle of the screen after every wave.
 */
const canTriple = computed(() =>
  isRewardGated
  && !!props.reward
  && props.reward.coins > 0
  && claimedWave.value !== props.reward.wave
  && canOfferReward.value
)

watch(() => props.reward, (r) => {
  if (hideTimer) clearTimeout(hideTimer)
  if (!r) { visible.value = false; return }
  visible.value = true
  hideTimer = setTimeout(() => { visible.value = false }, canTriple.value ? OFFER_MS : PLAIN_MS)
}, { immediate: true })

onUnmounted(() => { if (hideTimer) clearTimeout(hideTimer) })

const onTriple = (): void => {
  const r = props.reward
  if (!r || adInFlight.value) return
  claimedWave.value = r.wave
  emit('triple')
}

/** Kill tally, richest first, capped so the row never wraps on a phone. */
const tallyRows = computed(() => {
  const tally = props.reward?.tally ?? {}
  return Object.entries(tally)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, n]) => ({
      id,
      n,
      color: themedPalette(ENEMY_DEFS[id]?.palette ?? 'grunt').mid
    }))
})

/**
 * The payout chips, in resource order, skipping anything that paid nothing.
 *
 * A "+0 stone" chip is worse than no chip: it teaches the player that the row
 * is noise they can stop reading.
 */
const payouts = computed(() => {
  const r = props.reward
  if (!r) return []
  return ([
    { id: 'wood', amount: r.wood },
    { id: 'stone', amount: r.stone },
    { id: 'coin', amount: r.coins }
  ] as const).filter((p) => p.amount > 0)
})
</script>

<template lang="pug">
  Transition(name="toast")
    div.wave-toast(v-if="visible && reward" :class="{ 'is-interactive': canTriple }")
      span.wave-toast__shadow(aria-hidden="true")
      div.wave-toast__body
        div.wave-toast__title.text-white
          | {{ t('result.waveCleared', { n: reward.wave }) }}
          span.text-white.wave-toast__bonus(v-if="reward.bonusPct > 0") +{{ reward.bonusPct }}%

        //- Kill tally: a coloured pip per enemy type with its count.
        div.wave-toast__tally(v-if="tallyRows.length > 0")
          span.wave-toast__pip(v-for="row in tallyRows" :key="row.id")
            i.wave-toast__dot(:style="{ backgroundColor: row.color }")
            | {{ row.n }}

        //- ── Payout ─────────────────────────────────────────────────────
        //- Names itself, so the player learns that clearing a wave is what
        //- pays for the next one.
        div.wave-toast__payout(v-if="payouts.length > 0")
          span.wave-toast__payout-label {{ t('rewards') }}
          div.wave-toast__rewards
            span.wave-toast__reward(
              v-for="(p, i) in payouts"
              :key="p.id"
              :class="`is-${p.id}`"
              :style="{ animationDelay: `${i * 90}ms` }"
            )
              //- Same glyphs as the resource bar at the top of the screen —
              //- the whole point is that the player links the two.
              svg.wave-toast__icon(v-if="p.id === 'wood'" viewBox="0 0 24 24" aria-hidden="true")
                ellipse(cx="6" cy="12" rx="3" ry="6" fill="#8a5a2b")
                rect(x="6" y="6" width="12" height="12" fill="#a9682f")
                ellipse(cx="18" cy="12" rx="3" ry="6" fill="#d99a53")
                ellipse(cx="18" cy="12" rx="1.7" ry="3.4" fill="none" stroke="#7a4a20" stroke-width="1")
              svg.wave-toast__icon(v-else-if="p.id === 'stone'" viewBox="0 0 24 24" aria-hidden="true")
                path(d="M4 16 L7 7 L17 6 L20 15 L13 19 Z" fill="#767e88" stroke="#4a5058" stroke-width="1.4" stroke-linejoin="round")
                path(d="M7 7 L13 11 L20 15" fill="none" stroke="#a8b2bd" stroke-width="1.2")
              svg.wave-toast__icon(v-else viewBox="0 0 24 24" aria-hidden="true")
                circle(cx="12" cy="12" r="9" fill="#e0a81c" stroke="#8a6410" stroke-width="1.6")
                circle(cx="12" cy="12" r="5.5" fill="none" stroke="#ffe066" stroke-width="1.6")
                path(d="M12 8.5 v7 M10 10.5 h4 M10 13.5 h4" stroke="#8a6410" stroke-width="1.4" stroke-linecap="round")
              span.wave-toast__plus +
              span.wave-toast__amount {{ p.amount }}

        //- Triple the wave payout for a video. Offered here rather than on the
        //- defeat screen because this is the moment the number is on screen and
        //- the player can see exactly what they are tripling.
        FRewardButton(
          v-if="canTriple"
          tone="green"
          size="sm"
          :label="t('result.tripleWave', { n: reward.coins * 3 })"
          @click="onTriple"
        )
</template>

<style scoped lang="sass">
.wave-toast
  position: relative
  // Interactive only while it is carrying the triple-coins offer; a payout
  // readout must never eat a tap meant for the tower behind it.
  pointer-events: none
  max-width: min(92vw, 26rem)

.wave-toast.is-interactive
  pointer-events: auto

.wave-toast__shadow
  position: absolute
  inset: 0
  transform: translateY(4px)
  border-radius: clamp(0.6rem, 3vw, 1rem)
  background-color: #0d1830

.wave-toast__body
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  gap: clamp(0.15rem, 1vw, 0.35rem)
  padding: clamp(0.35rem, 1.8vw, 0.7rem) clamp(0.7rem, 4vw, 1.4rem)
  border: 2px solid #ffd93c
  border-radius: clamp(0.6rem, 3vw, 1rem)
  background-image: linear-gradient(to bottom, rgba(30, 48, 88, 0.97), rgba(14, 24, 48, 0.97))
  box-shadow: 0 0 22px rgba(255, 210, 60, 0.28)

.wave-toast__title
  display: flex
  align-items: center
  gap: 0.4em
  color: #ffd93c
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.04em
  text-align: center
  font-size: clamp(0.75rem, 3.6vw, 1.15rem)
  text-shadow: 2px 2px 0 #000

.wave-toast__bonus
  color: rgb(255, 255, 255)
  background-color: #4fc56e
  border-radius: 999px
  padding: 0 0.4em
  font-size: 0.72em

.wave-toast__tally
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  gap: 0.15rem 0.5rem

.wave-toast__pip
  display: inline-flex
  align-items: center
  gap: 0.2em
  color: #dbe6ff
  font-weight: 900
  font-size: clamp(0.55rem, 2.5vw, 0.78rem)
  text-shadow: 1px 1px 0 #000

.wave-toast__dot
  display: inline-block
  width: 0.55em
  height: 0.55em
  border-radius: 999px
  border: 1px solid rgba(0, 0, 0, 0.5)

// ─── Payout ─────────────────────────────────────────────────────────────────

.wave-toast__payout
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.15rem
  width: 100%
  margin-top: 0.15rem
  padding-top: 0.25rem
  border-top: 1px solid rgba(255, 217, 60, 0.28)

.wave-toast__payout-label
  color: #9fb6de
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.12em
  font-size: clamp(0.42rem, 1.9vw, 0.58rem)

.wave-toast__rewards
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  gap: clamp(0.25rem, 1.6vw, 0.55rem)

// Each payout is a raised chip rather than a bare numeral: the plus, the icon
// and the amount have to read as ONE object that just landed in the player's
// pocket, at a glance, from the far side of the screen.
.wave-toast__reward
  display: inline-flex
  align-items: center
  gap: 0.1em
  padding: clamp(0.1rem, 0.8vw, 0.22rem) clamp(0.3rem, 1.8vw, 0.55rem)
  border: 2px solid rgba(0, 0, 0, 0.45)
  border-radius: 999px
  background-image: linear-gradient(to bottom, rgba(255, 255, 255, 0.14), rgba(0, 0, 0, 0.22))
  font-weight: 900
  font-variant-numeric: tabular-nums
  line-height: 1
  text-shadow: 2px 2px 0 #000
  // Backwards, so the chip is already at rest if animations are suppressed.
  animation: reward-pop 460ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards

  &.is-wood
    color: #ffc27a
    box-shadow: inset 0 0 0 1px rgba(217, 154, 83, 0.5)
  &.is-stone
    color: #dce4ee
    box-shadow: inset 0 0 0 1px rgba(184, 194, 206, 0.5)
  &.is-coin
    color: #ffd93c
    box-shadow: inset 0 0 0 1px rgba(255, 217, 60, 0.55)

.wave-toast__icon
  flex: 0 0 auto
  width: clamp(0.95rem, 4.4vw, 1.45rem)
  height: clamp(0.95rem, 4.4vw, 1.45rem)
  margin-right: 0.1em

// Oversized on purpose. "+" is the entire message — the resource went UP.
.wave-toast__plus
  font-size: clamp(0.85rem, 4vw, 1.35rem)
  line-height: 1

.wave-toast__amount
  font-size: clamp(0.95rem, 4.6vw, 1.55rem)
  line-height: 1

@keyframes reward-pop
  0%
    opacity: 0
    scale: 0.55
    translate: 0 0.5rem
  60%
    opacity: 1
    scale: 1.14
  100%
    opacity: 1
    scale: 1
    translate: 0 0

@media (prefers-reduced-motion: reduce)
  .wave-toast__reward
    animation: none

.toast-enter-active
  transition: opacity 200ms ease-out, translate 260ms cubic-bezier(0.34, 1.56, 0.64, 1)
.toast-leave-active
  transition: opacity 400ms ease-in, translate 400ms ease-in

.toast-enter-from, .toast-leave-to
  opacity: 0
  translate: 0 0.75rem
</style>
