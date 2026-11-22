import type { ActorId } from './types/ids'
import type { CombatState } from './types/state'
import { Stat } from './types/stats'
import type { StatMods } from './types/stats'

/**
 * Sums a single stat across a list of partial stat modifiers, treating missing
 * entries as zero. Used by {@link getEffectiveStat} to fold equipment bonuses
 * into an actor's base stat.
 */
export function sumModifiers(mods: readonly StatMods[], stat: Stat): number {
  let total = 0
  for (const mod of mods) {
    total += mod[stat] ?? 0
  }
  return total
}

/**
 * Resolves an actor's live value for a stat as base + equipment modifiers.
 * Stats are derived on read and never persisted. Callers use this for Reflex
 * (reaction delay), Perception (skill reads), Attack/Defense (damage), and so
 * on. Throws if the actor is not present in the combat state.
 */
export function getEffectiveStat(state: CombatState, actorId: ActorId, stat: Stat): number {
  const actor = state.actors[actorId]
  if (actor === undefined) {
    throw new Error(`Unknown actor: ${actorId}`)
  }

  const equipmentMods: StatMods[] = actor.template.equipmentIds.map(
    (equipmentId) => state.content.equipment[equipmentId]?.statMods ?? {},
  )

  return actor.template.baseStats[stat] + sumModifiers(equipmentMods, stat)
}

/**
 * Returns an actor's effective maximum HP (the Hp stat). Used when
 * initialising health pools and when rendering an actor's status.
 */
export function getMaxHp(state: CombatState, actorId: ActorId): number {
  return getEffectiveStat(state, actorId, Stat.Hp)
}
