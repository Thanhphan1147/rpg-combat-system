import type { CombatLogEntry } from './events'
import type { ActorId, InstanceId, SkillId } from './ids'
import type { Intent } from './intent'
import type { SkillKind } from './skill'
import type { ActorSide, CombatOutcome, CombatState } from './state'

export interface PromptOption {
  skillId: SkillId
  label: string
  kind: SkillKind
  identified: boolean
  description: string
}

export interface IncomingSkillInfo {
  instanceId: InstanceId
  actorId: ActorId
  skillId: SkillId
  identified: boolean
  connectAt: number
}

export interface ActionPrompt {
  kind: 'action'
  actorId: ActorId
  options: PromptOption[]
}

export interface ReactionPrompt {
  kind: 'reaction'
  actorId: ActorId
  options: PromptOption[]
  incoming: IncomingSkillInfo
}

export type Prompt = ActionPrompt | ReactionPrompt

export interface ActorSnapshot {
  id: ActorId
  side: ActorSide
  name: string
  hp: number
  maxHp: number
  actionSkillId: SkillId | null
  reactionSkillId: SkillId | null
  cooldownEndsAt: Partial<Record<SkillId, number>>
}

export interface CombatSnapshot {
  tick: number
  outcome: CombatOutcome
  actors: ActorSnapshot[]
}

export interface Combat {
  readonly state: CombatState
  getPrompt(): Prompt | null
  step(intent: Intent): Prompt | null
  snapshot(): CombatSnapshot
  getLog(): readonly CombatLogEntry[]
}
