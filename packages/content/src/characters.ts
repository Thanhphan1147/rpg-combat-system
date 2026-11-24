import type { CharacterTemplate } from '@rpg/engine'

export const characters: Record<string, CharacterTemplate> = {
  wanderer: {
    id: 'wanderer',
    name: 'The Wanderer',
    baseStats: { speed: 12, reflex: 12, perception: 12, maxHp: 100, attack: 10, defense: 5 },
  },
  goblin: {
    id: 'goblin',
    name: 'Goblin',
    baseStats: { speed: 8, reflex: 8, perception: 8, maxHp: 70, attack: 8, defense: 3 },
  },
}
