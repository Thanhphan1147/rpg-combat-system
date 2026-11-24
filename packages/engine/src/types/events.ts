import type { ActorId, InstanceId, SkillId } from './ids'

/**
 * Narration events emitted by the engine as combat unfolds. The UI maps these to
 * prose; they are the only durable record of what happened.
 */
export type CombatEvent =
  | { kind: 'combatStart'; actors: ActorId[] }
  | { kind: 'skillUsed'; actorId: ActorId; skillId: SkillId }
  | {
      kind: 'reactionUsed'
      actorId: ActorId
      skillId: SkillId
      incomingInstanceId: InstanceId
    }
  | { kind: 'hit'; actorId: ActorId; targetActorId: ActorId; skillId: SkillId; damage: number }
  | {
      kind: 'blocked'
      actorId: ActorId
      targetActorId: ActorId
      skillId: SkillId
      damage: number
      complete: boolean
    }
  | { kind: 'dodged'; actorId: ActorId; targetActorId: ActorId; skillId: SkillId }
  | { kind: 'parried'; actorId: ActorId; targetActorId: ActorId; skillId: SkillId }
  | {
      kind: 'interrupted'
      actorId: ActorId
      skillId: SkillId
      byActorId: ActorId
      bySkillId: SkillId
    }
  | { kind: 'staggered'; actorId: ActorId }
  | { kind: 'combatEnd'; winner: ActorId }

export interface CombatLogEntry {
  tick: number
  event: CombatEvent
}
