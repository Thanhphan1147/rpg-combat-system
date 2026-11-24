import type { CharacterTemplate, Stat, StatBlock } from '@rpg/engine'
import { Stat as Stats } from '@rpg/engine'

export const wanderer: CharacterTemplate = {
  id: 'wanderer',
  name: 'The Wanderer',
  baseStats: { speed: 12, reflex: 12, perception: 12, maxHp: 100, attack: 10, defense: 5 },
}

const MINIMUMS: StatBlock = {
  speed: 2,
  reflex: 2,
  perception: 2,
  maxHp: 25,
  attack: 2,
  defense: 2,
}

const STAT_ORDER: Stat[] = [
  Stats.MaxHp,
  Stats.Attack,
  Stats.Defense,
  Stats.Speed,
  Stats.Reflex,
  Stats.Perception,
]

/**
 * Rolls a goblin whose base stats total 80% of the player's total. The extra
 * points are distributed randomly, weighted by the player's own profile, so each
 * fight presents a slightly different threat.
 */
export function rollGoblin(
  player: CharacterTemplate,
  random: () => number = Math.random,
): CharacterTemplate {
  const stats: StatBlock = { ...MINIMUMS }

  const playerTotal = STAT_ORDER.reduce((sum, key) => sum + player.baseStats[key], 0)
  const target = Math.round(playerTotal * 0.8)
  let remaining = target - STAT_ORDER.reduce((sum, key) => sum + stats[key], 0)

  const pool: Stat[] = []
  for (const key of STAT_ORDER) {
    const weight = Math.max(1, player.baseStats[key])
    for (let i = 0; i < weight; i += 1) {
      pool.push(key)
    }
  }

  while (remaining > 0 && pool.length > 0) {
    const key = pool[Math.floor(random() * pool.length)]!
    stats[key] += 1
    remaining -= 1
  }

  return { id: 'goblin', name: 'Goblin', baseStats: stats }
}

export const characters: Record<string, CharacterTemplate> = {
  wanderer,
  goblin: rollGoblin(wanderer, () => 0.5),
}
