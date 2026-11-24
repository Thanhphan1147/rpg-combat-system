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

interface Interruption {
  skill: TimelineSkill
  inStartup: boolean
}

/** In-flight attacks from the target that this hit can cancel. */
function findInterruptions(
  state: CombatState,
  targetId: ActorId,
  at: number,
): Interruption[] {
  const interruptions: Interruption[] = []
  for (const candidate of state.timeline.active) {
    if (candidate.actorId !== targetId || candidate.resolved) {
      continue
    }
    const definition = skillDefinitionOf(state, candidate.skillId)
    if (definition === undefined || definition.kind !== 'attack') {
      continue
    }
    const inStartup = at < candidate.startedAt + definition.startup
    if (!inStartup && definition.armoredDuringDelivery) {
      continue
    }
    interruptions.push({ skill: candidate, inStartup })
  }
  return interruptions
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
              damage: 0,
              complete: true,
            }
    return emit(state, event)
  }

  const interruptions = findInterruptions(state, targetId, at)
  const cleanInterrupt = interruptions.some((entry) => entry.inStartup)

  let damage = damageFor(state, attack.actorId, targetId, attackDefinition.power)
  if (cleanInterrupt) {
    damage = Math.max(
      1,
      Math.ceil(damage * state.rules.interruptDuringStartup.damageMultiplier),
    )
  }

  const lateBlock = reactions.find(
    (reaction) => skillDefinitionOf(state, reaction.skillId)?.kind === 'block',
  )
  if (lateBlock !== undefined) {
    damage = Math.max(1, Math.ceil(damage * (1 - state.rules.block.incompleteMitigation)))
  }

  let next = state
  for (const interruption of interruptions) {
    next = removeInstance(next, interruption.skill.instanceId)
    next = emit(next, {
      kind: 'interrupted',
      actorId: targetId,
      skillId: interruption.skill.skillId,
      byActorId: attack.actorId,
      bySkillId: attack.skillId,
    })
  }

  next = applyDamage(next, targetId, damage)
  next = lockUntil(next, targetId, 'hitstunUntil', at + attackDefinition.hitstun)
  if (cleanInterrupt) {
    next = lockUntil(next, targetId, 'staggeredUntil', at + next.rules.interruptDuringStartup.stagger)
    next = emit(next, { kind: 'staggered', actorId: targetId })
  }

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
 * Resolves the effects of a skill reaching its connect tick. Attacks deal damage
 * and interrupt any slower in-flight attack; block/dodge/parry have no
 * connect-time effect of their own (they are evaluated when the incoming attack
 * lands). Returns a new state with narration events appended.
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
