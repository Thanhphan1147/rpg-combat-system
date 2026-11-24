import type { CombatantConfig, ContentBundle, Ruleset } from '@rpg/engine'
import { characters } from './characters'
import { standardRules } from './rules'
import { skills } from './skills'

/**
 * Everything the app needs to start one fight: the content bundle, the tuning
 * rules, the combatant loadouts, and the framing text.
 */
export interface Encounter {
  id: string
  title: string
  content: ContentBundle
  rules: Ruleset
  combatants: CombatantConfig[]
}

export const goblinEncounter: Encounter = {
  id: 'goblin-ambush',
  title: 'The Goblin Ambush',
  content: { skills, characters },
  rules: standardRules,
  combatants: [
    {
      id: 'wanderer',
      side: 'player',
      characterId: 'wanderer',
      skillIds: ['slash', 'heavy', 'guard', 'dodge', 'counter'],
    },
    {
      id: 'goblin',
      side: 'enemy',
      characterId: 'goblin',
      skillIds: ['stab', 'club', 'guard'],
    },
  ],
}
