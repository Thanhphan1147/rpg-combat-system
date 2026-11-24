import { Stat } from '@rpg/engine'
import type { StatBlock } from '@rpg/engine'
import { HP_PER_POINT, STAT_ORDER } from './stats'

export type EquipmentSlot = 'weapon' | 'armor' | 'helmet' | 'boots'

export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'helmet', 'boots']

export interface Equipment {
  id: string
  slot: EquipmentSlot
  name: string
  flavor: string
  buffs: Partial<StatBlock>
}

/** Fraction of an item's budget reserved for its signature stats. */
export const EQUIPMENT_CORE_WEIGHT = 0.6
export const EQUIPMENT_BASE_BUDGET = 40
export const EQUIPMENT_BUDGET_PER_LEVEL = 15

interface SlotProfile {
  core: Partial<Record<Stat, number>>
  off: Partial<Record<Stat, number>>
}

const SLOT_PROFILES: Record<EquipmentSlot, SlotProfile> = {
  weapon: {
    core: { attack: 1 },
    off: { speed: 0.5, reflex: 0.5 },
  },
  armor: {
    core: { maxHp: 0.7, defense: 0.3 },
    off: { perception: 0.5, reflex: 0.5 },
  },
  helmet: {
    core: { perception: 0.6, reflex: 0.4 },
    off: { maxHp: 0.7, defense: 0.3 },
  },
  boots: {
    core: { speed: 1 },
    off: { reflex: 0.6, defense: 0.4 },
  },
}

const PREFIXES = [
  'Rusted',
  'Bone',
  'Scaled',
  'Horned',
  'Padded',
  'Jagged',
  'Heavy',
  'Swift',
  'Grim',
  'Savage',
]

const NOUNS: Record<EquipmentSlot, string[]> = {
  weapon: ['Blade', 'Cleaver', 'Spear', 'Fang', 'Club', 'Axe'],
  armor: ['Vest', 'Mail', 'Cuirass', 'Hide', 'Plate'],
  helmet: ['Cap', 'Helm', 'Casque', 'Hood', 'Crown'],
  boots: ['Boots', 'Greaves', 'Treads', 'Striders'],
}

const FLAVOR: Record<EquipmentSlot, string[]> = {
  weapon: [
    'The edge is pitted and dark with old blood.',
    'Its grip is wrapped in cracked, sweat-stained leather.',
    'A crude length of iron, heavy enough to split a skull.',
    'The blade rings faintly when the wind catches it.',
    'Notches along the edge mark every fight it has survived.',
    'The point is jagged, broken, and still eager.',
  ],
  armor: [
    'Stitched hide plates, stiff with salt and old sweat.',
    'Bone rings are lashed over a backing of boiled leather.',
    'The scales overlap like a second, dead skin.',
    'A patchwork of iron and hide that has seen better wars.',
    'The straps are frayed, but the chest is still solid.',
    'Dents in the plating remember blows that never healed.',
  ],
  helmet: [
    'A hollowed skull lined with greasy rags.',
    'The visor is a narrow slit of black iron.',
    'Horn stubs jut from a cap of hardened hide.',
    'The inside is dark and smells of old smoke.',
    'A crown of bent nails and scavenged plate.',
    'The leather is cracked, but the rivets hold.',
  ],
  boots: [
    'The soles are worn thin by long, quiet marches.',
    "Scales overlap down the shin like a lizard's leg.",
    'The laces are replaced with strips of gut.',
    'Mud never quite dries out of the seams.',
    'Soft soles, made for moving without a sound.',
    'Iron caps protect toes that have been broken before.',
  ],
}

let nextEquipmentId = 1

export function equipmentBudget(level: number): number {
  return EQUIPMENT_BASE_BUDGET + EQUIPMENT_BUDGET_PER_LEVEL * Math.max(0, level - 1)
}

/** Chance weights for 1, 2, 3, and 4 worn pieces. */
const EQUIPMENT_PIECE_WEIGHTS = [60, 25, 10, 5]

/** Rolls 1-4 worn pieces; each extra piece is rarer than the last. */
export function rollEquipmentCount(random: () => number = Math.random): number {
  const roll = random() * 100
  let cumulative = 0
  for (let index = 0; index < EQUIPMENT_PIECE_WEIGHTS.length; index += 1) {
    cumulative += EQUIPMENT_PIECE_WEIGHTS[index]!
    if (roll < cumulative) {
      return index + 1
    }
  }
  return EQUIPMENT_PIECE_WEIGHTS.length
}

function pick<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)] ?? values[0]!
}

function normalize(weights: Partial<Record<Stat, number>>): Map<Stat, number> {
  const map = new Map<Stat, number>()
  let total = 0
  for (const stat of STAT_ORDER) {
    total += weights[stat] ?? 0
  }
  if (total <= 0) {
    return map
  }
  for (const stat of STAT_ORDER) {
    const weight = weights[stat] ?? 0
    if (weight > 0) {
      map.set(stat, weight / total)
    }
  }
  return map
}

function splitShares(profile: SlotProfile, coreWeight: number): Map<Stat, number> {
  const shares = new Map<Stat, number>()
  const core = normalize(profile.core)
  const off = normalize(profile.off)

  for (const [stat, weight] of core) {
    shares.set(stat, (shares.get(stat) ?? 0) + weight * coreWeight)
  }
  for (const [stat, weight] of off) {
    shares.set(stat, (shares.get(stat) ?? 0) + weight * (1 - coreWeight))
  }
  return shares
}

function rollBuffs(
  profile: SlotProfile,
  level: number,
  coreWeight: number,
  random: () => number,
): Partial<StatBlock> {
  const shares = splitShares(profile, coreWeight)
  const jittered = new Map<Stat, number>()
  let total = 0

  for (const [stat, share] of shares) {
    const jitter = share * (0.75 + random() * 0.5)
    jittered.set(stat, jitter)
    total += jitter
  }

  if (total <= 0) {
    return {}
  }

  const budget = equipmentBudget(level)
  const buffs: Partial<StatBlock> = {}
  for (const [stat, jitter] of jittered) {
    const points = (budget * jitter) / total
    const value = stat === Stat.MaxHp ? Math.round(points * HP_PER_POINT) : Math.round(points)
    const minimum = stat === Stat.MaxHp ? HP_PER_POINT : 1
    buffs[stat] = Math.max(minimum, value)
  }
  return buffs
}

function flavorFor(slot: EquipmentSlot, name: string): string {
  const options = FLAVOR[slot]
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return options[hash % options.length]!
}

/**
 * Rolls one piece of gear. `coreWeight` is the share of the stat budget that
 * goes to the slot's signature stats (weapon attack, armor health/defense,
 * helmet perception/reflex, boots speed); the rest is spread over secondary
 * stats.
 */
export function createEquipment(
  slot: EquipmentSlot,
  level: number,
  random: () => number = Math.random,
  coreWeight: number = EQUIPMENT_CORE_WEIGHT,
): Equipment {
  const name = `${pick(PREFIXES, random)} ${pick(NOUNS[slot], random)}`
  const buffs = rollBuffs(SLOT_PROFILES[slot], level, coreWeight, random)
  const flavor = flavorFor(slot, name)
  const id = `gear-${nextEquipmentId}`
  nextEquipmentId += 1
  return {
    id,
    slot,
    name,
    flavor,
    buffs,
  }
}

/** Rolls between one and four pieces covering distinct slots. */
export function rollEquipment(
  level: number,
  random: () => number = Math.random,
  count: number = rollEquipmentCount(random),
  coreWeight: number = EQUIPMENT_CORE_WEIGHT,
): Equipment[] {
  const slots = [...EQUIPMENT_SLOTS]
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const current = slots[index]!
    slots[index] = slots[swap]!
    slots[swap] = current
  }

  const chosen = slots.slice(0, Math.max(0, Math.min(count, slots.length)))
  return chosen.map((slot) => createEquipment(slot, level, random, coreWeight))
}
