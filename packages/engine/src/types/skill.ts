import type { SkillId } from './ids'

export type Phase = 'startup' | 'delivery' | 'ending'

export type SkillKind = 'attack' | 'block' | 'dodge' | 'parry' | 'counter'

export type SkillTargeting = 'self' | 'opponent'

export interface SkillDef {
  id: SkillId
  name: string
  kind: SkillKind
  targeting: SkillTargeting
  startup: number
  delivery: number
  ending: number
  cooldown: number
  hitstun: number
  power: number
  armoredDuringDelivery: boolean
  vagueDescription: string
  preciseDescription: string
}
