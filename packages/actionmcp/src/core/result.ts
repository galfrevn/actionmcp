import { isNonEmptyString, isRecord } from './guards'
import type { SchemaIssue } from './schema'
import type { ToolAdapter } from './types'

export type AgentErrorCode =
  | 'invalid_input'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'stale_page'
  | 'failed'
  | 'declined'
  | 'blocked'
  | (string & {})

export interface AgentError {
  code: AgentErrorCode
  message: string
  issues?: SchemaIssue[]
}

export type AgentResult<R> = { ok: true; data: R } | { ok: false; error: AgentError }

export class AgentToolError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentToolError'
    this.code = code
  }
}

export const GENERIC_FAILURE_MESSAGE = 'The tool failed.'
export const INVALID_INPUT_MESSAGE = 'Invalid input.'
export const INVALID_OUTPUT_MESSAGE = 'The tool returned an unexpected output.'
export const DECLINED_MESSAGE = 'The user declined this action.'
export const BLOCKED_MESSAGE = 'The page blocked this action.'

export function succeed<R>(data: R): AgentResult<R> {
  return { ok: true, data }
}

export function fail(code: AgentErrorCode, message: string, issues?: SchemaIssue[]): AgentResult<never> {
  return { ok: false, error: issues && issues.length > 0 ? { code, message, issues } : { code, message } }
}

export function isAgentResult(value: unknown): value is AgentResult<unknown> {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok ? 'data' in value : isRecord(value.error) && typeof value.error.message === 'string'
}

export function isFrameworkSignal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const signal = error as { digest?: unknown; $$typeof?: unknown }
  return typeof signal.digest === 'string' || signal.$$typeof === Symbol.for('react.postpone')
}

export function normalizeActionResult(raw: unknown, adapter?: ToolAdapter): AgentResult<unknown> {
  if (isAgentResult(raw)) {
    return toJsonSafe(raw) as AgentResult<unknown>
  }
  if (isRecord(raw)) {
    const failure = readFailure(raw, adapter)
    if (failure) return failure
  }
  const data = adapter === 'safe-action' && isRecord(raw) ? raw.data : raw
  return succeed(toJsonSafe(data))
}

function readFailure(raw: Record<string, unknown>, adapter: ToolAdapter | undefined): AgentResult<never> | undefined {
  if (isPresent(raw.serverError)) {
    return fail('failed', isNonEmptyString(raw.serverError) ? raw.serverError : GENERIC_FAILURE_MESSAGE)
  }
  const validationIssues = collectIssues(raw.validationErrors, [])
  if (validationIssues.length > 0) return fail('invalid_input', INVALID_INPUT_MESSAGE, validationIssues)
  const formIssues = adapter === 'formdata' || adapter === 'form' ? collectIssues(raw.errors, []) : []
  if (formIssues.length > 0) return fail('invalid_input', isNonEmptyString(raw.message) ? raw.message : INVALID_INPUT_MESSAGE, formIssues)
  const errorMessage = isRecord(raw.error) ? raw.error.message : raw.error
  return isNonEmptyString(errorMessage) ? fail('failed', errorMessage) : undefined
}

export function toJsonSafe(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    const serialized = JSON.stringify(value, replaceUnserializable)
    return serialized === undefined ? undefined : JSON.parse(serialized)
  } catch {
    return String(value)
  }
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null
}

function collectIssues(node: unknown, path: readonly string[]): SchemaIssue[] {
  if (typeof node === 'string') return [{ message: node, path: [...path] }]
  if (Array.isArray(node)) return node.flatMap((item) => collectIssues(item, path))
  if (!isRecord(node)) return []
  return Object.entries(node).flatMap(([key, value]) => collectIssues(value, STRUCTURAL_KEYS.has(key) ? path : [...path, key]))
}

const STRUCTURAL_KEYS = new Set(['_errors', 'formErrors', 'fieldErrors'])

function replaceUnserializable(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Map) return Object.fromEntries(value)
  if (value instanceof Set) return [...value]
  return value
}
