import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, type TemporaryProject } from './__fixtures__/project'
import { analyze, hasErrors, resolveConfig } from './index'
import { renderRegistry } from '../generator/render'
import { loadTypeToolchain } from './toolchain'
import { inferParameterSchemas } from './types'

vi.mock('./toolchain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./toolchain')>()
  return { ...actual, loadTypeToolchain: vi.fn(actual.loadTypeToolchain) }
})

const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler' } })
const tagged = (name: string) =>
  `/**\n * Rename one record of the signed-in user. Returns the record.\n * @agent\n */\nexport async function ${name}(input: { id: string }) { await requireUser(); return schema.parse(input) }\n`

let project: TemporaryProject | undefined

beforeEach(() => {
  vi.mocked(loadTypeToolchain).mockReturnValue(undefined)
})

afterEach(() => {
  vi.mocked(loadTypeToolchain).mockReset()
  project?.remove()
  project = undefined
})

describe('the @agent path without ts-json-schema-generator', () => {
  it('reports AT206 once and leaves the tools out of the registry', async () => {
    project = createProject({ 'tsconfig.json': TSCONFIG, 'app/actions.ts': `'use server'\n${tagged('renameA')}${tagged('renameB')}` })
    const config = resolveConfig({ jsdoc: true }, project.cwd)
    const analysis = await analyze(config)

    expect(analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.level, diagnostic.file])).toEqual([
      ['AT206', 'error', 'package.json'],
    ])
    expect(hasErrors(analysis.diagnostics)).toBe(true)
    expect(analysis.tools.map((tool) => [tool.name, tool.schemaSource, tool.diagnostics])).toEqual([
      ['renameA', 'none', ['AT206']],
      ['renameB', 'none', ['AT206']],
    ])
    expect(renderRegistry(analysis, config)).not.toContain('renameA')
  })

  it('does not report AT206 when the @agent path is disabled', async () => {
    project = createProject({ 'tsconfig.json': TSCONFIG, 'app/actions.ts': `'use server'\n${tagged('renameA')}` })
    const analysis = await analyze(resolveConfig({ jsdoc: false }, project.cwd))
    expect(analysis.diagnostics).toEqual([])
    expect(analysis.tools).toEqual([])
  })

  it('does not cache the missing toolchain as a result', () => {
    const code = `export async function get(input: { id: number }) { return input }\n`
    project = createProject({ 'tsconfig.json': TSCONFIG, 'app/actions.ts': code })
    const cacheFile = join(project.cwd, '.agent-tools/cache/types.json')
    const target = { file: join(project.cwd, 'app/actions.ts'), parameterOffset: code.indexOf('input:') }

    expect(inferParameterSchemas([target], { cwd: project.cwd, cacheFile })).toEqual([
      { ok: false, reason: 'ts-json-schema-generator is not installed', missingToolchain: true },
    ])
    expect(existsSync(cacheFile)).toBe(false)
  })

  it('serves a cached schema and reports only the targets that changed', async () => {
    const { loadTypeToolchain: loadInstalled } = await vi.importActual<typeof import('./toolchain')>('./toolchain')
    const code = `export async function get(input: { id: number }) { return input }\n`
    project = createProject({ 'tsconfig.json': TSCONFIG, 'app/get.ts': code, 'app/put.ts': code })
    const cacheFile = join(project.cwd, '.agent-tools/cache/types.json')
    const targets = ['app/get.ts', 'app/put.ts'].map((file) => ({
      file: join(project?.cwd ?? '', file),
      parameterOffset: code.indexOf('input:'),
    }))

    vi.mocked(loadTypeToolchain).mockImplementationOnce(loadInstalled)
    const [cached] = inferParameterSchemas(targets, { cwd: project.cwd, cacheFile })
    expect(cached).toMatchObject({ ok: true })

    project.write('app/put.ts', code.replace('id: number', 'id: string'))
    expect(inferParameterSchemas(targets, { cwd: project.cwd, cacheFile })).toEqual([
      cached,
      { ok: false, reason: 'ts-json-schema-generator is not installed', missingToolchain: true },
    ])
  })
})
