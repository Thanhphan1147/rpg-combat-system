import type { ActorId, InstanceId } from './types/ids'
import type { CombatState, TimelineSkill } from './types/state'

/**
 * A scheduled point on the timeline. `connect` is when an active skill's
 * delivery ends (the hit resolves); `end` is when its ending finishes and it
 * leaves the timeline.
 */
export type Transition =
  | { kind: 'connect'; tick: number; instanceId: InstanceId }
  | { kind: 'end'; tick: number; instanceId: InstanceId }

const TRANSITION_PRIORITY: Record<Transition['kind'], number> = {
  connect: 0,
  end: 1,
}

/**
 * Absolute tick at which an active skill connects, derived from its start and
 * the skill's `startup + delivery`. Throws if the skill is missing from content.
 */
export function skillConnectAt(state: CombatState, skill: TimelineSkill): number {
  const def = state.content.skills[skill.skillId]
  if (def === undefined) {
    throw new Error(`Unknown skill: ${skill.skillId}`)
  }
  return skill.startedAt + def.startup + def.delivery
}

/**
 * Deterministic ordering for transitions: earliest tick first, then kind
 * (connect before end), then instance id. Used by {@link nextTransition}.
 */
export function compareTransitions(a: Transition, b: Transition): number {
  if (a.tick !== b.tick) {
    return a.tick - b.tick
  }
  const priority = TRANSITION_PRIORITY[a.kind] - TRANSITION_PRIORITY[b.kind]
  if (priority !== 0) {
    return priority
  }
  if (a.instanceId === b.instanceId) {
    return 0
  }
  return a.instanceId < b.instanceId ? -1 : 1
}

/**
 * Returns the earliest pending transition across all active skills, or `null`
 * when nothing is scheduled. This is the arithmetic core of the timeline: the
 * next thing that happens is the minimum of each skill's connect/end ticks.
 */
export function nextTransition(state: CombatState): Transition | null {
  let best: Transition | null = null

  for (const skill of state.timeline.active) {
    const candidates: Transition[] = []
    if (!skill.resolved) {
      candidates.push({ kind: 'connect', tick: skillConnectAt(state, skill), instanceId: skill.instanceId })
    }
    candidates.push({ kind: 'end', tick: skill.endingEndsAt, instanceId: skill.instanceId })

    for (const candidate of candidates) {
      if (best === null || compareTransitions(candidate, best) < 0) {
        best = candidate
      }
    }
  }

  return best
}

/**
 * Applies a single transition to a copy of the state: moves the clock to the
 * transition's tick, then either marks the skill resolved (connect) or removes
 * it from the timeline (end). The input state is never mutated.
 */
export function applyTransition(state: CombatState, transition: Transition): CombatState {
  const tick = Math.max(state.timeline.tick, transition.tick)
  const active =
    transition.kind === 'connect'
      ? state.timeline.active.map((skill) =>
          skill.instanceId === transition.instanceId ? { ...skill, resolved: true } : skill,
        )
      : state.timeline.active.filter((skill) => skill.instanceId !== transition.instanceId)

  return {
    ...state,
    timeline: {
      ...state.timeline,
      tick,
      active,
    },
  }
}

/**
 * Actors that may be prompted right now: alive, not committed to an active
 * skill, and past their hitstun/stagger lockout. Returned in roster order.
 */
export function getFreeActors(state: CombatState): ActorId[] {
  if (state.outcome.status === 'ended') {
    return []
  }

  const acting = new Set(state.timeline.active.map((skill) => skill.actorId))
  return state.roster.filter((actorId) => {
    const actor = state.actors[actorId]
    if (actor === undefined || actor.runtime.hp <= 0) {
      return false
    }
    if (acting.has(actorId)) {
      return false
    }
    const lockedUntil = Math.max(actor.runtime.hitstunUntil, actor.runtime.staggeredUntil)
    return state.timeline.tick >= lockedUntil
  })
}

/**
 * Whether the engine is waiting on input: either a pending reaction window or an
 * actor that is free to act.
 */
export function isDecisionPoint(state: CombatState): boolean {
  if (state.outcome.status === 'ended') {
    return false
  }
  return state.pending !== null || getFreeActors(state).length > 0
}

/**
 * Advances the timeline, applying transitions in order, until the engine reaches
 * a decision point or combat ends. Returns a new state.
 */
export function advanceUntilDecision(state: CombatState): CombatState {
  let current = state

  while (current.outcome.status === 'active' && !isDecisionPoint(current)) {
    const transition = nextTransition(current)
    if (transition === null) {
      break
    }
    current = applyTransition(current, transition)
  }

  return current
}
