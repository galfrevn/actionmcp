import { describe, expect, it } from 'vitest'
import { toFormData } from './formdata'

describe('toFormData', () => {
  it('writes strings and numbers as string fields', () => {
    const formData = toFormData({ email: 'ana@acme.com', seats: 3 })
    expect(formData.get('email')).toBe('ana@acme.com')
    expect(formData.get('seats')).toBe('3')
  })

  it('writes true as "on" and omits false', () => {
    const formData = toFormData({ notify: true, archive: false })
    expect(formData.get('notify')).toBe('on')
    expect(formData.has('archive')).toBe(false)
  })

  it('writes arrays as repeated keys', () => {
    expect(toFormData({ tags: ['a', 'b'] }).getAll('tags')).toEqual(['a', 'b'])
  })

  it('omits null and undefined', () => {
    const formData = toFormData({ a: null, b: undefined })
    expect([...formData.keys()]).toEqual([])
  })

  it('serializes nested objects as JSON', () => {
    expect(toFormData({ meta: { role: 'admin' } }).get('meta')).toBe('{"role":"admin"}')
  })

  it('returns an empty FormData for a non-object input', () => {
    expect([...toFormData('text').keys()]).toEqual([])
    expect([...toFormData(undefined).keys()]).toEqual([])
  })
})
