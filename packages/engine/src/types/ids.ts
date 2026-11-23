export type Brand<T, B extends string> = T & { readonly __brand: B }

export type ActorId = Brand<string, 'ActorId'>
export type SkillId = Brand<string, 'SkillId'>
export type CharacterId = Brand<string, 'CharacterId'>

export function actorId(value: string): ActorId {
  return value as ActorId
}

export function skillId(value: string): SkillId {
  return value as SkillId
}

export function characterId(value: string): CharacterId {
  return value as CharacterId
}
