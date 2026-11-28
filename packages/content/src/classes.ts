import type { SkillId } from '@rpg/engine'

export type PlayerClassId = 'warrior' | 'rogue' | 'berserker' | 'paladin'

export interface PlayerClass {
  id: PlayerClassId
  name: string
  description: string
  skillIds: SkillId[]
}

export const PLAYER_CLASSES: PlayerClass[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    description: 'A steady blade behind a raised shield. Reliable, and hard to break.',
    skillIds: ['basic', 'guard'],
  },
  {
    id: 'rogue',
    name: 'Rogue',
    description: 'Light on their feet. Slip the blow, then make the miss count.',
    skillIds: ['basic', 'dodge'],
  },
  {
    id: 'berserker',
    name: 'Berserker',
    description: 'A roaring brute. Shrug off pain and hit back twice as hard.',
    skillIds: ['basic', 'shout'],
  },
  {
    id: 'paladin',
    name: 'Paladin',
    description: 'A patient light. Mend your wounds and outlast the dark.',
    skillIds: ['basic', 'heal'],
  },
]

export const DEFAULT_PLAYER_CLASS: PlayerClassId = 'warrior'

export function findPlayerClass(id: PlayerClassId): PlayerClass {
  return PLAYER_CLASSES.find((playerClass) => playerClass.id === id) ?? PLAYER_CLASSES[0]!
}
