import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { median, quantile } from './lib/stats.ts'

interface RunRecord {
  type: 'run'
  task: string
  mode: string
  run: number
  success: boolean
  steps: number
  toolCalls: number
  inputTokens: number
  outputTokens: number
  durationMs: number
  error?: string
}

interface EnvironmentRecord {
  type: 'environment'
  [key: string]: unknown
}

interface Group {
  task: string
  mode: string
  runs: RunRecord[]
}

const [directory] = process.argv.slice(2)
if (!directory) {
  console.error('Usage: node summarize.ts <results-directory>')
  process.exit(1)
}

const records = readFileSync(join(directory, 'runs.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as RunRecord | EnvironmentRecord)
const environment = records.find((record): record is EnvironmentRecord => record.type === 'environment')
const runs = records.filter((record): record is RunRecord => record.type === 'run')

const groups: Group[] = []
for (const run of runs) {
  let group = groups.find((candidate) => candidate.task === run.task && candidate.mode === run.mode)
  if (!group) {
    group = { task: run.task, mode: run.mode, runs: [] }
    groups.push(group)
  }
  group.runs.push(run)
}

const tokens = (run: RunRecord) => run.inputTokens + run.outputTokens
const round = (value: number) => Math.round(value).toLocaleString('en-US')

const rows = groups.map((group) => {
  const successes = group.runs.filter((run) => run.success).length
  const totals = group.runs.map(tokens)
  const durations = group.runs.map((run) => run.durationMs)
  return [
    group.task,
    group.mode,
    `${successes}/${group.runs.length}`,
    round(median(totals)),
    round(quantile(totals, 0.9)),
    round(median(durations)),
    round(quantile(durations, 0.9)),
    round(median(group.runs.map((run) => run.toolCalls))),
    String(group.runs.filter((run) => run.error).length),
  ]
})

const header = [
  'Task',
  'Mode',
  'Success',
  'Tokens (median)',
  'Tokens (p90)',
  'Time ms (median)',
  'Time ms (p90)',
  'Tool calls (median)',
  'Errors',
]
const table = [header, header.map(() => '---'), ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n')

const summary = `# Benchmark summary

Every run is in \`runs.jsonl\`, including the failed ones. Success is verified against the database, not against the agent's answer.

## Environment

\`\`\`json
${JSON.stringify(environment ?? {}, null, 2)}
\`\`\`

## Results

${table}

![Median tokens per task, with p10 to p90 whiskers](chart.svg)

## Limits

- This is one app and ${new Set(runs.map((run) => run.task)).size} tasks. The numbers do not generalize to other apps.
- agent-browser announces the page tools to the agent, which favors the WebMCP mode.
- In the WebMCP mode the confirmation dialog is accepted by a test hook, so human latency is not measured.
`

writeFileSync(join(directory, 'summary.md'), summary)
writeFileSync(join(directory, 'chart.svg'), renderChart(groups))
console.log(`Wrote summary.md and chart.svg to ${directory}`)

function renderChart(data: readonly Group[]): string {
  const tasks = [...new Set(data.map((group) => group.task))]
  const modes = [...new Set(data.map((group) => group.mode))]
  const colors = ['#8a8f98', '#2f6feb']
  const width = 720
  const height = 360
  const margin = { top: 24, right: 16, bottom: 56, left: 72 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const maximum = Math.max(1, ...data.map((group) => quantile(group.runs.map(tokens), 0.9)))
  const y = (value: number) => margin.top + plotHeight - (value / maximum) * plotHeight
  const slot = plotWidth / Math.max(1, tasks.length)
  const barWidth = (slot * 0.7) / Math.max(1, modes.length)

  const bars = data.map((group) => {
    const totals = group.runs.map(tokens)
    const x = margin.left + tasks.indexOf(group.task) * slot + slot * 0.15 + modes.indexOf(group.mode) * barWidth
    const center = x + barWidth / 2
    const middle = median(totals)
    return [
      `<rect x="${x.toFixed(1)}" y="${y(middle).toFixed(1)}" width="${(barWidth - 4).toFixed(1)}" height="${(margin.top + plotHeight - y(middle)).toFixed(1)}" fill="${colors[modes.indexOf(group.mode) % colors.length]}"><title>${group.task} ${group.mode}: ${round(middle)} tokens</title></rect>`,
      `<line x1="${center.toFixed(1)}" x2="${center.toFixed(1)}" y1="${y(quantile(totals, 0.1)).toFixed(1)}" y2="${y(quantile(totals, 0.9)).toFixed(1)}" stroke="#111" stroke-width="1.5"/>`,
    ].join('')
  })
  const labels = tasks.map(
    (task, index) =>
      `<text x="${(margin.left + index * slot + slot / 2).toFixed(1)}" y="${height - 32}" text-anchor="middle">${task}</text>`,
  )
  const legend = modes.map(
    (mode, index) =>
      `<rect x="${margin.left + index * 110}" y="${height - 18}" width="10" height="10" fill="${colors[index % colors.length]}"/><text x="${margin.left + index * 110 + 16}" y="${height - 9}">${mode}</text>`,
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif" font-size="11">
<title>Median tokens per task, with p10 to p90 whiskers</title>
<rect width="${width}" height="${height}" fill="#fff"/>
<line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" stroke="#111"/>
<line x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" stroke="#111"/>
<text x="${margin.left - 8}" y="${margin.top + 4}" text-anchor="end">${round(maximum)}</text>
<text x="${margin.left - 8}" y="${margin.top + plotHeight}" text-anchor="end">0</text>
<text x="16" y="${margin.top + plotHeight / 2}" transform="rotate(-90 16 ${margin.top + plotHeight / 2})" text-anchor="middle">Tokens per run</text>
${bars.join('\n')}
${labels.join('\n')}
${legend.join('\n')}
</svg>
`
}
