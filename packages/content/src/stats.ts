import type { StatBlock } from '@rpg/engine'
import { Stat } from '@rpg/engine'

export const STAT_ORDER: Stat[] = [
  Stat.MaxHp,
  Stat.Attack,
  Stat.Defense,
  Stat.Speed,
  Stat.Reflex,
  Stat.Perception,
]

/** Approximate value of one point of Max HP relative to the other stats. */
export const HP_PER_POINT = 10

export function emptyBuffs(): StatBlock {
  return { maxHp: 0, attack: 0, defense: 0, speed: 0, reflex: 0, perception: 0 }
}

export function sumBuffs(buffs: Iterable<Partial<StatBlock>>): StatBlock {
  const total = emptyBuffs()
  for (const buff of buffs) {
    for (const stat of STAT_ORDER) {
      total[stat] += buff[stat] ?? 0
    }
  }
  return total
}

export function addBuffs(base: StatBlock, buffs: Partial<StatBlock>): StatBlock {
  const result = { ...base }
  for (const stat of STAT_ORDER) {
    result[stat] += buffs[stat] ?? 0
  }
  return result
}

/** Rough power score used for comparing items and enemies. */
export function statScore(buffs: Partial<StatBlock>): number {
  return (
    (buffs.maxHp ?? 0) / HP_PER_POINT +
    (buffs.attack ?? 0) +
    (buffs.defense ?? 0) +
    (buffs.speed ?? 0) +
    (buffs.reflex ?? 0) +
    (buffs.perception ?? 0)
  )
}

/** Raw sum of every stat, matching the enemy roll's total. */
export function statTotal(stats: Partial<StatBlock>): number {
  return STAT_ORDER.reduce((sum, stat) => sum + (stats[stat] ?? 0), 0)
}
