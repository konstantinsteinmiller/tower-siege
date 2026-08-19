<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BlockTile from '@/components/game/BlockTile.vue'
import {
  blockDef, GATE_ID, sellRefund, ENHANCED_DAMAGE_MUL, ROOF_TOP_DEFENSE_DIV,
  FORTIFY_TARGET, canFortifyType, fortifyCost,
  MAX_BLOCK_LEVEL, blockUpgradeCost, upgradePowerMul, upgradeArmorBonus,
  tierOf, mergePowerMul
} from '@/game/blocks'
import {
  damageMul, fireRateMul, rangeMul, splashMul, thornsMul, armorBonus,
  buffPowerMul, economyMul, availableBlocks,
  mergeDamageMul
} from '@/use/useTowerProgress'
import { runCoins, towerVersion, canFortifyBlock } from '@/use/useTowerGame'
import type { Block } from '@/game/types'

/**
 * Stat card for the selected block (reference image 3).
 *
 * Every number here is the EFFECTIVE one — base stats run through the player's
 * tech, the reinforced multiplier, the gable's HP bonus and whatever ranks the
 * block has been upgraded to. Showing base numbers would quietly make the tech
 * tree, the rewarded reinforced hand AND the upgrade button all feel like they
 * do nothing, because the card is where the player goes to check.
 *
 * Rows that are above the block's printed base are flagged `boosted` and drawn
 * in gold, so "why is this crate on 210 HP" answers itself.
 */

interface Props {
  block: Block | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'sell'): void
  (e: 'close'): void
  (e: 'upgrade'): void
  (e: 'fortify'): void
}>()

const { t } = useI18n()

const def = computed(() => (props.block ? blockDef(props.block.typeId) : null))
const isGate = computed(() => props.block?.typeId === GATE_ID)

/**
 * A SNAPSHOT of the live block, re-read whenever the tower changes.
 *
 * `props.block` is a PLAIN object out of the simulation's non-reactive grid, so
 * mutating its rank or max HP fires no dependency of its own. `towerVersion` is
 * bumped by every structural change including an upgrade, which is what makes
 * this card repaint the instant the player buys a rank.
 *
 * It must return a NEW object rather than the block itself. A computed that
 * re-evaluates to the identical reference is treated as unchanged by Vue and
 * notifies nobody — which is exactly what happened: the upgrade charged the
 * gold, the simulation applied the rank, and the card kept showing the old
 * numbers because `props.block` was still the same object it always was.
 */
const live = computed(() => {
  void towerVersion.value
  const b = props.block
  if (!b) return null
  return {
    typeId: b.typeId,
    hp: b.hp,
    maxHp: b.maxHp,
    roof: b.roof === true,
    enhanced: b.enhanced === true,
    level: b.level ?? 0,
    tier: tierOf(b.tier),
    // Derived from where the block STANDS, so it has to come off the live
    // instance rather than being recomputed from its type.
    buffMul: b.buffMul ?? 1,
    buffArmor: b.buffArmor ?? 0,
    // The footprint, so the chip can say what SHAPE the weld produced —
    // a 4×1 battery and a 2×2 bastion are both tier 3 and play differently.
    w: b.w ?? 1,
    h: b.h ?? 1
  }
})

const level = computed(() => live.value?.level ?? 0)
const isMaxLevel = computed(() => level.value >= MAX_BLOCK_LEVEL)

interface Row { key: string; value: string; boosted?: boolean }

const stats = computed<Row[]>(() => {
  const d = def.value
  const b = live.value
  if (!d || !b) return []

  // A merged block's output curve, plus the forge-weld tech that rides on it.
  const merge = b.tier > 1 ? mergePowerMul(b.tier) * mergeDamageMul.value : 1
  const power = upgradePowerMul(b.level) * merge
  const enh = b.enhanced ? ENHANCED_DAMAGE_MUL : 1
  const rows: Row[] = [
    // `maxHp` already carries tech, the reinforced bonus, the gable and the
    // ranks — it is the number the simulation actually defends with.
    { key: 'hp', value: `${Math.ceil(b.hp)} / ${b.maxHp}`, boosted: b.maxHp > d.hp }
  ]

  // Armour is FLAT damage reduction and the Iron Plating node adds it to every
  // block, including ones whose printed armour is zero — so this row has to be
  // computed, never read straight off the definition.
  // Neighbouring buff blocks raise armour flatly and everything else by a
  // product — the card has to show the numbers the block is actually fighting
  // with, or a banner is a stat sheet the player cannot check.
  const armor = (d.armor ?? 0) + armorBonus.value + upgradeArmorBonus(b.level) + b.buffArmor
  if (armor > 0) rows.push({ key: 'armor', value: `${armor}`, boosted: armor > (d.armor ?? 0) })

  // A gable divides every hit that lands on top of it by three.
  if (b.roof) rows.push({ key: 'topDefense', value: `×${ROOF_TOP_DEFENSE_DIV}`, boosted: true })

  if (d.weapon) {
    const dmg = d.weapon.damage * damageMul.value * enh * power * b.buffMul
    rows.push({ key: 'dmg', value: `${Math.round(dmg)}`, boosted: dmg > d.weapon.damage + 0.5 })
    // Cooldown shrinks as fire rate grows, so present it already divided.
    rows.push({
      key: 'cooldown',
      value: `${(d.weapon.cooldownMs / fireRateMul.value / 1000).toFixed(1)}s`,
      boosted: fireRateMul.value > 1
    })
    rows.push({
      key: 'range',
      value: `${(d.weapon.range * rangeMul.value).toFixed(1)}`,
      boosted: rangeMul.value > 1
    })
    if (d.weapon.splash) {
      rows.push({
        key: 'splash',
        value: `${(d.weapon.splash * splashMul.value).toFixed(1)}`,
        boosted: splashMul.value > 1
      })
    }
  }
  if (d.economy) {
    const yieldMul = power * economyMul.value
    const yields: Array<[string, number | undefined]> = [
      ['yieldWood', d.economy.wood],
      ['yieldStone', d.economy.stone],
      ['yieldGold', d.economy.gold],
      ['yieldCoins', d.economy.coins]
    ]
    for (const [key, base] of yields) {
      if (!base) continue
      rows.push({ key, value: `+${Math.round(base * yieldMul)}`, boosted: yieldMul > 1 })
    }
  }

  // What this block gives its neighbours — the whole value of a buff block, and
  // invisible everywhere else on the card because it changes nothing about the
  // block itself.
  if (d.buff) {
    const mul = 1 + (d.buff.statMul - 1) * buffPowerMul.value
    rows.push({
      key: 'buff',
      value: `×${mul.toFixed(2)} · +${d.buff.armor}`,
      boosted: buffPowerMul.value > 1
    })
  }
  if (d.utility?.repairPerWave) {
    rows.push({
      key: 'repair',
      value: `+${Math.round(d.utility.repairPerWave * power)}`,
      boosted: power > 1
    })
  }
  if (d.utility?.deathExplosion) {
    rows.push({
      key: 'blast',
      value: `${Math.round(d.utility.deathExplosion.damage * power)}`,
      boosted: power > 1
    })
  }
  // Thorns is shown already multiplied, like weapon damage — the number in the
  // panel should be the number the enemy actually takes.
  if (d.utility?.thorns) {
    const thorns = d.utility.thorns * thornsMul.value * power
    rows.push({ key: 'thorns', value: `${Math.round(thorns)}`, boosted: thorns > d.utility.thorns + 0.5 })
  }
  return rows
})

const upgradeCost = computed(() =>
  live.value ? blockUpgradeCost(live.value.typeId, level.value) : Infinity
)
const canUpgrade = computed(() =>
  !isMaxLevel.value && runCoins.value >= upgradeCost.value
)

/**
 * Turning this wall into a spiked one.
 *
 * Only offered on a plain wall, and only once the spiked wall itself is
 * unlocked — the button is a shortcut past the offer deck, not past the tech
 * node. Hidden rather than disabled when it does not apply: a greyed-out
 * "Fortify" on a cannon is a question the card should never raise.
 */
const fortify = computed(() => {
  const b = props.block
  void towerVersion.value
  if (!b || !canFortifyType(b.typeId) || !availableBlocks.value.has(FORTIFY_TARGET)) return null
  return {
    cost: fortifyCost(b.typeId, (b.w ?? 1) * (b.h ?? 1)),
    can: canFortifyBlock(b.c, b.r)
  }
})

const refund = computed(() =>
  live.value
    ? sellRefund(live.value.typeId, live.value.w * live.value.h, live.value.level)
    : { wood: 0, stone: 0, coins: 0 }
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

        //- Why this block's numbers are above the printed base. Chips rather
        //- than prose: the card is read mid-siege with a wave incoming.
        div.inspector__tags(v-if="live?.enhanced || live?.roof || level > 0 || (live?.tier ?? 1) > 1")
          span.inspector__tag.is-merge(v-if="(live?.tier ?? 1) > 1")
            | {{ t('blocks.mergeTier', { n: live?.tier ?? 1 }) }}
            //- Pure geometry — no words to translate, and the only honest way
            //- to say "this one is long" vs "this one is square".
            span.inspector__span(v-if="(live?.w ?? 1) * (live?.h ?? 1) > 1")
              | &nbsp;· {{ live?.w }}×{{ live?.h }}
          span.inspector__tag.is-gold(v-if="live?.enhanced") {{ t('blocks.reinforced') }}
          span.inspector__tag.is-red(v-if="live?.roof") {{ t('blocks.roofed') }}
          span.inspector__tag.is-gold(v-if="level > 0")
            | {{ t('blocks.rank', { n: level, max: MAX_BLOCK_LEVEL }) }}

        dl.inspector__stats
          template(v-for="row in stats" :key="row.key")
            dt {{ t(`blocks.stats.${row.key}`) }}
            dd(:class="{ 'is-boosted': row.boosted }") {{ row.value }}

        //- Spend the run's gold on the tower you already have. Sits above
        //- Sell because it is the constructive half of the pair.
        button.inspector__upgrade(
          type="button"
          :class="{ 'is-maxed': isMaxLevel }"
          :disabled="!canUpgrade"
          @click="emit('upgrade')"
        )
          template(v-if="isMaxLevel")
            span {{ t('blocks.upgradeMax') }}
          template(v-else)
            svg.inspector__upgrade-icon(viewBox="0 0 24 24" fill="currentColor" aria-hidden="true")
              path(d="M12 3 21 12h-5v8h-8v-8H3z")
            span {{ t('blocks.upgrade') }}
            span.inspector__upgrade-cost
              i.inspector__dot.is-gold
              | {{ upgradeCost }}

        //- Turn a plain wall into a spiked one without waiting for the deck to
        //- deal one. Sits between Upgrade and Sell because it is the third
        //- thing a player can do to a block they already own.
        button.inspector__fortify(
          v-if="fortify"
          type="button"
          :disabled="!fortify.can"
          @click="emit('fortify')"
        )
          span {{ t('blocks.fortify') }}
          span.inspector__fortify-cost
            template(v-if="fortify.cost.wood > 0")
              span {{ fortify.cost.wood }}
              i.inspector__dot.is-wood
            template(v-if="fortify.cost.stone > 0")
              span {{ fortify.cost.stone }}
              i.inspector__dot.is-stone
            template(v-if="fortify.cost.coins > 0")
              span {{ fortify.cost.coins }}
              i.inspector__dot.is-gold

        //- Rank pips, so "how much more is there" is answerable without maths.
        div.inspector__pips(v-if="!isMaxLevel || level > 0" :aria-hidden="true")
          i.inspector__pip(
            v-for="n in MAX_BLOCK_LEVEL"
            :key="n"
            :class="{ 'is-on': n <= level }"
          )

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

    // Anything above the block's printed base — tech, a gable, the reinforced
    // hand, a bought rank. The arrow carries the meaning where colour alone
    // would not (colour-blind players, washed-out phone screens in daylight).
    &.is-boosted
      color: #ffd93c

      &::before
        content: '▲'
        margin-right: 0.25em
        font-size: 0.7em
        vertical-align: 0.08em

.inspector__tags
  display: flex
  flex-wrap: wrap
  gap: 0.2rem

.inspector__tag
  padding: 0.05rem 0.35rem
  border-radius: 999px
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.04em
  font-size: clamp(0.4rem, 1.9vw, 0.55rem)

  &.is-gold
    background-color: rgba(255, 217, 60, 0.18)
    border: 1px solid rgba(255, 217, 60, 0.55)
    color: #ffd93c
  &.is-red
    background-color: rgba(224, 87, 77, 0.18)
    border: 1px solid rgba(224, 87, 77, 0.6)
    color: #ff9a92
  &.is-merge
    background-color: rgba(255, 240, 168, 0.22)
    border: 1px solid rgba(255, 240, 168, 0.75)
    color: #fff0a8

.inspector__span
  opacity: 0.75
  font-variant-numeric: tabular-nums

.inspector__upgrade
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  gap: 0.2em 0.35em
  min-height: 1.9rem
  margin-top: 0.15rem
  padding: 0.2rem 0.5rem
  border: 2px solid #0f1a30
  border-radius: 0.5rem
  background-image: linear-gradient(to bottom, #6fe08a, #1f8f4d)
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

  // Disabled means "you cannot afford this yet", which is information, so the
  // price stays legible rather than being greyed into the background.
  &:disabled
    background-image: linear-gradient(to bottom, #4a5a72, #2b3548)
    cursor: default
    opacity: 0.85

    &:active
      translate: 0
      scale: 1

  &.is-maxed
    background-image: linear-gradient(to bottom, #c9a227, #7a5f12)
    opacity: 1

.inspector__upgrade-icon
  width: 0.85em
  height: 0.85em
  flex: 0 0 auto

.inspector__upgrade-cost
  display: inline-flex
  align-items: center
  gap: 0.15em
  font-variant-numeric: tabular-nums

.inspector__pips
  display: flex
  justify-content: center
  gap: 0.2rem

.inspector__pip
  width: 0.85rem
  height: 0.22rem
  border-radius: 999px
  background-color: rgba(255, 255, 255, 0.16)

  &.is-on
    background-color: #ffd93c

// Wraps: a three-resource refund (the Mint and the Bombard both return wood,
// stone AND gold) alongside a long localised verb can outrun the panel width.
// Steel-blue, between the green Upgrade and the red Sell: it is neither
// growth nor disposal, it is a conversion.
.inspector__fortify
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  gap: 0.2em 0.4em
  min-height: 1.9rem
  margin-top: 0.25rem
  padding: 0.2rem 0.5rem
  border: 2px solid #0f1a30
  border-radius: 0.5rem
  background-image: linear-gradient(to bottom, #7fa8c8, #3d6a92)
  color: #fff
  font-weight: 900
  text-transform: uppercase
  font-size: clamp(0.5rem, 2.3vw, 0.7rem)
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6)
  cursor: pointer
  -webkit-tap-highlight-color: transparent

  &:active:not(:disabled)
    translate: 0 2px
    scale: 0.97

  &:disabled
    background-image: linear-gradient(to bottom, #4a5a72, #2b3548)
    cursor: not-allowed
    opacity: 0.85

.inspector__fortify-cost
  display: inline-flex
  align-items: center
  gap: 0.15em 0.3em
  font-variant-numeric: tabular-nums

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
