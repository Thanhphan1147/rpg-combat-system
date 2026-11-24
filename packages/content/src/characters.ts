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

export interface RollMonsterOptions {
  id?: string
  name?: string
  bias?: Partial<StatBlock>
  power?: number
  level?: number
}

/** Enemy stat totals grow by this fraction per run level. */
export const LEVEL_STAT_GROWTH = 0.08

/**
 * Rolls a monster whose base stats total between 85% and 115% of the player's
 * total, multiplied by its archetype power and run level. The extra points are
 * distributed randomly around the player's profile (optionally biased toward an
 * archetype), so each fight presents a different threat.
 */
export function rollMonster(
  player: CharacterTemplate,
  random: () => number = Math.random,
  options: RollMonsterOptions = {},
): CharacterTemplate {
  const stats: StatBlock = { ...MINIMUMS }
  const bias = options.bias ?? {}

  const playerTotal = STAT_ORDER.reduce((sum, key) => sum + player.baseStats[key], 0)
  const level = Math.max(1, options.level ?? 1)
  const levelFactor = 1 + LEVEL_STAT_GROWTH * (level - 1)
  const ratio = (0.85 + random() * 0.3) * (options.power ?? 1) * levelFactor
  const target = Math.round(playerTotal * ratio)

  const weightFor = (key: Stat): number => player.baseStats[key] * (bias[key] ?? 1)
  const weightTotal = STAT_ORDER.reduce((sum, key) => sum + weightFor(key), 0)

  for (const key of STAT_ORDER) {
    const jitter = 0.9 + random() * 0.2
    stats[key] = Math.max(
      MINIMUMS[key],
      Math.round((target * weightFor(key) * jitter) / weightTotal),
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

  return {
    id: options.id ?? 'goblin',
    name: options.name ?? 'Goblin',
    baseStats: stats,
  }
}

export const characters: Record<string, CharacterTemplate> = {
  wanderer,
}
