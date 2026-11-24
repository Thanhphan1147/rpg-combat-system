import type { ActorId, InstanceId, SkillId } from './types/ids'
import type { CombatState, TimelineSkill } from './types/state'
import type { SkillKind } from './types/skill'
import { Stat } from './types/stats'
import { getEffectiveStat } from './stats'
import { getPerceptionView } from './perception'
import { reactionAt } from './reflex'
import { emit } from './log'
import { scalePhases } from './scaling'
import { cooldownMapAfter } from './cooldown'

/**
 * Earliest tick at which an actor may begin reacting to an incoming skill: the
 * skill's start plus the actor's reflex delay.
 */
export function canReactAt(
  state: CombatState,
  reactorId: ActorId,
  incoming: TimelineSkill,
): number {
  const reflex = getEffectiveStat(state, reactorId, Stat.Reflex)
  return reactionAt(incoming.startedAt, reflex, state.rules)
}

/**
 * Whether an actor may open a reaction to this incoming skill right now: the
 * reflex window is open, the hit has not landed, and the actor is free.
 */
export function canReact(
  state: CombatState,
  reactorId: ActorId,
  incoming: TimelineSkill,
): boolean {
  if (reactorId === incoming.actorId) {
    return false
  }
  const actor = state.actors[reactorId]
  if (actor === undefined || actor.runtime.hp <= 0) {
    return false
  }
  if (state.timeline.active.some((active) => active.actorId === reactorId)) {
    return false
  }
  const lockedUntil = Math.max(actor.runtime.hitstunUntil, actor.runtime.staggeredUntil)
  if (state.timeline.tick < lockedUntil) {
    return false
  }
  if (incoming.resolved) {
    return false
  }
  if (incoming.respondedBy.includes(reactorId)) {
    return false
  }
  const connectAt = incoming.startedAt + incoming.startupTicks + incoming.deliveryTicks
  if (state.timeline.tick >= connectAt) {
    return false
  }
  if (state.timeline.tick < canReactAt(state, reactorId, incoming)) {
    return false
  }
  return !state.timeline.active.some(
    (active) =>
      active.actorId === reactorId && active.reactingToInstanceId === incoming.instanceId,
  )
}

export interface ReactionOption {
  skillId: SkillId
  kind: SkillKind
  identified: boolean
  description: string
  connectsAt: number
}

function optionList(
  state: CombatState,
  reactorId: ActorId,
  incoming: TimelineSkill,
  defensiveOnly: boolean,
): ReactionOption[] {
  const actor = state.actors[reactorId]
  if (actor === undefined) {
    return []
  }
  const view = getPerceptionView(state, reactorId, incoming)
  const start = state.timeline.tick
  const options: ReactionOption[] = []

  for (const skillId of actor.runtime.skillIds) {
    const skill = state.content.skills[skillId]
    if (skill === undefined) {
      continue
    }
    if (
      defensiveOnly &&
      skill.kind !== 'block' &&
      skill.kind !== 'dodge' &&
      skill.kind !== 'parry'
    ) {
      continue
    }
    if ((actor.runtime.cooldownEndsAt[skillId] ?? 0) > state.timeline.tick) {
      continue
    }
    const durations = scalePhases(state, reactorId, skill)
    options.push({
      skillId,
      kind: skill.kind,
      identified: view.identified,
      description: view.description,
      connectsAt: start + durations.startup + durations.delivery,
    })
  }

  return options
}

/**
 * Legal reaction choices for a free actor against an incoming skill. Any known,
 * off-cooldown skill can be gambled; `identified` reflects whether Perception
 * read the incoming skill.
 */
export function getReactionOptions(
  state: CombatState,
  reactorId: ActorId,
  incoming: TimelineSkill,
): ReactionOption[] {
  if (!canReact(state, reactorId, incoming)) {
    return []
  }
  return optionList(state, reactorId, incoming, false)
}

/**
 * Whether an armored actor currently in delivery may choose to keep committing
 * (or abandon the attack to defend) against an incoming counter.
 */
export function canCommit(
  state: CombatState,
  actorId: ActorId,
  incoming: TimelineSkill,
): boolean {
  if (incoming.resolved || incoming.reactingToInstanceId !== null) {
    return false
  }
  if (incoming.actorId === actorId) {
    return false
  }
  if (incoming.respondedBy.includes(actorId)) {
    return false
  }
  const incomingDefinition = state.content.skills[incoming.skillId]
  if (incomingDefinition?.kind !== 'attack') {
    return false
  }
  const actor = state.actors[actorId]
  if (actor === undefined || actor.runtime.hp <= 0) {
    return false
  }
  const at = state.timeline.tick
  const connectAt = incoming.startedAt + incoming.startupTicks + incoming.deliveryTicks
  if (at >= connectAt || at < canReactAt(state, actorId, incoming)) {
    return false
  }
  return state.timeline.active.some((active) => {
    if (active.actorId !== actorId || active.resolved) {
      return false
    }
    const definition = state.content.skills[active.skillId]
    if (definition?.armoredDuringDelivery !== true) {
      return false
    }
    const startupEnd = active.startedAt + active.startupTicks
    const connect = startupEnd + active.deliveryTicks
    return at >= startupEnd && at < connect
  })
}

/** Whether any armored actor has an open commit window. */
export function hasCommitOpportunity(state: CombatState): boolean {
  if (state.outcome.status === 'ended') {
    return false
  }
  for (const incoming of state.timeline.active) {
    if (incoming.resolved || incoming.reactingToInstanceId !== null) {
      continue
    }
    const definition = state.content.skills[incoming.skillId]
    if (definition?.kind !== 'attack') {
      continue
    }
    for (const actorId of state.roster) {
      if (actorId !== incoming.actorId && canCommit(state, actorId, incoming)) {
        return true
      }
    }
  }
  return false
}

/** Defensive options offered while the actor decides whether to keep committing. */
export function getCommitOptions(
  state: CombatState,
  actorId: ActorId,
  incoming: TimelineSkill,
): ReactionOption[] {
  if (!canCommit(state, actorId, incoming)) {
    return []
  }
  return optionList(state, actorId, incoming, true)
}

/**
 * Commits a reactor to a skill in response to an incoming skill. The reaction is
 * an ordinary timeline skill linked to its target via `reactingToInstanceId`;
 * cooldown starts immediately. Throws if the window is not open or the choice is
 * illegal.
 */
export function startReaction(
  state: CombatState,
  reactorId: ActorId,
  skillId: SkillId,
  incomingInstanceId: InstanceId,
): CombatState {
  const reactor = state.actors[reactorId]
  if (reactor === undefined) {
    throw new Error(`Unknown actor: ${reactorId}`)
  }
  const incoming = state.timeline.active.find(
    (active) => active.instanceId === incomingInstanceId,
  )
  if (incoming === undefined) {
    throw new Error(`Unknown incoming skill: ${incomingInstanceId}`)
  }
  if (!canReact(state, reactorId, incoming)) {
    throw new Error(`Cannot react to ${incomingInstanceId} yet`)
  }
  const skill = state.content.skills[skillId]
  if (skill === undefined) {
    throw new Error(`Unknown skill: ${skillId}`)
  }
  if (!reactor.runtime.skillIds.includes(skillId)) {
    throw new Error(`Actor cannot use skill: ${skillId}`)
  }
  if ((reactor.runtime.cooldownEndsAt[skillId] ?? 0) > state.timeline.tick) {
    throw new Error(`Skill on cooldown: ${skillId}`)
  }

  const tick = state.timeline.tick
  const durations = scalePhases(state, reactorId, skill)
  const instance: TimelineSkill = {
    instanceId: `i${state.timeline.nextInstanceId}`,
    actorId: reactorId,
    skillId,
    startedAt: tick,
    startupTicks: durations.startup,
    deliveryTicks: durations.delivery,
    endingTicks: durations.ending,
    endingEndsAt: tick + durations.startup + durations.delivery + durations.ending,
    targetActorId: skill.targeting === 'opponent' ? incoming.actorId : null,
    reactingToInstanceId: incomingInstanceId,
    resolved: false,
    traded: false,
    respondedBy: [],
    defence: null,
  }

  const updatedIncoming: TimelineSkill = {
    ...incoming,
    respondedBy: [...incoming.respondedBy, reactorId],
  }

  return emit(
    {
      ...state,
      actors: {
        ...state.actors,
        [reactorId]: {
          ...reactor,
          runtime: {
            ...reactor.runtime,
            cooldownEndsAt: cooldownMapAfter(
              state,
              reactor.runtime.cooldownEndsAt,
              skill,
              tick + skill.cooldown,
            ),
          },
        },
      },
      timeline: {
        ...state.timeline,
        nextInstanceId: state.timeline.nextInstanceId + 1,
        active: [
          ...state.timeline.active.map((active) =>
            active.instanceId === incomingInstanceId ? updatedIncoming : active,
          ),
          instance,
        ],
      },
    },
    {
      kind: 'reactionUsed',
      actorId: reactorId,
      skillId,
      incomingInstanceId,
    },
  )
}
