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

/**
 * Ends the exchange: cancels every other unresolved skill. Attacks that are
 * cancelled are narrated as interrupted; defensive reactions simply lapse.
 */
function cancelOthers(
  state: CombatState,
  keepInstanceId: InstanceId,
  byActorId: ActorId,
  bySkillId: string,
): CombatState {
  let next = state
  for (const other of state.timeline.active) {
    if (other.instanceId === keepInstanceId || other.resolved) {
      continue
    }
    next = removeInstance(next, other.instanceId)
    const definition = skillDefinitionOf(next, other.skillId)
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
  const reactions = state.timeline.active.filter(
    (active) =>
      active.reactingToInstanceId === attack.instanceId && active.actorId === targetId,
  )

  const defence = reactions.find((reaction) => {
    const definition = skillDefinitionOf(state, reaction.skillId)
    if (definition === undefined || !isDefensive(definition.kind)) {
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
            }
    return emit(cancelOthers(state, attack.instanceId, attack.actorId, attack.skillId), event)
  }

  const others = state.timeline.active.filter(
    (active) => active.instanceId !== attack.instanceId && !active.resolved,
  )
  const cleanInterrupt = others.some((other) => {
    const definition = skillDefinitionOf(state, other.skillId)
    return definition?.kind === 'attack' && at < other.startedAt + definition.startup
  })

  let damage = damageFor(state, attack.actorId, targetId, attackDefinition.power)
  if (cleanInterrupt) {
    damage = Math.max(
      1,
      Math.ceil(damage * state.rules.interruptDuringStartup.damageMultiplier),
    )
  }

  let next = cancelOthers(state, attack.instanceId, attack.actorId, attack.skillId)
  next = applyDamage(next, targetId, damage)
  next = lockUntil(next, targetId, 'hitstunUntil', at + attackDefinition.hitstun)
  if (cleanInterrupt) {
    next = lockUntil(next, targetId, 'staggeredUntil', at + next.rules.interruptDuringStartup.stagger)
    next = emit(next, { kind: 'staggered', actorId: targetId })
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
 * and ends the exchange, cancelling every other in-flight skill; defensive
 * reactions have no connect-time effect of their own (they are evaluated when
 * the incoming attack lands). Returns a new state with narration appended.
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
  return definition.kind === 'attack' ? resolveAttack(state, instance, definition) : state
}
