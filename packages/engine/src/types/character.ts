import type { CharacterId, SkillId } from './ids'
import type { StatBlock } from './stats'

export interface CharacterTemplate {
  id: CharacterId
  name: string
  baseStats: StatBlock
}

export interface CharacterRuntime {
  pools: { hp: number }
  skillIds: SkillId[]
  cooldowns: Record<string, number>
}
