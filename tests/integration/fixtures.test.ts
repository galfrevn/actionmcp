import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixturePath, nextBuild, type Bundler } from './next'

interface FixtureExpectation {
  name: string
  tools: string[]
  routes: string[]
  prerendered?: { file: string; toolNames: string[] }
}

const FIXTURES: FixtureExpectation[] = [
  { name: 'basic', tools: ['addTodo', 'listTodos'], routes: ['/'] },
  { name: 'formdata', tools: ['notes.create', 'team.inviteMember'], routes: ['/'] },
  { name: 'safe-action', tools: ['loginUser'], routes: ['/'] },
  { name: 'jsdoc', tools: ['searchTasks', 'task.rename'], routes: ['/'] },
  {
    name: 'scoped',
    tools: ['alpha.read', 'alpha.write', 'beta.read', 'ping'],
    routes: ['/', '/a', '/a/details', '/b'],
    prerendered: { file: 'b.html', toolNames: ['ping', 'team.beta.read'] },
  },
  {
    name: 'navigate',
    tools: ['navigate'],
    routes: ['/', '/api/health', '/docs/[...path]', '/feed', '/feed/(.)photo', '/feed/photo', '/login', '/posts/[slug]', '/pricing', '/projects', '/projects/[id]', '/todos'],
    prerendered: { file: 'projects.html', toolNames: ['navigate', 'projects.navigate'] },
  },
  {
    name: 'redirect',
    tools: ['finishOnboarding', 'leaveStart'],
    routes: ['/', '/done', '/start'],
    prerendered: { file: 'start.html', toolNames: ['finishOnboarding', 'leaveStart'] },
  },
  { name: 'hostile', tools: ['deleteAccount', 'listComments', 'restoreAccount'], routes: ['/'] },
  { name: 'coexist', tools: ['getProfile', 'get_cart'], routes: ['/'], prerendered: { file: 'index.html', toolNames: ['getProfile', 'get_cart'] } },
]

const BUNDLERS: Bundler[] = ['webpack', 'turbopack']
const FRAMEWORK_ROUTES = new Set(['/_not-found', '/_global-error', '/favicon.ico'])

const SERVER_ONLY_MARKERS = ['~standard', 'actionmcp.registry', 'actionmcp.meta', 'oxc-parser', 'ts-json-schema-generator']

function clientScripts(directory: string): Array<{ file: string; code: string }> {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, code: readFileSync(join(directory, file), 'utf8') }))
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T
}

describe.each(FIXTURES)('fixture $name', (fixture) => {
  describe.each(BUNDLERS)('next build with %s', (bundler) => {
    it('builds, generates the registry, and resolves the alias', async () => {
      const build = await nextBuild(fixturePath(fixture.name), bundler)
      expect(build.code, build.output).toBe(0)
      expect(build.output).not.toMatch(/Module not found|Failed to compile/)

      const registry = readFileSync(fixturePath(fixture.name, '.agent-tools/registry.ts'), 'utf8')
      await expect(registry).toMatchFileSnapshot(`./__snapshots__/${fixture.name}.registry.snap`)

      const manifest = readJson<{ version: number; nextVersion: string; tools: Array<{ name: string }> }>(
        fixturePath(fixture.name, '.agent-tools/manifest.json'),
      )
      expect(manifest.version).toBe(1)
      expect(manifest.nextVersion).toMatch(/^16\./)
      expect(manifest.tools.map((tool) => tool.name)).toEqual(fixture.tools)
    })

    it('adds no routes of its own', () => {
      const routes = readJson<Record<string, string>>(fixturePath(fixture.name, '.next/app-path-routes-manifest.json'))
      const applicationRoutes = [...new Set(Object.values(routes))].filter((route) => !FRAMEWORK_ROUTES.has(route)).toSorted()
      expect(applicationRoutes).toEqual(fixture.routes)
    })

    it.runIf(fixture.prerendered)('emits the tool definitions in the prerendered RSC payload', () => {
      const { file, toolNames } = fixture.prerendered ?? { file: '', toolNames: [] }
      const html = readFileSync(fixturePath(fixture.name, '.next/server/app', file), 'utf8')
      for (const name of toolNames) {
        expect(html).toContain(`\\"name\\":\\"${name}\\"`)
      }
      expect(html).not.toContain('~standard')
    })

    it('keeps validators, the registry, and the analyzer out of the client bundles', () => {
      const scripts = clientScripts(fixturePath(fixture.name, '.next/static'))
      expect(scripts.length).toBeGreaterThan(0)
      for (const marker of SERVER_ONLY_MARKERS) {
        expect(scripts.filter((script) => script.code.includes(marker)).map((script) => script.file)).toEqual([])
      }
    })
  })
})
