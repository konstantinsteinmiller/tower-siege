<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BlockTile from '@/components/game/BlockTile.vue'
import { blockDef, GATE_ID, sellRefund } from '@/game/blocks'
import { damageMul, fireRateMul, rangeMul, thornsMul } from '@/use/useTowerProgress'
import type { Block } from '@/game/types'

/**
 * Stat card for the selected block (reference image 3).
 *
 * Numbers shown are the EFFECTIVE values — base stats multiplied by the
 * player's tech. Showing the base numbers here would quietly make the entire
 * tech tree feel like it does nothing.
 */

interface Props {
  block: Block | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'sell'): void; (e: 'close'): void }>()

const { t } = useI18n()

const def = computed(() => (props.block ? blockDef(props.block.typeId) : null))
const isGate = computed(() => props.block?.typeId === GATE_ID)

const stats = computed(() => {
  const d = def.value
  const b = props.block
  if (!d || !b) return []

  const rows: Array<{ key: string; value: string }> = [
    { key: 'hp', value: `${Math.ceil(b.hp)} / ${b.maxHp}` }
  ]
  if (d.armor) rows.push({ key: 'armor', value: `${d.armor}` })

  if (d.weapon) {
    rows.push({ key: 'dmg', value: `${Math.round(d.weapon.damage * damageMul.value)}` })
    // Cooldown shrinks as fire rate grows, so present it already divided.
    rows.push({ key: 'cooldown', value: `${(d.weapon.cooldownMs / fireRateMul.value / 1000).toFixed(1)}s` })
    rows.push({ key: 'range', value: `${(d.weapon.range * rangeMul.value).toFixed(1)}` })
    if (d.weapon.splash) rows.push({ key: 'splash', value: `${d.weapon.splash.toFixed(1)}` })
  }
  if (d.economy) {
    if (d.economy.wood) rows.push({ key: 'yieldWood', value: `+${d.economy.wood}` })
    if (d.economy.stone) rows.push({ key: 'yieldStone', value: `+${d.economy.stone}` })
    if (d.economy.coins) rows.push({ key: 'yieldCoins', value: `+${d.economy.coins}` })
  }
  if (d.utility?.repairPerWave) rows.push({ key: 'repair', value: `+${d.utility.repairPerWave}` })
  if (d.utility?.deathExplosion) {
    rows.push({ key: 'blast', value: `${d.utility.deathExplosion.damage}` })
  }
  // Thorns is shown already multiplied by the tech rank, like weapon damage —
  // the number in the panel should be the number the enemy actually takes.
  if (d.utility?.thorns) {
    rows.push({ key: 'thorns', value: `${Math.round(d.utility.thorns * thornsMul.value)}` })
  }
  return rows
})

const refund = computed(() =>
  props.block ? sellRefund(props.block.typeId) : { wood: 0, stone: 0, coins: 0 }
)
</script>

<template lang="pug">
  Transition(name="inspector")
    div.inspector(v-if="block")
      span.inspector__shadow(aria-hidden="true")
      div.inspector__body
        div.inspector__head
          BlockTile(:type-id="block.typeId" :size="34")
          div.inspector__title
            span.inspector__name {{ t(`blocks.names.${block.typeId}`) }}
            span.inspector__kind {{ t(`blocks.kinds.${def?.kind}`) }}
          button.inspector__close(
            type="button"
            :aria-label="t('close')"
            @click="emit('close')"
          )
            svg(viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round")
              path(d="M6 18L18 6M6 6l12 12")

        dl.inspector__stats
          template(v-for="row in stats" :key="row.key")
            dt {{ t(`blocks.stats.${row.key}`) }}
            dd {{ row.value }}

        //- The Gate is the run's lose condition and can never be sold.
        button.inspector__sell(
          v-if="!isGate"
          type="button"
          @click="emit('sell')"
        )
          span {{ t('blocks.sell') }}
          span.inspector__sell-refund
            span(v-if="refund.wood > 0") +{{ refund.wood }}
            i.inspector__dot(v-if="refund.wood > 0" class="is-wood")
            span(v-if="refund.stone > 0") +{{ refund.stone }}
            i.inspector__dot(v-if="refund.stone > 0" class="is-stone")
            span(v-if="refund.coins > 0") +{{ refund.coins }}
            i.inspector__dot(v-if="refund.coins > 0" class="is-gold")
</template>

<style scoped lang="sass">
.inspector
  position: relative
  pointer-events: auto
  width: clamp(9.5rem, 46vw, 14rem)

.inspector__shadow
  position: absolute
  inset: 0
  transform: translateY(3px)
  border-radius: clamp(0.5rem, 2.4vw, 0.9rem)
  background-color: #0d1830

.inspector__body
  position: relative
  display: flex
  flex-direction: column
  gap: clamp(0.25rem, 1.2vw, 0.45rem)
  padding: clamp(0.35rem, 1.8vw, 0.65rem)
  border: 2px solid #0f1a30
  border-radius: clamp(0.5rem, 2.4vw, 0.9rem)
  background-image: linear-gradient(to bottom, rgba(38, 56, 96, 0.96), rgba(18, 30, 56, 0.96))

.inspector__head
  display: flex
  align-items: center
  gap: clamp(0.25rem, 1.4vw, 0.5rem)

.inspector__title
  display: flex
  flex-direction: column
  min-width: 0
  flex: 1

.inspector__name
  color: #fff
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.03em
  font-size: clamp(0.7rem, 3.2vw, 0.95rem)
  line-height: 1.1
  text-shadow: 2px 2px 0 #000
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.inspector__kind
  color: #9fb6de
  text-transform: uppercase
  letter-spacing: 0.08em
  font-size: clamp(0.45rem, 2vw, 0.6rem)

.inspector__close
  flex: 0 0 auto
  display: flex
  align-items: center
  justify-content: center
  width: 1.5rem
  height: 1.5rem
  min-width: 1.5rem
  min-height: 1.5rem
  padding: 0
  border: 0
  border-radius: 0.35rem
  background-color: rgba(255, 255, 255, 0.1)
  color: #cfe0ff
  cursor: pointer

  svg
    width: 55%
    height: 55%

  &:active
    scale: 0.9

.inspector__stats
  display: grid
  grid-template-columns: 1fr auto
  gap: 0.1rem clamp(0.3rem, 2vw, 0.7rem)
  margin: 0

  dt
    color: #9fb6de
    text-transform: uppercase
    letter-spacing: 0.05em
    font-size: clamp(0.45rem, 2.1vw, 0.62rem)
    text-align: left

  dd
    margin: 0
    color: #fff
    font-weight: 900
    font-variant-numeric: tabular-nums
    font-size: clamp(0.55rem, 2.5vw, 0.75rem)
    text-align: right

// Wraps: a three-resource refund (the Mint and the Bombard both return wood,
// stone AND gold) alongside a long localised verb can outrun the panel width.
.inspector__sell
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  gap: 0.2em 0.4em
  min-height: 1.9rem
  margin-top: 0.1rem
  padding: 0.2rem 0.5rem
  border: 2px solid #0f1a30
  border-radius: 0.5rem
  background-image: linear-gradient(to bottom, #ff8a5a, #c62828)
  color: #fff
  font-weight: 900
  text-transform: uppercase
  font-size: clamp(0.5rem, 2.3vw, 0.7rem)
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6)
  cursor: pointer
  -webkit-tap-highlight-color: transparent

  &:active
    translate: 0 2px
    scale: 0.97

.inspector__sell-refund
  display: inline-flex
  align-items: center
  gap: 0.15em

.inspector__dot
  display: inline-block
  width: 0.5em
  height: 0.5em
  border-radius: 999px

  &.is-wood
    background-color: #a9682f
  &.is-stone
    background-color: #cbd3dd
  &.is-gold
    background-color: #ffd93c

.inspector-enter-active, .inspector-leave-active
  transition: opacity 160ms ease-out, translate 160ms ease-out

.inspector-enter-from, .inspector-leave-to
  opacity: 0
  translate: -0.5rem 0
</style>
