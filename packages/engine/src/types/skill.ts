import type { SkillId } from './ids'

export type Phase = 'startup' | 'delivery' | 'ending'

export type SkillKind = 'attack' | 'block' | 'dodge' | 'parry' | 'buff' | 'heal'

export type SkillTargeting = 'self' | 'opponent'

export interface SkillBuff {
  /** Duration in centiticks. */
  duration: number
  /** Multiplier on damage dealt while active. Defaults to 1. */
  damageMultiplier?: number
  /** Multiplier on damage taken while active. Defaults to 1. */
  incomingDamageMultiplier?: number
}

export interface SkillDef {
  id: SkillId
  name: string
  kind: SkillKind
  targeting: SkillTargeting
  startup: number
  delivery: number
  ending: number
  cooldown: number
  cooldownGroup?: string
  hitstun: number
  power: number
  armoredDuringStartup?: boolean
  armoredDuringDelivery?: boolean
  buff?: SkillBuff
  /** Fraction of max HP restored on connect. */
  healPercent?: number
  vagueDescription: string
  preciseDescription: string
  hitFlavor: string
}
