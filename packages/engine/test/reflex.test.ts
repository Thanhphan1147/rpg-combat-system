import { describe, expect, it } from 'vitest'
import { reactionAt, reactionDelay } from '../src/reflex'
import type { Ruleset } from '../src/types/state'

const rules: Ruleset = {
  reflex: { base: 12, scale: 0.5, floor: 1 },
  perception: { base: 10, scale: 1, floor: 1 },
  interruptDuringStartup: { damageMultiplier: 1.5, stagger: 4 },
  speedScaling: { rate: 0, startupFloor: 0 },
}

describe('reactionDelay', () => {
  it('decreases as reflex rises', () => {
    expect(reactionDelay(0, rules)).toBe(12)
    expect(reactionDelay(10, rules)).toBe(7)
    expect(reactionDelay(20, rules)).toBe(2)
  })

  it('applies the configured floor', () => {
    expect(reactionDelay(100, rules)).toBe(1)
  })

  it('never returns a negative delay', () => {
    const harsh: Ruleset = { ...rules, reflex: { base: 1, scale: 1, floor: 0 } }
    expect(reactionDelay(2, harsh)).toBe(0)
  })
})

describe('reactionAt', () => {
  it('adds the delay to the skill start', () => {
    expect(reactionAt(10, 10, rules)).toBe(17)
  })
})
