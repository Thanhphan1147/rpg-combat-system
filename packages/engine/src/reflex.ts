import type { Ruleset } from './types/state'

/**
 * Converts a Reflex stat into a reaction delay in whole ticks using the
 * configured diminishing curve with a floor:
 * `clamp(base - scale * reflex, floor, infinity)`.
 *
 * Lower is better: a higher Reflex reaches the floor sooner. Callers use this
 * to work out when a reactor may begin responding to an incoming skill.
 */
export function reactionDelay(reflex: number, rules: Ruleset): number {
  const raw = rules.reflex.base - rules.reflex.scale * reflex
  return Math.max(Math.ceil(raw), Math.ceil(rules.reflex.floor), 0)
}

/**
 * Absolute tick at which an actor may first react to a skill that started at
 * `startedAt`: the skill's start plus the actor's reflex delay.
 */
export function reactionAt(startedAt: number, reflex: number, rules: Ruleset): number {
  return startedAt + reactionDelay(reflex, rules)
}
