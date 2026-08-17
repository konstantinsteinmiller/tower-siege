import type { AllyDef } from './types'

// ─── Allies ─────────────────────────────────────────────────────────────────
//
// The tower cannot answer a trebuchet parked at 20 cells — no turret reaches
// that far, and by design none ever will. Siege engines that stand off exist
// specifically to force the player OUT of the tower, and cavalry is that exit.
//
// They are bought with COINS, not wood or stone, so calling a sortie competes
// directly with the tech tree. That keeps it a real decision rather than a free
// button: every charge is a tech node you didn't buy.
//
// A sortie is temporary. Riders expire after `lifeMs`, so cavalry can never
// become a standing army that replaces the tower — it is an answer to a
// specific threat, used at a specific moment.

export const ALLY_DEFS: Record<string, AllyDef> = {
  cavalry: {
    id: 'cavalry',
    hp: 130,
    // Fast enough to close on a standoff engine before it gets many shots off.
    speed: 2.6,
    damage: 26,
    attackCooldownMs: 620,
    reach: 0.9,
    cost: 40,
    lifeMs: 22_000,
    // Bigger than a Brute (0.85) and short of a Siege Golem (1.45). A horse
    // and an armoured rider are simply larger than the infantry they ride
    // through, and at 0.8 the barding, the shield device and the lance pennon
    // were all detail nobody could resolve — the player was paying forty gold
    // for something smaller than the thing it was killing.
    scale: 1.1,
    palette: 'cavalry'
  }
}

export const allyDef = (id: string): AllyDef => ALLY_DEFS[id] ?? ALLY_DEFS.cavalry!

/** How many riders one purchase sends out. A lone horseman dies to a catapult
 *  crew; a group of three actually reaches it. */
export const CAVALRY_SQUAD = 3
