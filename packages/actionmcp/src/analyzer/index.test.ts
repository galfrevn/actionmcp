import { rmSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, type TemporaryProject } from './__fixtures__/project'
import { analyze, createAnalysisCache, hasErrors, resolveConfig } from './index'
import { formatDiagnostic } from './diagnostics'

const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler' } })
const PAGE = 'export default function Page() { return null }\n'
const ACTIONS = `'use server'
import { agent } from 'actionmcp/server'
import { z } from 'zod'

export const addTodo = agent(
  { description: 'Add an item to the todo list. Returns the created item.', input: z.object({ text: z.string() }) },
  async ({ text }) => {
    await requireUser()
    return { text }
  },
)

export const listTodos = agent({ description: 'List the todos of the signed-in user.', readOnly: true }, async () => {
  await requireUser()
  return []
})
`

let project: TemporaryProject | undefined

afterEach(() => {
  project?.remove()
  project = undefined
})

function setup(files: Record<string, string>): TemporaryProject {
  project = createProject({ 'tsconfig.json': TSCONFIG, ...files })
  return project
}

describe('resolveConfig', () => {
  it('applies the defaults', () => {
    const { cwd } = setup({})
    expect(resolveConfig({}, cwd)).toMatchObject({
      cwd,
      registry: undefined,
      scan: ['app/**', 'lib/**', 'src/**'],
      outDir: join(cwd, '.agent-tools'),
      jsdoc: false,
    })
  })

  it('finds agent-tools.ts by default and honors explicit values', () => {
    const { cwd } = setup({ 'agent-tools.ts': '', 'tools/registry.ts': '' })
    expect(resolveConfig({}, cwd).registry).toBe(join(cwd, 'agent-tools.ts'))
    expect(
      resolveConfig(
        { registry: './tools/registry.ts', outDir: 'generated', scan: ['features/**'], jsdoc: true, auth: ['ensureUser'] },
        cwd,
      ),
    ).toEqual({
      cwd,
      registry: join(cwd, 'tools/registry.ts'),
      scan: ['features/**'],
      outDir: join(cwd, 'generated'),
      jsdoc: true,
      auth: ['ensureUser'],
    })
  })
})

describe('analyze', () => {
  it('collects tools from every scanned file, sorted by name', async () => {
    const { cwd } = setup({
      'app/page.tsx': PAGE,
      'app/todos/actions.ts': ACTIONS,
      'lib/unrelated.ts': 'export const answer = 42\n',
      'node_modules/pkg/index.ts': ACTIONS,
      '.agent-tools/registry.ts': ACTIONS,
    })
    const analysis = await analyze(resolveConfig({}, cwd))
    expect(analysis.diagnostics).toEqual([])
    expect(analysis.tools.map((tool) => [tool.name, tool.source.file])).toEqual([
      ['addTodo', 'app/todos/actions.ts'],
      ['listTodos', 'app/todos/actions.ts'],
    ])
    expect(analysis.routes).toEqual([{ pattern: '/', params: [] }])
    expect(analysis.registry).toBeUndefined()
  })

  it('never exposes a Server Function that did not opt in', async () => {
    const { cwd } = setup({
      'app/actions.ts': `'use server'\nexport async function deleteEverything() {}\nexport const transferFunds = async (input: { amount: number }) => input\n`,
    })
    const analysis = await analyze(resolveConfig({ jsdoc: true }, cwd))
    expect(analysis.tools).toEqual([])
  })

  it('adds the explicit registry and the JSDoc tools with inferred schemas', async () => {
    const { cwd } = setup({
      'app/todos/actions.ts': ACTIONS,
      'app/projects/actions.ts': `'use server'
/**
 * Rename the current project and return the new name.
 * @agent consequential
 */
export async function renameProject(input: { projectId: string; name: string }) {
  await requireUser()
  return schema.parse(input)
}
`,
      'agent-tools.ts': `import { defineAgentTools, tool, fromFormDataAction } from 'actionmcp/server'
import { invite } from './app/team/actions'
import { inviteSchema } from './lib/schemas'
export default defineAgentTools({
  'team.invite': tool(fromFormDataAction(invite), { description: 'Invite a person to the current team by email.', input: inviteSchema }),
})
`,
    })
    const analysis = await analyze(resolveConfig({ jsdoc: true }, cwd))
    expect(analysis.diagnostics).toEqual([])
    expect(analysis.registry).toBe('agent-tools.ts')
    expect(analysis.tools.map((tool) => [tool.name, tool.kind, tool.schemaSource])).toEqual([
      ['addTodo', 'agent', 'standard-schema'],
      ['listTodos', 'agent', 'none'],
      ['renameProject', 'jsdoc', 'typescript'],
      ['team.invite', 'explicit', 'standard-schema'],
    ])
    expect(analysis.tools[2]?.inputSchema).toEqual({
      type: 'object',
      properties: { projectId: { type: 'string' }, name: { type: 'string' } },
      required: ['projectId', 'name'],
    })
  })

  it('lists an agent() tool once when the registry renames it', async () => {
    const { cwd } = setup({
      'app/todos/actions.ts': ACTIONS,
      'agent-tools.ts': `import { defineAgentTools } from 'actionmcp/server'
import { listTodos as list } from './app/todos/actions'
export default defineAgentTools({ 'todos.list': list })
`,
    })
    const analysis = await analyze(resolveConfig({}, cwd))
    expect(analysis.diagnostics).toEqual([])
    expect(analysis.tools.map((tool) => [tool.name, tool.kind, tool.source.file])).toEqual([
      ['addTodo', 'agent', 'app/todos/actions.ts'],
      ['todos.list', 'explicit', 'app/todos/actions.ts'],
    ])
    expect(analysis.tools[1]).toMatchObject({
      description: 'List the todos of the signed-in user.',
      annotations: { readOnlyHint: true },
      validated: true,
    })
  })

  it('reports AT101 when a JSDoc type cannot become an object schema', async () => {
    const { cwd } = setup({
      'app/actions.ts': `'use server'\n/**\n * Fetch one project by its identifier.\n * @agent readonly\n */\nexport async function getProject(id: string) { await requireUser(); return schema.parse(id) }\n`,
    })
    const analysis = await analyze(resolveConfig({ jsdoc: true }, cwd))
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['AT101'])
    expect(analysis.tools[0]).toMatchObject({ schemaSource: 'none', diagnostics: ['AT101'] })
    expect(analysis.tools[0]).not.toHaveProperty('inputSchema')
  })

  it('reports AT001 for an invalid name and AT002 for reserved and duplicate names', async () => {
    const tool = (name: string, exportName: string) =>
      `export const ${exportName} = agent({ description: 'Do something useful for the signed-in user.', name: '${name}' }, async () => { await requireUser() })\n`
    const { cwd } = setup({
      'app/a.ts': `'use server'\nimport { agent } from 'actionmcp/server'\n${tool('bad name', 'a')}${tool('snapshot', 'b')}${tool('same', 'c')}`,
      'app/b.ts': `'use server'\nimport { agent } from 'actionmcp/server'\n${tool('same', 'd')}`,
    })
    const analysis = await analyze(resolveConfig({}, cwd))
    expect(analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.tool, diagnostic.file])).toEqual([
      ['AT001', 'bad name', 'app/a.ts'],
      ['AT002', 'snapshot', 'app/a.ts'],
      ['AT002', 'same', 'app/b.ts'],
    ])
    expect(analysis.diagnostics[2]?.message).toContain('app/a.ts:5')
    expect(hasErrors(analysis.diagnostics)).toBe(true)
  })

  it('accepts unique valid names', async () => {
    const { cwd } = setup({ 'app/todos/actions.ts': ACTIONS })
    expect(hasErrors((await analyze(resolveConfig({}, cwd))).diagnostics)).toBe(false)
  })

  it('reports AT104 above 32 tools and not at 32', async () => {
    const tools = (count: number) =>
      `'use server'\nimport { agent } from 'actionmcp/server'\n${Array.from({ length: count }, (_value, index) => `export const tool${index} = agent({ description: 'Do something useful for the signed-in user.' }, async () => { await requireUser() })`).join('\n')}\n`
    const { cwd, write } = setup({ 'app/actions.ts': tools(32) })
    expect((await analyze(resolveConfig({}, cwd))).diagnostics).toEqual([])
    write('app/actions.ts', tools(33))
    const analysis = await analyze(resolveConfig({}, cwd))
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['AT104'])
    expect(analysis.diagnostics[0]?.message).toContain('33 tools')
  })

  it('lists the navigate tool when a layout enables it', async () => {
    const { cwd } = setup({
      'app/layout.tsx':
        "import { AgentTools } from 'actionmcp'\nexport default function Layout({ children }) { return <html><body>{children}<AgentTools navigate /></body></html> }\n",
      'app/page.tsx': PAGE,
      'app/todos/page.tsx': PAGE,
    })
    const analysis = await analyze(resolveConfig({}, cwd))
    expect(analysis.tools).toEqual([expect.objectContaining({ name: 'navigate', kind: 'navigate', confirm: 'never' })])
    expect(analysis.routes.map((route) => route.pattern)).toEqual(['/', '/todos'])
  })

  it('reuses unchanged modules from the cache and picks up edits', async () => {
    const { cwd, write } = setup({ 'app/todos/actions.ts': ACTIONS })
    const config = resolveConfig({}, cwd)
    const cache = createAnalysisCache()
    const first = await analyze(config, cache)
    const cached = cache.modules.get('app/todos/actions.ts')
    const second = await analyze(config, cache)
    expect(cache.modules.get('app/todos/actions.ts')).toBe(cached)
    expect(second).toEqual(first)
    expect(second.tools[0]).not.toBe(first.tools[0])

    write('app/todos/actions.ts', ACTIONS.replace('addTodo', 'createTodo'))
    const future = new Date(Date.now() + 5000)
    utimesSync(join(cwd, 'app/todos/actions.ts'), future, future)
    const third = await analyze(config, cache)
    expect(third.tools.map((tool) => tool.name)).toEqual(['createTodo', 'listTodos'])
  })

  it('forgets deleted files', async () => {
    const { cwd, remove } = setup({ 'app/todos/actions.ts': ACTIONS, 'lib/extra.ts': ACTIONS.replaceAll('Todo', 'Note') })
    const config = resolveConfig({}, cwd)
    const cache = createAnalysisCache()
    expect((await analyze(config, cache)).tools).toHaveLength(4)
    rmSync(join(cwd, 'lib/extra.ts'))
    expect((await analyze(config, cache)).tools).toHaveLength(2)
    expect(cache.modules.has('lib/extra.ts')).toBe(false)
    void remove
  })
})

describe('registry references', () => {
  const registry = (imports: string, entries: string) =>
    `import { defineAgentTools } from 'actionmcp/server'\n${imports}\nexport default defineAgentTools(${entries})\n`
  const codes = (analysis: Awaited<ReturnType<typeof analyze>>) => analysis.diagnostics.map((diagnostic) => diagnostic.code)

  it('reports AT008 for a plain Server Function that the registry lists without tool()', async () => {
    const { cwd } = setup({
      'app/actions.ts': `'use server'\nexport async function plain(input: { id: string }) { return input }\nexport const arrow = async () => 1\n`,
      'agent-tools.ts': registry(`import { plain, arrow } from './app/actions'`, '{ plain, renamed: arrow }'),
    })
    const analysis = await analyze(resolveConfig({}, cwd))
    expect(codes(analysis)).toEqual(['AT008', 'AT008'])
    expect(hasErrors(analysis.diagnostics)).toBe(true)
    expect(analysis.diagnostics[0]).toMatchObject({ file: 'agent-tools.ts', line: 3, tool: 'plain' })
    expect(analysis.diagnostics[0]?.message).toContain('"plain" is a plain function in app/actions.ts')
    expect(analysis.tools.map((tool) => [tool.name, tool.diagnostics])).toEqual([
      ['plain', ['AT008']],
      ['renamed', ['AT008']],
    ])
  })

  it('reports AT008 for a default export that is a plain function', async () => {
    const { cwd } = setup({
      'app/actions.ts': `'use server'\nexport default async function plain() { return 1 }\n`,
      'agent-tools.ts': registry(`import plain from './app/actions'`, '{ plain }'),
    })
    expect(codes(await analyze(resolveConfig({}, cwd)))).toEqual(['AT008'])
  })

  it('does not report AT008 for an export that a factory creates or that an alias imports', async () => {
    const { cwd } = setup({
      'app/actions.ts': `'use server'\nimport { makeTool } from '../lib/factory'\nexport const made = makeTool('made')\nexport async function plain() { return 1 }\n`,
      'agent-tools.ts': registry(`import { made } from './app/actions'\nimport { plain } from '@/app/actions'`, '{ made, plain }'),
    })
    const analysis = await analyze(resolveConfig({}, cwd))
    expect(codes(analysis)).toEqual([])
    expect(analysis.tools.map((tool) => tool.name)).toEqual(['made', 'plain'])
  })

  it('adopts the tool from the imported file when two files export the same name', async () => {
    const { cwd } = setup({
      'app/todos/actions.ts': ACTIONS,
      'app/notes/actions.ts': ACTIONS.replace('List the todos of the signed-in user.', 'List the notes of the signed-in user.'),
      'agent-tools.ts': registry(
        `import { listTodos, addTodo } from './app/notes/actions'`,
        `{ 'notes.list': listTodos, 'notes.add': addTodo }`,
      ),
    })
    const analysis = await analyze(resolveConfig({}, cwd))
    expect(codes(analysis)).toEqual([])
    expect(analysis.tools.map((tool) => [tool.name, tool.kind, tool.source.file])).toEqual([
      ['addTodo', 'agent', 'app/todos/actions.ts'],
      ['listTodos', 'agent', 'app/todos/actions.ts'],
      ['notes.add', 'explicit', 'app/notes/actions.ts'],
      ['notes.list', 'explicit', 'app/notes/actions.ts'],
    ])
    expect(analysis.tools[3]?.description).toBe('List the notes of the signed-in user.')
  })

  it('reads an agent() tool that the registry imports from a file outside the scan globs', async () => {
    const { cwd } = setup({
      'actions/todos.ts': ACTIONS,
      'agent-tools.ts': registry(`import { listTodos } from './actions/todos'`, `{ 'todos.list': listTodos }`),
    })
    const analysis = await analyze(resolveConfig({}, cwd))
    expect(analysis.tools).toEqual([
      expect.objectContaining({
        name: 'todos.list',
        kind: 'explicit',
        description: 'List the todos of the signed-in user.',
        source: expect.objectContaining({ file: 'actions/todos.ts', export: 'listTodos' }),
      }),
    ])
    expect(analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.tool])).toEqual([['AT110', 'addTodo']])
  })
})

describe('tools outside the scan globs', () => {
  it('reports AT110 for an exported agent() tool that no scan glob covers', async () => {
    const { cwd } = setup({ 'app/page.tsx': PAGE, 'actions/todos.ts': ACTIONS })
    const analysis = await analyze(resolveConfig({}, cwd))
    expect(analysis.tools).toEqual([])
    expect(
      analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.level, diagnostic.file, diagnostic.line, diagnostic.tool]),
    ).toEqual([
      ['AT110', 'warn', 'actions/todos.ts', 5, 'addTodo'],
      ['AT110', 'warn', 'actions/todos.ts', 13, 'listTodos'],
    ])
    expect(hasErrors(analysis.diagnostics)).toBe(false)
  })

  it('does not report AT110 when a scan glob covers the file', async () => {
    const { cwd } = setup({ 'actions/todos.ts': ACTIONS })
    const analysis = await analyze(resolveConfig({ scan: ['actions/**'] }, cwd))
    expect(analysis.diagnostics).toEqual([])
    expect(analysis.tools).toHaveLength(2)
  })

  it('ignores tests, build output, dependencies, and files that export no tool', async () => {
    const { cwd } = setup({
      'actions/todos.test.ts': ACTIONS,
      'dist/todos.ts': ACTIONS,
      'node_modules/pkg/todos.ts': ACTIONS,
      'scripts/local.ts': ACTIONS.replaceAll('export const', 'const'),
      'scripts/client.ts': ACTIONS.replace(`'use server'\n`, ''),
      'next.config.ts': `import { withAgentTools } from 'actionmcp/config'\nexport default withAgentTools()({})\n`,
    })
    expect((await analyze(resolveConfig({}, cwd))).diagnostics).toEqual([])
  })

  it('drops the warning in watch mode when the file is removed', async () => {
    const { cwd } = setup({ 'actions/todos.ts': ACTIONS })
    const config = resolveConfig({}, cwd)
    const cache = createAnalysisCache()
    expect((await analyze(config, cache)).diagnostics).toHaveLength(2)
    expect(cache.modules.has('actions/todos.ts')).toBe(true)
    rmSync(join(cwd, 'actions/todos.ts'))
    expect((await analyze(config, cache)).diagnostics).toEqual([])
  })
})

describe('formatDiagnostic', () => {
  it('prints the level, code, location, message, and fix', async () => {
    const { cwd } = setup({
      'app/actions.ts': `'use server'\nimport { agent } from 'actionmcp/server'\nconst hidden = agent({ description: 'Do something useful for the signed-in user.' }, async () => { await requireUser() })\n`,
    })
    const [diagnostic] = (await analyze(resolveConfig({}, cwd))).diagnostics
    if (!diagnostic) throw new Error('Expected a diagnostic')
    expect(formatDiagnostic(diagnostic)).toBe(
      "error AT004 app/actions.ts:3:16 Tool is not an exported Server Function: the agent() call is not exported\n      fix: Export the function from a file that starts with the 'use server' directive.",
    )
  })
})
