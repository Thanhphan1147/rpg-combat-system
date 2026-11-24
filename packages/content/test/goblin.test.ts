import { describe, expect, it } from 'vitest'
import { createCombat, getPrompt, step } from '@rpg/engine'
import type { Intent } from '@rpg/engine'
import { goblinEncounter } from '../src/encounter'

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
  })

  it('plays to completion with a simple auto-player', () => {
    let state = createCombat({
      content: goblinEncounter.content,
      rules: goblinEncounter.rules,
      combatants: goblinEncounter.combatants,
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
