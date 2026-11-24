import { describe, expect, it } from 'vitest'
import { createCombat, startSkill } from '../src/combat'
import {
  advanceUntilDecision,
  applyTransition,
  compareTransitions,
  getFreeActors,
  isDecisionPoint,
  nextTransition,
} from '../src/timeline'
import type { SkillDef } from '../src/types/skill'
import type { CombatState, ContentBundle, Ruleset } from '../src/types/state'

const rules: Ruleset = {
  reflex: { base: 12, scale: 0.5, floor: 1 },
  perception: { base: 10, scale: 1, floor: 1 },
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
    vagueDescription: 'A blur.',
    preciseDescription: 'A precise strike.',
    hitFlavor: '',
    ...overrides,
  }
}

function makeContent(): ContentBundle {
  return {
    skills: {
      jab: makeSkill({ id: 'jab' }),
      heavy: makeSkill({ id: 'heavy', cooldown: 20 }),
      secret: makeSkill({ id: 'secret' }),
      guard: makeSkill({ id: 'guard', kind: 'block', targeting: 'self', startup: 1, delivery: 0, ending: 1 }),
    },
    characters: {
      hero: {
        id: 'hero',
        name: 'Hero',
        baseStats: { speed: 10, reflex: 10, perception: 10, maxHp: 100, attack: 8, defense: 4 },
      },
      foe: {
        id: 'foe',
        name: 'Foe',
        baseStats: { speed: 8, reflex: 8, perception: 8, maxHp: 80, attack: 6, defense: 3 },
      },
    },
  }
}

function makeCombat() {
  return createCombat({
    content: makeContent(),
    rules,
    combatants: [
      { id: 'a', side: 'player', characterId: 'hero', skillIds: ['jab', 'heavy', 'guard'] },
      { id: 'b', side: 'enemy', characterId: 'foe', skillIds: ['jab', 'heavy', 'guard'] },
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

describe('createCombat', () => {
  it('starts at tick 0 with both actors free', () => {
    const state = makeCombat()
    expect(state.timeline.tick).toBe(0)
    expect(state.timeline.nextInstanceId).toBe(1)
    expect(getFreeActors(state)).toEqual(['a', 'b'])
    expect(isDecisionPoint(state)).toBe(true)
    expect(state.actors.a?.runtime.hp).toBe(100)
    expect(state.actors.b?.runtime.hp).toBe(80)
  })

  it('rejects duplicate actors', () => {
    expect(() =>
      createCombat({
        content: makeContent(),
        rules,
        combatants: [
          { id: 'a', side: 'player', characterId: 'hero' },
          { id: 'a', side: 'enemy', characterId: 'foe' },
        ],
      }),
    ).toThrow(/Duplicate actor/)
  })
})

describe('startSkill', () => {
  it('schedules connect/end, applies cooldown and consumes the actor', () => {
    const state = makeCombat()
    const next = startSkill(state, 'a', 'jab', 'b')

    expect(getFreeActors(next)).toEqual(['b'])
    expect(next.timeline.nextInstanceId).toBe(2)
    expect(next.timeline.active).toHaveLength(1)
    expect(next.timeline.active[0]).toMatchObject({
      instanceId: 'i1',
      actorId: 'a',
      skillId: 'jab',
      startedAt: 0,
      endingEndsAt: 7,
      targetActorId: 'b',
      reactingToInstanceId: null,
      resolved: false,
    })
    expect(next.actors.a?.runtime.cooldownEndsAt.jab).toBe(4)
  })

  it('does not mutate the input state', () => {
    const state = makeCombat()
    startSkill(state, 'a', 'jab', 'b')
    expect(state.timeline.active).toEqual([])
    expect(state.actors.a?.runtime.cooldownEndsAt).toEqual({})
  })

  it('allows self-targeted skills without a target', () => {
    const next = startSkill(makeCombat(), 'a', 'guard')
    expect(next.timeline.active[0]?.targetActorId).toBeNull()
  })

  it('rejects illegal starts', () => {
    const state = makeCombat()
    expect(() => startSkill(state, 'a', 'jab')).toThrow(/requires a target/)
    expect(() => startSkill(state, 'a', 'jab', 'a')).toThrow(/own actor/)
    expect(() => startSkill(state, 'a', 'jab', 'nobody')).toThrow(/Unknown target/)
    expect(() => startSkill(state, 'a', 'missing', 'b')).toThrow(/Unknown skill/)
    expect(() => startSkill(state, 'a', 'secret', 'b')).toThrow(/cannot use/)

    const started = startSkill(state, 'a', 'jab', 'b')
    expect(() => startSkill(started, 'a', 'jab', 'b')).toThrow(/not free/)
  })

  it('rejects a skill that is still on cooldown', () => {
    let state = startSkill(makeCombat(), 'a', 'heavy', 'b')
    state = startSkill(state, 'b', 'jab', 'a')
    state = advanceUntilDecision(state)

    expect(getFreeActors(state)).toContain('a')
    expect(() => startSkill(state, 'a', 'heavy', 'b')).toThrow(/cooldown/)
  })
})

describe('timeline arithmetic', () => {
  it('resolves a hit at connect, then ends the skill', () => {
    const started = startSkill(makeCombat(), 'a', 'jab', 'b')
    const connect = nextTransition(started)
    expect(connect).toEqual({ kind: 'connect', tick: 5, instanceId: 'i1' })

    const atConnect = applyTransition(started, connect!)
    expect(atConnect.timeline.tick).toBe(5)
    expect(atConnect.timeline.active[0]?.resolved).toBe(true)
    expect(atConnect.actors.b?.runtime.hp).toBe(71)
    expect(atConnect.actors.b?.runtime.hitstunUntil).toBe(8)
    expect(started.timeline.active[0]?.resolved).toBe(false)

    const end = nextTransition(atConnect)
    expect(end).toEqual({ kind: 'end', tick: 7, instanceId: 'i1' })
    const atEnd = applyTransition(atConnect, end!)
    expect(atEnd.timeline.tick).toBe(7)
    expect(atEnd.timeline.active).toEqual([])
    expect(getFreeActors(atEnd)).toEqual(['a'])
    expect(nextTransition(atEnd)).toEqual({ kind: 'unlock', tick: 8, actorId: 'b' })
  })

  it('orders same-tick transitions deterministically (connect before end)', () => {
    expect(
      compareTransitions(
        { kind: 'end', tick: 5, instanceId: 'i1' },
        { kind: 'connect', tick: 5, instanceId: 'i2' },
      ),
    ).toBeGreaterThan(0)
    expect(
      compareTransitions(
        { kind: 'connect', tick: 5, instanceId: 'i1' },
        { kind: 'connect', tick: 5, instanceId: 'i2' },
      ),
    ).toBeLessThan(0)
  })

  it('advanceUntilDecision stops immediately when an actor is free', () => {
    const state = makeCombat()
    expect(advanceUntilDecision(state)).toBe(state)
  })

  it('a faster attack interrupts the other, so the winner is free first', () => {
    let state = makeCombat()
    state = startSkill(state, 'a', 'jab', 'b')
    state = startSkill(state, 'b', 'jab', 'a')

    const settled = advanceUntilDecision(state)
    expect(settled.timeline.tick).toBe(7)
    expect(getFreeActors(settled)).toEqual(['a'])
  })
})
