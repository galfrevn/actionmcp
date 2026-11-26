import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { MAX_STEPS, runAgent, type Mode } from './lib/agent.ts'
import { APP_URL, readDatabase, resetDatabase, startApp } from './lib/app.ts'
import { browser } from './lib/browser.ts'
import { TASKS } from './lib/tasks.ts'

const environmentFile = fileURLToPath(new URL('./.env.local', import.meta.url))
if (existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile)
}

const { values } = parseArgs({
  options: {
    model: { type: 'string', default: process.env.BENCH_MODEL ?? 'anthropic/claude-sonnet-5.5' },
    runs: { type: 'string', default: '20' },
    tasks: { type: 'string', default: TASKS.map((task) => task.id).join(',') },
    modes: { type: 'string', default: 'clicks,webmcp' },
    out: { type: 'string' },
  },
})

if (!process.env.AI_GATEWAY_API_KEY) {
  console.error('Set AI_GATEWAY_API_KEY in the environment or in bench/.env.local to run the benchmark. See bench/README.md.')
  process.exit(1)
}

const runs = Number(values.runs)
const modes = values.modes.split(',') as Mode[]
const tasks = TASKS.filter((task) => values.tasks.split(',').includes(task.id))
const date = new Date().toISOString().slice(0, 10)
const outDirectory = values.out ?? fileURLToPath(new URL(`./results/${date}`, import.meta.url))
const outFile = join(outDirectory, 'runs.jsonl')
mkdirSync(outDirectory, { recursive: true })

const version = (args: string[]) => execFileSync('pnpm', args, { encoding: 'utf8' }).trim()
const environment = {
  model: values.model,
  maxSteps: MAX_STEPS,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version,
  agentBrowser: version(['exec', 'agent-browser', '--version']),
  next: version(['--filter', 'bench-app', 'exec', 'next', '--version']),
}
appendFileSync(outFile, `${JSON.stringify({ type: 'environment', ...environment })}\n`)

const server = await startApp()
try {
  for (const task of tasks) {
    for (const mode of modes) {
      for (let run = 1; run <= runs; run += 1) {
        const seed = resetDatabase()
        const options = { session: `bench-${task.id}-${mode}-${run}`, webmcp: mode === 'webmcp' }
        await browser(options, ['open', APP_URL])
        const result = await runAgent(values.model, mode, task.prompt, options)
        await browser(options, ['close'])
        const success = !result.error && task.verify(readDatabase(), result.answer, seed)
        appendFileSync(outFile, `${JSON.stringify({ type: 'run', task: task.id, mode, run, success, prompt: task.prompt, ...result })}\n`)
        console.log(`${task.id} ${mode} ${run}/${runs} ${success ? 'ok' : 'failed'} ${result.durationMs} ms ${result.inputTokens + result.outputTokens} tokens`)
      }
    }
  }
} finally {
  server.kill()
}
console.log(`Wrote ${outFile}. Run "pnpm --filter actionmcp-bench summarize ${outDirectory}" to build the summary.`)
