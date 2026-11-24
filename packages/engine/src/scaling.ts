import type { ActorId } from './types/ids'
import type { SkillDef } from './types/skill'
import type { CombatState } from './types/state'
import { Stat } from './types/stats'
import { getEffectiveStat } from './stats'

/** Durations are expressed in centiticks; 100 centiticks make one displayed tick. */
export const CENTITICKS_PER_TICK = 100

export interface PhaseDurations {
  startup: number
  delivery: number
  ending: number
}

/**
 * Applies the actor's Speed to a skill's phases. One Speed point removes
 * `speedScaling.rate` centiticks; the discount is spent on startup first (never
 * below `startupFloor`), then delivery, then ending. With rate 0 this is a
 * no-op, which keeps unit tests focused on the timeline.
 */
export function scalePhases(
  state: CombatState,
  actorId: ActorId,
  skill: SkillDef,
): PhaseDurations {
  const { rate, startupFloor } = state.rules.speedScaling
  let remaining = Math.max(
    0,
    Math.floor(getEffectiveStat(state, actorId, Stat.Speed) * rate),
  )

  const spend = (value: number, floor: number): number => {
    const reducible = Math.max(0, value - floor)
    const amount = Math.min(remaining, reducible)
    remaining -= amount
    return value - amount
  }

  return {
    startup: spend(skill.startup, startupFloor),
    delivery: spend(skill.delivery, 0),
    ending: spend(skill.ending, 0),
  }
}
