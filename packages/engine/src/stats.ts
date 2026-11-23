import type { ActorId } from './types/ids'
import type { CombatState } from './types/state'
import { Stat } from './types/stats'

/**
 * Resolves an actor's current value for a stat. Stats are derived on read and
 * never persisted; modifiers (equipment, effects, level scaling) will be
 * layered in later. Callers use this for Reflex (reaction delay), Perception
 * (skill reads), Attack/Defense (damage), and so on. Throws if the actor is not
 * present in the combat state.
 */
export function getEffectiveStat(state: CombatState, actorId: ActorId, stat: Stat): number {
  const actor = state.actors[actorId]
  if (actor === undefined) {
    throw new Error(`Unknown actor: ${actorId}`)
  }
  return actor.template.baseStats[stat]
}

/**
 * Returns an actor's effective maximum HP (the Hp stat). Used when
 * initialising health pools and when rendering an actor's status.
 */
export function getMaxHp(state: CombatState, actorId: ActorId): number {
  return getEffectiveStat(state, actorId, Stat.Hp)
}
