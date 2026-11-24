import type { CharacterTemplate, Stat, StatBlock } from '@rpg/engine'
import { Stat as Stats } from '@rpg/engine'

export const wanderer: CharacterTemplate = {
  id: 'wanderer',
  name: 'The Wanderer',
  baseStats: { speed: 120, reflex: 120, perception: 120, maxHp: 1000, attack: 100, defense: 50 },
}

const MINIMUMS: StatBlock = {
  speed: 20,
  reflex: 20,
  perception: 20,
  maxHp: 250,
  attack: 20,
  defense: 20,
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
 * Rolls a goblin whose base stats total between 85% and 115% of the player's
 * total. The extra points are distributed randomly, weighted by the player's own
 * profile, so each fight presents a different threat.
 */
export function rollGoblin(
  player: CharacterTemplate,
  random: () => number = Math.random,
): CharacterTemplate {
  const stats: StatBlock = { ...MINIMUMS }

  const playerTotal = STAT_ORDER.reduce((sum, key) => sum + player.baseStats[key], 0)
  const ratio = 0.85 + random() * 0.3
  const target = Math.round(playerTotal * ratio)
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
