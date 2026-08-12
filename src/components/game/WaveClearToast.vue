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

        div.wave-toast__rewards
          span.wave-toast__reward(class="is-wood") +{{ reward.wood }}
          span.wave-toast__reward(class="is-stone") +{{ reward.stone }}
          span.wave-toast__reward(class="is-coin") +{{ reward.coins }}

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
  max-width: min(92vw, 24rem)

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

.wave-toast__rewards
  display: flex
  align-items: center
  gap: clamp(0.35rem, 2vw, 0.8rem)

.wave-toast__reward
  font-weight: 900
  font-size: clamp(0.65rem, 3vw, 0.95rem)
  text-shadow: 2px 2px 0 #000

  &.is-wood
    color: #d99a53
  &.is-stone
    color: #b8c2ce
  &.is-coin
    color: #ffd93c

.toast-enter-active
  transition: opacity 200ms ease-out, translate 260ms cubic-bezier(0.34, 1.56, 0.64, 1)
.toast-leave-active
  transition: opacity 400ms ease-in, translate 400ms ease-in

.toast-enter-from, .toast-leave-to
  opacity: 0
  translate: 0 -0.75rem
</style>
