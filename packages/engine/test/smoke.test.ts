import { describe, expect, it } from 'vitest'
import * as engine from '../src/index'

describe('@rpg/engine', () => {
  it('exposes an entry module', () => {
    expect(engine).toBeTypeOf('object')
  })
})
