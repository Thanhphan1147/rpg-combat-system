import { describe, expect, it } from 'vitest'
import { createCombat, getPrompt, step } from '@rpg/engine'
import type { Intent } from '@rpg/engine'
import { rollGoblin, wanderer } from '../src/characters'
import { goblinEncounter, rollGoblinEncounter } from '../src/encounter'

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
    expect(goblinEncounter.rules.block.incompleteMitigation).toBeGreaterThan(0)
    expect(goblinEncounter.narration.opening).toContain('goblin')
    expect(goblinEncounter.narration.playerInitiative.length).toBeGreaterThan(0)
    expect(goblinEncounter.narration.tooFastPlayer).toContain('too fast')
  })

  it('rolls the goblin at 80% of the player total', () => {
    const target = Math.round(total(wanderer.baseStats) * 0.8)
    for (let seed = 1; seed <= 20; seed += 1) {
      const goblin = rollGoblin(wanderer, seeded(seed))
      expect(total(goblin.baseStats)).toBe(target)
      expect(goblin.baseStats.maxHp).toBeGreaterThanOrEqual(25)
      expect(goblin.baseStats.attack).toBeGreaterThanOrEqual(2)
    }
  })

  it('plays a rolled fight to completion', () => {
    const encounter = rollGoblinEncounter(seeded(7))
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
      if (prompt.kind === 'action') {
        const attack = prompt.options.find((option) => option.kind === 'attack')
        intent = { kind: 'act', skillId: (attack ?? prompt.options[0]!).skillId }
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
