import type {
  CharacterTemplate,
  CombatantConfig,
  ContentBundle,
  Ruleset,
  SkillId,
  StatBlock,
} from '@rpg/engine'
import { characters, rollMonster, wanderer } from './characters'
import { equipmentPiecesForLevel, rollEquipment } from './equipment'
import type { Equipment } from './equipment'
import { standardRules } from './rules'
import { skills } from './skills'
import { addBuffs, STAT_ORDER, sumBuffs } from './stats'

export interface EncounterNarration {
  opening: string
  playerInitiative: string
  enemyInitiative: string
  tooFastPlayer: string
  tooFastEnemy: string
}

/**
 * Everything the app needs to start one fight: the content bundle, the tuning
 * rules, the combatant loadouts, the enemy's gear, and the framing text.
 */
export interface Encounter {
  id: string
  level: number
  title: string
  narration: EncounterNarration
  content: ContentBundle
  rules: Ruleset
  combatants: CombatantConfig[]
  loot: Equipment[]
}

/** A humanoid variant: name, loadout, stat bias, level gate, and essence. */
export interface EnemyArchetype {
  id: string
  name: string
  characterId: string
  skillIds: SkillId[]
  bias: Partial<StatBlock>
  power: number
  minLevel: number
  maxLevel?: number
  opening: string
  xp: number
  essenceName: string
  essenceBuffs: Partial<StatBlock>
}

/** The player's starting kit. Essences can add more skills on top of this. */
export const BASE_PLAYER_SKILLS: SkillId[] = ['basic', 'slash', 'heavy', 'guard', 'dodge']

/** The character template and loadout used for the player side of a fight. */
export interface PlayerBuild {
  character: CharacterTemplate
  skillIds: SkillId[]
}

export const defaultPlayerBuild: PlayerBuild = {
  character: wanderer,
  skillIds: BASE_PLAYER_SKILLS,
}

export const enemyArchetypes: EnemyArchetype[] = [
  {
    id: 'clubber',
    name: 'Goblin Clubber',
    characterId: 'goblin',
    skillIds: ['basic', 'stab', 'club', 'guard', 'dodge'],
    bias: {},
    power: 1,
    minLevel: 1,
    maxLevel: 3,
    opening: 'You face a goblin clubber in battle.',
    xp: 100,
    essenceName: 'Clubber Essence',
    essenceBuffs: { maxHp: 360, attack: 24, defense: 18 },
  },
  {
    id: 'archer',
    name: 'Goblin Archer',
    characterId: 'goblin_archer',
    skillIds: ['basic', 'snapShot', 'quickShot', 'aimedShot', 'dodge', 'guard'],
    bias: { speed: 1.3, reflex: 1.3, perception: 1.2, maxHp: 0.85, attack: 0.75, defense: 0.75 },
    power: 1,
    minLevel: 1,
    maxLevel: 3,
    opening: 'You face a goblin archer in battle.',
    xp: 90,
    essenceName: 'Archer Essence',
    essenceBuffs: { speed: 36, reflex: 36, perception: 24, attack: 12 },
  },
  {
    id: 'berserker',
    name: 'Goblin Berserker',
    characterId: 'goblin_berserker',
    skillIds: ['basic', 'headbutt', 'cleave', 'slam', 'brace'],
    bias: { maxHp: 1.3, attack: 1.3, defense: 1.1, speed: 0.95, reflex: 1.15, perception: 0.9 },
    power: 1,
    minLevel: 1,
    maxLevel: 3,
    opening: 'You face a goblin berserker in battle.',
    xp: 120,
    essenceName: 'Berserker Essence',
    essenceBuffs: { maxHp: 480, attack: 36, defense: 12 },
  },
  {
    id: 'skeleton',
    name: 'Skeleton Warrior',
    characterId: 'skeleton',
    skillIds: ['basic', 'boneJab', 'shieldBash', 'boneGuard', 'dodge'],
    bias: { maxHp: 1.1, defense: 1.4, attack: 0.95, speed: 0.9, reflex: 0.95, perception: 1.0 },
    power: 1.15,
    minLevel: 2,
    maxLevel: 4,
    opening: 'A skeleton warrior rattles into your path.',
    xp: 140,
    essenceName: 'Skeleton Essence',
    essenceBuffs: { maxHp: 360, defense: 30, perception: 12 },
  },
  {
    id: 'lizardman',
    name: 'Lizardman Skirmisher',
    characterId: 'lizardman',
    skillIds: ['basic', 'tailSweep', 'venomBite', 'scaleGuard', 'dodge'],
    bias: { speed: 1.15, reflex: 1.15, attack: 1.05, maxHp: 0.95, defense: 0.9, perception: 1.05 },
    power: 1.15,
    minLevel: 3,
    maxLevel: 8,
    opening: 'A lizardman skirmisher slips from the reeds.',
    xp: 160,
    essenceName: 'Lizardman Essence',
    essenceBuffs: { speed: 36, reflex: 36, perception: 24, attack: 18 },
  },
  {
    id: 'beastman',
    name: 'Beastman Brute',
    characterId: 'beastman',
    skillIds: ['basic', 'pounce', 'maul', 'hunker', 'dodge'],
    bias: { maxHp: 1.3, attack: 1.4, defense: 1.1, speed: 0.95, reflex: 0.95, perception: 0.9 },
    power: 1.4,
    minLevel: 4,
    maxLevel: 10,
    opening: 'A beastman brute blocks the way, snarling.',
    xp: 180,
    essenceName: 'Beastman Essence',
    essenceBuffs: { maxHp: 480, attack: 36, defense: 18 },
  },
  {
    id: 'skeletonCaptain',
    name: 'Skeleton Captain',
    characterId: 'skeleton_captain',
    skillIds: ['basic', 'graveCleave', 'boneJab', 'shieldBash', 'boneGuard', 'dodge'],
    bias: { maxHp: 1.25, defense: 1.35, attack: 1.1, speed: 0.95, reflex: 1.0, perception: 1.05 },
    power: 1.4,
    minLevel: 5,
    opening: 'A skeleton captain levels a blackened blade at you.',
    xp: 240,
    essenceName: 'Captain Essence',
    essenceBuffs: { maxHp: 600, attack: 36, defense: 36 },
  },
]

function buildEncounter(
  archetype: EnemyArchetype,
  enemy: CharacterTemplate,
  player: PlayerBuild,
  loot: Equipment[],
  level: number,
): Encounter {
  return {
    id: archetype.id,
    level,
    title: archetype.name,
    narration: {
      opening: archetype.opening,
      playerInitiative: 'You seize the initiative.',
      enemyInitiative: `The ${archetype.name.toLowerCase()} seizes the initiative.`,
      tooFastPlayer: 'The attack is too fast for you to react.',
      tooFastEnemy: `The attack is too fast for the ${archetype.name.toLowerCase()} to react.`,
    },
    content: {
      skills,
      characters: {
        ...characters,
        [player.character.id]: player.character,
        [archetype.characterId]: enemy,
      },
    },
    rules: standardRules,
    combatants: [
      {
        id: 'wanderer',
        side: 'player',
        characterId: player.character.id,
        skillIds: player.skillIds,
      },
      {
        id: 'enemy',
        side: 'enemy',
        characterId: archetype.characterId,
        skillIds: archetype.skillIds,
      },
    ],
    loot,
  }
}

export interface RollEncounterOptions {
  random?: () => number
  excludeId?: string
  player?: PlayerBuild
  level?: number
  coreWeight?: number
}

/** Picks an eligible enemy (optionally avoiding the last one) and rolls its gear. */
export function rollEncounter(options: RollEncounterOptions = {}): Encounter {
  const random = options.random ?? Math.random
  const level = Math.max(1, options.level ?? 1)
  const player = options.player ?? defaultPlayerBuild

  const eligible = enemyArchetypes.filter(
    (archetype) =>
      archetype.minLevel <= level &&
      (archetype.maxLevel === undefined || level <= archetype.maxLevel),
  )
  const pool = eligible.length > 0 ? eligible : enemyArchetypes
  const filtered =
    options.excludeId === undefined
      ? pool
      : pool.filter((archetype) => archetype.id !== options.excludeId)
  const choices = filtered.length > 0 ? filtered : pool
  const archetype = choices[Math.floor(random() * choices.length)]!

  const rolled = rollMonster(wanderer, random, {
    id: archetype.characterId,
    name: archetype.name,
    bias: archetype.bias,
    power: archetype.power,
    level,
  })
  const loot = rollEquipment(
    level,
    random,
    equipmentPiecesForLevel(level),
    options.coreWeight,
  )
  const gearBuffs = sumBuffs(loot.map((item) => item.buffs))
  const combined = addBuffs(rolled.baseStats, gearBuffs)
  const targetTotal = STAT_ORDER.reduce((sum, stat) => sum + rolled.baseStats[stat], 0)
  const combinedTotal = STAT_ORDER.reduce((sum, stat) => sum + combined[stat], 0)
  const scale = combinedTotal > 0 ? targetTotal / combinedTotal : 1
  const enemyStats = { ...combined }
  for (const stat of STAT_ORDER) {
    enemyStats[stat] = Math.max(1, Math.round(combined[stat] * scale))
  }
  const enemy: CharacterTemplate = { ...rolled, baseStats: enemyStats }

  return buildEncounter(archetype, enemy, player, loot, level)
}

/** Static default (clubber) encounter, used by tests. */
export const goblinEncounter: Encounter = buildEncounter(
  enemyArchetypes[0]!,
  rollMonster(wanderer, () => 0.5, {
    id: 'goblin',
    name: 'Goblin',
    bias: {},
    power: 1,
    level: 1,
  }),
  defaultPlayerBuild,
  [],
  1,
)
