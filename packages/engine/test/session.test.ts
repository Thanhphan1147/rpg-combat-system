import { describe, expect, it } from 'vitest'
import { createCombat, startSkill } from '../src/combat'
import { getPrompt, snapshot, step } from '../src/session'
import { applyTransition, nextTransition } from '../src/timeline'
import type { SkillDef } from '../src/types/skill'
import type { CombatState, ContentBundle, Ruleset } from '../src/types/state'

const rules: Ruleset = {
  reflex: { base: 12, scale: 0.5, floor: 1 },
  perception: { base: 12, scale: 0.5, floor: 1 },
  interruptDuringStartup: { damageMultiplier: 1.5, stagger: 4 },
  speedScaling: { rate: 0, startupFloor: 0 },
}

function makeSkill(overrides: Partial<SkillDef> & { id: SkillDef['id'] }): SkillDef {
  return {
    name: overrides.id,
    kind: 'attack',
    targeting: 'opponent',
    startup: 2,
    delivery: 3,
    ending: 2,
    cooldown: 4,
    hitstun: 3,
    power: 4,
    vagueDescription: 'vague',
    preciseDescription: 'precise',
    hitFlavor: '',
    ...overrides,
  }
}

function makeContent(): ContentBundle {
  return {
    skills: {
      jab: makeSkill({ id: 'jab' }),
      heavy: makeSkill({
        id: 'heavy',
        startup: 6,
        delivery: 4,
        ending: 6,
        cooldown: 12,
        hitstun: 5,
        power: 10,
      }),
      guard: makeSkill({
        id: 'guard',
        kind: 'block',
        targeting: 'self',
        startup: 1,
        delivery: 0,
        ending: 2,
        cooldown: 0,
        hitstun: 0,
        power: 0,
      }),
    },
    characters: {
      hero: {
        id: 'hero',
        name: 'Hero',
        baseStats: { speed: 10, reflex: 12, perception: 12, maxHp: 100, attack: 10, defense: 5 },
      },
      foe: {
        id: 'foe',
        name: 'Foe',
        baseStats: { speed: 8, reflex: 8, perception: 8, maxHp: 90, attack: 8, defense: 4 },
      },
    },
  }
}

function makeCombat(hp: { a?: number; b?: number } = {}) {
  return createCombat({
    content: makeContent(),
    rules,
    combatants: [
      { id: 'a', side: 'player', characterId: 'hero', skillIds: ['jab', 'heavy', 'guard'], hp: hp.a },
      { id: 'b', side: 'enemy', characterId: 'foe', skillIds: ['jab', 'heavy', 'guard'], hp: hp.b },
    ],
  })
}

function advanceTo(state: CombatState, tick: number): CombatState {
  let current = state
  while (current.timeline.tick < tick && current.outcome.status === 'active') {
    const transition = nextTransition(current)
    if (transition === null) {
      break
    }
    current = applyTransition(current, transition)
  }
  return current
}

describe('session prompts', () => {
  it('prompts the faster free actor first', () => {
    const prompt = getPrompt(makeCombat())
    expect(prompt?.kind).toBe('action')
    expect(prompt?.actorId).toBe('a')
  })

  it('does not prompt the defender while an attack is unresolved', () => {
    const state = startSkill(makeCombat(), 'a', 'jab', 'b')
    expect(getPrompt(state)).toBeNull()
  })

  it('prompts the tempo holder after the exchange resolves', () => {
    const state = step(makeCombat(), { kind: 'act', skillId: 'jab' })
    const prompt = getPrompt(state)
    expect(prompt?.kind).toBe('action')
    expect(prompt?.actorId).toBe('a')
  })

  it('offers a reaction prompt at the reflex window', () => {
    const state = advanceTo(startSkill(makeCombat(), 'a', 'heavy', 'b'), 8)
    const prompt = getPrompt(state)
    expect(prompt?.kind).toBe('reaction')
    if (prompt?.kind === 'reaction') {
      expect(prompt.actorId).toBe('b')
      expect(prompt.incoming.skillId).toBe('heavy')
    }
  })

  it('builds a rendering snapshot', () => {
    const view = snapshot(makeCombat())
    expect(view.actors.map((actor) => actor.name)).toEqual(['Hero', 'Foe'])
    expect(view.actors[0]?.maxHp).toBe(100)
  })
})

describe('session narration', () => {
  it('records skill use, the hit and combat end', () => {
    const state = advanceTo(startSkill(makeCombat({ b: 1 }), 'a', 'heavy', 'b'), 10)
    const kinds = state.log.map((entry) => entry.event.kind)
    expect(kinds).toContain('skillUsed')
    expect(kinds).toContain('hit')
    expect(kinds).toContain('combatEnd')
    expect(state.outcome.status).toBe('ended')
  })

  it('flags an attack with no reaction window as unreactable', () => {
    const jab = startSkill(makeCombat(), 'a', 'jab', 'b')
    expect(jab.log.some((entry) => entry.event.kind === 'unreactable')).toBe(true)

    const heavy = startSkill(makeCombat(), 'a', 'heavy', 'b')
    expect(heavy.log.some((entry) => entry.event.kind === 'unreactable')).toBe(false)
  })
})
