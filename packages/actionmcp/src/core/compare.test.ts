import { describe, expect, it } from 'vitest'
import { compareText } from './compare'

describe('compareText', () => {
  it('orders by code unit, independent of the locale', () => {
    expect(['get_cart', 'getProfile', 'Zeta', 'alpha', 'alpha'].toSorted(compareText)).toEqual([
      'Zeta',
      'alpha',
      'alpha',
      'getProfile',
      'get_cart',
    ])
  })
})
