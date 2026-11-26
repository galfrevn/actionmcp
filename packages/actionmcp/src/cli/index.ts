import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { runDoctor, runGenerate, runInspect } from './commands'
import { processOutput, type Output } from './output'
import { loadProjectConfig } from './project'

const USAGE = `Usage: actionmcp <command> [options]

Commands:
  generate [--watch]       Scan the project and write the registry and the manifest
  inspect [--json] [tool]  List the tools, or show one tool
  doctor [--json]          Check versions, names, validation, confirmation, and the origin trial token

Options:
  --cwd <dir>              Project directory (default: current directory)
  --registry <file>        Explicit registry file (default: ./agent-tools.ts if it exists)
  --scan <glob>            Glob to scan for agent() and @agent; repeatable
  --out-dir <dir>          Output folder (default: .agent-tools)
  --jsdoc                  Enable the experimental @agent JSDoc path
  -h, --help               Show this help
  -v, --version            Show the version

Options default to the withAgentTools() options in next.config.`

export function readVersion(): string {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
  return manifest.version
}

export async function run(argv: readonly string[], output: Output = processOutput): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        cwd: { type: 'string' },
        registry: { type: 'string' },
        scan: { type: 'string', multiple: true },
        'out-dir': { type: 'string' },
        jsdoc: { type: 'boolean' },
        watch: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    })
  } catch (error) {
    output.error(`actionmcp: ${error instanceof Error ? error.message : String(error)}`)
    output.error(USAGE)
    return 1
  }
  const { values, positionals } = parsed
  const [command, argument] = positionals
  if (values.version) {
    output.write(readVersion())
    return 0
  }
  if (values.help || command === undefined) {
    output.write(USAGE)
    return values.help ? 0 : 1
  }
  if (command !== 'generate' && command !== 'inspect' && command !== 'doctor') {
    output.error(`actionmcp: unknown command "${command}".`)
    output.error(USAGE)
    return 1
  }
  const cwd = resolve(values.cwd ?? process.cwd())
  const config = await loadProjectConfig(
    cwd,
    { registry: values.registry, scan: values.scan, outDir: values['out-dir'], jsdoc: values.jsdoc },
    output,
  )
  const context = { config, output }
  if (command === 'generate') return runGenerate(context, values.watch)
  if (command === 'inspect') return runInspect(context, argument, values.json)
  return runDoctor(context, values.json)
}
