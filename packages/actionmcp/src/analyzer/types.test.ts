import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, type TemporaryProject } from './__fixtures__/project'
import { inferParameterSchemas, normalizeTypeSchema, type TypeInference } from './types'

const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler' } })

let project: TemporaryProject | undefined

afterEach(() => {
  project?.remove()
  project = undefined
})

async function infer(code: string, parameter: string, files: Record<string, string> = {}): Promise<TypeInference> {
  project = createProject({ 'tsconfig.json': TSCONFIG, 'app/actions.ts': code, ...files })
  const file = join(project.cwd, 'app/actions.ts')
  const [inference] = inferParameterSchemas([{ file, parameterOffset: code.indexOf(parameter) }], { cwd: project.cwd })
  if (!inference) throw new Error('No inference')
  return inference
}

describe('inferParameterSchemas', () => {
  it('returns nothing for no targets', async () => {
    expect(inferParameterSchemas([], { cwd: process.cwd() })).toEqual([])
  })

  it('infers required and optional fields from an inline type', async () => {
    const code = `export async function rename(input: { projectId: string; name: string; archived?: boolean }) { return input }\n`
    await expect(infer(code, 'input:')).resolves.toEqual({
      ok: true,
      schema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, name: { type: 'string' }, archived: { type: 'boolean' } },
        required: ['projectId', 'name'],
      },
    })
  })

  it('infers enums, discriminated unions, arrays, and per-property JSDoc', async () => {
    const code = `export type Role = 'admin' | 'member'
export interface Filters {
  /** Free-text search. */
  query?: string
  role: Role
  shape: { kind: 'circle'; radius: number } | { kind: 'square'; side: number }
  tags: string[]
}
export const search = async (filters: Filters) => filters
`
    const inference = await infer(code, 'filters:')
    expect(inference).toEqual({
      ok: true,
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text search.' },
          role: { type: 'string', enum: ['admin', 'member'] },
          shape: {
            anyOf: [
              {
                type: 'object',
                properties: { kind: { type: 'string', const: 'circle' }, radius: { type: 'number' } },
                required: ['kind', 'radius'],
              },
              {
                type: 'object',
                properties: { kind: { type: 'string', const: 'square' }, side: { type: 'number' } },
                required: ['kind', 'side'],
              },
            ],
          },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['role', 'shape', 'tags'],
      },
    })
  })

  it('follows types imported from another module', async () => {
    const code = `import type { Invite } from '../lib/types'\nexport async function invite(input: Invite) { return input }\n`
    const inference = await infer(code, 'input:', {
      'lib/types.ts': `export interface Invite { email: string; role: 'owner' | 'member' }\n`,
    })
    expect(inference).toMatchObject({
      ok: true,
      schema: { properties: { email: { type: 'string' }, role: { enum: ['owner', 'member'] } } },
    })
  })

  it('keeps $defs for a recursive type', async () => {
    const code = `export interface Folder { name: string; children: Folder[] }\nexport async function save(folder: Folder) { return folder }\n`
    const inference = await infer(code, 'folder:')
    expect(inference.ok).toBe(true)
    expect(JSON.stringify(inference)).toContain('#/$defs/')
    expect(JSON.stringify(inference)).not.toContain('#/definitions/')
  })

  it('rejects a parameter that is not an object', async () => {
    await expect(infer(`export async function get(id: string) { return id }\n`, 'id:')).resolves.toEqual({
      ok: false,
      reason: 'the first parameter is not an object type',
    })
  })

  it('reports a parameter that cannot be found', async () => {
    const code = `export async function get(input: { id: string }) { return input }\n`
    project = createProject({ 'tsconfig.json': TSCONFIG, 'app/actions.ts': code })
    const file = join(project.cwd, 'app/actions.ts')
    expect(inferParameterSchemas([{ file, parameterOffset: 3 }], { cwd: project.cwd })).toEqual([
      { ok: false, reason: 'the first parameter has no type annotation' },
    ])
  })

  it('works without a tsconfig.json', async () => {
    const code = `export async function get(input: { id: number }) { return input }\n`
    project = createProject({ 'app/actions.ts': code })
    const file = join(project.cwd, 'app/actions.ts')
    const [inference] = inferParameterSchemas([{ file, parameterOffset: code.indexOf('input:') }], { cwd: project.cwd })
    expect(inference).toMatchObject({ ok: true, schema: { properties: { id: { type: 'number' } } } })
  })

  it('caches by content hash and refreshes when the file changes', async () => {
    const code = `export async function get(input: { id: number }) { return input }\n`
    project = createProject({ 'tsconfig.json': TSCONFIG, 'app/actions.ts': code })
    const file = join(project.cwd, 'app/actions.ts')
    const cacheFile = join(project.cwd, '.agent-tools/cache/types.json')
    const target = { file, parameterOffset: code.indexOf('input:') }

    const [first] = inferParameterSchemas([target], { cwd: project.cwd, cacheFile })
    expect(existsSync(cacheFile)).toBe(true)
    const stored = readFileSync(cacheFile, 'utf8')

    const started = performance.now()
    const [second] = inferParameterSchemas([target], { cwd: project.cwd, cacheFile })
    expect(performance.now() - started).toBeLessThan(50)
    expect(second).toEqual(first)
    expect(readFileSync(cacheFile, 'utf8')).toBe(stored)

    project.write('app/actions.ts', code.replace('id: number', 'id: string'))
    const [third] = inferParameterSchemas([target], { cwd: project.cwd, cacheFile })
    expect(third).toMatchObject({ ok: true, schema: { properties: { id: { type: 'string' } } } })
  })

  it('ignores a corrupt cache file', async () => {
    const code = `export async function get(input: { id: number }) { return input }\n`
    project = createProject({ 'tsconfig.json': TSCONFIG, 'app/actions.ts': code, '.agent-tools/cache/types.json': 'not json' })
    const file = join(project.cwd, 'app/actions.ts')
    const cacheFile = join(project.cwd, '.agent-tools/cache/types.json')
    const [inference] = inferParameterSchemas([{ file, parameterOffset: code.indexOf('input:') }], { cwd: project.cwd, cacheFile })
    expect(inference?.ok).toBe(true)
  })
})

describe('normalizeTypeSchema', () => {
  it('drops the dialect and empty definitions', () => {
    const schema = { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: {}, definitions: {} }
    expect(normalizeTypeSchema(schema)).toEqual({ ok: true, schema: { type: 'object', properties: {} } })
  })

  it('accepts a union of object types and marks it as an object', () => {
    const schema = {
      anyOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'number' } } },
      ],
    }
    expect(normalizeTypeSchema(schema)).toEqual({ ok: true, schema: { type: 'object', ...schema } })
  })

  it('inlines acyclic definitions', () => {
    const schema = { type: 'object', properties: { role: { $ref: '#/definitions/Role' } }, definitions: { Role: { enum: ['a', 'b'] } } }
    expect(normalizeTypeSchema(schema)).toEqual({ ok: true, schema: { type: 'object', properties: { role: { enum: ['a', 'b'] } } } })
  })
})
