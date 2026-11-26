import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const packageDirectory = join(repositoryRoot, 'packages/actionmcp')
const fixture = join(repositoryRoot, 'fixtures/basic')
const PORT = 4391

let workspace: string
let project: string
let server: ChildProcess | undefined

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } })
}

async function waitForServer(url: string, logs: string[]): Promise<string> {
  let lastFailure = 'no response'
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.text()
      lastFailure = `status ${response.status}: ${(await response.text()).slice(0, 400)}`
    } catch (error) {
      lastFailure = error instanceof Error ? `${error.message}: ${String(error.cause)}` : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`The server at ${url} did not answer with 200 (${lastFailure}).\n${logs.join('')}`)
}

beforeAll(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), 'actionmcp-package-')))
  project = join(workspace, 'app')
  run('pnpm', ['pack', '--pack-destination', workspace], packageDirectory)
  const tarball = readdirSync(workspace).find((file) => file.endsWith('.tgz'))
  if (!tarball) throw new Error('pnpm pack did not produce a tarball.')

  for (const entry of ['app', 'lib', 'next.config.ts', 'tsconfig.json']) {
    cpSync(join(fixture, entry), join(project, entry), { recursive: true })
  }
  const manifest = JSON.parse(readFileSync(join(fixture, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  manifest.dependencies.actionmcp = `file:${join(workspace, tarball)}`
  writeFileSync(join(project, 'package.json'), JSON.stringify({ ...manifest, name: 'actionmcp-package-test' }, null, 2))
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], project)
})

afterAll(() => {
  server?.kill()
  rmSync(workspace, { recursive: true, force: true })
})

describe('the packed tarball in a project outside the workspace', () => {
  it('ships only the build output and the package files', () => {
    const entries = readdirSync(join(project, 'node_modules/actionmcp')).toSorted()
    expect(entries).toEqual(['LICENSE', 'README.md', 'dist', 'node_modules', 'package.json'].filter((entry) => entries.includes(entry)))
    expect(entries).toEqual(expect.arrayContaining(['LICENSE', 'README.md', 'dist', 'package.json']))
  })

  it('runs the CLI from node_modules/.bin', () => {
    const tools = JSON.parse(run('npx', ['actionmcp', 'inspect', '--json'], project)) as { tools: Array<{ name: string }> }
    expect(tools.tools.map((tool) => tool.name)).toEqual(['addTodo', 'listTodos'])
    expect(run('npx', ['actionmcp', '--version'], project).trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('builds with the registry alias resolved from inside node_modules', () => {
    const output = run('npx', ['next', 'build'], project)
    expect(output).toContain('Compiled successfully')
    expect(readFileSync(join(project, '.agent-tools/registry.ts'), 'utf8')).toContain('addTodo: m0.addTodo')
  })

  it('serves the tool definitions from the generated registry', async () => {
    const logs: string[] = []
    server = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(PORT)], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout?.on('data', (chunk: Buffer) => logs.push(chunk.toString()))
    server.stderr?.on('data', (chunk: Buffer) => logs.push(chunk.toString()))
    const html = await waitForServer(`http://127.0.0.1:${PORT}/`, logs)
    expect(html).toContain('\\"name\\":\\"addTodo\\"')
    expect(html).toContain('\\"name\\":\\"listTodos\\"')
    expect(html).toContain('<meta http-equiv="origin-trial" content="fixture-origin-trial-token"')
  })
})
