import type { ActorId, SkillId } from './ids'
import type { Intent } from './intent'
import type { SkillKind } from './skill'
import type { ActorSide, CombatState } from './state'

/**
 * One selectable choice in a {@link Prompt}: a skill the actor can act or react
 * with. Built from the actor's available skills and the reaction rules
 * (block, dodge, gamble any skill, or precise options when identified).
 */
export interface PromptOption {
  skillId: SkillId
  label: string
  kind: SkillKind
}

/**
 * A decision the engine is waiting on: which actor must choose, and their legal
 * options. Returned by {@link Combat.getPrompt}; the UI renders these and sends
 * the chosen {@link Intent} back.
 */
export interface Prompt {
  kind: 'action' | 'reaction'
  actorId: ActorId
  options: PromptOption[]
}

/**
 * Read-only view of one actor for rendering: identity, HP, current action and
 * cooldowns. Produced by {@link Combat.snapshot}.
 */
export interface ActorSnapshot {
  id: ActorId
  side: ActorSide
  name: string
  hp: number
  maxHp: number
  actingSkillId: SkillId | null
  cooldowns: Record<string, number>
}

/**
 * Read-only view of the whole fight for rendering: current tick, status, winner
 * and actors. Produced by {@link Combat.snapshot}.
 */
export interface CombatSnapshot {
  tick: number
  status: 'active' | 'ended'
  winner: ActorId | null
  actors: ActorSnapshot[]
}

/**
 * Result of applying an {@link Intent}: the next {@link Prompt} (or `null` when
 * combat has ended) and whether the fight is over.
 */
export interface CombatStepResult {
  prompt: Prompt | null
  ended: boolean
}

/**
 * The engine facade the UI drives. Read `state` directly, call `getPrompt()` to
 * see what input is needed, apply the player's choice with `step()`, and call
 * `snapshot()` for a rendering-friendly view.
 */
export interface Combat {
  readonly state: CombatState
  getPrompt(): Prompt | null
  step(intent: Intent): CombatStepResult
  snapshot(): CombatSnapshot
}
