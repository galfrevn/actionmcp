import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, type TemporaryProject } from '../analyzer/__fixtures__/project'
import { readRecordedConfig } from '../next/config-store'
import { checkEnvironment, isAtLeast, readPackageVersion, type Environment } from './environment'
import { readVersion, run } from './index'
import type { Output } from './output'

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

export const clearTodos = agent({ description: 'Delete every todo of the signed-in user.', confirm: 'never' }, async () => {
  await requireUser()
})
`
const BROKEN = `'use server'\nimport { agent } from 'actionmcp/server'\nexport const broken = agent({ description: text }, async () => { await requireUser() })\n`

let project: TemporaryProject | undefined

afterEach(() => {
  project?.remove()
  project = undefined
})

function installed(name: string, version: string): Record<string, string> {
  return { [`node_modules/${name}/package.json`]: JSON.stringify({ name, version }) }
}

async function cli(files: Record<string, string>, ...argv: string[]) {
  project = createProject({ 'package.json': '{}', ...files })
  const lines: string[] = []
  const errors: string[] = []
  const output: Output = { write: (text) => lines.push(text), error: (text) => errors.push(text) }
  const code = await run([...argv, '--cwd', project.cwd], output)
  return { code, stdout: lines.join('\n'), stderr: errors.join('\n'), cwd: project.cwd }
}

describe('actionmcp', () => {
  it('prints the usage with --help and fails without a command', async () => {
    const help = await cli({}, '--help')
    expect(help.code).toBe(0)
    expect(help.stdout).toContain('Usage: actionmcp <command>')
    expect((await cli({})).code).toBe(1)
  })

  it('prints the package version', async () => {
    const result = await cli({}, '--version')
    expect(result.stdout).toBe(readVersion())
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('rejects unknown commands and unknown flags', async () => {
    const command = await cli({}, 'expose-all')
    expect(command.code).toBe(1)
    expect(command.stderr).toContain('unknown command "expose-all"')
    const flag = await cli({}, 'generate', '--expose-all')
    expect(flag.code).toBe(1)
    expect(flag.stderr).toContain('--expose-all')
  })
})

describe('actionmcp generate', () => {
  it('writes the registry and the manifest and exits 0 with warnings', async () => {
    const result = await cli({ 'app/actions.ts': ACTIONS }, 'generate')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('AT103')
    expect(result.stdout).toMatch(/actionmcp: 2 tools, 0 routes in \.agent-tools \(wrote registry\.ts, manifest\.json, \d+ ms\)/)
    expect(existsSync(join(result.cwd, '.agent-tools/registry.ts'))).toBe(true)
    expect(JSON.parse(readFileSync(join(result.cwd, '.agent-tools/manifest.json'), 'utf8'))).toMatchObject({ version: 1 })
  })

  it('exits 1 on AT0xx errors and prints file:line:column with the fix', async () => {
    const result = await cli({ 'app/actions.ts': BROKEN }, 'generate')
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('AT005')
    expect(result.stdout).toContain('app/actions.ts:3:44')
    expect(result.stdout).toContain('fix: Pass an object literal')
  })

  it('honors --out-dir, --scan, --registry, and --jsdoc', async () => {
    const files = {
      'features/actions.ts': `'use server'\n/**\n * Rename the current project and return the new name.\n * @agent\n */\nexport async function rename(input: { id: string }) { await requireUser(); return schema.parse(input) }\n`,
      'tools.ts': `import { defineAgentTools, tool } from 'actionmcp/server'\nimport { ping } from './features/ping'\nexport default defineAgentTools({ ping: tool(ping, { description: 'Check that the session is still valid.', readOnly: true }) })\n`,
    }
    const result = await cli(files, 'generate', '--out-dir', 'generated', '--scan', 'features/**', '--registry', 'tools.ts', '--jsdoc')
    expect(result.code).toBe(0)
    const registry = readFileSync(join(result.cwd, 'generated/registry.ts'), 'utf8')
    expect(registry).toContain('import explicit from "../tools"')
    expect(registry).toContain('rename: {')
  })

  it('reads the withAgentTools() options from next.config', async () => {
    const files = {
      'next.config.mjs': `globalThis[Symbol.for('actionmcp.config')] = { outDir: 'from-config', scan: ['features/**'] }\nexport default {}\n`,
      'features/actions.ts': ACTIONS,
    }
    const result = await cli(files, 'generate')
    expect(result.code).toBe(0)
    expect(existsSync(join(result.cwd, 'from-config/registry.ts'))).toBe(true)
    expect(readRecordedConfig()).toEqual({ outDir: 'from-config', scan: ['features/**'] })
  })

  it('falls back to the defaults when next.config cannot be loaded', async () => {
    const result = await cli({ 'next.config.mjs': 'throw new Error("boom")\n', 'app/actions.ts': ACTIONS }, 'generate')
    expect(result.code).toBe(0)
    expect(result.stderr).toContain('could not read withAgentTools() options')
    expect(existsSync(join(result.cwd, '.agent-tools/registry.ts'))).toBe(true)
  })
})

describe('actionmcp inspect', () => {
  it('prints a table of the tools', async () => {
    const result = await cli({ 'app/actions.ts': ACTIONS, 'app/page.tsx': 'export default function Page() { return null }\n' }, 'inspect')
    expect(result.code).toBe(0)
    const [header, first, second, summary] = result.stdout.split('\n')
    expect(header).toMatch(/^NAME\s+KIND\s+ANNOTATIONS\s+CONFIRM\s+SCHEMA\s+SOURCE\s+DIAGNOSTICS$/)
    expect(first).toMatch(/^addTodo\s+agent\s+consequential\s+consequential\s+standard-schema\s+app\/actions\.ts:5\s+-$/)
    expect(second).toMatch(/^clearTodos\s+agent\s+consequential\s+never\s+none\s+app\/actions\.ts:13\s+AT103$/)
    expect(summary).toBe('2 tools, 1 route, 0 errors, 1 warning')
    expect(existsSync(join(result.cwd, '.agent-tools'))).toBe(false)
  })

  it('prints stable JSON with --json', async () => {
    const result = await cli({ 'app/actions.ts': ACTIONS }, 'inspect', '--json')
    const parsed = JSON.parse(result.stdout) as { tools: Array<{ name: string }>; routes: unknown[]; diagnostics: Array<{ code: string }> }
    expect(Object.keys(parsed)).toEqual(['tools', 'routes', 'diagnostics'])
    expect(parsed.tools.map((tool) => tool.name)).toEqual(['addTodo', 'clearTodos'])
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['AT103'])
  })

  it('shows one tool with its schema source and diagnostics', async () => {
    const result = await cli({ 'app/actions.ts': ACTIONS }, 'inspect', 'clearTodos')
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/name\s+clearTodos/)
    expect(result.stdout).toMatch(/confirm\s+never/)
    expect(result.stdout).toContain('AT103')
    const withInput = await cli({ 'app/actions.ts': ACTIONS }, 'inspect', 'addTodo')
    expect(withInput.stdout).toContain('input: z.object({ text: z.string() })')
  })

  it('prints the inferred schema of a JSDoc tool', async () => {
    const files = {
      'app/actions.ts': `'use server'\n/**\n * Rename the current project and return the new name.\n * @agent\n */\nexport async function rename(input: { id: string }) { await requireUser(); return schema.parse(input) }\n`,
    }
    const result = await cli(files, 'inspect', 'rename', '--jsdoc')
    expect(result.stdout).toContain('"required": [\n    "id"\n  ]')
    const json = await cli(files, 'inspect', 'rename', '--jsdoc', '--json')
    expect(JSON.parse(json.stdout)).toMatchObject({ tools: [{ name: 'rename', inputSchema: { type: 'object' } }], diagnostics: [] })
  })

  it('fails for an unknown tool', async () => {
    const result = await cli({ 'app/actions.ts': ACTIONS }, 'inspect', 'missing')
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('no tool named "missing"')
  })

  it('explains how to opt in when there are no tools', async () => {
    const result = await cli({}, 'inspect')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('no tools found')
  })
})

describe('actionmcp doctor', () => {
  const healthy = { ...installed('next', '16.4.6'), ...installed('react', '19.3.1'), ...installed('zod', '4.6.7'), '.env.local': 'NEXT_PUBLIC_WEBMCP_OT_TOKEN=token\n' }

  it('passes on a healthy project', async () => {
    const result = await cli({ ...healthy, 'app/actions.ts': ACTIONS.replace(", confirm: 'never'", '') }, 'doctor')
    expect(result.stdout).toBe('actionmcp doctor: 2 tools checked, 0 errors, 0 warnings')
    expect(result.code).toBe(0)
  })

  it('lists warnings with their fix and still exits 0', async () => {
    const result = await cli({ ...healthy, 'app/actions.ts': ACTIONS }, 'doctor')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('AT103')
    expect(result.stdout).toContain("fix: Remove confirm: 'never'")
    expect(result.stdout).toContain('0 errors, 1 warning')
  })

  it('exits 1 on errors and prints JSON with --json', async () => {
    const result = await cli({ ...healthy, 'app/actions.ts': BROKEN }, 'doctor', '--json')
    expect(result.code).toBe(1)
    expect((JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> }).diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['AT005'])
  })
})

describe('checkEnvironment', () => {
  const codes = (files: Record<string, string>, env: Environment = {}) => {
    project = createProject({ 'package.json': '{}', ...files })
    return checkEnvironment(project.cwd, env).map((diagnostic) => diagnostic.code)
  }
  const base = { ...installed('next', '16.4.6'), ...installed('react', '19.3.1') }
  const token = { NEXT_PUBLIC_WEBMCP_OT_TOKEN: 'token' }

  it('reports AT201 for an unsupported or corrupt Next.js and accepts 16.x', () => {
    expect(codes({ ...installed('next', '15.5.4'), ...installed('react', '19.3.1') }, token)).toEqual(['AT201'])
    expect(codes({ 'node_modules/next/package.json': 'not json', ...installed('react', '19.3.1') }, token)).toEqual(['AT201'])
    expect(codes(base, token)).toEqual([])
  })

  it('reports AT202 for React below 19.2 and accepts canary builds of a newer version', () => {
    expect(codes({ ...installed('next', '16.4.6'), ...installed('react', '19.1.0') }, token)).toEqual(['AT202'])
    expect(codes({ ...installed('next', '16.4.6'), ...installed('react', '19.3.0-canary-1') }, token)).toEqual([])
  })

  it('reports AT203 for validators without Standard JSON Schema', () => {
    expect(codes({ ...base, ...installed('zod', '3.24.1') }, token)).toEqual(['AT203'])
    expect(codes({ ...base, ...installed('arktype', '2.1.20') }, token)).toEqual(['AT203'])
    expect(codes({ ...base, ...installed('valibot', '1.1.0') }, token)).toEqual(['AT203'])
    expect(codes({ ...base, ...installed('valibot', '1.5.0') }, token)).toEqual(['AT203'])
  })

  it('accepts supported validators', () => {
    const validators = { ...installed('zod', '4.2.0'), ...installed('arktype', '2.1.28'), ...installed('valibot', '1.2.0'), ...installed('@valibot/to-json-schema', '1.8.0') }
    expect(codes({ ...base, ...validators }, token)).toEqual([])
  })

  it('reports AT204 without an origin trial token and accepts one from the environment or an env file', () => {
    expect(codes(base)).toEqual(['AT204'])
    expect(codes(base, token)).toEqual([])
    expect(codes({ ...base, '.env': 'NEXT_PUBLIC_WEBMCP_OT_TOKEN=abc\n' })).toEqual([])
    expect(codes({ ...base, '.env': 'NEXT_PUBLIC_WEBMCP_OT_TOKEN=\n' })).toEqual(['AT204'])
  })
})

describe('version helpers', () => {
  it('compares versions numerically', () => {
    expect(isAtLeast('4.10.0', '4.2.0')).toBe(true)
    expect(isAtLeast('4.2.0', '4.2.0')).toBe(true)
    expect(isAtLeast('4.1.9', '4.2.0')).toBe(false)
    expect(isAtLeast('5', '4.2.0')).toBe(true)
  })

  it('returns undefined for a missing package', () => {
    project = createProject({ 'node_modules/broken/package.json': 'not json' })
    expect(readPackageVersion(project.cwd, 'broken')).toBeUndefined()
  })
})
