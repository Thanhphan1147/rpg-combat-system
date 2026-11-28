import { describe, expect, it } from 'vitest'
import { createCombat, startSkill } from '../src/combat'
import { applyTransition, nextTransition } from '../src/timeline'
import type { CombatEvent } from '../src/types/events'
import type { ActorId } from '../src/types/ids'
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
    startup: 1,
    delivery: 1,
    ending: 1,
    cooldown: 0,
    hitstun: 0,
    power: 10,
    vagueDescription: 'vague',
    preciseDescription: 'precise',
    hitFlavor: '',
    ...overrides,
  }
}

function makeContent(): ContentBundle {
  return {
    skills: {
      strike: makeSkill({ id: 'strike', power: 10 }),
      shout: makeSkill({
        id: 'shout',
        name: 'Shout',
        kind: 'buff',
        targeting: 'self',
        power: 0,
        buff: { duration: 20, damageMultiplier: 1.5, incomingDamageMultiplier: 0.5 },
      }),
      heal: makeSkill({
        id: 'heal',
        name: 'Heal',
        kind: 'heal',
        targeting: 'self',
        power: 0,
        healPercent: 0.3,
      }),
    },
    characters: {
      hero: {
        id: 'hero',
        name: 'Hero',
        baseStats: { speed: 10, reflex: 10, perception: 10, maxHp: 100, attack: 10, defense: 0 },
      },
      foe: {
        id: 'foe',
        name: 'Foe',
        baseStats: { speed: 8, reflex: 8, perception: 8, maxHp: 100, attack: 10, defense: 0 },
      },
    },
  }
}

function makeCombat(heroHp = 100): CombatState {
  return createCombat({
    content: makeContent(),
    rules,
    combatants: [
      { id: 'a', side: 'player', characterId: 'hero', skillIds: ['shout', 'heal', 'strike'], hp: heroHp },
      { id: 'b', side: 'enemy', characterId: 'foe', skillIds: ['strike'] },
    ],
  })
}

function advanceUntil(
  state: CombatState,
  kind: CombatEvent['kind'],
  max = 40,
): CombatState {
  let current = state
  for (let index = 0; index < max; index += 1) {
    if (current.log.some((entry) => entry.event.kind === kind)) {
      return current
    }
    const transition = nextTransition(current)
    if (transition === null) {
      break
    }
    current = applyTransition(current, transition)
  }
  return current
}

function advanceUntilFree(state: CombatState, actorId: ActorId): CombatState {
  let current = state
  for (let index = 0; index < 40; index += 1) {
    if (!current.timeline.active.some((skill) => skill.actorId === actorId)) {
      return current
    }
    const transition = nextTransition(current)
    if (transition === null) {
      break
    }
    current = applyTransition(current, transition)
  }
  return current
}

function damages(state: CombatState): number[] {
  return state.log.flatMap((entry) =>
    entry.event.kind === 'hit' ? [entry.event.damage] : [],
  )
}

function advanceUntilAnotherHit(state: CombatState): CombatState {
  const count = damages(state).length
  let current = state
  for (let index = 0; index < 40; index += 1) {
    if (damages(current).length > count) {
      return current
    }
    const transition = nextTransition(current)
    if (transition === null) {
      break
    }
    current = applyTransition(current, transition)
  }
  return current
}

describe('support skills', () => {
  it('heals 30% of max HP on connect', () => {
    let state = makeCombat(50)
    state = startSkill(state, 'a', 'heal')
    state = advanceUntil(state, 'healed')
    expect(state.actors.a?.runtime.hp).toBe(80)
  })

  it('applies shout damage buffs until they expire', () => {
    let state = makeCombat()
    state = startSkill(state, 'a', 'shout')
    state = advanceUntil(state, 'buffed')
    const buff = state.actors.a?.runtime.buffs[0]
    expect(buff?.damageMultiplier).toBe(1.5)
    expect(buff?.incomingDamageMultiplier).toBe(0.5)

    state = advanceUntilFree(state, 'a')
    state = startSkill(state, 'a', 'strike', 'b')
    state = advanceUntilAnotherHit(state)
    expect(damages(state).at(-1)).toBe(30)

    state = advanceUntilFree(state, 'b')
    state = startSkill(state, 'b', 'strike', 'a')
    state = advanceUntilAnotherHit(state)
    expect(damages(state).at(-1)).toBe(10)
  })
})
