import type { Ruleset } from '@rpg/engine'

/**
 * Shared tuning for the bundled encounters. Durations are in centiticks
 * (100 = one displayed tick).
 */
export const standardRules: Ruleset = {
  reflex: { base: 800, scale: 5, floor: 100 },
  perception: { base: 1200, scale: 5, floor: 100 },
  interruptDuringStartup: { damageMultiplier: 1.5, stagger: 400 },
  speedScaling: { rate: 1, startupFloor: 100 },
  damageMultiplier: 3,
  enemyDamageMultiplier: 1.5,
}
