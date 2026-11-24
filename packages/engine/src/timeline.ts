import type { ActorId, InstanceId } from './types/ids'
import type { CombatState, TimelineSkill } from './types/state'
import { canReactAt, getReactionOptions } from './reactions'
import { resolveConnect } from './resolution'

/**
 * A scheduled point on the timeline.
 * - `reaction`: a reactor's reflex window opens for an incoming skill.
 * - `connect`: an active skill's delivery ends (the hit resolves).
 * - `end`: a skill's ending finishes and it leaves the timeline.
 * - `unlock`: an actor's hitstun/stagger lockout ends.
 */
export type Transition =
  | { kind: 'reaction'; tick: number; actorId: ActorId; incomingInstanceId: InstanceId }
  | { kind: 'connect'; tick: number; instanceId: InstanceId }
  | { kind: 'end'; tick: number; instanceId: InstanceId }
  | { kind: 'unlock'; tick: number; actorId: ActorId }

const TRANSITION_PRIORITY: Record<Transition['kind'], number> = {
  reaction: 0,
  connect: 1,
  end: 2,
  unlock: 3,
}

function transitionKey(transition: Transition): string {
  switch (transition.kind) {
    case 'reaction':
      return `${transition.actorId}:${transition.incomingInstanceId}`
    case 'unlock':
      return transition.actorId
    case 'connect':
    case 'end':
      return transition.instanceId
  }
}

/**
 * Absolute tick at which an active skill connects, derived from its start and
 * the skill's `startup + delivery`. Throws if the skill is missing from content.
 */
export function skillConnectAt(state: CombatState, skill: TimelineSkill): number {
  const skillDefinition = state.content.skills[skill.skillId]
  if (skillDefinition === undefined) {
    throw new Error(`Unknown skill: ${skill.skillId}`)
  }
  return skill.startedAt + skillDefinition.startup + skillDefinition.delivery
}

/**
 * Deterministic ordering: earliest tick first, then kind (reaction → connect →
 * end → unlock), then a per-kind key (instance id or actor id).
 */
export function compareTransitions(a: Transition, b: Transition): number {
  if (a.tick !== b.tick) {
    return a.tick - b.tick
  }
  const priority = TRANSITION_PRIORITY[a.kind] - TRANSITION_PRIORITY[b.kind]
  if (priority !== 0) {
    return priority
  }
  const aKey = transitionKey(a)
  const bKey = transitionKey(b)
  if (aKey === bKey) {
    return 0
  }
  return aKey < bKey ? -1 : 1
}

/**
 * Returns the earliest pending transition, or `null` when nothing is scheduled.
 * This is the arithmetic core: the next thing that happens is the minimum of
 * each skill's connect/end, each reflex window, and each lockout expiry.
 */
export function nextTransition(state: CombatState): Transition | null {
  let best: Transition | null = null

  const consider = (candidate: Transition): void => {
    if (best === null || compareTransitions(candidate, best) < 0) {
      best = candidate
    }
  }

  for (const skill of state.timeline.active) {
    if (!skill.resolved) {
      consider({
        kind: 'connect',
        tick: skillConnectAt(state, skill),
        instanceId: skill.instanceId,
      })
    }
    consider({ kind: 'end', tick: skill.endingEndsAt, instanceId: skill.instanceId })

    if (skill.resolved || skill.reactingToInstanceId !== null) {
      continue
    }
    const skillDefinition = state.content.skills[skill.skillId]
    if (skillDefinition?.kind !== 'attack') {
      continue
    }
    const connectAt = skill.startedAt + skillDefinition.startup + skillDefinition.delivery
    for (const actorId of state.roster) {
      if (actorId === skill.actorId) {
        continue
      }
      const reactAt = canReactAt(state, actorId, skill)
      if (reactAt <= state.timeline.tick || reactAt >= connectAt) {
        continue
      }
      const alreadyReacting = state.timeline.active.some(
        (active) =>
          active.actorId === actorId &&
          active.reactingToInstanceId === skill.instanceId,
      )
      if (!alreadyReacting) {
        consider({
          kind: 'reaction',
          tick: reactAt,
          actorId,
          incomingInstanceId: skill.instanceId,
        })
      }
    }
  }

  for (const actorId of state.roster) {
    const actor = state.actors[actorId]
    if (actor === undefined) {
      continue
    }
    const lockedUntil = Math.max(actor.runtime.hitstunUntil, actor.runtime.staggeredUntil)
    if (lockedUntil > state.timeline.tick) {
      consider({ kind: 'unlock', tick: lockedUntil, actorId })
    }
  }

  return best
}

/**
 * Applies a single transition to a copy of the state. `connect` resolves the
 * hit/reaction, `end` removes the skill, and `reaction`/`unlock` just advance the
 * clock. The input state is never mutated.
 */
export function applyTransition(state: CombatState, transition: Transition): CombatState {
  const tick = Math.max(state.timeline.tick, transition.tick)
  const advanced: CombatState = { ...state, timeline: { ...state.timeline, tick } }

  if (transition.kind === 'reaction' || transition.kind === 'unlock') {
    return advanced
  }

  if (transition.kind === 'connect') {
    const resolved = resolveConnect(advanced, transition.instanceId)
    const stillActive = resolved.timeline.active.some(
      (skill) => skill.instanceId === transition.instanceId,
    )
    const active = stillActive
      ? resolved.timeline.active.map((skill) =>
          skill.instanceId === transition.instanceId ? { ...skill, resolved: true } : skill,
        )
      : resolved.timeline.active
    return { ...resolved, timeline: { ...resolved.timeline, active } }
  }

  return {
    ...advanced,
    timeline: {
      ...advanced.timeline,
      active: advanced.timeline.active.filter(
        (skill) => skill.instanceId !== transition.instanceId,
      ),
    },
  }
}

/**
 * Actors that may be prompted to act right now: alive, not committed to an
 * active skill, and past their hitstun/stagger lockout. Returned in roster order.
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
 * Whether any actor currently has a usable reaction to an unresolved attack.
 */
export function hasReactionOpportunity(state: CombatState): boolean {
  if (state.outcome.status === 'ended') {
    return false
  }
  for (const skill of state.timeline.active) {
    if (skill.resolved || skill.reactingToInstanceId !== null) {
      continue
    }
    const skillDefinition = state.content.skills[skill.skillId]
    if (skillDefinition?.kind !== 'attack') {
      continue
    }
    for (const actorId of state.roster) {
      if (actorId === skill.actorId) {
        continue
      }
      if (getReactionOptions(state, actorId, skill).length > 0) {
        return true
      }
    }
  }
  return false
}

/**
 * Whether the engine is waiting on input: a reaction window is open, an actor is
 * free to act, or a pending decision exists.
 */
export function isDecisionPoint(state: CombatState): boolean {
  if (state.outcome.status === 'ended') {
    return false
  }
  return (
    state.pending !== null ||
    getFreeActors(state).length > 0 ||
    hasReactionOpportunity(state)
  )
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
