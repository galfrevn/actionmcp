import { execFile } from 'node:child_process'

export interface BrowserOptions {
  session: string
  webmcp: boolean
}

export interface CommandResult {
  ok: boolean
  output: string
}

const COMMAND_TIMEOUT_MS = 60_000
const MAX_OUTPUT_CHARACTERS = 8000

export function browser(options: BrowserOptions, args: readonly string[]): Promise<CommandResult> {
  const flags = ['--session', options.session, ...(options.webmcp ? [] : ['--no-webmcp'])]
  return new Promise((resolve) => {
    execFile(
      'pnpm',
      ['exec', 'agent-browser', ...flags, ...args],
      { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = `${stdout}${error ? `\n${stderr || error.message}` : ''}`.trim()
        resolve({ ok: !error, output: output.slice(0, MAX_OUTPUT_CHARACTERS) })
      },
    )
  })
}

export async function browserJson<T>(options: BrowserOptions, args: readonly string[]): Promise<T> {
  const result = await browser(options, [...args, '--json'])
  const start = result.output.indexOf('{"success"')
  if (start === -1) {
    throw new Error(`agent-browser ${args.join(' ')} returned no JSON: ${result.output.slice(0, 400)}`)
  }
  const parsed = JSON.parse(result.output.slice(start).split('\n')[0] ?? '') as { success: boolean; data: T; error: unknown }
  if (!parsed.success) {
    throw new Error(`agent-browser ${args.join(' ')} failed: ${JSON.stringify(parsed.error)}`)
  }
  return parsed.data
}
