import type { ActorId, SkillId } from './ids'

/** Input for the turn loop: act, react to an open window, or decline it. */
export type Intent =
  | { kind: 'act'; skillId: SkillId; targetActorId?: ActorId }
  | { kind: 'react'; skillId: SkillId }
  | { kind: 'pass' }
