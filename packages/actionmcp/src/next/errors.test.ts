import { afterEach, describe, expect, it, vi } from 'vitest'
import { GENERIC_FAILURE_MESSAGE } from '../core/result'
import { FORBIDDEN_MESSAGE, NOT_FOUND_MESSAGE, STALE_PAGE_MESSAGE, UNAUTHORIZED_MESSAGE, recoverServerFunctionError } from './errors'

function digestError(message: string, digest: string): Error {
  return Object.assign(new Error(message), { digest })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('recoverServerFunctionError', () => {
  it('turns a redirect into a navigation result', () => {
    expect(recoverServerFunctionError(digestError('NEXT_REDIRECT', 'NEXT_REDIRECT;push;/done;307;'))).toEqual({
      ok: true,
      data: { navigatedTo: '/done' },
    })
  })

  it.each([
    ['NEXT_HTTP_ERROR_FALLBACK;404', 'not_found', NOT_FOUND_MESSAGE],
    ['NEXT_HTTP_ERROR_FALLBACK;401', 'unauthorized', UNAUTHORIZED_MESSAGE],
    ['NEXT_HTTP_ERROR_FALLBACK;403', 'forbidden', FORBIDDEN_MESSAGE],
  ])('turns the access error %s into the %s code', (digest, code, message) => {
    expect(recoverServerFunctionError(digestError(digest, digest))).toEqual({ ok: false, error: { code, message } })
  })

  it('turns an action that the server no longer knows into the stale_page code', () => {
    const error = Object.assign(new Error('Server Action "abc" was not found on the server.'), { name: 'UnrecognizedActionError' })
    expect(recoverServerFunctionError(error)).toEqual({ ok: false, error: { code: 'stale_page', message: STALE_PAGE_MESSAGE } })
  })

  it('replaces the message of a server error in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const error = digestError('An error occurred in the Server Components render. The specific message is omitted.', '2187401920')
    expect(recoverServerFunctionError(error)).toEqual({ ok: false, error: { code: 'failed', message: GENERIC_FAILURE_MESSAGE } })
  })

  it('keeps the message of a server error in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(recoverServerFunctionError(digestError('Database offline', '2187401920'))).toBeUndefined()
  })

  it.each([new Error('Failed to fetch'), digestError('x', 'NEXT_HTTP_ERROR_FALLBACK;500'), 'text', null, undefined])(
    'leaves %j to the default handling in development',
    (value) => {
      expect(recoverServerFunctionError(value)).toBeUndefined()
    },
  )
})
