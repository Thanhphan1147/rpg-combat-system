import { describe, expect, it } from 'vitest'
import { coinFlip, createRng, nextFloat, nextInt, nextUint32, seedRng } from '../src/rng'

describe('seeded rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const sequenceA = Array.from({ length: 10 }, () => a.nextFloat())
    const sequenceB = Array.from({ length: 10 }, () => b.nextFloat())
    expect(sequenceA).toEqual(sequenceB)
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(Array.from({ length: 10 }, () => a.nextFloat())).not.toEqual(
      Array.from({ length: 10 }, () => b.nextFloat()),
    )
  })

  it('keeps floats in [0, 1)', () => {
    const rng = createRng(123)
    for (let i = 0; i < 200; i += 1) {
      const value = rng.nextFloat()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('returns integers in the requested range', () => {
    const rng = createRng(9)
    for (let i = 0; i < 200; i += 1) {
      const value = rng.nextInt(6)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(6)
    }
  })

  it('returns booleans from coinFlip', () => {
    const rng = createRng(3)
    for (let i = 0; i < 50; i += 1) {
      expect(typeof rng.coinFlip()).toBe('boolean')
    }
  })

  it('is pure when driven by explicit state', () => {
    const state = seedRng(77)
    const first = nextUint32(state)
    const second = nextUint32(state)
    expect(first).toEqual(second)
    expect(first.state).not.toBe(state)

    expect(nextFloat(first.state)).toEqual(nextFloat(first.state))
    expect(nextInt(state, 10)).toEqual(nextInt(state, 10))
    expect(coinFlip(state)).toEqual(coinFlip(state))
    expect(nextInt(state, 10).value).toBeLessThan(10)
  })

  it('rejects a non-positive range', () => {
    expect(() => nextInt(seedRng(1), 0)).toThrow()
  })
})
