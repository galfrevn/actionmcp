import { describe, expect, it } from 'vitest'
import { DEFAULT_AUTH_FUNCTIONS } from './config'
import { mayContainTools, scanModule, type ModuleScan } from './scan'
import { parseModule } from './source'

const SERVER = "'use server'\nimport { agent } from 'actionmcp/server'\nimport { z } from 'zod'\n"
const DESCRIPTION = "description: 'Add an item to the todo list. Returns the item.'"

function scan(code: string, jsdoc = true, file = 'app/actions.ts'): ModuleScan {
  return scanModule(parseModule(file, code), { jsdoc, auth: DEFAULT_AUTH_FUNCTIONS })
}

function codes(result: ModuleScan): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code).toSorted()
}

const authedHandler = 'async () => { await requireUser() }'

describe('mayContainTools', () => {
  it('skips files that mention nothing relevant', () => {
    expect(mayContainTools('export const x = 1\n')).toBe(false)
  })

  it.each(["import { agent } from 'actionmcp/server'", '/** @agent */', '<AgentTools />'])('keeps %s', (code) => {
    expect(mayContainTools(code)).toBe(true)
  })
})

describe('agent() detection', () => {
  it('finds an exported agent() call with literal options', () => {
    const result = scan(
      `${SERVER}export const addTodo = agent({ ${DESCRIPTION}, title: 'Add todo', input: z.object({ text: z.string() }) }, async ({ text }) => { await requireUser(); return text })\n`,
    )
    expect(result.diagnostics).toEqual([])
    expect(result.tools).toEqual([
      {
        name: 'addTodo',
        kind: 'agent',
        source: { file: 'app/actions.ts', export: 'addTodo', line: 4 },
        description: 'Add an item to the todo list. Returns the item.',
        schemaSource: 'standard-schema',
        annotations: { readOnlyHint: false, consequentialHint: true, untrustedContentHint: false },
        confirm: 'consequential',
        validated: true,
        diagnostics: [],
        inputSource: 'z.object({ text: z.string() })',
      },
    ])
  })

  it('resolves an import alias and a namespace import', () => {
    const aliased = scan(
      `'use server'\nimport { agent as expose } from 'actionmcp/server'\nexport const a = expose({ ${DESCRIPTION} }, ${authedHandler})\n`,
    )
    const namespaced = scan(
      `'use server'\nimport * as mcp from 'actionmcp/server'\nexport const b = mcp.agent({ ${DESCRIPTION} }, ${authedHandler})\n`,
    )
    expect(aliased.tools.map((tool) => tool.name)).toEqual(['a'])
    expect(namespaced.tools.map((tool) => tool.name)).toEqual(['b'])
  })

  it('ignores an agent function from another package', () => {
    const result = scan(
      `'use server'\nimport { agent } from 'other-package'\nexport const a = agent({ ${DESCRIPTION} }, ${authedHandler})\n`,
    )
    expect(result.tools).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('reads flags, the name, and the confirm policy', () => {
    const result = scan(
      `${SERVER}export const listTodos = agent({ ${DESCRIPTION}, name: 'todos.list', readOnly: true, untrustedOutput: true, confirm: 'always' }, ${authedHandler})\n`,
    )
    expect(result.tools[0]).toMatchObject({
      name: 'todos.list',
      schemaSource: 'none',
      annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: true },
      confirm: 'always',
    })
  })

  it('finds a tool exported through a specifier and under another name', () => {
    const result = scan(`${SERVER}const internal = agent({ ${DESCRIPTION} }, ${authedHandler})\nexport { internal as addTodo }\n`)
    expect(result.tools[0]).toMatchObject({ name: 'addTodo', source: { export: 'addTodo' } })
    expect(result.diagnostics).toEqual([])
  })

  it('finds a default export that has a name', () => {
    const result = scan(`${SERVER}export default agent({ ${DESCRIPTION}, name: 'addTodo' }, ${authedHandler})\n`)
    expect(result.tools[0]).toMatchObject({ name: 'addTodo', source: { export: 'default' } })
    expect(result.diagnostics).toEqual([])
  })

  it('reports AT001 for a default export without a name', () => {
    expect(codes(scan(`${SERVER}export default agent({ ${DESCRIPTION} }, ${authedHandler})\n`))).toEqual(['AT001'])
  })

  it('reports AT001 for a name that is not a literal', () => {
    expect(codes(scan(`${SERVER}const n = 'x'\nexport const a = agent({ ${DESCRIPTION}, name: n }, ${authedHandler})\n`))).toEqual([
      'AT001',
    ])
  })

  it('reports AT003 for an empty or missing description', () => {
    expect(codes(scan(`${SERVER}export const a = agent({ description: '  ' }, ${authedHandler})\n`))).toEqual(['AT003'])
    expect(codes(scan(`${SERVER}export const a = agent({}, ${authedHandler})\n`))).toEqual(['AT003'])
  })

  it('reports AT004 for an agent() call that is not exported', () => {
    const result = scan(`${SERVER}const hidden = agent({ ${DESCRIPTION} }, ${authedHandler})\n`)
    expect(codes(result)).toEqual(['AT004'])
    expect(result.diagnostics[0]).toMatchObject({ file: 'app/actions.ts', line: 4, column: 16, level: 'error' })
  })

  it("reports AT004 for a file without 'use server'", () => {
    const result = scan(`import { agent } from 'actionmcp/server'\nexport const a = agent({ ${DESCRIPTION} }, ${authedHandler})\n`)
    expect(codes(result)).toEqual(['AT004'])
  })

  it.each([
    ['a variable', 'description: text'],
    ['a template with expressions', 'description: `Add ${thing} to the list`'],
    ['a function call', 'description: describe()'],
  ])('reports AT005 when the description is %s', (_label, description) => {
    expect(codes(scan(`${SERVER}export const a = agent({ ${description} }, ${authedHandler})\n`))).toEqual(['AT005'])
  })

  it('reports AT005 when the options are not an object literal or hide the description in a spread', () => {
    expect(codes(scan(`${SERVER}export const a = agent(options, ${authedHandler})\n`))).toEqual(['AT005'])
    expect(codes(scan(`${SERVER}export const a = agent({ ...shared }, ${authedHandler})\n`))).toEqual(['AT005'])
  })

  it.each([
    ['readOnly', 'readOnly: Boolean(process.env.READ_ONLY)'],
    ['consequential', 'consequential: flags.consequential'],
    ['untrustedOutput', 'untrustedOutput: !trusted'],
    ['confirm from a variable', 'confirm: policy'],
    ['confirm from a condition', "confirm: isDev ? 'never' : 'consequential'"],
    ['confirm with an unknown policy', "confirm: 'sometimes'"],
  ])('reports AT005 when %s is not a literal the analyzer can read', (_label, option) => {
    const result = scan(`${SERVER}export const a = agent({ ${DESCRIPTION}, ${option} }, ${authedHandler})\n`)
    expect(codes(result)).toEqual(['AT005'])
    expect(result.tools[0]?.diagnostics).toEqual(['AT005'])
  })

  it('reports AT005 for a spread next to a literal description', () => {
    expect(codes(scan(`${SERVER}export const a = agent({ ${DESCRIPTION}, ...defaults }, ${authedHandler})\n`))).toEqual(['AT005'])
  })

  it('reads literal behavior options without a diagnostic', () => {
    const result = scan(
      `${SERVER}export const a = agent({ ${DESCRIPTION}, readOnly: true, consequential: false, untrustedOutput: true, confirm: 'always' }, ${authedHandler})\n`,
    )
    expect(result.diagnostics).toEqual([])
    expect(result.tools[0]).toMatchObject({
      confirm: 'always',
      annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: true },
    })
  })

  it('accepts a template literal without expressions', () => {
    const result = scan(`${SERVER}export const a = agent({ description: \`Add an item to the todo list.\` }, ${authedHandler})\n`)
    expect(result.diagnostics).toEqual([])
    expect(result.tools[0]?.description).toBe('Add an item to the todo list.')
  })

  it("reports AT103 for a consequential tool with confirm: 'never'", () => {
    expect(codes(scan(`${SERVER}export const a = agent({ ${DESCRIPTION}, confirm: 'never' }, ${authedHandler})\n`))).toEqual(['AT103'])
  })

  it("accepts confirm: 'never' on a read-only tool", () => {
    expect(
      codes(scan(`${SERVER}export const a = agent({ ${DESCRIPTION}, confirm: 'never', readOnly: true }, ${authedHandler})\n`)),
    ).toEqual([])
  })

  it('reports AT105 when the handler calls no auth function', () => {
    const result = scan(`${SERVER}export const a = agent({ ${DESCRIPTION} }, async () => { return db.todo.findMany() })\n`)
    expect(codes(result)).toEqual(['AT105'])
    expect(result.tools[0]?.diagnostics).toEqual(['AT105'])
  })

  it('accepts a configured auth function, also as a member call and in a named handler', () => {
    expect(codes(scan(`${SERVER}export const a = agent({ ${DESCRIPTION} }, async () => { await session.requireUser() })\n`))).toEqual([])
    expect(
      codes(scan(`${SERVER}async function handler() { await auth() }\nexport const a = agent({ ${DESCRIPTION} }, handler)\n`)),
    ).toEqual([])
    const custom = scanModule(
      parseModule('a.ts', `${SERVER}export const a = agent({ ${DESCRIPTION} }, async () => { await ensureMember() })\n`),
      {
        jsdoc: false,
        auth: ['ensureMember'],
      },
    )
    expect(codes(custom)).toEqual([])
  })

  it('reports AT106 for an output with free-form strings and no untrustedOutput', () => {
    const output = 'output: z.object({ comments: z.array(z.string()) })'
    expect(codes(scan(`${SERVER}export const a = agent({ ${DESCRIPTION}, ${output} }, ${authedHandler})\n`))).toEqual(['AT106'])
    expect(
      codes(
        scan(
          `${SERVER}const out = z.object({ title: z.string() })\nexport const a = agent({ ${DESCRIPTION}, output: out }, ${authedHandler})\n`,
        ),
      ),
    ).toEqual(['AT106'])
  })

  it('accepts free-form output strings with untrustedOutput, and outputs without strings', () => {
    const output = 'output: z.object({ comments: z.array(z.string()) })'
    expect(
      codes(scan(`${SERVER}export const a = agent({ ${DESCRIPTION}, ${output}, untrustedOutput: true }, ${authedHandler})\n`)),
    ).toEqual([])
    expect(
      codes(scan(`${SERVER}export const a = agent({ ${DESCRIPTION}, output: z.object({ count: z.number() }) }, ${authedHandler})\n`)),
    ).toEqual([])
  })

  it('reports AT107 for personal fields that the handler does not use', () => {
    const input = 'input: z.object({ text: z.string(), email: z.string(), phoneNumber: z.string() })'
    const result = scan(
      `${SERVER}export const a = agent({ ${DESCRIPTION}, ${input} }, async ({ text }) => { await requireUser(); return text })\n`,
    )
    expect(codes(result)).toEqual(['AT107'])
    expect(result.diagnostics[0]?.message).toContain('email, phoneNumber')
  })

  it('accepts personal fields that the handler uses', () => {
    const input = 'input: z.object({ email: z.string() })'
    expect(
      codes(
        scan(
          `${SERVER}export const a = agent({ ${DESCRIPTION}, ${input} }, async (data) => { await requireUser(); return invite(data.email) })\n`,
        ),
      ),
    ).toEqual([])
  })

  it('reports AT108 for a description shorter than 20 characters', () => {
    expect(codes(scan(`${SERVER}export const a = agent({ description: 'Update settings' }, ${authedHandler})\n`))).toEqual(['AT108'])
  })
})

describe('agent() calls that cannot be registered', () => {
  it('reports AT109 for an agent() call wrapped in another call', () => {
    const result = scan(`${SERVER}export const a = withLogging(agent({ ${DESCRIPTION} }, ${authedHandler}))\n`)
    expect(result.tools).toEqual([])
    expect(result.diagnostics).toMatchObject([{ code: 'AT109', level: 'warn', file: 'app/actions.ts', line: 4, column: 30 }])
    expect(result.diagnostics[0]).not.toHaveProperty('tool')
  })

  it('reports AT109 for an agent() call inside a factory function', () => {
    const code = `import * as tools from 'actionmcp/server'\nexport function authedAgent(options, handler) {\n  return tools.agent(options, async (input) => { await requireUser(); return handler(input) })\n}\n`
    const result = scan(code, true, 'lib/agent.ts')
    expect(result.tools).toEqual([])
    expect(codes(result)).toEqual(['AT109'])
    expect(result.diagnostics[0]).toMatchObject({ file: 'lib/agent.ts', line: 3 })
  })

  it('does not report AT109 for a call that is registered or that already has its own diagnostic', () => {
    const exported = scan(
      `${SERVER}export const a = agent({ ${DESCRIPTION} }, ${authedHandler})\nexport default agent({ ${DESCRIPTION}, name: 'b' }, ${authedHandler})\n`,
    )
    expect(codes(exported)).toEqual([])
    const local = scan(`${SERVER}const a = agent({ ${DESCRIPTION} }, ${authedHandler})\n`)
    expect(codes(local)).toEqual(['AT004'])
  })

  it('ignores a function named agent that does not come from actionmcp/server', () => {
    const result = scan(
      `'use server'\nimport { agent } from './local'\nexport const a = wrap(agent({ ${DESCRIPTION} }, ${authedHandler}))\n// actionmcp/server\n`,
    )
    expect(codes(result)).toEqual([])
  })
})

describe('@agent detection', () => {
  const header = "'use server'\n"
  const doc = (tagLine: string, description = 'Rename the current project and return the new name.') =>
    `/**\n * ${description}\n * ${tagLine}\n */\n`
  const body = '{ await requireUser(); return schema.parse(input) }'

  it('finds an exported function with its modifiers', () => {
    const result = scan(
      `${header}${doc('@agent consequential name=project.rename untrusted-output')}export async function renameProject(input: { projectId: string; name: string }) ${body}\n`,
    )
    expect(result.diagnostics).toEqual([])
    expect(result.tools).toEqual([
      {
        name: 'project.rename',
        kind: 'jsdoc',
        source: { file: 'app/actions.ts', export: 'renameProject', line: 6 },
        description: 'Rename the current project and return the new name.',
        schemaSource: 'typescript',
        annotations: { readOnlyHint: false, consequentialHint: true, untrustedContentHint: true },
        confirm: 'consequential',
        validated: false,
        diagnostics: [],
      },
    ])
    expect(result.typeRequests).toHaveLength(1)
    expect(result.typeRequests[0]?.tool).toBe(result.tools[0])
  })

  it('finds a read-only arrow function', () => {
    const result = scan(`${header}${doc('@agent readonly')}export const listProjects = async () => { await requireUser() }\n`)
    expect(result.diagnostics).toEqual([])
    expect(result.tools[0]).toMatchObject({
      name: 'listProjects',
      schemaSource: 'none',
      annotations: { readOnlyHint: true, consequentialHint: false },
    })
    expect(result.typeRequests).toEqual([])
  })

  it('finds a function exported later through a specifier', () => {
    const result = scan(`${header}${doc('@agent')}async function rename(input: { id: string }) ${body}\nexport { rename }\n`)
    expect(result.diagnostics).toEqual([])
    expect(result.tools[0]?.name).toBe('rename')
  })

  it('ignores the tag when the JSDoc path is disabled', () => {
    const result = scan(`${header}${doc('@agent')}export async function rename(input: { id: string }) ${body}\n`, false)
    expect(result.tools).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('ignores tags in line comments and plain block comments', () => {
    const result = scan(`${header}// @agent\n/* @agent */\nexport async function rename(input: { id: string }) ${body}\n`)
    expect(result.tools).toEqual([])
  })

  it('reports AT003 for a tag without a description', () => {
    expect(codes(scan(`${header}/**\n * @agent\n */\nexport async function rename(input: { id: string }) ${body}\n`))).toEqual(['AT003'])
  })

  it('reports AT004 for a function that is not exported', () => {
    expect(codes(scan(`${header}${doc('@agent')}async function rename(input: { id: string }) ${body}\n`))).toEqual(['AT004'])
  })

  it("reports AT004 for a file without 'use server'", () => {
    expect(codes(scan(`${doc('@agent')}export async function rename(input: { id: string }) ${body}\n`))).toEqual(['AT004'])
  })

  it('reports AT004 for a tag that is not attached to a function', () => {
    expect(codes(scan(`${header}${doc('@agent')}export const limit = 10\n`))).toEqual(['AT004'])
    expect(codes(scan(`${header}export async function rename(input: { id: string }) ${body}\n${doc('@agent')}`))).toEqual(['AT004'])
  })

  it('reports AT006 for an unknown modifier', () => {
    const result = scan(`${header}${doc('@agent expose-all')}export async function rename(input: { id: string }) ${body}\n`)
    expect(codes(result)).toEqual(['AT006'])
    expect(result.diagnostics[0]?.message).toContain('expose-all')
  })

  it('reports AT101 for a (prevState, formData) signature and selects the formdata adapter', () => {
    const result = scan(
      `${header}${doc('@agent')}export async function invite(prev: unknown, formData: FormData) { await requireUser(); return schema.parse(formData) }\n`,
    )
    expect(codes(result)).toEqual(['AT101'])
    expect(result.tools[0]).toMatchObject({ adapter: 'formdata', schemaSource: 'none' })
    expect(result.typeRequests).toEqual([])
  })

  it('selects the form adapter for a (formData) signature with the formdata modifier', () => {
    const result = scan(
      `${header}${doc('@agent formdata')}export async function createPost(formData) { await requireUser(); return schema.parse(formData) }\n`,
    )
    expect(codes(result)).toEqual(['AT101'])
    expect(result.tools[0]?.adapter).toBe('form')
  })

  it('reports AT101 for a first parameter without a type', () => {
    expect(
      codes(scan(`${header}${doc('@agent')}export async function rename(input) { await requireUser(); return schema.parse(input) }\n`)),
    ).toEqual(['AT101'])
  })

  it('reports AT102 when the body does not validate its input', () => {
    const result = scan(
      `${header}${doc('@agent')}export async function rename(input: { id: string }) { await requireUser(); return db.rename(input.id) }\n`,
    )
    expect(codes(result)).toEqual(['AT102'])
  })

  it.each(['schema.parse(input)', 'schema.safeParse(input)', "schema['~standard'].validate(input)", 'assertValid(input)'])(
    'accepts %s as validation',
    (call) => {
      expect(
        codes(
          scan(`${header}${doc('@agent')}export async function rename(input: { id: string }) { await requireUser(); return ${call} }\n`),
        ),
      ).toEqual([])
    },
  )

  it('does not ask a function without parameters to validate', () => {
    expect(codes(scan(`${header}${doc('@agent readonly')}export async function list() { await requireUser() }\n`))).toEqual([])
  })

  it('reports AT105 and AT107 for JSDoc tools', () => {
    const result = scan(
      `${header}${doc('@agent')}export async function rename(input: { id: string; email: string }) { return schema.parse(input).id }\n`,
    )
    expect(codes(result)).toEqual(['AT105', 'AT107'])
  })

  it('reports AT108 for a short description', () => {
    expect(codes(scan(`${header}${doc('@agent readonly', 'List items.')}export async function list() { await requireUser() }\n`))).toEqual([
      'AT108',
    ])
  })
})

describe('navigate usage', () => {
  it('detects <AgentTools navigate />', () => {
    const code = "import { AgentTools } from 'actionmcp'\nexport default function Layout() { return <AgentTools navigate /> }\n"
    expect(scan(code, false, 'app/layout.tsx').usesNavigate).toBe(true)
  })

  it('detects a navigate object and an aliased import', () => {
    const code =
      "import { AgentTools as Tools } from 'actionmcp'\nexport default function Layout() { return <Tools navigate={{ routes: ['/todos'] }} /> }\n"
    expect(scan(code, false, 'app/layout.tsx').usesNavigate).toBe(true)
  })

  it('ignores navigate={false}, other props, and other components', () => {
    const disabled =
      "import { AgentTools } from 'actionmcp'\nexport default function Layout() { return <AgentTools navigate={false} polyfill /> }\n"
    const other = "import { AgentTools } from './local'\nexport default function Layout() { return <AgentTools navigate /> }\n"
    expect(scan(disabled, false, 'app/layout.tsx').usesNavigate).toBe(false)
    expect(scan(other, false, 'app/layout.tsx').usesNavigate).toBe(false)
  })
})
