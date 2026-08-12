<script setup lang="ts">
import { mobileCheck } from '@/utils/function'
import { isMobilePortrait, isMobileLandscape } from '@/use/useUser'
import { isMuted, toggleMute } from '@/use/useCrazyMuteSync'
import { isMobileAudioMuted, toggleMobileAudioMute } from '@/use/useMobileAudioMute'
</script>

<template lang="pug">
  div.flex.flex-col.items-end.gap-1
    //- Desktop: volume-based mute (Web Audio gain works here).
    button.mute-btn.rounded-full.backdrop-blur-sm.transition-all.cursor-pointer(
      v-if="!mobileCheck()"
      class="bg-black/20 hover:bg-black/40 active:scale-95 pointer-events-auto"
      @click="toggleMute"
    )
      span.mute-btn__icon {{ isMuted ? '🔇': '🔊' }}
    //- Mobile: hard silence toggle. The OS volume rocker owns the device level,
    //- so this suspends all engine audio + blocks new music/SFX instead of
    //- changing volume — letting players run their own music app.
    button.mute-btn.rounded-full.backdrop-blur-sm.transition-all.cursor-pointer(
      v-else-if="isMobilePortrait || isMobileLandscape"
      class="bg-black/20 hover:bg-black/40 active:scale-95 pointer-events-auto"
      @click="toggleMobileAudioMute"
    )
      span.mute-btn__icon {{ isMobileAudioMuted ? '🔇': '🔊' }}
</template>

<style scoped lang="sass">
// Sized deliberately, not by its glyph.
//
// `p-2` around a `text-2xl` emoji made this 49 px wide — the largest control in
// the bottom row, and by some margin the least important one in it. Explicit
// box sizing puts it a step BELOW the action buttons beside it, which is where
// a rarely-touched toggle belongs; 2.25 rem still clears a comfortable thumb.
.mute-btn
  display: inline-flex
  align-items: center
  justify-content: center
  width: clamp(2.25rem, 9.2vw, 2.6rem)
  height: clamp(2.25rem, 9.2vw, 2.6rem)
  padding: 0

.mute-btn__icon
  font-size: clamp(1rem, 4.4vw, 1.35rem)
  line-height: 1
</style>
