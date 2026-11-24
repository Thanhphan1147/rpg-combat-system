import type { ActorId } from './types/ids'
import type { CombatState } from './types/state'
import { Stat } from './types/stats'

/**
 * Resolves an actor's current value for a stat from its character template.
 * Stats are derived on read and never persisted; modifiers (equipment, effects,
 * level scaling) will be layered in later. Throws if the actor or its character
 * template is missing.
 */
export function getEffectiveStat(state: CombatState, actorId: ActorId, stat: Stat): number {
  const actor = state.actors[actorId]
  if (actor === undefined) {
    throw new Error(`Unknown actor: ${actorId}`)
  }
  const template = state.content.characters[actor.characterId]
  if (template === undefined) {
    throw new Error(`Unknown character: ${actor.characterId}`)
  }
  return template.baseStats[stat]
}

/**
 * Returns an actor's effective maximum HP (the MaxHp stat). Used when
 * initialising health pools and when rendering an actor's status.
 */
export function getMaxHp(state: CombatState, actorId: ActorId): number {
  return getEffectiveStat(state, actorId, Stat.MaxHp)
}
