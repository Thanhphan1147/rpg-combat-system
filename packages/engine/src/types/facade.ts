import type { ActorId, InstanceId, SkillId } from './ids'
import type { Intent } from './intent'
import type { SkillKind } from './skill'
import type { ActorSide, CombatOutcome, CombatState } from './state'

/**
 * One selectable choice in a {@link Prompt}: a skill the actor can act or react
 * with. `identified` reflects whether Perception read the incoming skill, and
 * `description` is the matching vague or precise text.
 */
export interface PromptOption {
  skillId: SkillId
  label: string
  kind: SkillKind
  identified: boolean
  description: string
}

/**
 * What the reacting actor currently knows about the incoming skill: its
 * instance, owner, the (possibly concealed) skill and when it connects.
 */
export interface IncomingSkillInfo {
  instanceId: InstanceId
  actorId: ActorId
  skillId: SkillId
  identified: boolean
  connectAt: number
}

/** A prompt where an actor chooses their next action. */
export interface ActionPrompt {
  kind: 'action'
  actorId: ActorId
  options: PromptOption[]
}

/** A prompt where an actor may react to an incoming skill. */
export interface ReactionPrompt {
  kind: 'reaction'
  actorId: ActorId
  options: PromptOption[]
  incoming: IncomingSkillInfo
}

/** The decision the engine is waiting on. */
export type Prompt = ActionPrompt | ReactionPrompt

/**
 * Read-only view of one actor for rendering: identity, HP, active attack and
 * reaction, and cooldown timers. Produced by {@link Combat.snapshot}.
 */
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

/**
 * Read-only view of the whole fight for rendering. Produced by
 * {@link Combat.snapshot}.
 */
export interface CombatSnapshot {
  tick: number
  outcome: CombatOutcome
  actors: ActorSnapshot[]
}

/**
 * The engine facade the UI drives. Read `state` directly, call `getPrompt()` to
 * see what input is needed, apply the player's choice with `step()` (which
 * returns the next prompt or `null` when the fight is over), and call
 * `snapshot()` for a rendering-friendly view.
 */
export interface Combat {
  readonly state: Readonly<CombatState>
  getPrompt(): Prompt | null
  step(intent: Intent): Prompt | null
  snapshot(): CombatSnapshot
}
