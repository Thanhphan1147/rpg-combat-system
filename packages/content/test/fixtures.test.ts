import { describe, expect, it } from 'vitest'
import { sampleContent, sampleRules } from '../src/fixtures'

describe('sample content', () => {
  it('provides skills and characters for the debug UI', () => {
    const content = sampleContent()
    expect(Object.keys(content.skills)).toEqual(['jab', 'heavy', 'guard'])
    expect(Object.keys(content.characters)).toEqual(['hero', 'foe'])
    expect(content.skills.heavy?.armoredDuringDelivery).toBe(true)
    expect(sampleRules.block.incompleteMitigation).toBeGreaterThan(0)
  })
})
