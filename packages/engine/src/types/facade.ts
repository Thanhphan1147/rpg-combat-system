import type { ActorId, SkillId } from './ids'
import type { Intent } from './intent'
import type { SkillKind } from './skill'
import type { ActorSide, CombatState } from './state'

export interface PromptOption {
  skillId: SkillId
  label: string
  kind: SkillKind
}

export interface Prompt {
  kind: 'action' | 'reaction'
  actorId: ActorId
  options: PromptOption[]
}

export interface ActorSnapshot {
  id: ActorId
  side: ActorSide
  name: string
  hp: number
  maxHp: number
  actingSkillId: SkillId | null
  cooldowns: Record<string, number>
}

export interface CombatSnapshot {
  tick: number
  status: 'active' | 'ended'
  winner: ActorId | null
  actors: ActorSnapshot[]
}

export interface CombatStepResult {
  prompt: Prompt | null
  ended: boolean
}

export interface Combat {
  readonly state: CombatState
  getPrompt(): Prompt | null
  step(intent: Intent): CombatStepResult
  snapshot(): CombatSnapshot
}
