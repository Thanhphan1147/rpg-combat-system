import type { ActorId, CharacterId, SkillId } from './types/ids'
import type { SkillDef } from './types/skill'
import type { ActorSide, CombatActor, CombatState, ContentBundle, Ruleset, TimelineSkill } from './types/state'
import { Stat } from './types/stats'
import { getFreeActors } from './timeline'

/**
 * Configuration for one actor entering combat. `skillIds` is the actor's current
 * loadout; HP defaults to the character's MaxHp stat.
 */
export interface CombatantConfig {
  id: ActorId
  side: ActorSide
  characterId: CharacterId
  skillIds?: SkillId[]
  hp?: number
}

export interface CreateCombatConfig {
  content: ContentBundle
  rules: Ruleset
  combatants: CombatantConfig[]
}

/**
 * Builds a fresh, active combat state at tick 0 with no scheduled skills.
 * Throws on duplicate actors or unknown character templates.
 */
export function createCombat(config: CreateCombatConfig): CombatState {
  const actors: Record<ActorId, CombatActor> = {}
  const roster: ActorId[] = []

  for (const combatant of config.combatants) {
    if (actors[combatant.id] !== undefined) {
      throw new Error(`Duplicate actor: ${combatant.id}`)
    }
    const template = config.content.characters[combatant.characterId]
    if (template === undefined) {
      throw new Error(`Unknown character: ${combatant.characterId}`)
    }

    actors[combatant.id] = {
      id: combatant.id,
      side: combatant.side,
      characterId: combatant.characterId,
      runtime: {
        hp: combatant.hp ?? template.baseStats[Stat.MaxHp],
        skillIds: combatant.skillIds ?? [],
        cooldownEndsAt: {},
        hitstunUntil: 0,
        staggeredUntil: 0,
      },
    }
    roster.push(combatant.id)
  }

  return {
    actors,
    roster,
    content: config.content,
    rules: config.rules,
    timeline: { tick: 0, nextInstanceId: 1, active: [] },
    pending: null,
    outcome: { status: 'active' },
  }
}

/**
 * Commits a free actor to a skill. Schedules its connect/end on the timeline,
 * applies the skill's cooldown immediately, and returns a new state. Validates
 * that the actor is free, knows the skill, is off cooldown, and (for opponent
 * skills) has a legal target.
 */
export function startSkill(
  state: CombatState,
  actorId: ActorId,
  skillId: SkillId,
  targetActorId?: ActorId,
): CombatState {
  if (state.outcome.status === 'ended') {
    throw new Error('Combat has ended')
  }
  const actor = state.actors[actorId]
  if (actor === undefined) {
    throw new Error(`Unknown actor: ${actorId}`)
  }
  if (!getFreeActors(state).includes(actorId)) {
    throw new Error(`Actor is not free: ${actorId}`)
  }

  const skill = state.content.skills[skillId]
  if (skill === undefined) {
    throw new Error(`Unknown skill: ${skillId}`)
  }
  if (!actor.runtime.skillIds.includes(skillId)) {
    throw new Error(`Actor cannot use skill: ${skillId}`)
  }

  const tick = state.timeline.tick
  if ((actor.runtime.cooldownEndsAt[skillId] ?? 0) > tick) {
    throw new Error(`Skill on cooldown: ${skillId}`)
  }

  const target = resolveTarget(state, actorId, skill, targetActorId)
  const instance: TimelineSkill = {
    instanceId: `i${state.timeline.nextInstanceId}`,
    actorId,
    skillId,
    startedAt: tick,
    endingEndsAt: tick + skill.startup + skill.delivery + skill.ending,
    targetActorId: target,
    reactingToInstanceId: null,
    resolved: false,
  }

  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        runtime: {
          ...actor.runtime,
          cooldownEndsAt: {
            ...actor.runtime.cooldownEndsAt,
            [skillId]: tick + skill.cooldown,
          },
        },
      },
    },
    timeline: {
      ...state.timeline,
      nextInstanceId: state.timeline.nextInstanceId + 1,
      active: [...state.timeline.active, instance],
    },
  }
}

function resolveTarget(
  state: CombatState,
  actorId: ActorId,
  skill: SkillDef,
  targetActorId: ActorId | undefined,
): ActorId | null {
  if (skill.targeting === 'self') {
    return null
  }
  if (targetActorId === undefined) {
    throw new Error(`Skill requires a target: ${skill.id}`)
  }
  if (state.actors[targetActorId] === undefined) {
    throw new Error(`Unknown target: ${targetActorId}`)
  }
  if (targetActorId === actorId) {
    throw new Error(`Skill cannot target its own actor: ${skill.id}`)
  }
  return targetActorId
}
