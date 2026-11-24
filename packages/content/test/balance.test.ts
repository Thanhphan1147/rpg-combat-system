import { describe, expect, it } from 'vitest'
import { createCombat, getPrompt, scalePhases, step } from '@rpg/engine'
import type { CombatState, Intent, Prompt } from '@rpg/engine'
import { rollEncounter } from '../src/encounter'

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function chooseIntent(state: CombatState, prompt: Prompt, random: () => number): Intent {
  if (prompt.kind === 'commit') {
    return { kind: 'commit' }
  }
  if (prompt.kind === 'reaction') {
    const best = prompt.options
      .filter(
        (option) =>
          option.kind === 'block' || option.kind === 'dodge' || option.kind === 'parry',
      )
      .map((option) => {
        const definition = state.content.skills[option.skillId]
        if (definition === undefined) {
          return { option, connectsAt: Number.POSITIVE_INFINITY }
        }
        const durations = scalePhases(state, prompt.actorId, definition)
        return {
          option,
          connectsAt: state.timeline.tick + durations.startup + durations.delivery,
        }
      })
      .filter((candidate) => candidate.connectsAt <= prompt.incoming.connectAt)
      .sort((a, b) => a.connectsAt - b.connectsAt)[0]
    return best ? { kind: 'react', skillId: best.option.skillId } : { kind: 'pass' }
  }
  const attacks = prompt.options.filter((option) => option.kind === 'attack')
  const pool = attacks.length > 0 ? attacks : prompt.options
  const choice = pool[Math.floor(random() * pool.length)]
  return choice ? { kind: 'act', skillId: choice.skillId } : { kind: 'pass' }
}

describe('balance simulation', () => {
  it('stays within a sane win-rate and length band', () => {
    const random = seeded(20261124)
    const runs = 300
    let playerWins = 0
    let stalls = 0
    let totalSteps = 0

    for (let run = 0; run < runs; run += 1) {
      const encounter = rollEncounter({ random })
      let state = createCombat({
        content: encounter.content,
        rules: encounter.rules,
        combatants: encounter.combatants,
      })
      let steps = 0
      while (state.outcome.status === 'active' && steps < 5000) {
        const prompt = getPrompt(state)
        if (prompt === null) {
          stalls += 1
          break
        }
        state = step(state, chooseIntent(state, prompt, random))
        steps += 1
      }
      if (state.outcome.status === 'active') {
        stalls += 1
      }
      if (state.outcome.status === 'ended' && state.outcome.winner === 'wanderer') {
        playerWins += 1
      }
      totalSteps += steps
    }

    expect(stalls).toBe(0)
    expect(playerWins / runs).toBeGreaterThan(0.35)
    expect(playerWins / runs).toBeLessThan(0.65)
    expect(totalSteps / runs).toBeLessThan(400)
  })
})
