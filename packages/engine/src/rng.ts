export type RngState = number

export interface Rng {
  nextFloat(): number
  nextInt(maxExclusive: number): number
  coinFlip(): boolean
}

export function seedRng(seed: number): RngState {
  return seed >>> 0
}

export function nextUint32(state: RngState): { value: number; state: RngState } {
  const next = (state + 0x6d2b79f5) | 0
  let t = Math.imul(next ^ (next >>> 15), 1 | next)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  const value = (t ^ (t >>> 14)) >>> 0
  return { value, state: next }
}

export function nextFloat(state: RngState): { value: number; state: RngState } {
  const result = nextUint32(state)
  return { value: result.value / 0x100000000, state: result.state }
}

export function nextInt(
  state: RngState,
  maxExclusive: number,
): { value: number; state: RngState } {
  if (maxExclusive <= 0) {
    throw new Error('maxExclusive must be positive')
  }
  const result = nextFloat(state)
  return { value: Math.floor(result.value * maxExclusive), state: result.state }
}

export function coinFlip(state: RngState): { value: boolean; state: RngState } {
  const result = nextUint32(state)
  return { value: (result.value & 1) === 1, state: result.state }
}

export function createRng(seed: number): Rng {
  let state = seedRng(seed)
  return {
    nextFloat(): number {
      const result = nextFloat(state)
      state = result.state
      return result.value
    },
    nextInt(maxExclusive: number): number {
      const result = nextInt(state, maxExclusive)
      state = result.state
      return result.value
    },
    coinFlip(): boolean {
      const result = coinFlip(state)
      state = result.state
      return result.value
    },
  }
}
