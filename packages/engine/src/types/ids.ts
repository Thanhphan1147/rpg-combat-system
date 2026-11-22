export type Brand<T, B extends string> = T & { readonly __brand: B }

export type ActorId = Brand<string, 'ActorId'>
export type SkillId = Brand<string, 'SkillId'>
export type CharacterId = Brand<string, 'CharacterId'>
export type EquipmentId = Brand<string, 'EquipmentId'>
export type EffectId = Brand<string, 'EffectId'>

export function actorId(value: string): ActorId {
  return value as ActorId
}

export function skillId(value: string): SkillId {
  return value as SkillId
}

export function characterId(value: string): CharacterId {
  return value as CharacterId
}

export function equipmentId(value: string): EquipmentId {
  return value as EquipmentId
}

export function effectId(value: string): EffectId {
  return value as EffectId
}
