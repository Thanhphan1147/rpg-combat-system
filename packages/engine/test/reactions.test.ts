import { describe, expect, it } from 'vitest'
import { createCombat, startSkill } from '../src/combat'
import {
  canReact,
  canReactAt,
  getReactionOptions,
  startReaction,
} from '../src/reactions'
import { getPerceptionView, identifyAt, readTicks } from '../src/perception'
import { applyTransition, nextTransition } from '../src/timeline'
import type { SkillDef } from '../src/types/skill'
import type { CombatState, ContentBundle, Ruleset } from '../src/types/state'

const rules: Ruleset = {
  reflex: { base: 12, scale: 0.5, floor: 1 },
  perception: { base: 12, scale: 0.5, floor: 1 },
  interruptDuringStartup: { damageMultiplier: 1.5, stagger: 4 },
  block: { incompleteMitigation: 0.5 },
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
    armoredDuringDelivery: false,
    vagueDescription: 'vague',
    preciseDescription: 'precise',
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
        armoredDuringDelivery: true,
      }),
      slow: makeSkill({
        id: 'slow',
        startup: 12,
        delivery: 3,
        ending: 4,
        cooldown: 20,
        hitstun: 4,
        power: 8,
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
      dodge: makeSkill({
        id: 'dodge',
        kind: 'dodge',
        targeting: 'self',
        startup: 0,
        delivery: 2,
        ending: 3,
        cooldown: 6,
        hitstun: 0,
        power: 0,
      }),
      quick: makeSkill({
        id: 'quick',
        startup: 0,
        delivery: 1,
        ending: 1,
        cooldown: 0,
        hitstun: 2,
        power: 6,
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

const allSkills = ['jab', 'heavy', 'slow', 'guard', 'dodge', 'quick']

function makeCombat() {
  return createCombat({
    content: makeContent(),
    rules,
    combatants: [
      { id: 'a', side: 'player', characterId: 'hero', skillIds: allSkills },
      { id: 'b', side: 'enemy', characterId: 'foe', skillIds: allSkills },
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

describe('perception', () => {
  it('turns Perception into a read time that shortens as the stat grows', () => {
    expect(readTicks(12, rules)).toBe(6)
    expect(readTicks(8, rules)).toBe(8)
  })

  it('only identifies a skill when the read fits inside its startup', () => {
    const state = startSkill(makeCombat(), 'a', 'heavy', 'b')
    const heavy = state.timeline.active[0]!

    expect(identifyAt(state, 'b', heavy)).toBeNull()
    expect(identifyAt(state, 'a', heavy)).toBe(6)

    const atWindow = advanceTo(state, 8)
    const incoming = atWindow.timeline.active[0]!
    expect(getPerceptionView(atWindow, 'a', incoming)).toEqual({
      identified: true,
      description: 'precise',
    })
    expect(getPerceptionView(atWindow, 'b', incoming)).toEqual({
      identified: false,
      description: 'vague',
    })
  })
})

describe('reaction windows', () => {
  it('opens at the reflex delay and offers the actor loadout', () => {
    let state = startSkill(makeCombat(), 'a', 'heavy', 'b')
    const instanceId = state.timeline.active[0]!.instanceId

    expect(canReactAt(state, 'b', state.timeline.active[0]!)).toBe(8)
    expect(canReact(state, 'b', state.timeline.active[0]!)).toBe(false)
    expect(() => startReaction(state, 'b', 'guard', instanceId)).toThrow(/Cannot react/)

    state = advanceTo(state, 8)
    const incoming = state.timeline.active.find((skill) => skill.instanceId === instanceId)!
    expect(canReact(state, 'b', incoming)).toBe(true)

    const options = getReactionOptions(state, 'b', incoming)
    expect(options).toHaveLength(allSkills.length)
    expect(options.every((option) => option.identified === false)).toBe(true)
    expect(options.every((option) => option.description === 'vague')).toBe(true)
  })

  it('starts a reaction and rejects duplicates', () => {
    let state = startSkill(makeCombat(), 'a', 'heavy', 'b')
    const instanceId = state.timeline.active[0]!.instanceId
    state = advanceTo(state, 8)

    state = startReaction(state, 'b', 'guard', instanceId)
    expect(
      state.timeline.active.some((skill) => skill.reactingToInstanceId === instanceId),
    ).toBe(true)
    expect(() => startReaction(state, 'b', 'dodge', instanceId)).toThrow(/Cannot react/)
  })
})

describe('resolution', () => {
  it('blocking in time negates the hit', () => {
    let state = startSkill(makeCombat(), 'a', 'heavy', 'b')
    const instanceId = state.timeline.active[0]!.instanceId
    state = advanceTo(state, 8)
    state = startReaction(state, 'b', 'guard', instanceId)
    state = advanceTo(state, 10)

    expect(state.actors.a?.runtime.hp).toBe(100)
    expect(state.actors.b?.runtime.hp).toBe(90)
  })

  it('dodging wins the tie with the hit (defender wins ties)', () => {
    let state = startSkill(makeCombat(), 'a', 'heavy', 'b')
    const instanceId = state.timeline.active[0]!.instanceId
    state = advanceTo(state, 8)
    state = startReaction(state, 'b', 'dodge', instanceId)
    state = advanceTo(state, 10)

    expect(state.actors.b?.runtime.hp).toBe(90)
  })

  it('a faster attack interrupts a slower one', () => {
    let state = startSkill(makeCombat(), 'a', 'slow', 'b')
    const instanceId = state.timeline.active[0]!.instanceId
    state = advanceTo(state, 8)
    state = startReaction(state, 'b', 'jab', instanceId)
    state = advanceTo(state, 13)

    expect(state.actors.a?.runtime.hp).toBe(93)
    expect(state.timeline.active.some((skill) => skill.skillId === 'slow')).toBe(false)
  })

  it('a clean startup interrupt is rewarded and staggers', () => {
    let state = startSkill(makeCombat(), 'a', 'slow', 'b')
    const instanceId = state.timeline.active[0]!.instanceId
    state = advanceTo(state, 8)
    state = startReaction(state, 'b', 'quick', instanceId)
    state = advanceTo(state, 9)

    expect(state.actors.a?.runtime.hp).toBe(86)
    expect(state.actors.a?.runtime.staggeredUntil).toBe(13)
    expect(state.timeline.active.some((skill) => skill.skillId === 'slow')).toBe(false)
  })

  it('does not interrupt a skill armored during delivery (trade)', () => {
    let state = startSkill(makeCombat(), 'a', 'heavy', 'b')
    const instanceId = state.timeline.active[0]!.instanceId
    state = advanceTo(state, 8)
    state = startReaction(state, 'b', 'quick', instanceId)
    state = advanceTo(state, 10)

    expect(state.actors.a?.runtime.hp).toBe(91)
    expect(state.actors.b?.runtime.hp).toBe(74)
  })
})
