import type { SkillDef } from './types/skill'
import type { CombatState } from './types/state'

/**
 * Cooldown map after using a skill. Skills that share a `cooldownGroup` (e.g.
 * every defence) all become ready at the same tick, so dodge and block cannot
 * be alternated freely.
 */
export function cooldownMapAfter(
  state: CombatState,
  current: Partial<Record<string, number>>,
  skill: SkillDef,
  readyAt: number,
): Partial<Record<string, number>> {
  const next: Partial<Record<string, number>> = { ...current, [skill.id]: readyAt }
  if (skill.cooldownGroup !== undefined) {
    for (const other of Object.values(state.content.skills)) {
      if (other.cooldownGroup === skill.cooldownGroup) {
        next[other.id] = readyAt
      }
    }
  }
  return next
}
