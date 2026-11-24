import type { CombatantConfig, ContentBundle, Ruleset } from '@rpg/engine'
import { characters, rollGoblin, wanderer } from './characters'
import { standardRules } from './rules'
import { skills } from './skills'

export interface EncounterNarration {
  opening: string
  playerInitiative: string
  enemyInitiative: string
  tooFastPlayer: string
  tooFastEnemy: string
}

/**
 * Everything the app needs to start one fight: the content bundle, the tuning
 * rules, the combatant loadouts, and the framing text.
 */
export interface Encounter {
  id: string
  title: string
  narration: EncounterNarration
  content: ContentBundle
  rules: Ruleset
  combatants: CombatantConfig[]
}

export const goblinEncounter: Encounter = {
  id: 'goblin-ambush',
  title: 'The Goblin Ambush',
  narration: {
    opening: 'You face a goblin in battle.',
    playerInitiative: 'You seize the initiative.',
    enemyInitiative: 'The goblin seizes the initiative.',
    tooFastPlayer: 'The attack is too fast for you to react.',
    tooFastEnemy: 'The attack is too fast for the goblin to react.',
  },
  content: { skills, characters },
  rules: standardRules,
  combatants: [
    {
      id: 'wanderer',
      side: 'player',
      characterId: 'wanderer',
      skillIds: ['slash', 'heavy', 'guard', 'dodge'],
    },
    {
      id: 'goblin',
      side: 'enemy',
      characterId: 'goblin',
      skillIds: ['stab', 'club', 'guard', 'dodge'],
    },
  ],
}

/**
 * A copy of the goblin encounter with freshly rolled goblin stats. Call this
 * once per fight so the opponent varies between runs.
 */
export function rollGoblinEncounter(
  random: () => number = Math.random,
): Encounter {
  return {
    ...goblinEncounter,
    content: {
      ...goblinEncounter.content,
      characters: { ...characters, goblin: rollGoblin(wanderer, random) },
    },
  }
}
