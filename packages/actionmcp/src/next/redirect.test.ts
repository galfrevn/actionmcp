import { describe, expect, it } from 'vitest'
import { readRedirect, recoverRedirect } from './redirect'

function redirectError(digest: string): Error {
  return Object.assign(new Error('NEXT_REDIRECT'), { digest })
}

describe('readRedirect', () => {
  it('reads the target of a redirect() error', () => {
    expect(readRedirect(redirectError('NEXT_REDIRECT;push;/done;307;'))).toBe('/done')
    expect(readRedirect(redirectError('NEXT_REDIRECT;replace;/projects/1?tab=a;b;308;'))).toBe('/projects/1?tab=a;b')
  })

  it.each([new Error('boom'), redirectError('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 42 }, 'text', null, undefined])(
    'ignores %j',
    (value) => {
      expect(readRedirect(value)).toBeUndefined()
    },
  )
})

describe('recoverRedirect', () => {
  it('turns a redirect into a successful result', () => {
    expect(recoverRedirect(redirectError('NEXT_REDIRECT;push;/done;307;'))).toEqual({ ok: true, data: { navigatedTo: '/done' } })
  })

  it('leaves other errors alone', () => {
    expect(recoverRedirect(new Error('boom'))).toBeUndefined()
  })
})
