import * as v from 'valibot'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { agent } from './agent'
import { createRegistry, defineAgentTools, fromFormDataAction, tool } from './registry'
import { resolveTools, selectOrigins, selectTools, wrapOutputSchema } from './resolve'

const action = async () => undefined

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('resolveTools', () => {
  it('produces serializable definitions with JSON Schemas', () => {
    const addTodo = agent(
      {
        description: 'Add a todo.',
        title: 'Add todo',
        input: z.object({ text: z.string() }),
        output: z.object({ id: z.number() }),
        untrustedOutput: true,
      },
      async () => ({ id: 1 }),
    )
    const registry = createRegistry({ agent: { addTodo } })
    expect(resolveTools(registry)).toEqual([
      {
        name: 'addTodo',
        title: 'Add todo',
        description: 'Add a todo.',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        outputSchema: wrapOutputSchema({
          type: 'object',
          properties: { id: { type: 'number' } },
          required: ['id'],
          additionalProperties: false,
        }),
        annotations: { readOnlyHint: false, consequentialHint: true, untrustedContentHint: true },
        confirm: 'consequential',
        action: addTodo,
      },
    ])
  })

  it('omits schemas for a tool without input', () => {
    const registry = defineAgentTools({ ping: tool(action, { description: 'Ping.', readOnly: true }) })
    const [definition] = resolveTools(registry)
    expect(definition).not.toHaveProperty('inputSchema')
    expect(definition).not.toHaveProperty('outputSchema')
    expect(definition).not.toHaveProperty('adapter')
    expect(definition).not.toHaveProperty('title')
  })

  it('uses the embedded schema of a JSDoc tool', () => {
    const inputSchema = { type: 'object', properties: { id: { type: 'string' } } }
    const registry = createRegistry({ jsdoc: { rename: { action, description: 'Rename.', inputSchema, validated: false } } })
    expect(resolveTools(registry)[0]?.inputSchema).toBe(inputSchema)
  })

  it('caches the definitions per registry', () => {
    const registry = defineAgentTools({ ping: tool(action, { description: 'Ping.' }) })
    expect(resolveTools(registry)).toBe(resolveTools(registry))
  })

  it('warns with AT101 and registers without a schema when conversion fails', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = defineAgentTools({ save: tool(action, { description: 'Save.', input: v.object({ text: v.string() }) }) })
    expect(resolveTools(registry)[0]).not.toHaveProperty('inputSchema')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('AT101'))
  })

  it('stays silent about AT101 in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = defineAgentTools({ save: tool(action, { description: 'Save.', input: v.object({ text: v.string() }) }) })
    resolveTools(registry)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('selectTools', () => {
  const registry = defineAgentTools({
    'team.listMembers': tool(action, { description: 'List members.', readOnly: true }),
    'team.removeMember': tool(action, { description: 'Remove a member.' }),
    'account.update': tool(action, { description: 'Update the account.' }),
  })

  const names = (selection: Parameters<typeof selectTools>[1]) => selectTools(registry, selection).map((definition) => definition.name)

  it('selects every tool by default', () => {
    expect(names({})).toEqual(['team.listMembers', 'team.removeMember', 'account.update'])
  })

  it('applies include and exclude before the prefix', () => {
    expect(names({ include: ['team.*'], exclude: ['team.removeMember'], prefix: 'acme.' })).toEqual(['acme.team.listMembers'])
  })

  it('does not mutate the cached definitions', () => {
    names({ prefix: 'acme.' })
    expect(names({})).toEqual(['team.listMembers', 'team.removeMember', 'account.update'])
  })

  it('throws on an invalid name in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(() => names({ prefix: 'acme ' })).toThrow('Invalid tool name')
  })

  it('throws on a duplicate name in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const duplicated = defineAgentTools({
      first: tool(action, { description: 'First.', name: 'same' }),
      second: tool(action, { description: 'Second.', name: 'same' }),
    })
    expect(() => selectTools(duplicated, {})).toThrow('more than once')
  })

  it('warns and drops the offending tools in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reserved = defineAgentTools({
      snapshot: tool(action, { description: 'Reserved name.' }),
      ping: tool(action, { description: 'Ping.' }),
    })
    expect(selectTools(reserved, {}).map((definition) => definition.name)).toEqual(['ping'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('reserved'))
  })
})

describe('wrapOutputSchema', () => {
  it('describes the result envelope around the data schema', () => {
    const data = { type: 'object', properties: { id: { type: 'number' } } }
    const schema = wrapOutputSchema(data)
    expect(schema).toMatchObject({ type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, data } })
  })
})

describe('initial state', () => {
  it('passes the initial state of a FormData action to the definition', () => {
    const registry = defineAgentTools({
      invite: tool(
        fromFormDataAction(async (_previous: never, _formData: FormData) => undefined, { initialState: { errors: {} } }),
        {
          description: 'Invite a person to the team.',
        },
      ),
    })
    expect(resolveTools(registry)[0]).toMatchObject({ adapter: 'formdata', initialState: { errors: {} } })
  })
})

describe('selectOrigins', () => {
  it('keeps trustworthy origins and an absent list', () => {
    expect(selectOrigins(undefined)).toBeUndefined()
    expect(selectOrigins(['https://agent.example', 'http://localhost:3001'])).toEqual(['https://agent.example', 'http://localhost:3001'])
  })

  it('throws on an origin that the browser would refuse in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(() => selectOrigins(['agent.example'])).toThrow('exposedTo needs origins')
  })

  it('warns and leaves out the refused origins in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(selectOrigins(['agent.example', 'https://agent.example'])).toEqual(['https://agent.example'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"agent.example"'))
  })
})
