import type { ActorId, SkillId } from './ids'
import type { Phase } from './skill'

export type CombatEvent =
  | { kind: 'combatStart'; actors: ActorId[] }
  | { kind: 'skillStart'; actorId: ActorId; skillId: SkillId }
  | { kind: 'phaseChange'; actorId: ActorId; skillId: SkillId; phase: Phase }
  | { kind: 'reactionAvailable'; actorId: ActorId; incomingActorId: ActorId }
  | { kind: 'identified'; actorId: ActorId; skillId: SkillId }
  | {
      kind: 'hit'
      actorId: ActorId
      targetActorId: ActorId
      skillId: SkillId
      damage: number
      cleanCounter: boolean
    }
  | {
      kind: 'blocked'
      actorId: ActorId
      targetActorId: ActorId
      skillId: SkillId
      mitigation: number
      complete: boolean
    }
  | { kind: 'dodged'; actorId: ActorId; targetActorId: ActorId; skillId: SkillId }
  | { kind: 'parried'; actorId: ActorId; targetActorId: ActorId; skillId: SkillId }
  | { kind: 'countered'; actorId: ActorId; targetActorId: ActorId; skillId: SkillId }
  | { kind: 'interrupted'; actorId: ActorId; skillId: SkillId }
  | { kind: 'staggered'; actorId: ActorId; ticks: number }
  | { kind: 'cooldownStarted'; actorId: ActorId; skillId: SkillId; readyAt: number }
  | { kind: 'combatEnd'; winner: ActorId | null }

export interface CombatLogEntry {
  tick: number
  event: CombatEvent
}
