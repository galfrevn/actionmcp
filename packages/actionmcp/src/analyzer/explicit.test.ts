import { describe, expect, it } from 'vitest'
import { scanRegistryModule, type RegistryScan } from './explicit'
import { parseModule } from './source'

const IMPORTS = `import 'server-only'
import { defineAgentTools, tool, fromFormDataAction, fromFormAction, fromSafeAction } from 'actionmcp/server'
import { inviteTeamMember, deleteAccount, createPost } from '@/app/actions'
import { loginUser } from '@/app/auth'
import { inviteSchema } from '@/lib/schemas'
`

function scan(body: string): RegistryScan {
  return scanRegistryModule(parseModule('agent-tools.ts', `${IMPORTS}${body}\n`))
}

function codes(result: RegistryScan): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code).toSorted()
}

describe('scanRegistryModule', () => {
  it('reads tools, adapters, and options from the default export', () => {
    const result = scan(`export default defineAgentTools({
  inviteTeamMember: tool(fromFormDataAction(inviteTeamMember), {
    description: 'Invite a person to the current team by email with a role',
    input: inviteSchema,
  }),
  'account.delete': tool(fromFormDataAction(deleteAccount), {
    description: 'Permanently delete the signed-in account. Irreversible.',
    input: inviteSchema,
    consequential: true,
  }),
  createPost: tool(fromFormAction(createPost), { description: 'Create a blog post from a title and a body.', input: inviteSchema }),
  loginUser: tool(fromSafeAction(loginUser), { description: 'Sign in with a username and a password.', input: inviteSchema, name: 'auth.login' }),
  ping: tool(loginUser, { description: 'Check that the session is still valid.', readOnly: true }),
})`)
    expect(result.diagnostics).toEqual([])
    expect(result.tools.map((tool) => [tool.name, tool.adapter, tool.schemaSource, tool.source.export])).toEqual([
      ['inviteTeamMember', 'formdata', 'standard-schema', 'inviteTeamMember'],
      ['account.delete', 'formdata', 'standard-schema', 'deleteAccount'],
      ['createPost', 'form', 'standard-schema', 'createPost'],
      ['auth.login', 'safe-action', 'standard-schema', 'loginUser'],
      ['ping', undefined, 'none', 'loginUser'],
    ])
    expect(result.tools[0]).toMatchObject({
      kind: 'explicit',
      source: { file: 'agent-tools.ts', line: 7 },
      annotations: { readOnlyHint: false, consequentialHint: true, untrustedContentHint: false },
      confirm: 'consequential',
      validated: false,
      inputSource: 'inviteSchema',
    })
    expect(result.tools[4]?.annotations.readOnlyHint).toBe(true)
  })

  it('finds a registry assigned to a variable', () => {
    const result = scan(
      `const registry = defineAgentTools({ ping: tool(loginUser, { description: 'Check that the session is still valid.' }) })\nexport default registry`,
    )
    expect(result.tools.map((tool) => tool.name)).toEqual(['ping'])
  })

  it('accepts an agent() tool passed by reference', () => {
    const result = scan(`export default defineAgentTools({ addTodo: loginUser })`)
    expect(result.diagnostics).toEqual([])
    expect(result.tools[0]).toMatchObject({ name: 'addTodo', validated: true, description: '' })
  })

  it('reports AT007 when there is no defineAgentTools call with an object literal', () => {
    expect(codes(scan(`export default {}`))).toEqual(['AT007'])
    expect(codes(scan(`export default defineAgentTools(tools)`))).toEqual(['AT007'])
  })

  it('reports AT007 for spreads, computed keys, and values that are not tool() calls', () => {
    const result = scan(`export default defineAgentTools({
  ...other,
  [dynamicName]: tool(loginUser, { description: 'Check that the session is still valid.' }),
  wrapped: wrap(loginUser),
})`)
    expect(codes(result)).toEqual(['AT007', 'AT007', 'AT007'])
    expect(result.tools).toEqual([])
  })

  it('reports AT003 and AT005 for descriptions', () => {
    expect(codes(scan(`export default defineAgentTools({ a: tool(loginUser, { description: '' }) })`))).toEqual(['AT003'])
    expect(codes(scan(`export default defineAgentTools({ a: tool(loginUser, { description: text }) })`))).toEqual(['AT005'])
    expect(codes(scan(`export default defineAgentTools({ a: tool(loginUser, options) })`))).toEqual(['AT005'])
  })

  it('reports AT005 for behavior options that are not literals', () => {
    expect(
      codes(
        scan(
          `export default defineAgentTools({ a: tool(loginUser, { description: 'Check that the session is valid.', confirm: policy }) })`,
        ),
      ),
    ).toEqual(['AT005'])
    expect(
      codes(
        scan(
          `export default defineAgentTools({ a: tool(loginUser, { description: 'Check that the session is valid.', readOnly: isReadOnly }) })`,
        ),
      ),
    ).toEqual(['AT005'])
  })

  it("reports AT103 for a consequential tool with confirm: 'never'", () => {
    const result = scan(
      `export default defineAgentTools({ a: tool(loginUser, { description: 'Delete every project in the team.', confirm: 'never' }) })`,
    )
    expect(codes(result)).toEqual(['AT103'])
  })

  it('reports AT108 for a short description', () => {
    expect(codes(scan(`export default defineAgentTools({ a: tool(loginUser, { description: 'Sign in' }) })`))).toEqual(['AT108'])
  })

  it('reports AT205 for an adapted action without an input schema', () => {
    const result = scan(
      `export default defineAgentTools({ invite: tool(fromFormDataAction(inviteTeamMember), { description: 'Invite a person to the current team.' }) })`,
    )
    expect(codes(result)).toEqual(['AT205'])
    expect(result.tools[0]?.diagnostics).toEqual(['AT205'])
  })

  it('does not report AT205 for a plain action without input', () => {
    expect(
      codes(scan(`export default defineAgentTools({ ping: tool(loginUser, { description: 'Check that the session is still valid.' }) })`)),
    ).toEqual([])
  })
})
