import type { ActorId, InstanceId } from './types/ids'
import type { CombatEvent } from './types/events'
import type { CombatState, TimelineSkill } from './types/state'
import type { SkillDef } from './types/skill'
import { Stat } from './types/stats'
import { getEffectiveStat } from './stats'
import { emit } from './log'

function skillDefinitionOf(state: CombatState, skillId: string): SkillDef | undefined {
  return state.content.skills[skillId]
}

function connectAtOf(instance: TimelineSkill): number {
  return instance.startedAt + instance.startupTicks + instance.deliveryTicks
}

function isDefensive(kind: string): boolean {
  return kind === 'block' || kind === 'dodge' || kind === 'parry'
}

function damageFor(
  state: CombatState,
  attackerId: ActorId,
  targetId: ActorId,
  power: number,
): number {
  const attack = getEffectiveStat(state, attackerId, Stat.Attack)
  const defense = getEffectiveStat(state, targetId, Stat.Defense)
  const multiplier = state.rules.damageMultiplier ?? 1
  return Math.max(1, Math.round((power + attack - defense) * multiplier))
}

function applyDamage(state: CombatState, targetId: ActorId, amount: number): CombatState {
  const actor = state.actors[targetId]
  if (actor === undefined) {
    return state
  }
  const hp = Math.max(0, actor.runtime.hp - amount)
  const withHp: CombatState = {
    ...state,
    actors: {
      ...state.actors,
      [targetId]: { ...actor, runtime: { ...actor.runtime, hp } },
    },
  }
  if (hp > 0 || withHp.outcome.status === 'ended') {
    return withHp
  }
  const winner = state.roster.find((id) => id !== targetId) ?? targetId
  return { ...withHp, outcome: { status: 'ended', winner } }
}

function withEnd(previous: CombatState, next: CombatState): CombatState {
  if (previous.outcome.status === 'active' && next.outcome.status === 'ended') {
    return emit(next, { kind: 'combatEnd', winner: next.outcome.winner })
  }
  return next
}

function lockUntil(
  state: CombatState,
  actorId: ActorId,
  field: 'hitstunUntil' | 'staggeredUntil',
  until: number,
): CombatState {
  const actor = state.actors[actorId]
  if (actor === undefined || until <= actor.runtime[field]) {
    return state
  }
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: { ...actor, runtime: { ...actor.runtime, [field]: until } },
    },
  }
}

function removeInstance(state: CombatState, instanceId: InstanceId): CombatState {
  return {
    ...state,
    timeline: {
      ...state.timeline,
      active: state.timeline.active.filter((active) => active.instanceId !== instanceId),
    },
  }
}

function markTraded(state: CombatState, instanceId: InstanceId): CombatState {
  return {
    ...state,
    timeline: {
      ...state.timeline,
      active: state.timeline.active.map((active) =>
        active.instanceId === instanceId ? { ...active, traded: true } : active,
      ),
    },
  }
}

/** Whether a skill is currently protected from interruption by super armor. */
function isArmoredNow(state: CombatState, skill: TimelineSkill, at: number): boolean {
  const definition = skillDefinitionOf(state, skill.skillId)
  if (definition === undefined) {
    return false
  }
  const startupEnd = skill.startedAt + skill.startupTicks
  const connect = startupEnd + skill.deliveryTicks
  if (definition.armoredDuringStartup === true && at < startupEnd) {
    return true
  }
  if (definition.armoredDuringDelivery === true && at >= startupEnd && at <= connect) {
    return true
  }
  return false
}

/**
 * Records that a defensive reaction became active in time. The record lives on
 * the incoming attack so it survives the reaction's own recovery ending.
 */
function recordDefence(state: CombatState, reaction: TimelineSkill): CombatState {
  const incomingId = reaction.reactingToInstanceId
  if (incomingId === null) {
    return state
  }
  const incoming = state.timeline.active.find((active) => active.instanceId === incomingId)
  if (incoming === undefined) {
    return state
  }
  const connectsAt = reaction.startedAt + reaction.startupTicks + reaction.deliveryTicks
  if (incoming.defence !== null && incoming.defence.connectsAt <= connectsAt) {
    return state
  }
  const updated: TimelineSkill = {
    ...incoming,
    defence: { actorId: reaction.actorId, skillId: reaction.skillId, connectsAt },
  }
  return {
    ...state,
    timeline: {
      ...state.timeline,
      active: state.timeline.active.map((active) =>
        active.instanceId === incomingId ? updated : active,
      ),
    },
  }
}

/**
 * Ends the exchange for everything except an armored skill already in delivery.
 * Those are marked `traded` instead of cancelled, so they still land. All other
 * unresolved skills are removed; cancelled attacks are narrated as interrupted.
 */
function cancelOthers(
  state: CombatState,
  keepInstanceId: InstanceId,
  at: number,
  byActorId: ActorId,
  bySkillId: string,
): CombatState {
  let next = state
  for (const other of state.timeline.active) {
    if (other.instanceId === keepInstanceId || other.resolved) {
      continue
    }
    const definition = skillDefinitionOf(next, other.skillId)

    if (definition?.kind === 'attack' && isArmoredNow(next, other, at)) {
      if (!other.traded) {
        next = markTraded(next, other.instanceId)
        next = emit(next, {
          kind: 'armored',
          actorId: other.actorId,
          skillId: other.skillId,
        })
      }
      continue
    }

    next = removeInstance(next, other.instanceId)
    if (definition?.kind === 'attack') {
      next = emit(next, {
        kind: 'interrupted',
        actorId: other.actorId,
        skillId: other.skillId,
        byActorId,
        bySkillId,
      })
    }
  }
  return next
}

/** Resolves an attack landing on its target. */
function resolveAttack(
  state: CombatState,
  attack: TimelineSkill,
  attackDefinition: SkillDef,
): CombatState {
  const targetId = attack.targetActorId
  if (targetId === null) {
    return state
  }

  const at = state.timeline.tick
  const armoredAttack = attackDefinition.armoredDuringDelivery === true
  const reactions = state.timeline.active.filter(
    (active) =>
      active.reactingToInstanceId === attack.instanceId && active.actorId === targetId,
  )

  const activeDefence = reactions.find((reaction) => {
    const definition = skillDefinitionOf(state, reaction.skillId)
    if (definition === undefined || !isDefensive(definition.kind)) {
      return false
    }
    if (armoredAttack && definition.kind !== 'dodge') {
      return false
    }
    return connectAtOf(reaction) <= at
  })

  const recorded = attack.defence
  const recordedKind =
    recorded !== null && recorded.connectsAt <= at
      ? skillDefinitionOf(state, recorded.skillId)?.kind
      : undefined
  const recordedDefenceKind =
    recordedKind !== undefined && (!armoredAttack || recordedKind === 'dodge')
      ? recordedKind
      : undefined
  const activeDefenceKind =
    activeDefence === undefined
      ? undefined
      : skillDefinitionOf(state, activeDefence.skillId)?.kind
  const defenceKind = recordedDefenceKind ?? activeDefenceKind

  if (defenceKind !== undefined) {
    const event: CombatEvent =
      defenceKind === 'dodge'
        ? {
            kind: 'dodged',
            actorId: attack.actorId,
            targetActorId: targetId,
            skillId: attack.skillId,
          }
        : defenceKind === 'parry'
          ? {
              kind: 'parried',
              actorId: attack.actorId,
              targetActorId: targetId,
              skillId: attack.skillId,
            }
          : {
              kind: 'blocked',
              actorId: attack.actorId,
              targetActorId: targetId,
              skillId: attack.skillId,
            }
    return emit(
      cancelOthers(state, attack.instanceId, at, attack.actorId, attack.skillId),
      event,
    )
  }

  const others = state.timeline.active.filter(
    (active) => active.instanceId !== attack.instanceId && !active.resolved,
  )
  const cleanInterrupt = others.some((other) => {
    const definition = skillDefinitionOf(state, other.skillId)
    return (
      definition?.kind === 'attack' &&
      at < other.startedAt + other.startupTicks &&
      !isArmoredNow(state, other, at)
    )
  })

  let damage = damageFor(state, attack.actorId, targetId, attackDefinition.power)
  if (cleanInterrupt) {
    damage = Math.max(
      1,
      Math.ceil(damage * state.rules.interruptDuringStartup.damageMultiplier),
    )
  }

  let next = cancelOthers(state, attack.instanceId, at, attack.actorId, attack.skillId)
  next = applyDamage(next, targetId, damage)
  next = lockUntil(next, targetId, 'hitstunUntil', at + attackDefinition.hitstun)
  if (cleanInterrupt) {
    next = lockUntil(next, targetId, 'staggeredUntil', at + next.rules.interruptDuringStartup.stagger)
    next = emit(next, { kind: 'staggered', actorId: targetId })
  }

  if (attack.traded) {
    next = { ...next, timeline: { ...next.timeline, active: [] } }
  }

  const event: CombatEvent = {
    kind: 'hit',
    actorId: attack.actorId,
    targetActorId: targetId,
    skillId: attack.skillId,
    damage,
  }
  return withEnd(state, emit(next, event))
}

/**
 * Resolves the effects of a skill reaching its connect tick. An attack delivers
 * and ends the exchange (or trades with an armored attack); defensive reactions
 * are recorded so they survive their own recovery.
 */
export function resolveConnect(state: CombatState, instanceId: InstanceId): CombatState {
  const instance = state.timeline.active.find((active) => active.instanceId === instanceId)
  if (instance === undefined) {
    return state
  }
  const definition = skillDefinitionOf(state, instance.skillId)
  if (definition === undefined) {
    return state
  }
  if (definition.kind === 'attack') {
    return resolveAttack(state, instance, definition)
  }
  if (isDefensive(definition.kind) && instance.reactingToInstanceId !== null) {
    return recordDefence(state, instance)
  }
  return state
}
