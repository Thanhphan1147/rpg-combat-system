import type { ActorId } from './types/ids'
import type { CombatState, Ruleset, TimelineSkill } from './types/state'
import { Stat } from './types/stats'
import { getEffectiveStat } from './stats'

/**
 * Converts a Perception stat into the number of ticks needed to read a skill,
 * using the configured curve with a floor:
 * `clamp(base - scale * perception, floor, infinity)`, at least 1.
 */
export function readTicks(perception: number, rules: Ruleset): number {
  const raw = rules.perception.base - rules.perception.scale * perception
  return Math.max(Math.ceil(raw), Math.ceil(rules.perception.floor), 1)
}

/**
 * Tick at which an observer fully identifies an incoming skill, or `null` if the
 * read cannot complete within the skill's startup window.
 */
export function identifyAt(
  state: CombatState,
  observerId: ActorId,
  incoming: TimelineSkill,
): number | null {
  const skill = state.content.skills[incoming.skillId]
  if (skill === undefined) {
    return null
  }
  const perception = getEffectiveStat(state, observerId, Stat.Perception)
  const ticks = readTicks(perception, state.rules)
  if (ticks > skill.startup) {
    return null
  }
  return incoming.startedAt + ticks
}

export interface PerceptionView {
  identified: boolean
  description: string
}

/**
 * What an observer currently knows about an incoming skill: the precise
 * description once identified, otherwise the vague tell.
 */
export function getPerceptionView(
  state: CombatState,
  observerId: ActorId,
  incoming: TimelineSkill,
): PerceptionView {
  const skill = state.content.skills[incoming.skillId]
  if (skill === undefined) {
    return { identified: false, description: '' }
  }
  const at = identifyAt(state, observerId, incoming)
  const identified = at !== null && state.timeline.tick >= at
  return {
    identified,
    description: identified ? skill.preciseDescription : skill.vagueDescription,
  }
}
