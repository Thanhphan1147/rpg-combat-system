import type { CharacterId, EquipmentId, SkillId } from './ids'
import type { StatBlock, StatMods } from './stats'

export interface CharacterTemplate {
  id: CharacterId
  name: string
  baseStats: StatBlock
}

export interface EquipmentDef {
  id: EquipmentId
  name: string
  statMods: StatMods
}

export interface CharacterRuntime {
  templateId: CharacterId
  level: number
  pools: { hp: number }
  equipmentIds: EquipmentId[]
  skillIds: SkillId[]
  cooldowns: Record<string, number>
}
