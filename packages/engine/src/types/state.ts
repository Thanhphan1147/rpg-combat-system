import type { CharacterRuntime, CharacterTemplate, EquipmentDef } from './character'
import type { CombatLogEntry } from './events'
import type { ActorId, SkillId } from './ids'
import type { Phase, SkillDef } from './skill'

export type ActorSide = 'player' | 'enemy'
export type CombatStatus = 'active' | 'ended'

export interface TimelineSkill {
  instanceId: string
  actorId: ActorId
  skillId: SkillId
  phase: Phase
  startedAt: number
  phaseEndsAt: number
  connectAt: number
  endingEndsAt: number
  targetActorId: ActorId | null
  reactingToInstanceId: string | null
  resolved: boolean
}

export interface Timeline {
  tick: number
  active: TimelineSkill[]
}

export interface CombatActor {
  id: ActorId
  side: ActorSide
  template: CharacterTemplate
  runtime: CharacterRuntime
}

export interface ReactionWindow {
  incomingActorId: ActorId
  incomingInstanceId: string
  reactorActorId: ActorId
  opensAt: number
}

export type PendingDecision =
  | { kind: 'action'; actorId: ActorId }
  | { kind: 'reaction'; window: ReactionWindow }

export interface ContentBundle {
  skills: Record<string, SkillDef>
  characters: Record<string, CharacterTemplate>
  equipment: Record<string, EquipmentDef>
}

export interface Ruleset {
  reflex: { base: number; scale: number; floor: number }
  perception: { readBase: number }
  cleanCounter: { damageMultiplier: number; stagger: number }
  block: { incompleteMitigation: number }
}

export interface CombatState {
  actors: Record<string, CombatActor>
  order: ActorId[]
  content: ContentBundle
  rules: Ruleset
  timeline: Timeline
  pending: PendingDecision | null
  log: CombatLogEntry[]
  status: CombatStatus
  winner: ActorId | null
}
