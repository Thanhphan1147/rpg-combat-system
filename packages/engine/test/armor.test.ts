import { describe, expect, it } from 'vitest'
import { createCombat, startSkill } from '../src/combat'
import { getPrompt, step } from '../src/session'
import { startReaction } from '../src/reactions'
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
    cooldown: 0,
    hitstun: 3,
    power: 5,
    vagueDescription: 'vague',
    preciseDescription: 'precise',
    hitFlavor: '',
    ...overrides,
  }
}

function makeContent(): ContentBundle {
  return {
    skills: {
      armored: makeSkill({
        id: 'armored',
        startup: 2,
        delivery: 4,
        ending: 2,
        power: 10,
        armoredDuringDelivery: true,
      }),
      longArmored: makeSkill({
        id: 'longArmored',
        startup: 2,
        delivery: 10,
        ending: 2,
        power: 10,
        armoredDuringDelivery: true,
      }),
      fast: makeSkill({ id: 'fast', startup: 1, delivery: 1, ending: 2, power: 4, hitstun: 2 }),
      slow: makeSkill({ id: 'slow', startup: 3, delivery: 4, ending: 2 }),
      slow2: makeSkill({ id: 'slow2', startup: 6, delivery: 4, ending: 2 }),
      guard: makeSkill({ id: 'guard', kind: 'block', targeting: 'self', startup: 1, delivery: 0, ending: 2, power: 0, hitstun: 0 }),
      dodge: makeSkill({ id: 'dodge', kind: 'dodge', targeting: 'self', startup: 0, delivery: 2, ending: 3, power: 0, hitstun: 0 }),
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

const allSkills = ['armored', 'longArmored', 'fast', 'slow', 'slow2', 'guard', 'dodge']

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

describe('super armor', () => {
  it('trades against an attack that lands during delivery, then resets', () => {
    let state = startSkill(makeCombat(), 'a', 'armored', 'b')
    state = startSkill(state, 'b', 'fast', 'a')
    state = advanceTo(state, 6)

    expect(state.actors.a?.runtime.hp).toBe(94)
    expect(state.actors.b?.runtime.hp).toBe(65)
    expect(state.timeline.active).toEqual([])
  })

  it('lets two armored attacks both land', () => {
    let state = startSkill(makeCombat(), 'a', 'armored', 'b')
    state = startSkill(state, 'b', 'armored', 'a')
    state = advanceTo(state, 7)

    expect(state.actors.a?.runtime.hp).toBeLessThan(100)
    expect(state.actors.b?.runtime.hp).toBeLessThan(80)
    expect(state.timeline.active).toEqual([])
  })

  it('interrupts a slower non-armored attack when the armored one lands first', () => {
    let state = startSkill(makeCombat(), 'a', 'armored', 'b')
    state = startSkill(state, 'b', 'slow', 'a')
    state = advanceTo(state, 7)

    expect(state.actors.a?.runtime.hp).toBe(100)
    expect(state.actors.b?.runtime.hp).toBe(65)
    expect(state.timeline.active.some((skill) => skill.skillId === 'slow')).toBe(false)
  })

  it('is dodged like any other attack', () => {
    let state = startSkill(makeCombat(), 'a', 'longArmored', 'b')
    const instanceId = state.timeline.active[0]!.instanceId
    state = advanceTo(state, 8)
    state = startReaction(state, 'b', 'dodge', instanceId)
    state = advanceTo(state, 12)

    expect(state.actors.a?.runtime.hp).toBe(100)
    expect(state.actors.b?.runtime.hp).toBe(80)
  })

  it('is not stopped by a block', () => {
    let state = startSkill(makeCombat(), 'a', 'longArmored', 'b')
    const instanceId = state.timeline.active[0]!.instanceId
    state = advanceTo(state, 8)
    state = startReaction(state, 'b', 'guard', instanceId)
    state = advanceTo(state, 12)

    expect(state.actors.a?.runtime.hp).toBe(100)
    expect(state.actors.b?.runtime.hp).toBe(65)
  })

  it('offers the committed attacker a choice to keep committing', () => {
    let state = startSkill(makeCombat(), 'a', 'longArmored', 'b')
    state = startSkill(state, 'b', 'slow2', 'a')
    state = advanceTo(state, 7)

    const prompt = getPrompt(state)
    expect(prompt?.kind).toBe('commit')
    if (prompt?.kind === 'commit') {
      expect(prompt.actorId).toBe('a')
    }

    state = step(state, { kind: 'commit' })
    expect(state.actors.a?.runtime.hp).toBeLessThan(100)
    expect(state.actors.b?.runtime.hp).toBeLessThan(80)
  })

  it('lets the committed attacker abandon the attack and dodge instead', () => {
    let state = startSkill(makeCombat(), 'a', 'longArmored', 'b')
    state = startSkill(state, 'b', 'slow2', 'a')
    state = advanceTo(state, 7)

    expect(getPrompt(state)?.kind).toBe('commit')
    state = step(state, { kind: 'react', skillId: 'dodge' })

    expect(state.actors.a?.runtime.hp).toBe(100)
    expect(state.timeline.active.some((skill) => skill.skillId === 'longArmored')).toBe(false)
  })
})
