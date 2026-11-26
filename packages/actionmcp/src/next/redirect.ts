import type { AgentResult } from '../core/result'

const REDIRECT_DIGEST = /^NEXT_REDIRECT;[^;]*;(.*);\d+;$/

export type NavigationResult = AgentResult<{ navigatedTo: string }>

export function readRedirect(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const { digest } = error as { digest?: unknown }
  return typeof digest === 'string' ? REDIRECT_DIGEST.exec(digest)?.[1] : undefined
}

export function recoverRedirect(error: unknown): NavigationResult | undefined {
  const navigatedTo = readRedirect(error)
  return navigatedTo === undefined ? undefined : { ok: true, data: { navigatedTo } }
}
