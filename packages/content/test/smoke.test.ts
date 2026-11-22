import { describe, expect, it } from 'vitest'
import * as content from '../src/index'

describe('@rpg/content', () => {
  it('exposes an entry module', () => {
    expect(content).toBeTypeOf('object')
  })
})
