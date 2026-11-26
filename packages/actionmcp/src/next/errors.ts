import { GENERIC_FAILURE_MESSAGE, fail, type AgentResult } from '../core/result'
import { recoverRedirect } from './redirect'

export const NOT_FOUND_MESSAGE = 'The resource was not found.'
export const UNAUTHORIZED_MESSAGE = 'The action needs a signed-in user.'
export const FORBIDDEN_MESSAGE = 'The user is not allowed to do this.'
export const STALE_PAGE_MESSAGE = 'The page is out of date. Reload it.'

const ACCESS_FALLBACKS: Record<string, AgentResult<never>> = {
  'NEXT_HTTP_ERROR_FALLBACK;401': fail('unauthorized', UNAUTHORIZED_MESSAGE),
  'NEXT_HTTP_ERROR_FALLBACK;403': fail('forbidden', FORBIDDEN_MESSAGE),
  'NEXT_HTTP_ERROR_FALLBACK;404': fail('not_found', NOT_FOUND_MESSAGE),
}

export function recoverServerFunctionError(error: unknown): AgentResult<unknown> | undefined {
  const navigation = recoverRedirect(error)
  if (navigation) return navigation
  if (typeof error !== 'object' || error === null) return undefined
  const { digest, name } = error as { digest?: unknown; name?: unknown }
  if (name === 'UnrecognizedActionError') return fail('stale_page', STALE_PAGE_MESSAGE)
  if (typeof digest !== 'string') return undefined
  if (Object.hasOwn(ACCESS_FALLBACKS, digest)) return ACCESS_FALLBACKS[digest]
  return process.env.NODE_ENV === 'production' ? fail('failed', GENERIC_FAILURE_MESSAGE) : undefined
}
