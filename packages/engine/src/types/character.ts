import type { CharacterId, EquipmentId, SkillId } from './ids'
import type { StatBlock, StatMods } from './stats'

export interface CharacterTemplate {
  id: CharacterId
  name: string
  baseStats: StatBlock
  skillIds: SkillId[]
  equipmentIds: EquipmentId[]
}

export interface EquipmentDef {
  id: EquipmentId
  name: string
  statMods: StatMods
  grantedSkillIds: SkillId[]
}

export interface CharacterRuntime {
  templateId: CharacterId
  pools: { hp: number }
  cooldowns: Record<string, number>
}
