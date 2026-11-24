/**
 * Nominal-typing helper. Intersects a base type with a phantom `__brand` field
 * so structurally identical types (e.g. `ActorId` and `SkillId`, both strings)
 * are not interchangeable — this catches ID mix-ups at compile time while the
 * runtime value stays a plain string.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B }

/** Identifier for a combat participant. */
export type ActorId = Brand<string, 'ActorId'>
/** Identifier for a skill definition. */
export type SkillId = Brand<string, 'SkillId'>
/** Identifier for an authored character template. */
export type CharacterId = Brand<string, 'CharacterId'>

/** Brands a plain string as an {@link ActorId}. Use where actor IDs are created. */
export function actorId(value: string): ActorId {
  return value as ActorId
}

/** Brands a plain string as a {@link SkillId}. Use where skill IDs are created. */
export function skillId(value: string): SkillId {
  return value as SkillId
}

/** Brands a plain string as a {@link CharacterId}. Use where character IDs are created. */
export function characterId(value: string): CharacterId {
  return value as CharacterId
}
