import { describe, expect, it } from 'vitest'
import { getEffectiveStat, getMaxHp } from '../src/stats'
import type { CharacterTemplate } from '../src/types/character'
import { actorId, characterId } from '../src/types/ids'
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
  }
  const content: ContentBundle = {
    skills: {},
    characters: { hero: template },
  }
  const state: CombatState = {
    actors: {
      'hero-1': {
        id: actor,
        side: 'player',
        template,
        runtime: { templateId: template.id, pools: { hp: 100 }, skillIds: [], cooldowns: {} },
      },
    },
    order: [actor],
    content,
    rules,
    timeline: { tick: 0, active: [] },
    pending: null,
    status: 'active',
    winner: null,
  }
  return { state, actor }
}

describe('getEffectiveStat', () => {
  it('resolves stats from the base template', () => {
    const { state, actor } = createFixture()
    expect(getEffectiveStat(state, actor, Stat.Attack)).toBe(8)
    expect(getEffectiveStat(state, actor, Stat.Speed)).toBe(10)
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
