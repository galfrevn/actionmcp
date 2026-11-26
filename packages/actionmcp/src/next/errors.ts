import { GENERIC_FAILURE_MESSAGE, fail, type AgentResult } from '../core/result'
import { recoverRedirect } from './redirect'

const ACCESS_FALLBACK_DIGEST = /^NEXT_HTTP_ERROR_FALLBACK;(\d{3})$/

export const NOT_FOUND_MESSAGE = 'The resource was not found.'
export const UNAUTHORIZED_MESSAGE = 'The action needs a signed-in user.'
export const FORBIDDEN_MESSAGE = 'The signed-in user is not allowed to run this action.'
export const STALE_PAGE_MESSAGE = 'The page is out of date because the app was deployed again. Reload the page and try again.'

const ACCESS_FALLBACKS: Record<string, AgentResult<never>> = {
  '401': fail('unauthorized', UNAUTHORIZED_MESSAGE),
  '403': fail('forbidden', FORBIDDEN_MESSAGE),
  '404': fail('not_found', NOT_FOUND_MESSAGE),
}

export function recoverServerFunctionError(error: unknown): AgentResult<unknown> | undefined {
  const navigation = recoverRedirect(error)
  if (navigation) return navigation
  if (typeof error !== 'object' || error === null) return undefined
  const { digest, name } = error as { digest?: unknown; name?: unknown }
  if (name === 'UnrecognizedActionError') return fail('stale_page', STALE_PAGE_MESSAGE)
  if (typeof digest !== 'string') return undefined
  const status = ACCESS_FALLBACK_DIGEST.exec(digest)?.[1]
  const fallback = status === undefined ? undefined : ACCESS_FALLBACKS[status]
  if (fallback) return fallback
  return process.env.NODE_ENV === 'production' ? fail('failed', GENERIC_FAILURE_MESSAGE) : undefined
}
