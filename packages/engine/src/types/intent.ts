import type { ActorId, SkillId } from './ids'

export type Intent =
  | { kind: 'act'; skillId: SkillId; targetActorId?: ActorId }
  | { kind: 'react'; skillId: SkillId }
  | { kind: 'wait' }
