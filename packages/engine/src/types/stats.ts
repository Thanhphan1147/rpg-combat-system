export const Stat = {
  Speed: 'speed',
  Reflex: 'reflex',
  Perception: 'perception',
  MaxHp: 'maxHp',
  Attack: 'attack',
  Defense: 'defense',
} as const

export type Stat = (typeof Stat)[keyof typeof Stat]

export type StatBlock = Record<Stat, number>
