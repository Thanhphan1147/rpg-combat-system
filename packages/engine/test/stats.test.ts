import { describe, expect, it } from 'vitest'
import { getEffectiveStat, getMaxHp } from '../src/stats'
import type { CharacterTemplate } from '../src/types/character'
import { Stat } from '../src/types/stats'
import type { CombatState, ContentBundle, Ruleset } from '../src/types/state'

const rules: Ruleset = {
  reflex: { base: 12, scale: 0.5, floor: 1 },
  perception: { base: 10, scale: 1, floor: 1 },
  startupCounter: { damageMultiplier: 1.5, stagger: 4 },
  block: { incompleteMitigation: 0.5 },
}

function createFixture() {
  const actor = 'hero-1'
  const template: CharacterTemplate = {
    id: 'hero',
    name: 'Hero',
    baseStats: { speed: 10, reflex: 10, perception: 10, maxHp: 100, attack: 8, defense: 4 },
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
        characterId: 'hero',
        runtime: {
          hp: 100,
          skillIds: [],
          cooldownEndsAt: {},
          hitstunUntil: 0,
          staggeredUntil: 0,
        },
      },
    },
    roster: [actor],
    content,
    rules,
    timeline: { tick: 0, active: [] },
    pending: null,
    outcome: { status: 'active' },
  }
  return { state, actor }
}

describe('getEffectiveStat', () => {
  it('resolves stats from the actor character template', () => {
    const { state, actor } = createFixture()
    expect(getEffectiveStat(state, actor, Stat.Attack)).toBe(8)
    expect(getEffectiveStat(state, actor, Stat.Speed)).toBe(10)
    expect(getEffectiveStat(state, actor, Stat.Defense)).toBe(4)
  })

  it('exposes max hp from the maxHp stat', () => {
    const { state, actor } = createFixture()
    expect(getMaxHp(state, actor)).toBe(100)
  })

  it('throws for unknown actors', () => {
    const { state } = createFixture()
    expect(() => getEffectiveStat(state, 'ghost', Stat.Attack)).toThrow(/Unknown actor/)
  })

  it('throws when the character template is missing', () => {
    const { state, actor } = createFixture()
    delete state.content.characters.hero
    expect(() => getEffectiveStat(state, actor, Stat.Attack)).toThrow(/Unknown character/)
  })
})
