import { describe, expect, it } from 'vitest'
import { createCombat, getPrompt, step } from '@rpg/engine'
import type { Intent } from '@rpg/engine'
import { rollMonster, wanderer } from '../src/characters'
import { enemyArchetypes, goblinEncounter, rollEncounter } from '../src/encounter'

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function total(stats: Record<string, number>): number {
  return Object.values(stats).reduce((sum, value) => sum + value, 0)
}

describe('goblin encounter', () => {
  it('ships content, rules and two combatants', () => {
    expect(goblinEncounter.combatants).toHaveLength(2)
    expect(Object.keys(goblinEncounter.content.skills)).toEqual(
      expect.arrayContaining(['slash', 'heavy', 'guard', 'stab', 'club']),
    )
    expect(Object.keys(goblinEncounter.content.characters)).toEqual([
      'wanderer',
      'goblin',
    ])
    expect(goblinEncounter.narration.opening).toContain('goblin')
    expect(goblinEncounter.content.skills.basic?.cooldown).toBe(0)
    expect(
      goblinEncounter.combatants.every((combatant) =>
        combatant.skillIds?.includes('basic'),
      ),
    ).toBe(true)
    expect(goblinEncounter.narration.playerInitiative.length).toBeGreaterThan(0)
    expect(goblinEncounter.narration.tooFastPlayer).toContain('too fast')

    const guard = goblinEncounter.content.skills.guard!
    const dodge = goblinEncounter.content.skills.dodge!
    expect(dodge.startup + dodge.delivery).toBeLessThan(guard.startup + guard.delivery)
    expect(dodge.ending).toBeGreaterThan(guard.ending)
  })

  it('ships goblin and humanoid archetypes with resolvable skills', () => {
    expect(enemyArchetypes.map((archetype) => archetype.id)).toEqual(
      expect.arrayContaining([
        'clubber',
        'archer',
        'berserker',
        'skeleton',
        'lizardman',
        'beastman',
        'skeletonCaptain',
      ]),
    )
    for (const archetype of enemyArchetypes) {
      for (const skillId of archetype.skillIds) {
        expect(goblinEncounter.content.skills[skillId]).toBeDefined()
      }
    }
  })

  it('rolls the goblin between 85% and 115% of the player total', () => {
    const playerTotal = total(wanderer.baseStats)
    const min = Math.round(playerTotal * 0.85)
    const max = Math.round(playerTotal * 1.15)
    for (let seed = 1; seed <= 40; seed += 1) {
      const goblin = rollMonster(wanderer, seeded(seed))
      const goblinTotal = total(goblin.baseStats)
      expect(goblinTotal).toBeGreaterThanOrEqual(min)
      expect(goblinTotal).toBeLessThanOrEqual(max)
      expect(goblin.baseStats.maxHp).toBeGreaterThanOrEqual(250)
      expect(goblin.baseStats.attack).toBeGreaterThanOrEqual(20)
    }
  })

  it('scales monsters with level', () => {
    const low = rollMonster(wanderer, seeded(1), { level: 1 })
    const high = rollMonster(wanderer, seeded(1), { level: 5 })
    expect(total(high.baseStats)).toBeGreaterThan(total(low.baseStats))
  })

  it('plays a rolled fight to completion', () => {
    const random = seeded(7)
    const encounter = rollEncounter({ random })
    let state = createCombat({
      content: encounter.content,
      rules: encounter.rules,
      combatants: encounter.combatants,
    })

    let safety = 0
    while (state.outcome.status === 'active' && safety < 2000) {
      safety += 1
      const prompt = getPrompt(state)
      if (prompt === null) {
        break
      }

      let intent: Intent
      if (prompt.kind === 'commit') {
        intent = { kind: 'commit' }
      } else if (prompt.kind === 'action') {
        const attacks = prompt.options.filter((option) => option.kind === 'attack')
        const pool = attacks.length > 0 ? attacks : prompt.options
        const choice = pool[Math.floor(random() * pool.length)]!
        intent = { kind: 'act', skillId: choice.skillId }
      } else {
        const block = prompt.options.find((option) => option.kind === 'block')
        intent = block ? { kind: 'react', skillId: block.skillId } : { kind: 'pass' }
      }
      state = step(state, intent)
    }

    expect(state.outcome.status).toBe('ended')
    expect(state.log.some((entry) => entry.event.kind === 'combatEnd')).toBe(true)
  })
})
