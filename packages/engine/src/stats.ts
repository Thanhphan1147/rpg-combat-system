import type { ActorId } from './types/ids'
import type { CombatState } from './types/state'
import { Stat } from './types/stats'
import type { StatMods } from './types/stats'

export function sumModifiers(mods: readonly StatMods[], stat: Stat): number {
  let total = 0
  for (const mod of mods) {
    total += mod[stat] ?? 0
  }
  return total
}

export function getEffectiveStat(state: CombatState, actorId: ActorId, stat: Stat): number {
  const actor = state.actors[actorId]
  if (actor === undefined) {
    throw new Error(`Unknown actor: ${actorId}`)
  }

  const equipmentMods: StatMods[] = actor.template.equipmentIds.map(
    (equipmentId) => state.content.equipment[equipmentId]?.statMods ?? {},
  )
  const effectMods = actor.runtime.effects.map((effect) => effect.statMods)

  return (
    actor.template.baseStats[stat] +
    sumModifiers(equipmentMods, stat) +
    sumModifiers(effectMods, stat)
  )
}

export function getMaxHp(state: CombatState, actorId: ActorId): number {
  return getEffectiveStat(state, actorId, Stat.Hp)
}
