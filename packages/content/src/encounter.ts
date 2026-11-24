import type {
  CharacterTemplate,
  CombatantConfig,
  ContentBundle,
  Ruleset,
  StatBlock,
} from '@rpg/engine'
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

/** A goblin variant: name, loadout, stat bias, and opening line. */
export interface GoblinArchetype {
  id: string
  name: string
  characterId: string
  skillIds: string[]
  bias: Partial<StatBlock>
  opening: string
}

const PLAYER_SKILLS = ['basic', 'slash', 'heavy', 'guard', 'dodge']

export const goblinArchetypes: GoblinArchetype[] = [
  {
    id: 'clubber',
    name: 'Goblin Clubber',
    characterId: 'goblin',
    skillIds: ['basic', 'stab', 'club', 'guard', 'dodge'],
    bias: {},
    opening: 'You face a goblin clubber in battle.',
  },
  {
    id: 'archer',
    name: 'Goblin Archer',
    characterId: 'goblin_archer',
    skillIds: ['basic', 'snapShot', 'quickShot', 'aimedShot', 'dodge', 'guard'],
    bias: { speed: 1.3, reflex: 1.3, perception: 1.2, maxHp: 0.85, attack: 0.75, defense: 0.75 },
    opening: 'You face a goblin archer in battle.',
  },
  {
    id: 'berserker',
    name: 'Goblin Berserker',
    characterId: 'goblin_berserker',
    skillIds: ['basic', 'headbutt', 'cleave', 'slam', 'brace'],
    bias: { maxHp: 1.3, attack: 1.3, defense: 1.1, speed: 0.95, reflex: 1.15, perception: 0.9 },
    opening: 'You face a goblin berserker in battle.',
  },
]

function buildEncounter(archetype: GoblinArchetype, goblin: CharacterTemplate): Encounter {
  return {
    id: archetype.id,
    title: archetype.name,
    narration: {
      opening: archetype.opening,
      playerInitiative: 'You seize the initiative.',
      enemyInitiative: `The ${archetype.name.toLowerCase()} seizes the initiative.`,
      tooFastPlayer: 'The attack is too fast for you to react.',
      tooFastEnemy: 'The attack is too fast for the goblin to react.',
    },
    content: {
      skills,
      characters: { ...characters, [archetype.characterId]: goblin },
    },
    rules: standardRules,
    combatants: [
      { id: 'wanderer', side: 'player', characterId: 'wanderer', skillIds: PLAYER_SKILLS },
      {
        id: 'goblin',
        side: 'enemy',
        characterId: archetype.characterId,
        skillIds: archetype.skillIds,
      },
    ],
  }
}

/** Picks a random goblin archetype (optionally avoiding the last one). */
export function rollEncounter(
  random: () => number = Math.random,
  excludeId?: string,
): Encounter {
  const pool =
    excludeId === undefined
      ? goblinArchetypes
      : goblinArchetypes.filter((archetype) => archetype.id !== excludeId)
  const choices = pool.length > 0 ? pool : goblinArchetypes
  const archetype = choices[Math.floor(random() * choices.length)]!
  const goblin = rollGoblin(wanderer, random, {
    id: archetype.characterId,
    name: archetype.name,
    bias: archetype.bias,
  })
  return buildEncounter(archetype, goblin)
}

/** Static default (clubber) encounter, used by tests. */
export const goblinEncounter: Encounter = buildEncounter(
  goblinArchetypes[0]!,
  rollGoblin(wanderer, () => 0.5, { id: 'goblin', name: 'Goblin', bias: {} }),
)
