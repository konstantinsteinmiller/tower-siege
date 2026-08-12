<script setup lang="ts">
import { ref, computed } from 'vue'
import FHudButton from '@/components/atoms/FHudButton.vue'
import FHudBadge from '@/components/atoms/FHudBadge.vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useMissions from '@/use/useMissions'
import useSounds from '@/use/useSound'

const emit = defineEmits<{
  (e: 'coins-awarded', sourceEl: HTMLElement): void
  /** Fired just before the panel is shown, so the owner can flush live
   *  progress into the dailies — otherwise the numbers are as stale as the
   *  last wave clear. */
  (e: 'opened'): void
}>()

const { t } = useI18n()
const { playSound } = useSounds()
const { missions, claim, claimableMissionCount } = useMissions()

const isOpen = ref(false)

const open = (): void => {
  // Ask for a refresh BEFORE showing, so the first frame the player sees is
  // already correct rather than visibly ticking up a moment later.
  emit('opened')
  isOpen.value = true
}
const rootEl = ref<HTMLElement | null>(null)

interface MissionView {
  index: number
  type: string
  label: string
  progress: number
  target: number
  fraction: number
  reward: number
  claimed: boolean
  claimable: boolean
}

const cards = computed<MissionView[]>(() =>
  missions.value.map((m, i) => {
    // Defensive: never let a stray NaN reach the template (the "NaN /" bug).
    const target = Number.isFinite(m.target) && m.target > 0 ? m.target : 1
    const progress = Number.isFinite(m.progress) ? Math.max(0, m.progress) : 0
    return {
      index: i,
      type: m.type,
      label: t('missions.types.' + m.type, { n: target }),
      progress: Math.min(progress, target),
      target,
      fraction: Math.max(0, Math.min(1, progress / target)),
      reward: m.reward,
      claimed: m.claimed,
      claimable: !m.claimed && progress >= target
    }
  })
)

const onClaim = (index: number): void => {
  if (claim(index)) {
    playSound('reward-continue', 0.06)
    if (rootEl.value) emit('coins-awarded', rootEl.value)
  } else {
    playSound('barricade', 0.04)
  }
}
</script>

<template lang="pug">
  FHudButton(
    ref="rootEl"
    tone="blue"
    :attention="claimableMissionCount > 0"
    :aria-label="t('missions.title')"
    @click="open"
  )
    //- Checklist / clipboard glyph for the missions board.
    svg(viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white")
      path(d="M9 3 h6 v3 h-6 z M6 5 h2 M16 5 h2 v16 h-12 v-16 h2")
      path(d="M9 11 l1.5 1.5 L13 10 M9 16 l1.5 1.5 L13 15")
    template(#badge)
      FHudBadge(v-if="claimableMissionCount > 0" tone="red") {{ claimableMissionCount }}

  FModal(v-model="isOpen" :title="t('missions.title')")
    div.flex.flex-col.gap-2.p-2
      p.text-center.text-white.game-text.opacity-80(class="text-xs sm:text-sm") {{ t('missions.subtitle') }}
      div.flex.flex-col.gap-2
        div.flex.items-center.gap-3.rounded-xl.border-2.p-2.text-left(
          v-for="card in cards"
          :key="card.index"
          class="bg-black/30"
          :class="card.claimable ? 'border-yellow-300' : 'border-white/15'"
        )
          div.flex-1.min-w-0
            div.font-black.game-text.text-white(class="text-xs sm:text-sm") {{ card.label }}
            //- Progress bar
            div.relative.mt-1.h-2.w-full.overflow-hidden.rounded-full(class="bg-black/40")
              div.absolute.inset-y-0.left-0.rounded-full(
                class="bg-gradient-to-r from-yellow-300 to-amber-500"
                :style="{ width: (card.fraction * 100) + '%' }"
              )
            div.text-white.game-text.opacity-70(class="text-[10px] mt-0.5") {{ card.progress }} / {{ card.target }}
          div.shrink-0.flex.flex-col.items-end.gap-1
            div.flex.items-center.gap-1
              IconCoin(class="w-3.5 h-3.5 text-yellow-300")
              span.text-yellow-200.game-text.font-black(class="text-xs") {{ card.reward }}
            div.text-center.text-emerald-300.font-black.game-text(v-if="card.claimed" class="text-[10px]") {{ t('missions.done') }}
            FButton(
              v-else-if="card.claimable"
              size="sm"
              @click="onClaim(card.index)"
            ) {{ t('missions.claim') }}
</template>

<style scoped lang="sass">
</style>
