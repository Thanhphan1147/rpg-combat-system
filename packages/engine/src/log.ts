import type { CombatEvent } from './types/events'
import type { CombatState } from './types/state'

/** Appends a narration event at the current tick. Returns a new state. */
export function emit(state: CombatState, event: CombatEvent): CombatState {
  return { ...state, log: [...state.log, { tick: state.timeline.tick, event }] }
}
