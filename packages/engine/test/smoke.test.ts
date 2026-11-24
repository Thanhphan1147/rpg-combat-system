import { describe, expect, it } from 'vitest'
import * as engine from '../src/index'

describe('@rpg/engine', () => {
  it('exposes the public stats helpers', () => {
    expect(engine.getEffectiveStat).toBeTypeOf('function')
    expect(engine.getMaxHp).toBeTypeOf('function')
  })
})
