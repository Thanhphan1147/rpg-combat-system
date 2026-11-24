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

function connectAtOf(state: CombatState, instance: TimelineSkill): number {
  const skillDefinition = skillDefinitionOf(state, instance.skillId)
  if (skillDefinition === undefined) {
    throw new Error(`Unknown skill: ${instance.skillId}`)
  }
  return instance.startedAt + skillDefinition.startup + skillDefinition.delivery
}

function damageFor(
  state: CombatState,
  attackerId: ActorId,
  targetId: ActorId,
  power: number,
): number {
  const attack = getEffectiveStat(state, attackerId, Stat.Attack)
  const defense = getEffectiveStat(state, targetId, Stat.Defense)
  return Math.max(1, power + attack - defense)
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

function canCounterInterrupt(state: CombatState, counter: TimelineSkill): boolean {
  const attack = state.timeline.active.find(
    (active) => active.instanceId === counter.reactingToInstanceId,
  )
  if (attack === undefined || attack.resolved) {
    return false
  }
  const attackDefinition = skillDefinitionOf(state, attack.skillId)
  if (attackDefinition === undefined) {
    return false
  }
  const inStartup = state.timeline.tick < attack.startedAt + attackDefinition.startup
  return inStartup || !attackDefinition.armoredDuringDelivery
}

function resolveCounter(
  state: CombatState,
  counter: TimelineSkill,
  counterDefinition: SkillDef,
): CombatState {
  const attack = state.timeline.active.find(
    (active) => active.instanceId === counter.reactingToInstanceId,
  )
  if (attack === undefined || attack.resolved) {
    return state
  }
  const attackDefinition = skillDefinitionOf(state, attack.skillId)
  if (attackDefinition === undefined) {
    return state
  }

  const at = state.timeline.tick
  const inStartup = at < attack.startedAt + attackDefinition.startup
  if (!inStartup && attackDefinition.armoredDuringDelivery) {
    return state
  }

  const raw = damageFor(state, counter.actorId, attack.actorId, counterDefinition.power)
  const multiplier = inStartup ? state.rules.startupCounter.damageMultiplier : 1
  const damage = Math.max(1, Math.ceil(raw * multiplier))

  let next = applyDamage(state, attack.actorId, damage)
  next = lockUntil(next, attack.actorId, 'hitstunUntil', at + counterDefinition.hitstun)
  if (inStartup) {
    next = lockUntil(next, attack.actorId, 'staggeredUntil', at + next.rules.startupCounter.stagger)
  }
  next = removeInstance(next, attack.instanceId)
  next = emit(next, {
    kind: 'countered',
    actorId: counter.actorId,
    targetActorId: attack.actorId,
    skillId: counter.skillId,
    targetSkillId: attack.skillId,
    damage,
    clean: inStartup,
  })
  if (inStartup) {
    next = emit(next, { kind: 'staggered', actorId: attack.actorId })
  }
  return withEnd(state, next)
}

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
  const reactions = state.timeline.active.filter(
    (active) =>
      active.reactingToInstanceId === attack.instanceId && active.actorId === targetId,
  )

  const counter = reactions.find((reaction) => {
    const definition = skillDefinitionOf(state, reaction.skillId)
    return definition?.kind === 'counter' && connectAtOf(state, reaction) <= at
  })
  if (counter !== undefined && canCounterInterrupt(state, counter)) {
    const definition = skillDefinitionOf(state, counter.skillId)
    if (definition !== undefined) {
      return resolveCounter(state, counter, definition)
    }
  }

  const defence = reactions.find((reaction) => {
    const definition = skillDefinitionOf(state, reaction.skillId)
    if (definition === undefined || definition.kind === 'counter') {
      return false
    }
    return connectAtOf(state, reaction) <= at
  })
  if (defence !== undefined) {
    const kind = skillDefinitionOf(state, defence.skillId)?.kind
    const event: CombatEvent =
      kind === 'dodge'
        ? {
            kind: 'dodged',
            actorId: attack.actorId,
            targetActorId: targetId,
            skillId: attack.skillId,
          }
        : kind === 'parry'
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
              damage: 0,
              complete: true,
            }
    return emit(state, event)
  }

  const raw = damageFor(state, attack.actorId, targetId, attackDefinition.power)
  const lateBlock = reactions.find(
    (reaction) => skillDefinitionOf(state, reaction.skillId)?.kind === 'block',
  )

  let next = state
  let damage = raw
  if (lateBlock !== undefined) {
    damage = Math.max(1, Math.ceil(raw * (1 - state.rules.block.incompleteMitigation)))
  }
  next = applyDamage(next, targetId, damage)
  next = lockUntil(next, targetId, 'hitstunUntil', at + attackDefinition.hitstun)

  const event: CombatEvent =
    lateBlock !== undefined
      ? {
          kind: 'blocked',
          actorId: attack.actorId,
          targetActorId: targetId,
          skillId: attack.skillId,
          damage,
          complete: false,
        }
      : {
          kind: 'hit',
          actorId: attack.actorId,
          targetActorId: targetId,
          skillId: attack.skillId,
          damage,
        }
  return withEnd(state, emit(next, event))
}

/**
 * Resolves the effects of a skill reaching its connect tick. Attacks deal
 * damage (or are blocked/dodged/parried), counters interrupt their target, and
 * pure defence reactions have no connect-time effect of their own. Returns a
 * new state with narration events appended.
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

  if (instance.reactingToInstanceId !== null) {
    return definition.kind === 'counter' ? resolveCounter(state, instance, definition) : state
  }
  return definition.kind === 'attack' ? resolveAttack(state, instance, definition) : state
}
