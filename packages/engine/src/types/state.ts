import type { CharacterRuntime, CharacterTemplate } from './character'
import type { CombatLogEntry } from './events'
import type { ActorId, CharacterId, InstanceId, SkillId } from './ids'
import type { SkillDef } from './skill'

export type ActorSide = 'player' | 'enemy'

export interface DefenceRecord {
  actorId: ActorId
  skillId: SkillId
  connectsAt: number
}

export interface TimelineSkill {
  instanceId: InstanceId
  actorId: ActorId
  skillId: SkillId
  startedAt: number
  startupTicks: number
  deliveryTicks: number
  endingTicks: number
  endingEndsAt: number
  targetActorId: ActorId | null
  reactingToInstanceId: InstanceId | null
  resolved: boolean
  traded: boolean
  respondedBy: ActorId[]
  defence: DefenceRecord | null
}

export interface Timeline {
  tick: number
  nextInstanceId: number
  active: TimelineSkill[]
}

export interface CombatActor {
  id: ActorId
  side: ActorSide
  characterId: CharacterId
  runtime: CharacterRuntime
}

export interface ReactionWindow {
  reactorActorId: ActorId
  incomingInstanceId: InstanceId
  reactAt: number
  deadline: number
}

export type PendingDecision =
  | { kind: 'action'; actorId: ActorId }
  | { kind: 'reaction'; window: ReactionWindow }

export interface ContentBundle {
  skills: Record<SkillId, SkillDef>
  characters: Record<CharacterId, CharacterTemplate>
}

export type CombatOutcome =
  | { status: 'active' }
  | { status: 'ended'; winner: ActorId }

export interface Ruleset {
  reflex: { base: number; scale: number; floor: number }
  perception: { base: number; scale: number; floor: number }
  interruptDuringStartup: { damageMultiplier: number; stagger: number }
  speedScaling: { rate: number; startupFloor: number }
  /** Global multiplier applied after skill power and attack/defense. Defaults to 1. */
  damageMultiplier?: number
  /** Extra multiplier for damage dealt by enemies. Defaults to 1. */
  enemyDamageMultiplier?: number
}

export interface CombatState {
  actors: Record<ActorId, CombatActor>
  roster: ActorId[]
  content: ContentBundle
  rules: Ruleset
  timeline: Timeline
  pending: PendingDecision | null
  outcome: CombatOutcome
  log: CombatLogEntry[]
}
