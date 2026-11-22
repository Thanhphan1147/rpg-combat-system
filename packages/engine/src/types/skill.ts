import type { EffectId, SkillId } from './ids'

export type Phase = 'startup' | 'delivery' | 'ending'

export type SkillKind = 'attack' | 'block' | 'dodge' | 'parry' | 'counter'

export interface SkillArmor {
  duringDelivery: boolean
}

export interface SkillDef {
  id: SkillId
  name: string
  kind: SkillKind
  startup: number
  delivery: number
  ending: number
  cooldown: number
  hitstun: number
  effectIds: EffectId[]
  armor: SkillArmor
}
