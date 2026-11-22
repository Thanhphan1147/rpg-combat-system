import { describe, expect, it } from 'vitest'
import { getEffectiveStat, getMaxHp, sumModifiers } from '../src/stats'
import type { CharacterTemplate, EquipmentDef } from '../src/types/character'
import { actorId, characterId, equipmentId } from '../src/types/ids'
import { Stat } from '../src/types/stats'
import type { CombatState, ContentBundle, Ruleset } from '../src/types/state'

const rules: Ruleset = {
  reflex: { base: 12, scale: 0.5, floor: 1 },
  perception: { readBase: 10 },
  cleanCounter: { damageMultiplier: 1.5, stagger: 4 },
  block: { incompleteMitigation: 0.5 },
}

function createFixture() {
  const actor = actorId('hero-1')
  const template: CharacterTemplate = {
    id: characterId('hero'),
    name: 'Hero',
    baseStats: { speed: 10, reflex: 10, perception: 10, hp: 100, attack: 8, defense: 4 },
    skillIds: [],
    equipmentIds: [equipmentId('sword')],
  }
  const sword: EquipmentDef = {
    id: equipmentId('sword'),
    name: 'Sword',
    statMods: { attack: 5, speed: 2 },
    grantedSkillIds: [],
  }
  const content: ContentBundle = {
    skills: {},
    characters: { hero: template },
    equipment: { sword },
  }
  const state: CombatState = {
    actors: {
      'hero-1': {
        id: actor,
        side: 'player',
        template,
        runtime: { templateId: template.id, pools: { hp: 100 }, cooldowns: {} },
      },
    },
    order: [actor],
    content,
    rules,
    timeline: { tick: 0, active: [] },
    pending: null,
    log: [],
    status: 'active',
    winner: null,
  }
  return { state, actor }
}

describe('getEffectiveStat', () => {
  it('adds equipment modifiers to base stats', () => {
    const { state, actor } = createFixture()
    expect(getEffectiveStat(state, actor, Stat.Attack)).toBe(13)
    expect(getEffectiveStat(state, actor, Stat.Speed)).toBe(12)
    expect(getEffectiveStat(state, actor, Stat.Defense)).toBe(4)
  })

  it('exposes max hp from the hp stat', () => {
    const { state, actor } = createFixture()
    expect(getMaxHp(state, actor)).toBe(100)
  })

  it('throws for unknown actors', () => {
    const { state } = createFixture()
    expect(() => getEffectiveStat(state, actorId('ghost'), Stat.Attack)).toThrow(/Unknown actor/)
  })
})

describe('sumModifiers', () => {
  it('sums a single stat across modifiers, ignoring missing keys', () => {
    expect(sumModifiers([{ attack: 2 }, { attack: 3, speed: 9 }, {}], Stat.Attack)).toBe(5)
    expect(sumModifiers([{ attack: 2 }], Stat.Speed)).toBe(0)
  })
})
