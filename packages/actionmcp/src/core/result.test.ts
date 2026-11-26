import { describe, expect, it } from 'vitest'
import {
  AgentToolError,
  GENERIC_FAILURE_MESSAGE,
  INVALID_INPUT_MESSAGE,
  fail,
  isAgentResult,
  isFrameworkSignal,
  normalizeActionResult,
  succeed,
  toJsonSafe,
} from './result'

describe('AgentToolError', () => {
  it('keeps the code and the message', () => {
    const error = new AgentToolError('unauthorized', 'Sign in first.')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AgentToolError')
    expect(error.code).toBe('unauthorized')
    expect(error.message).toBe('Sign in first.')
  })
})

describe('fail', () => {
  it('omits issues when there are none', () => {
    expect(fail('failed', 'Nope')).toEqual({ ok: false, error: { code: 'failed', message: 'Nope' } })
    expect(fail('failed', 'Nope', [])).toEqual({ ok: false, error: { code: 'failed', message: 'Nope' } })
  })

  it('includes issues when present', () => {
    const issues = [{ message: 'Required', path: ['text'] }]
    expect(fail('invalid_input', 'Invalid', issues)).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: 'Invalid', issues },
    })
  })
})

describe('isAgentResult', () => {
  it.each([succeed(1), succeed(undefined), fail('failed', 'x')])('accepts %j', (value) => {
    expect(isAgentResult(value)).toBe(true)
  })

  it.each([null, 'ok', [], {}, { ok: 'yes' }, { ok: true }, { ok: false }, { ok: false, error: 'x' }])('rejects %j', (value) => {
    expect(isAgentResult(value)).toBe(false)
  })
})

describe('isFrameworkSignal', () => {
  it('recognizes errors that carry a digest', () => {
    expect(isFrameworkSignal(Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;push;/done;307;' }))).toBe(true)
  })

  it('recognizes a React postpone', () => {
    expect(isFrameworkSignal({ $$typeof: Symbol.for('react.postpone') })).toBe(true)
  })

  it.each([new Error('boom'), 'text', null, undefined])('ignores %j', (value) => {
    expect(isFrameworkSignal(value)).toBe(false)
  })
})

describe('normalizeActionResult', () => {
  it('passes an AgentResult through', () => {
    expect(normalizeActionResult(succeed({ id: 1 }))).toEqual({ ok: true, data: { id: 1 } })
    expect(normalizeActionResult(fail('unauthorized', 'Sign in first.'))).toEqual({
      ok: false,
      error: { code: 'unauthorized', message: 'Sign in first.' },
    })
  })

  it('wraps a plain value', () => {
    expect(normalizeActionResult({ id: 1 })).toEqual({ ok: true, data: { id: 1 } })
    expect(normalizeActionResult('done')).toEqual({ ok: true, data: 'done' })
  })

  it('reports a void action as a success without data', () => {
    expect(JSON.stringify(normalizeActionResult(undefined))).toBe('{"ok":true}')
  })

  it('maps an ActionState error string to a failure', () => {
    expect(normalizeActionResult({ error: 'Invalid email' })).toEqual({
      ok: false,
      error: { code: 'failed', message: 'Invalid email' },
    })
  })

  it('keeps an ActionState without an error as data', () => {
    expect(normalizeActionResult({ success: 'Invitation sent' })).toEqual({
      ok: true,
      data: { success: 'Invitation sent' },
    })
  })

  it('maps a safe-action serverError to a failure', () => {
    expect(normalizeActionResult({ serverError: 'Database is down' }, 'safe-action')).toEqual({
      ok: false,
      error: { code: 'failed', message: 'Database is down' },
    })
    expect(normalizeActionResult({ serverError: { reason: 'x' } }, 'safe-action')).toEqual({
      ok: false,
      error: { code: 'failed', message: GENERIC_FAILURE_MESSAGE },
    })
  })

  it('maps formatted safe-action validationErrors to issues', () => {
    const raw = { validationErrors: { _errors: ['Form is invalid'], email: { _errors: ['Invalid email'] } } }
    expect(normalizeActionResult(raw, 'safe-action')).toEqual({
      ok: false,
      error: {
        code: 'invalid_input',
        message: INVALID_INPUT_MESSAGE,
        issues: [
          { message: 'Form is invalid', path: [] },
          { message: 'Invalid email', path: ['email'] },
        ],
      },
    })
  })

  it('maps flattened safe-action validationErrors to issues', () => {
    const raw = { validationErrors: { formErrors: [], fieldErrors: { email: ['Invalid email'] } } }
    expect(normalizeActionResult(raw, 'safe-action')).toEqual({
      ok: false,
      error: {
        code: 'invalid_input',
        message: INVALID_INPUT_MESSAGE,
        issues: [{ message: 'Invalid email', path: ['email'] }],
      },
    })
  })

  it('unwraps safe-action data', () => {
    expect(normalizeActionResult({ data: { id: 7 } }, 'safe-action')).toEqual({ ok: true, data: { id: 7 } })
  })

  it('does not unwrap data without the safe-action adapter', () => {
    expect(normalizeActionResult({ data: { id: 7 } })).toEqual({ ok: true, data: { data: { id: 7 } } })
  })
})

describe('toJsonSafe', () => {
  it('converts values that JSON cannot represent', () => {
    const value = { count: 10n, tags: new Set(['a']), byId: new Map([['k', 1]]), at: new Date(0) }
    expect(toJsonSafe(value)).toEqual({ count: '10', tags: ['a'], byId: { k: 1 }, at: '1970-01-01T00:00:00.000Z' })
  })

  it('returns undefined for values without a JSON form', () => {
    expect(toJsonSafe(undefined)).toBeUndefined()
    expect(toJsonSafe(() => 1)).toBeUndefined()
  })

  it('falls back to a string for circular values', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(toJsonSafe(circular)).toBe('[object Object]')
  })
})
