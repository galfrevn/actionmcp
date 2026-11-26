import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export type Bundler = 'turbopack' | 'webpack'

export interface BuildResult {
  code: number
  output: string
}

export const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

export function fixturePath(name: string, ...segments: string[]): string {
  return [repositoryRoot.replace(/\/$/, ''), 'fixtures', name, ...segments].join('/')
}

export function nextBuild(cwd: string, bundler: Bundler): Promise<BuildResult> {
  const args = ['exec', 'next', 'build', ...(bundler === 'webpack' ? ['--webpack'] : [])]
  return new Promise((resolve) => {
    execFile('pnpm', args, { cwd, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
      resolve({ code, output: `${stdout}\n${stderr}` })
    })
  })
}
