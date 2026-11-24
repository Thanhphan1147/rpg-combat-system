import type { ActorId } from './types/ids'
import type { Intent } from './types/intent'
import type {
  ActionPrompt,
  ActorSnapshot,
  Combat,
  CombatSnapshot,
  IncomingSkillInfo,
  Prompt,
  PromptOption,
  ReactionPrompt,
} from './types/facade'
import type { CombatState } from './types/state'
import { getEffectiveStat, getMaxHp } from './stats'
import { Stat } from './types/stats'
import {
  advanceUntilDecision,
  applyTransition,
  getFreeActors,
  hasUnresolvedAttack,
  nextTransition,
  skillConnectAt,
} from './timeline'
import { canReact, getReactionOptions, startReaction } from './reactions'
import { getPerceptionView } from './perception'
import { startSkill } from './combat'

function optionFor(state: CombatState, skillId: string, identified: boolean): PromptOption {
  const skill = state.content.skills[skillId]
  return {
    skillId,
    label: skill?.name ?? skillId,
    kind: skill?.kind ?? 'attack',
    identified,
    description:
      skill === undefined
        ? ''
        : identified
          ? skill.preciseDescription
          : skill.vagueDescription,
  }
}

function reactionPrompt(state: CombatState): ReactionPrompt | null {
  for (const incoming of state.timeline.active) {
    if (incoming.resolved || incoming.reactingToInstanceId !== null) {
      continue
    }
    const skill = state.content.skills[incoming.skillId]
    if (skill?.kind !== 'attack') {
      continue
    }
    for (const actorId of state.roster) {
      if (actorId === incoming.actorId || !canReact(state, actorId, incoming)) {
        continue
      }
      const options = getReactionOptions(state, actorId, incoming)
      if (options.length === 0) {
        continue
      }
      const view = getPerceptionView(state, actorId, incoming)
      const info: IncomingSkillInfo = {
        instanceId: incoming.instanceId,
        actorId: incoming.actorId,
        skillId: incoming.skillId,
        identified: view.identified,
        connectAt: skillConnectAt(incoming),
      }
      return {
        kind: 'reaction',
        actorId,
        incoming: info,
        options: options.map((option) => optionFor(state, option.skillId, option.identified)),
      }
    }
  }
  return null
}

function nextFreeActor(state: CombatState): ActorId | undefined {
  const free = getFreeActors(state)
  if (free.length === 0) {
    return undefined
  }
  return [...free].sort((a, b) => {
    const speedA = getEffectiveStat(state, a, Stat.Speed)
    const speedB = getEffectiveStat(state, b, Stat.Speed)
    if (speedA !== speedB) {
      return speedB - speedA
    }
    return state.roster.indexOf(a) - state.roster.indexOf(b)
  })[0]
}

function actionPrompt(state: CombatState, actorId: ActorId): ActionPrompt {
  const actor = state.actors[actorId]
  const options: PromptOption[] = []
  for (const skillId of actor?.runtime.skillIds ?? []) {
    const skill = state.content.skills[skillId]
    if (skill === undefined) {
      continue
    }
    if (
      skill.kind === 'block' ||
      skill.kind === 'dodge' ||
      skill.kind === 'parry'
    ) {
      continue
    }
    if ((actor?.runtime.cooldownEndsAt[skillId] ?? 0) > state.timeline.tick) {
      continue
    }
    options.push({
      skillId,
      label: skill.name,
      kind: skill.kind,
      identified: true,
      description: skill.preciseDescription,
    })
  }
  return { kind: 'action', actorId, options }
}

/**
 * The decision the engine is waiting on, or `null` when combat is over. Reaction
 * windows take priority over ordinary action prompts.
 */
export function getPrompt(state: CombatState): Prompt | null {
  if (state.outcome.status === 'ended') {
    return null
  }
  const reaction = reactionPrompt(state)
  if (reaction !== null) {
    return reaction
  }
  if (hasUnresolvedAttack(state)) {
    return null
  }
  const actorId = nextFreeActor(state)
  return actorId === undefined ? null : actionPrompt(state, actorId)
}

/**
 * Applies an intent for the current prompt. `pass` declines a reaction window and
 * lets time move on; action prompts must be answered with an action.
 */
export function applyIntent(state: CombatState, intent: Intent): CombatState {
  const prompt = getPrompt(state)
  if (prompt === null) {
    return state
  }

  if (intent.kind === 'pass') {
    if (prompt.kind !== 'reaction') {
      throw new Error('Cannot pass an action prompt')
    }
    const transition = nextTransition(state)
    if (transition === null) {
      return state
    }
    return advanceUntilDecision(applyTransition(state, transition))
  }

  if (intent.kind === 'react') {
    if (prompt.kind !== 'reaction') {
      throw new Error('Not a reaction prompt')
    }
    return startReaction(state, prompt.actorId, intent.skillId, prompt.incoming.instanceId)
  }

  if (prompt.kind !== 'action') {
    throw new Error('Not an action prompt')
  }
  const skill = state.content.skills[intent.skillId]
  const target =
    skill?.targeting === 'opponent' && intent.targetActorId === undefined
      ? state.roster.find((id) => id !== prompt.actorId)
      : intent.targetActorId
  return startSkill(state, prompt.actorId, intent.skillId, target)
}

/** Applies an intent and advances to the next decision point. */
export function step(state: CombatState, intent: Intent): CombatState {
  return advanceUntilDecision(applyIntent(state, intent))
}

/** Rendering-friendly view of the current state. */
export function snapshot(state: CombatState): CombatSnapshot {
  const actors: ActorSnapshot[] = state.roster.map((actorId) => {
    const actor = state.actors[actorId]
    const active = state.timeline.active.filter((skill) => skill.actorId === actorId)
    const action = active.find((skill) => skill.reactingToInstanceId === null)
    const reaction = active.find((skill) => skill.reactingToInstanceId !== null)
    const template =
      actor === undefined ? undefined : state.content.characters[actor.characterId]
    return {
      id: actorId,
      side: actor?.side ?? 'enemy',
      name: template?.name ?? actorId,
      hp: actor?.runtime.hp ?? 0,
      maxHp: actor === undefined ? 0 : getMaxHp(state, actorId),
      actionSkillId: action?.skillId ?? null,
      reactionSkillId: reaction?.skillId ?? null,
      cooldownEndsAt: actor?.runtime.cooldownEndsAt ?? {},
    }
  })

  return { tick: state.timeline.tick, outcome: state.outcome, actors }
}

/**
 * Thin stateful facade over the pure turn-loop functions. Useful for UIs that
 * prefer an object; the underlying state is still plain data.
 */
export function createCombatSession(initial: CombatState): Combat {
  let current = initial
  return {
    get state() {
      return current
    },
    getPrompt() {
      return getPrompt(current)
    },
    step(intent) {
      current = step(current, intent)
      return getPrompt(current)
    },
    snapshot() {
      return snapshot(current)
    },
    getLog() {
      return current.log
    },
  }
}
