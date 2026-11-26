import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProject, type TemporaryProject } from '../analyzer/__fixtures__/project'
import { resolveConfig } from '../analyzer/config'
import type { GenerateResult } from './index'
import { watchProject, watchRoots, type WatchHandle } from './watch'

const tool = (name: string) =>
  `'use server'\nimport { agent } from 'actionmcp/server'\nexport const ${name} = agent({ description: 'Check that the session is still valid.', readOnly: true }, async () => { await requireUser() })\n`
const REGISTRY = (description: string) =>
  `import { defineAgentTools, tool } from 'actionmcp/server'\nimport { ping } from './lib/ping'\nexport default defineAgentTools({ ping: tool(ping, { description: '${description}', readOnly: true }) })\n`

let project: TemporaryProject | undefined
let handle: WatchHandle | undefined

afterEach(() => {
  handle?.close()
  handle = undefined
  project?.remove()
  project = undefined
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 400))

async function start(files: Record<string, string>, config = {}) {
  project = createProject(files)
  const resolved = resolveConfig(config, project.cwd)
  const results: GenerateResult[] = []
  const errors: unknown[] = []
  await settle()
  handle = watchProject(resolved, { onResult: (result) => results.push(result), onError: (error) => errors.push(error), debounceMs: 100 })
  await settle()
  results.length = 0
  errors.length = 0
  return { cwd: project.cwd, write: project.write, results, errors }
}

describe('watchRoots', () => {
  it('watches the static prefix of each glob that exists, without nested duplicates', () => {
    project = createProject({ 'app/page.tsx': '', 'lib/x.ts': '', 'features/todos/actions.ts': '' })
    const { cwd } = project
    expect(watchRoots(resolveConfig({}, cwd))).toEqual([join(cwd, 'app'), join(cwd, 'lib')])
    expect(watchRoots(resolveConfig({ scan: ['features/**/actions.ts', 'features/todos/*.ts', 'missing/**'] }, cwd))).toEqual([
      join(cwd, 'app'),
      join(cwd, 'features'),
    ])
    expect(watchRoots(resolveConfig({ scan: ['lib/x.ts'] }, cwd))).toEqual([join(cwd, 'app'), join(cwd, 'lib')])
  })

  it('adds src/app when the app lives there', () => {
    project = createProject({ 'src/app/page.tsx': '', 'src/lib/x.ts': '' })
    expect(watchRoots(resolveConfig({}, project.cwd))).toEqual([join(project.cwd, 'src')])
  })
})

describe('watchProject', () => {
  it('regenerates when a scanned file changes and once per burst of edits', async () => {
    const { cwd, write, results } = await start({ 'app/actions.ts': tool('ping') })
    write('app/actions.ts', tool('pong'))
    write('app/other.ts', tool('extra'))
    await vi.waitFor(() => expect(results.length).toBeGreaterThan(0), { timeout: 5000, interval: 25 })
    await settle()
    expect(results).toHaveLength(1)
    expect(results[0]?.analysis.tools.map((entry) => entry.name)).toEqual(['extra', 'pong'])
    expect(readFileSync(join(cwd, '.agent-tools/registry.ts'), 'utf8')).toContain('pong: m0.pong')
  })

  it('stays within the incremental budget', async () => {
    const files = Object.fromEntries(Array.from({ length: 200 }, (_value, index) => [`lib/module${index}.ts`, tool(`tool${index}`)]))
    const { write, results } = await start(files, { scan: ['lib/**'] })
    write('lib/module0.ts', tool('first'))
    await vi.waitFor(() => expect(results).toHaveLength(1), { timeout: 5000, interval: 25 })
    write('lib/module1.ts', tool('second'))
    await vi.waitFor(() => expect(results).toHaveLength(2), { timeout: 5000, interval: 25 })
    expect(results[1]?.durationMs).toBeLessThan(300)
  })

  it('ignores its own output and dependency folders', async () => {
    const { write, results } = await start(
      { 'src/actions.ts': tool('ping'), 'src/node_modules/pkg/index.ts': '' },
      { outDir: 'src/generated' },
    )
    write('src/generated/registry.ts', 'export default {}\n')
    write('src/node_modules/pkg/index.ts', tool('hidden'))
    await settle()
    expect(results).toEqual([])
  })

  it('regenerates when the registry file changes and ignores its siblings', async () => {
    const { write, results } = await start({
      'agent-tools.ts': REGISTRY('Check that the session is still valid.'),
      'lib/ping.ts': '',
      'notes.txt': '',
    })
    write('notes.txt', 'unrelated')
    await settle()
    expect(results).toEqual([])
    write('agent-tools.ts', REGISTRY('Report whether the session is still valid.'))
    await vi.waitFor(() => expect(results).toHaveLength(1), { timeout: 5000, interval: 25 })
    expect(results[0]?.analysis.tools[0]?.description).toBe('Report whether the session is still valid.')
  })

  it('reports failures and keeps watching', async () => {
    const { cwd, write, results, errors } = await start({ 'app/actions.ts': tool('ping') }, { outDir: 'out' })
    rmSync(join(cwd, 'out'), { recursive: true, force: true })
    write('out', 'a file where the folder should be')
    write('app/actions.ts', tool('pong'))
    await vi.waitFor(() => expect(errors).toHaveLength(1), { timeout: 5000, interval: 25 })
    rmSync(join(cwd, 'out'))
    write('app/actions.ts', tool('third'))
    await vi.waitFor(() => expect(results).toHaveLength(1), { timeout: 5000, interval: 25 })
  })

  it('stops after close()', async () => {
    const { write, results } = await start({ 'app/actions.ts': tool('ping') })
    handle?.close()
    write('app/actions.ts', tool('pong'))
    await settle()
    expect(results).toEqual([])
  })
})
