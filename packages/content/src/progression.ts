import type { SkillId, StatBlock } from '@rpg/engine'
import { Stat } from '@rpg/engine'
import { wanderer } from './characters'
import { BASE_PLAYER_SKILLS, goblinArchetypes } from './encounter'
import type { GoblinArchetype, PlayerBuild } from './encounter'

/**
 * A monster's essence: a fixed stat boost plus one of that monster's signature
 * skills, rolled when the monster is killed. Load one into a slot to benefit
 * from it; loading over another essence returns the old one to the reserve.
 */
export interface Essence {
  id: string
  name: string
  sourceId: string
  sourceName: string
  buffs: Partial<StatBlock>
  skillId: SkillId
}

/** Everything that persists between fights in a single run. */
export interface RunState {
  level: number
  xp: number
  essences: Essence[]
  slots: (Essence | null)[]
  nextEssenceId: number
}

const STAT_ORDER: Stat[] = [
  Stat.MaxHp,
  Stat.Attack,
  Stat.Defense,
  Stat.Speed,
  Stat.Reflex,
  Stat.Perception,
]

/** XP needed to go from `level` to `level + 1`. */
export const XP_PER_LEVEL = 100

export function xpForNextLevel(level: number): number {
  return XP_PER_LEVEL * level
}

/** A fresh run starts at level 1 with a single, empty essence slot. */
export function createRun(): RunState {
  return {
    level: 1,
    xp: 0,
    essences: [],
    slots: [null],
    nextEssenceId: 1,
  }
}

export function findArchetype(id: string): GoblinArchetype | undefined {
  return goblinArchetypes.find((archetype) => archetype.id === id)
}

/**
 * The skills an essence can roll: the monster's kit minus the moves every
 * wanderer already knows. Falls back to the full kit if nothing is left.
 */
export function essenceSkillPool(archetype: GoblinArchetype): SkillId[] {
  const signature = archetype.skillIds.filter(
    (skillId) => !BASE_PLAYER_SKILLS.includes(skillId),
  )
  return signature.length > 0 ? signature : archetype.skillIds
}

/**
 * Awards XP for a kill, levels up as many times as the XP allows (each level
 * adds one empty essence slot), and drops one essence from the monster.
 */
export function applyVictory(
  run: RunState,
  archetypeId: string,
  random: () => number = Math.random,
): RunState {
  const archetype = findArchetype(archetypeId)
  if (archetype === undefined) {
    return run
  }

  const pool = essenceSkillPool(archetype)
  const skillId = pool[Math.floor(random() * pool.length)] ?? pool[0]
  if (skillId === undefined) {
    return run
  }

  const essence: Essence = {
    id: `essence-${run.nextEssenceId}`,
    name: archetype.essenceName,
    sourceId: archetype.id,
    sourceName: archetype.name,
    buffs: { ...archetype.essenceBuffs },
    skillId,
  }

  let level = run.level
  let xp = run.xp + archetype.xp
  const slots = [...run.slots]
  while (xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level)
    level += 1
    slots.push(null)
  }

  return {
    level,
    xp,
    essences: [...run.essences, essence],
    slots,
    nextEssenceId: run.nextEssenceId + 1,
  }
}

/**
 * Loads an essence from the reserve into a slot. Any essence already in that
 * slot is returned to the reserve.
 */
export function loadEssence(
  run: RunState,
  essenceId: string,
  slotIndex: number,
): RunState {
  if (slotIndex < 0 || slotIndex >= run.slots.length) {
    return run
  }
  const essence = run.essences.find((candidate) => candidate.id === essenceId)
  if (essence === undefined) {
    return run
  }

  const slots = [...run.slots]
  const previous = slots[slotIndex] ?? null
  slots[slotIndex] = essence
  const essences = run.essences.filter((candidate) => candidate.id !== essenceId)
  if (previous !== null) {
    essences.push(previous)
  }
  return { ...run, slots, essences }
}

/** Empties a slot, returning its essence to the reserve. */
export function unloadEssence(run: RunState, slotIndex: number): RunState {
  if (slotIndex < 0 || slotIndex >= run.slots.length) {
    return run
  }
  const essence = run.slots[slotIndex]
  if (essence === null || essence === undefined) {
    return run
  }
  const slots = [...run.slots]
  slots[slotIndex] = null
  return { ...run, slots, essences: [...run.essences, essence] }
}

export function equippedEssences(run: RunState): Essence[] {
  return run.slots.filter((essence): essence is Essence => essence !== null)
}

/** Sum of every equipped essence's fixed stat boosts. */
export function statBonuses(run: RunState): StatBlock {
  const bonuses: StatBlock = {
    speed: 0,
    reflex: 0,
    perception: 0,
    maxHp: 0,
    attack: 0,
    defense: 0,
  }
  for (const essence of equippedEssences(run)) {
    for (const stat of STAT_ORDER) {
      bonuses[stat] += essence.buffs[stat] ?? 0
    }
  }
  return bonuses
}

export function playerStats(run: RunState): StatBlock {
  const bonuses = statBonuses(run)
  const stats: StatBlock = { ...wanderer.baseStats }
  for (const stat of STAT_ORDER) {
    stats[stat] += bonuses[stat]
  }
  return stats
}

/** Base kit plus every skill granted by an equipped essence, without duplicates. */
export function playerSkillIds(run: RunState): SkillId[] {
  const skillIds = [...BASE_PLAYER_SKILLS]
  for (const essence of equippedEssences(run)) {
    if (!skillIds.includes(essence.skillId)) {
      skillIds.push(essence.skillId)
    }
  }
  return skillIds
}

export function buildPlayer(run: RunState): PlayerBuild {
  return {
    character: { ...wanderer, baseStats: playerStats(run) },
    skillIds: playerSkillIds(run),
  }
}
