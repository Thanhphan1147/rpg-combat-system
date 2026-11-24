import type { CharacterId, SkillId } from './ids'
import type { StatBlock } from './stats'

export interface CharacterTemplate {
  id: CharacterId
  name: string
  baseStats: StatBlock
}

export interface CharacterRuntime {
  hp: number
  skillIds: SkillId[]
  cooldownEndsAt: Partial<Record<SkillId, number>>
  hitstunUntil: number
  staggeredUntil: number
}
