import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { executeTool } from '../core/execute'
import { INVALID_INPUT_MESSAGE } from '../core/result'
import { agent } from './agent'
import { loginSchema, loginUser } from './__fixtures__/safe-action'
import { invitations, inviteTeamMember, inviteTeamMemberSchema } from './__fixtures__/saas-starter'
import {
  createRegistry,
  defineAgentTools,
  fromFormAction,
  fromFormDataAction,
  fromSafeAction,
  isAgentToolRegistry,
  resolveAnnotations,
  tool,
} from './registry'
import { resolveTools } from './resolve'

const addTodo = agent({ description: 'Add a todo.', input: z.object({ text: z.string() }) }, async ({ text }) => ({ text }))
const listTodos = agent({ description: 'List todos.', readOnly: true, name: 'todos.list' }, async () => [])
const plainAction = async (input: { id: string }) => ({ id: input.id })

function run(registry: ReturnType<typeof defineAgentTools>, name: string, input: unknown) {
  const definition = resolveTools(registry).find((candidate) => candidate.name === name)
  if (!definition) throw new Error(`Unknown tool ${name}`)
  return executeTool({ ...definition, confirm: 'never' }, input, new AbortController().signal, { confirm: async () => true })
}

describe('resolveAnnotations', () => {
  it('marks a tool consequential unless it is read-only', () => {
    expect(resolveAnnotations(undefined, undefined, undefined)).toEqual({
      readOnlyHint: false,
      consequentialHint: true,
      untrustedContentHint: false,
    })
    expect(resolveAnnotations(true, undefined, undefined)).toEqual({
      readOnlyHint: true,
      consequentialHint: false,
      untrustedContentHint: false,
    })
  })

  it('honors explicit values', () => {
    expect(resolveAnnotations(false, false, true)).toEqual({
      readOnlyHint: false,
      consequentialHint: false,
      untrustedContentHint: true,
    })
    expect(resolveAnnotations(true, true, undefined).consequentialHint).toBe(true)
  })
})

describe('tool', () => {
  it('pairs an action with its options', () => {
    const options = { description: 'Read one item.' }
    expect(tool(plainAction, options)).toEqual({ action: plainAction, options })
  })

  it('keeps the adapter of an adapted action', () => {
    const definition = tool(fromFormDataAction(inviteTeamMember), { description: 'Invite a member.' })
    expect(definition.adapter).toBe('formdata')
    expect(definition.action).toBe(inviteTeamMember)
    expect(tool(fromSafeAction(loginUser), { description: 'Sign in.' }).adapter).toBe('safe-action')
    expect(tool(fromFormAction(async (_formData: FormData) => undefined), { description: 'Post.' }).adapter).toBe('form')
  })

  it('rejects an empty description', () => {
    expect(() => tool(plainAction, { description: ' ' })).toThrow('non-empty description')
  })
})

describe('defineAgentTools', () => {
  it('builds entries with safe defaults', () => {
    const registry = defineAgentTools({
      inviteTeamMember: tool(fromFormDataAction(inviteTeamMember), {
        description: 'Invite a person to the team.',
        title: 'Invite member',
        input: inviteTeamMemberSchema,
      }),
    })
    expect(isAgentToolRegistry(registry)).toBe(true)
    expect(registry.routes).toEqual([])
    expect(registry.entries).toEqual([
      {
        name: 'inviteTeamMember',
        kind: 'explicit',
        action: inviteTeamMember,
        title: 'Invite member',
        description: 'Invite a person to the team.',
        input: inviteTeamMemberSchema,
        annotations: { readOnlyHint: false, consequentialHint: true, untrustedContentHint: false },
        confirm: 'consequential',
        adapter: 'formdata',
      },
    ])
  })

  it('prefers the name option over the key', () => {
    const registry = defineAgentTools({ invite: tool(plainAction, { description: 'Invite.', name: 'team.invite', confirm: 'never' }) })
    expect(registry.entries[0]).toMatchObject({ name: 'team.invite', confirm: 'never' })
  })

  it('accepts agent() tools directly', () => {
    const registry = defineAgentTools({ addTodo, listTodos })
    expect(registry.entries.map((entry) => [entry.name, entry.kind])).toEqual([
      ['addTodo', 'agent'],
      ['todos.list', 'agent'],
    ])
  })

  it('rejects a bare function that is not an agent() tool', () => {
    expect(() => defineAgentTools({ plainAction })).toThrow('not wrapped in agent()')
  })
})

describe('createRegistry', () => {
  it('merges agent, jsdoc, and explicit tools with routes', () => {
    const explicit = defineAgentTools({ loginUser: tool(fromSafeAction(loginUser), { description: 'Sign in.', input: loginSchema }) })
    const inputSchema = { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] }
    const registry = createRegistry({
      agent: { addTodo },
      jsdoc: {
        renameProject: {
          action: plainAction,
          description: 'Rename the current project.',
          inputSchema,
          annotations: { consequentialHint: true },
          validated: false,
        },
        legacyForm: { action: plainAction, description: 'Submit the legacy form.', adapter: 'formdata', validated: false },
      },
      explicit,
      routes: [{ pattern: '/', params: [] }],
    })
    expect(isAgentToolRegistry(registry)).toBe(true)
    expect(registry.entries.map((entry) => [entry.name, entry.kind, entry.adapter])).toEqual([
      ['addTodo', 'agent', undefined],
      ['renameProject', 'jsdoc', undefined],
      ['legacyForm', 'jsdoc', 'formdata'],
      ['loginUser', 'explicit', 'safe-action'],
    ])
    expect(registry.entries[1]).toMatchObject({ inputSchema, confirm: 'consequential', annotations: { consequentialHint: true } })
    expect(registry.routes).toEqual([{ pattern: '/', params: [] }])
  })

  it('creates an empty registry', () => {
    expect(createRegistry({})).toMatchObject({ entries: [], routes: [] })
  })

  it('rejects an agent export without metadata', () => {
    expect(() => createRegistry({ agent: { plainAction } })).toThrow('"plainAction" is not wrapped in agent()')
  })
})

describe('isAgentToolRegistry', () => {
  it.each([null, undefined, {}, { entries: [], routes: [] }])('rejects %j', (value) => {
    expect(isAgentToolRegistry(value)).toBe(false)
  })
})

describe('fromFormDataAction with the saas-starter signature', () => {
  const registry = defineAgentTools({
    inviteTeamMember: tool(fromFormDataAction(inviteTeamMember), { description: 'Invite a person to the team.', input: inviteTeamMemberSchema }),
  })

  it('builds FormData from the agent input and returns the ActionState', async () => {
    invitations.length = 0
    await expect(run(registry, 'inviteTeamMember', { email: 'ana@acme.com', role: 'member' })).resolves.toEqual({
      ok: true,
      data: { success: 'Invitation sent successfully' },
    })
    expect(invitations).toEqual([{ email: 'ana@acme.com', role: 'member' }])
  })

  it('maps an ActionState error to a failure', async () => {
    await expect(run(registry, 'inviteTeamMember', { email: 'not-an-email', role: 'member' })).resolves.toEqual({
      ok: false,
      error: { code: 'failed', message: 'Invalid email' },
    })
    await expect(run(registry, 'inviteTeamMember', { email: 'ana@acme.com', role: 'member' })).resolves.toEqual({
      ok: false,
      error: { code: 'failed', message: 'An invitation has already been sent to this email' },
    })
  })
})

describe('fromSafeAction with next-safe-action', () => {
  const registry = defineAgentTools({
    loginUser: tool(fromSafeAction(loginUser), { description: 'Sign in with a username and a password.', input: loginSchema }),
  })

  it('unwraps data', async () => {
    await expect(run(registry, 'loginUser', { username: 'valentin', password: 'correct-horse' })).resolves.toEqual({
      ok: true,
      data: { username: 'valentin' },
    })
  })

  it('maps validationErrors to invalid_input issues', async () => {
    const output = await run(registry, 'loginUser', { username: 'v', password: 'short' })
    expect(output).toMatchObject({ ok: false, error: { code: 'invalid_input', message: INVALID_INPUT_MESSAGE } })
    expect(output.ok ? [] : output.error.issues?.map((issue) => issue.path)).toEqual([['username'], ['password']])
  })

  it('maps serverError to a failure', async () => {
    await expect(run(registry, 'loginUser', { username: 'locked', password: 'correct-horse' })).resolves.toEqual({
      ok: false,
      error: { code: 'failed', message: 'This account is locked' },
    })
  })
})
