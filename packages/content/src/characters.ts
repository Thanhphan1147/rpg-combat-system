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

  for (const key of STAT_ORDER) {
    const jitter = 0.9 + random() * 0.2
    stats[key] = Math.max(
      MINIMUMS[key],
      Math.round(player.baseStats[key] * ratio * jitter),
    )
  }

  const adjustable = (): Stat => STAT_ORDER[Math.floor(random() * STAT_ORDER.length)]!
  let diff = target - STAT_ORDER.reduce((sum, key) => sum + stats[key], 0)
  while (diff > 0) {
    stats[adjustable()] += 1
    diff -= 1
  }
  while (diff < 0) {
    const key = adjustable()
    if (stats[key] > MINIMUMS[key]) {
      stats[key] -= 1
      diff += 1
    }
  }

  return { id: 'goblin', name: 'Goblin', baseStats: stats }
}

export const characters: Record<string, CharacterTemplate> = {
  wanderer,
  goblin: rollGoblin(wanderer, () => 0.5),
}
