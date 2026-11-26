import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { AgentToolError, GENERIC_FAILURE_MESSAGE, INVALID_INPUT_MESSAGE, INVALID_OUTPUT_MESSAGE, type AgentResult } from '../core/result'
import { AGENT_META, agent, readAgentMeta } from './agent'

const input = z.object({ text: z.string().min(1).max(200) })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('agent', () => {
  it('returns an async function that carries its options', () => {
    const options = { description: 'Add a todo.', input }
    const addTodo = agent(options, async ({ text }) => ({ text }))
    expect(addTodo.constructor.name).toBe('AsyncFunction')
    expect(addTodo[AGENT_META].options).toBe(options)
    expect(readAgentMeta(addTodo)?.options).toBe(options)
    expect(Object.keys(addTodo)).toEqual([])
  })

  it('reads no metadata from other values', () => {
    expect(readAgentMeta(async () => 1)).toBeUndefined()
    expect(readAgentMeta({})).toBeUndefined()
  })

  it.each(['', '   '])('rejects the description %j', (description) => {
    expect(() => agent({ description }, async () => 1)).toThrow('non-empty description')
  })

  it.each(['Always', 'sometimes', ''])('rejects the confirm policy %j', (confirm) => {
    expect(() => agent({ description: 'Add a todo.', confirm: confirm as never }, async () => 1)).toThrow(
      "requires `confirm` to be 'always', 'consequential', or 'never'",
    )
  })

  it.each(['readOnly', 'consequential', 'untrustedOutput'])('rejects a %s option that is not a boolean', (key) => {
    expect(() => agent({ description: 'Add a todo.', [key]: 'false' }, async () => 1)).toThrow(`requires \`${key}\` to be a boolean`)
  })

  it('accepts every valid policy and boolean', () => {
    for (const confirm of ['always', 'consequential', 'never'] as const) {
      expect(() =>
        agent({ description: 'Add a todo.', confirm, readOnly: false, consequential: true, untrustedOutput: false }, async () => 1),
      ).not.toThrow()
    }
  })

  it('passes the validated input to the handler', async () => {
    const handler = vi.fn(async ({ text }: { text: string }) => ({ id: 1, text }))
    const addTodo = agent({ description: 'Add a todo.', input }, handler)
    await expect(addTodo({ text: 'Buy milk' })).resolves.toEqual({ ok: true, data: { id: 1, text: 'Buy milk' } })
    expect(handler).toHaveBeenCalledWith({ text: 'Buy milk' })
  })

  it('applies schema defaults and transforms before the handler', async () => {
    const schema = z.object({ count: z.coerce.number(), tags: z.array(z.string()).default([]) })
    const tool = agent({ description: 'Count things.', input: schema }, async (value) => value)
    await expect(tool({ count: '3' })).resolves.toEqual({ ok: true, data: { count: 3, tags: [] } })
  })

  it('returns invalid_input without calling the handler', async () => {
    const handler = vi.fn(async () => 'never')
    const addTodo = agent({ description: 'Add a todo.', input }, handler)
    const result = await (addTodo as (value: unknown) => Promise<AgentResult<string>>)({ text: '' })
    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: INVALID_INPUT_MESSAGE, issues: [expect.objectContaining({ path: ['text'] })] },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not leak internals in validation issues', async () => {
    const addTodo = agent({ description: 'Add a todo.', input }, async () => 'done')
    const result = await (addTodo as (value: unknown) => Promise<AgentResult<string>>)('not an object')
    expect(JSON.stringify(result)).not.toMatch(/\bat\b.*\.ts|node_modules|stack/)
    expect(result.ok ? [] : Object.keys(result.error.issues?.[0] ?? {}).toSorted()).toEqual(['message', 'path'])
  })

  it('ignores the caller input when the tool declares none', async () => {
    const handler = vi.fn(async () => ['a'])
    const listTodos = agent({ description: 'List todos.', readOnly: true }, handler)
    await expect((listTodos as (value?: unknown) => Promise<unknown>)({ injected: true })).resolves.toEqual({ ok: true, data: ['a'] })
    expect(handler).toHaveBeenCalledWith(undefined)
  })

  it('returns the code and message of an AgentToolError', async () => {
    const tool = agent({ description: 'Needs auth.' }, async () => {
      throw new AgentToolError('unauthorized', 'Sign in first.')
    })
    await expect(tool()).resolves.toEqual({ ok: false, error: { code: 'unauthorized', message: 'Sign in first.' } })
  })

  it('hides unexpected error messages in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('connect ECONNREFUSED 10.0.0.5:5432')
    const tool = agent({ description: 'Breaks.' }, async () => {
      throw failure
    })
    await expect(tool()).resolves.toEqual({ ok: false, error: { code: 'failed', message: GENERIC_FAILURE_MESSAGE } })
    expect(log).toHaveBeenCalledWith(failure)
  })

  it('shows unexpected error messages in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const tool = agent({ description: 'Breaks.' }, async () => {
      throw new Error('Database is down')
    })
    await expect(tool()).resolves.toEqual({ ok: false, error: { code: 'failed', message: 'Database is down' } })
  })

  it('uses the generic message for a thrown non-error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const tool = agent({ description: 'Breaks.' }, async () => Promise.reject('nope'))
    await expect(tool()).resolves.toEqual({ ok: false, error: { code: 'failed', message: GENERIC_FAILURE_MESSAGE } })
  })

  it('rethrows framework signals such as redirect()', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;push;/done;307;' })
    const tool = agent({ description: 'Redirects.' }, async () => {
      throw redirect
    })
    await expect(tool()).rejects.toBe(redirect)
  })

  it('returns only what the output schema declares', async () => {
    const output = z.object({ id: z.number(), text: z.string() })
    const tool = agent({ description: 'Create a todo.', output }, async () => ({ id: 1, text: 'Buy milk', userId: 'secret' }))
    await expect(tool()).resolves.toEqual({ ok: true, data: { id: 1, text: 'Buy milk' } })
  })

  it('fails without returning data when the output does not match its schema', async () => {
    const output = z.object({ id: z.number() })
    const tool = agent({ description: 'Create a todo.', output }, async () => ({ id: 'not-a-number', secret: 'x' }) as never)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await tool()
    expect(result).toEqual({ ok: false, error: { code: 'failed', message: INVALID_OUTPUT_MESSAGE } })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(logged).toHaveBeenCalledWith(
      'actionmcp: the output of the tool described as "Create a todo." does not match its output schema.',
      [expect.objectContaining({ path: ['id'] })],
    )
    expect(JSON.stringify(logged.mock.calls)).not.toContain('not-a-number')
    logged.mockRestore()
  })

  it('names the tool in the log when the output of a named tool does not match', async () => {
    const tool = agent(
      { name: 'todos.create', description: 'Create a todo.', output: z.object({ id: z.number() }) },
      async () => ({}) as never,
    )
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await tool()
    expect(logged.mock.calls[0]?.[0]).toBe('actionmcp: the output of the tool "todos.create" does not match its output schema.')
    logged.mockRestore()
  })
})

describe('agent types', () => {
  it('infers the handler input from the schema output and the caller input from the schema input', () => {
    const schema = z.object({ count: z.string().transform(Number), note: z.string().optional() })
    const tool = agent({ description: 'Typed.', input: schema }, async (value) => {
      expectTypeOf(value).toEqualTypeOf<{ count: number; note?: string | undefined }>()
      return { total: value.count }
    })
    expectTypeOf(tool).parameter(0).toEqualTypeOf<{ count: string; note?: string | undefined }>()
    expectTypeOf(tool).returns.resolves.toEqualTypeOf<AgentResult<{ total: number }>>()
  })

  it('takes no arguments when the tool declares no input', () => {
    const tool = agent({ description: 'No input.' }, async () => 1)
    expectTypeOf(tool).parameters.toEqualTypeOf<[]>()
    expectTypeOf(tool).returns.resolves.toEqualTypeOf<AgentResult<number>>()
  })

  it('types the data from the output schema', () => {
    const output = z.object({ id: z.number() })
    const tool = agent({ description: 'Output.', output }, async () => ({ id: 1, extra: true }))
    expectTypeOf(tool).returns.resolves.toEqualTypeOf<AgentResult<{ id: number }>>()
  })
})
