import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, type TemporaryProject } from './__fixtures__/project'
import { loadTypeToolchain, toolchainOrigins } from './toolchain'

let project: TemporaryProject | undefined

afterEach(() => {
  project?.remove()
  project = undefined
})

describe('loadTypeToolchain', () => {
  it('loads the generator and the TypeScript that the generator resolves', () => {
    const toolchain = loadTypeToolchain([import.meta.url])
    expect(typeof toolchain?.generator.SchemaGenerator).toBe('function')
    expect(typeof toolchain?.typescript.createProgram).toBe('function')
  })

  it('returns nothing when no origin can resolve the generator', () => {
    project = createProject({ 'package.json': '{}' })
    expect(loadTypeToolchain([join(project.cwd, 'package.json'), import.meta.url], 'actionmcp-absent-generator')).toBeUndefined()
    expect(loadTypeToolchain([])).toBeUndefined()
  })

  it('falls back to the next origin', () => {
    project = createProject({
      'package.json': '{}',
      'node_modules/local-generator/package.json': JSON.stringify({ name: 'local-generator', main: 'index.js' }),
      'node_modules/local-generator/index.js': 'module.exports = { SchemaGenerator: function SchemaGenerator() {} }\n',
      'node_modules/typescript/package.json': JSON.stringify({ name: 'typescript', main: 'index.js' }),
      'node_modules/typescript/index.js': 'module.exports = { createProgram: function createProgram() {}, local: true }\n',
    })
    const toolchain = loadTypeToolchain([import.meta.url, join(project.cwd, 'package.json')], 'local-generator')
    expect(typeof toolchain?.generator.SchemaGenerator).toBe('function')
    expect(toolchain?.typescript).toMatchObject({ local: true })
  })

  it('looks in the project first and then next to the package', () => {
    const [first, second] = toolchainOrigins('/work/app')
    expect(first).toBe(join('/work/app', 'package.json'))
    expect(second).toMatch(/^file:/)
  })
})
