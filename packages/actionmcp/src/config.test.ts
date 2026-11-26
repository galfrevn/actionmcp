import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NextConfig } from 'next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProject, type TemporaryProject } from './analyzer/__fixtures__/project'
import { resolveConfig } from './analyzer/config'
import { REGISTRY_ALIAS, applyRegistryAlias, withAgentTools } from './config'
import { readRecordedConfig } from './next/config-store'

const ACTIONS = `'use server'
import { agent } from 'actionmcp/server'
export const ping = agent({ description: 'Check that the session is still valid.', readOnly: true }, async () => { await requireUser() })
`
const BROKEN = `'use server'\nimport { agent } from 'actionmcp/server'\nexport const broken = agent({ description: text }, async () => { await requireUser() })\n`
const context = { defaultConfig: {} }

let project: TemporaryProject | undefined

afterEach(() => {
  project?.remove()
  project = undefined
  vi.restoreAllMocks()
})

function enter(files: Record<string, string>): string {
  project = createProject(files)
  vi.spyOn(process, 'cwd').mockReturnValue(project.cwd)
  return project.cwd
}

describe('applyRegistryAlias', () => {
  it('adds the alias for Turbopack and webpack and keeps existing settings', () => {
    const userWebpack = vi.fn((config: { resolve: { alias: Record<string, string> } }) => ({ ...config, marker: true }))
    const config = resolveConfig({}, '/project')
    const result = applyRegistryAlias(
      { reactStrictMode: true, turbopack: { resolveAlias: { other: './other.ts' }, resolveExtensions: ['.ts'] }, webpack: userWebpack },
      config,
    )
    expect(result.reactStrictMode).toBe(true)
    expect(result.turbopack).toEqual({
      resolveAlias: { other: './other.ts', [REGISTRY_ALIAS]: './.agent-tools/registry.ts' },
      resolveExtensions: ['.ts'],
    })
    const webpackConfig = result.webpack({ resolve: { alias: { existing: '/x' } } }) as unknown as {
      resolve: { alias: Record<string, string> }
      marker: boolean
    }
    expect(webpackConfig.resolve.alias).toEqual({ existing: '/x', [REGISTRY_ALIAS]: '/project/.agent-tools/registry.ts' })
    expect(webpackConfig.marker).toBe(true)
    expect(userWebpack).toHaveBeenCalledOnce()
  })

  it('creates the webpack resolve section when it is missing', () => {
    const result = applyRegistryAlias<NextConfig>({}, resolveConfig({ outDir: 'generated' }, '/project'))
    const webpackConfig = result.webpack?.({}, {} as never) as { resolve: { alias: Record<string, string> } }
    expect(webpackConfig.resolve.alias[REGISTRY_ALIAS]).toBe('/project/generated/registry.ts')
    expect(result.turbopack?.resolveAlias?.[REGISTRY_ALIAS]).toBe('./generated/registry.ts')
  })
})

describe('withAgentTools', () => {
  it('records its options for the CLI', () => {
    withAgentTools({ jsdoc: true, outDir: 'generated' })
    expect(readRecordedConfig()).toEqual({ jsdoc: true, outDir: 'generated' })
  })

  it('generates once during the build and returns the config with the alias', async () => {
    const cwd = enter({ 'app/actions.ts': ACTIONS })
    const configure = withAgentTools()<NextConfig>({ poweredByHeader: false })
    const first = await configure('phase-production-build', context)
    expect(first.poweredByHeader).toBe(false)
    expect(first.turbopack?.resolveAlias?.[REGISTRY_ALIAS]).toBe('./.agent-tools/registry.ts')
    const registry = join(cwd, '.agent-tools/registry.ts')
    expect(readFileSync(registry, 'utf8')).toContain('ping: m0.ping')

    project?.write('app/actions.ts', ACTIONS.replace('ping', 'pong'))
    await configure('phase-production-build', context)
    expect(readFileSync(registry, 'utf8')).toContain('ping: m0.ping')
  })

  it('accepts a config function', async () => {
    enter({ 'app/actions.ts': ACTIONS })
    const configure = withAgentTools()(async (phase) => ({ env: { PHASE: phase } }))
    await expect(configure('phase-production-build', context)).resolves.toMatchObject({ env: { PHASE: 'phase-production-build' } })
  })

  it('aborts the build on AT0xx errors with file:line', async () => {
    enter({ 'app/actions.ts': BROKEN })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const configure = withAgentTools()({})
    await expect(configure('phase-production-build', context)).rejects.toThrow(
      /actionmcp found 1 error\(s\)[\s\S]*AT005 app\/actions\.ts:3:44/,
    )
  })

  it('prints warnings and continues', async () => {
    enter({ 'app/actions.ts': ACTIONS.replace('readOnly: true', "confirm: 'never'") })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await withAgentTools()({})('phase-production-build', context)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('AT103'))
  })

  it('does not generate in other phases', async () => {
    const cwd = enter({ 'app/actions.ts': ACTIONS })
    const result = await withAgentTools()<NextConfig>({})('phase-production-server', context)
    expect(result.turbopack?.resolveAlias?.[REGISTRY_ALIAS]).toBe('./.agent-tools/registry.ts')
    expect(existsSync(join(cwd, '.agent-tools'))).toBe(false)
  })

  it('generates and then regenerates on changes in development', async () => {
    const cwd = enter({ 'app/actions.ts': ACTIONS })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await withAgentTools()({})('phase-development-server', context)
    const registry = join(cwd, '.agent-tools/registry.ts')
    expect(readFileSync(registry, 'utf8')).toContain('ping: m0.ping')
    await new Promise((resolve) => setTimeout(resolve, 200))
    project?.write('app/actions.ts', ACTIONS.replace('const ping', 'const pong'))
    await vi.waitFor(() => expect(readFileSync(registry, 'utf8')).toContain('pong: m0.pong'), { timeout: 5000, interval: 50 })
  })
})
