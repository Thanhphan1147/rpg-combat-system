import type { ActorId, CharacterId, EffectId, EquipmentId, SkillId } from './ids'
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

export interface EffectInstance {
  instanceId: string
  effectId: EffectId
  sourceActorId: ActorId | null
  remainingTicks: number
  statMods: StatMods
}

export interface CharacterRuntime {
  templateId: CharacterId
  pools: { hp: number }
  effects: EffectInstance[]
  cooldowns: Record<string, number>
}
