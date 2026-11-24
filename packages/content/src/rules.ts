import type { Ruleset } from '@rpg/engine'

/** Shared tuning for the bundled encounters. */
export const standardRules: Ruleset = {
  reflex: { base: 12, scale: 0.5, floor: 1 },
  perception: { base: 12, scale: 0.5, floor: 1 },
  interruptDuringStartup: { damageMultiplier: 1.5, stagger: 4 },
}
