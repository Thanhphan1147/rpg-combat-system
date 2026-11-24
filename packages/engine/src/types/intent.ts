import type { ActorId, InstanceId, SkillId } from './ids'

export type Intent =
  | { kind: 'act'; skillId: SkillId; targetActorId?: ActorId }
  | { kind: 'react'; skillId: SkillId; incomingInstanceId: InstanceId }
