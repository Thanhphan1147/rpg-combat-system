import type { CharacterTemplate, ContentBundle, Ruleset, SkillDef } from '@rpg/engine'

export const sampleRules: Ruleset = {
  reflex: { base: 12, scale: 0.5, floor: 1 },
  perception: { base: 12, scale: 0.5, floor: 1 },
  startupCounter: { damageMultiplier: 1.5, stagger: 4 },
  block: { incompleteMitigation: 0.5 },
}

const jab: SkillDef = {
  id: 'jab',
  name: 'Jab',
  kind: 'attack',
  targeting: 'opponent',
  startup: 2,
  delivery: 3,
  ending: 2,
  cooldown: 4,
  hitstun: 3,
  armoredDuringDelivery: false,
  vagueDescription: 'A quick blur toward you.',
  preciseDescription: 'Jab — fast, low commitment.',
}

const heavy: SkillDef = {
  id: 'heavy',
  name: 'Heavy Blow',
  kind: 'attack',
  targeting: 'opponent',
  startup: 6,
  delivery: 4,
  ending: 6,
  cooldown: 12,
  hitstun: 5,
  armoredDuringDelivery: true,
  vagueDescription: 'A slow, heavy swing winding up.',
  preciseDescription: 'Heavy Blow — slow startup, armored delivery.',
}

const guard: SkillDef = {
  id: 'guard',
  name: 'Guard',
  kind: 'block',
  targeting: 'self',
  startup: 1,
  delivery: 0,
  ending: 2,
  cooldown: 0,
  hitstun: 0,
  armoredDuringDelivery: false,
  vagueDescription: 'You raise your guard.',
  preciseDescription: 'Guard — quick block.',
}

const hero: CharacterTemplate = {
  id: 'hero',
  name: 'Hero',
  baseStats: { speed: 12, reflex: 12, perception: 12, maxHp: 100, attack: 10, defense: 5 },
}

const foe: CharacterTemplate = {
  id: 'foe',
  name: 'Foe',
  baseStats: { speed: 8, reflex: 8, perception: 8, maxHp: 90, attack: 8, defense: 4 },
}

export function sampleContent(): ContentBundle {
  return {
    skills: { jab, heavy, guard },
    characters: { hero, foe },
  }
}
