import type { SkillId, StatBlock } from '@rpg/engine'
import { wanderer } from './characters'
import { BASE_PLAYER_SKILLS, enemyArchetypes } from './encounter'
import type { EnemyArchetype, PlayerBuild } from './encounter'
import { EQUIPMENT_SLOTS } from './equipment'
import type { Equipment, EquipmentSlot } from './equipment'
import { STAT_ORDER, sumBuffs } from './stats'

/**
 * A monster's essence: a huge fixed stat boost plus one of that monster's
 * signature skills, rolled when the monster is killed. Essences are rare, so
 * each one is a major power spike.
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
  items: Equipment[]
  gear: Record<EquipmentSlot, Equipment | null>
  nextEssenceId: number
}

/** XP needed to go from `level` to `level + 1`. */
export const XP_PER_LEVEL = 100

/** Chance that a kill also drops an essence. */
export const ESSENCE_DROP_RATE = 0.1

export function xpForNextLevel(level: number): number {
  return XP_PER_LEVEL * level
}

function emptyGear(): Record<EquipmentSlot, Equipment | null> {
  return { weapon: null, armor: null, helmet: null, boots: null }
}

/** A fresh run starts at level 1 with a single, empty essence slot. */
export function createRun(): RunState {
  return {
    level: 1,
    xp: 0,
    essences: [],
    slots: [null],
    items: [],
    gear: emptyGear(),
    nextEssenceId: 1,
  }
}

export function findArchetype(id: string): EnemyArchetype | undefined {
  return enemyArchetypes.find((archetype) => archetype.id === id)
}

/**
 * The skills an essence can roll: the enemy's kit minus the moves every
 * wanderer already knows. Falls back to the full kit if nothing is left.
 */
export function essenceSkillPool(archetype: EnemyArchetype): SkillId[] {
  const signature = archetype.skillIds.filter(
    (skillId) => !BASE_PLAYER_SKILLS.includes(skillId),
  )
  return signature.length > 0 ? signature : archetype.skillIds
}

export interface VictoryReward {
  archetypeId: string
  equipment: Equipment[]
}

/**
 * Awards XP for a kill, levels up as many times as the XP allows (each level
 * adds one empty essence slot), takes the monster's gear, and rolls a 10%
 * chance for an essence.
 */
export function applyVictory(
  run: RunState,
  reward: VictoryReward,
  random: () => number = Math.random,
): RunState {
  const archetype = findArchetype(reward.archetypeId)
  const items = [...run.items, ...reward.equipment]
  if (archetype === undefined) {
    return { ...run, items }
  }

  let level = run.level
  let xp = run.xp + archetype.xp
  const slots = [...run.slots]
  while (xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level)
    level += 1
    slots.push(null)
  }

  let essences = run.essences
  let nextEssenceId = run.nextEssenceId
  if (random() < ESSENCE_DROP_RATE) {
    const pool = essenceSkillPool(archetype)
    const skillId = pool[Math.floor(random() * pool.length)] ?? pool[0]
    if (skillId !== undefined) {
      essences = [
        ...essences,
        {
          id: `essence-${nextEssenceId}`,
          name: archetype.essenceName,
          sourceId: archetype.id,
          sourceName: archetype.name,
          buffs: { ...archetype.essenceBuffs },
          skillId,
        },
      ]
      nextEssenceId += 1
    }
  }

  return { ...run, level, xp, essences, slots, items, nextEssenceId }
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

/** Empties an essence slot, returning its essence to the reserve. */
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

/**
 * Equips an item from the reserve. If the slot is occupied, the old item
 * returns to the reserve.
 */
export function equipItem(run: RunState, itemId: string): RunState {
  const item = run.items.find((candidate) => candidate.id === itemId)
  if (item === undefined) {
    return run
  }
  const previous = run.gear[item.slot]
  const items = run.items.filter((candidate) => candidate.id !== itemId)
  if (previous !== null) {
    items.push(previous)
  }
  return { ...run, items, gear: { ...run.gear, [item.slot]: item } }
}

/** Empties an equipment slot, returning its item to the reserve. */
export function unequipItem(run: RunState, slot: EquipmentSlot): RunState {
  const item = run.gear[slot]
  if (item === null) {
    return run
  }
  return { ...run, items: [...run.items, item], gear: { ...run.gear, [slot]: null } }
}

export function equippedGear(run: RunState): Equipment[] {
  return EQUIPMENT_SLOTS.map((slot) => run.gear[slot]).filter(
    (item): item is Equipment => item !== null,
  )
}

export function equippedEssences(run: RunState): Essence[] {
  return run.slots.filter((essence): essence is Essence => essence !== null)
}

/** Sum of every equipped essence's and item's fixed stat boosts. */
export function statBonuses(run: RunState): StatBlock {
  return sumBuffs([
    ...equippedEssences(run).map((essence) => essence.buffs),
    ...equippedGear(run).map((item) => item.buffs),
  ])
}

export function equipmentBonuses(run: RunState): StatBlock {
  return sumBuffs(equippedGear(run).map((item) => item.buffs))
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
