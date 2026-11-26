import { relative } from 'node:path'
import { analyze } from '../analyzer/index'
import type { ResolvedConfig } from '../analyzer/config'
import { hasErrors, sortDiagnostics } from '../analyzer/diagnostics'
import type { AnalyzedTool } from '../analyzer/model'
import { generate, type GenerateResult } from '../generator/index'
import { watchProject } from '../generator/watch'
import { checkEnvironment } from './environment'
import { plural, printDiagnostics, summarize, table, type Output } from './output'

export interface CommandContext {
  config: ResolvedConfig
  output: Output
}

export async function runGenerate({ config, output }: CommandContext, watch: boolean): Promise<number> {
  const print = (result: GenerateResult) => {
    const { analysis, written, durationMs } = result
    printDiagnostics(output, analysis.diagnostics)
    const target = relative(config.cwd, config.outDir) || '.'
    const changes = written.length > 0 ? `wrote ${written.join(', ')}` : 'no changes'
    output.write(
      `actionmcp: ${plural(analysis.tools.length, 'tool')}, ${plural(analysis.routes.length, 'route')} in ${target} (${changes}, ${Math.round(durationMs)} ms)`,
    )
  }
  const result = await generate(config)
  print(result)
  if (!watch) return hasErrors(result.analysis.diagnostics) ? 1 : 0
  watchProject(config, { onResult: print, onError: (error) => output.error(`actionmcp: ${String(error)}`) })
  output.write('actionmcp: watching for changes')
  return new Promise<number>(() => {})
}

export async function runInspect({ config, output }: CommandContext, toolName: string | undefined, json: boolean): Promise<number> {
  const analysis = await analyze(config)
  const tools = toolName === undefined ? analysis.tools : analysis.tools.filter((tool) => tool.name === toolName)
  if (toolName !== undefined && tools.length === 0) {
    output.error(`actionmcp: no tool named "${toolName}". Run \`actionmcp inspect\` to list the tools.`)
    return 1
  }
  if (json) {
    const diagnostics =
      toolName === undefined ? analysis.diagnostics : analysis.diagnostics.filter((diagnostic) => diagnostic.tool === toolName)
    output.write(JSON.stringify({ tools, routes: analysis.routes, diagnostics }, null, 2))
    return 0
  }
  if (toolName !== undefined) {
    for (const tool of tools) describeTool(output, tool)
    printDiagnostics(
      output,
      analysis.diagnostics.filter((diagnostic) => diagnostic.tool === toolName),
    )
    return 0
  }
  if (tools.length === 0) {
    output.write('actionmcp: no tools found. Wrap a Server Function in agent(), or list it in agent-tools.ts.')
    return 0
  }
  const header = ['NAME', 'KIND', 'ANNOTATIONS', 'CONFIRM', 'SCHEMA', 'SOURCE', 'DIAGNOSTICS']
  const rows = tools.map((tool) => [
    tool.name,
    tool.kind,
    describeAnnotations(tool),
    tool.confirm,
    tool.schemaSource,
    `${tool.source.file}:${tool.source.line}`,
    tool.diagnostics.toSorted().join(',') || '-',
  ])
  for (const line of table([header, ...rows])) output.write(line)
  output.write(`${plural(tools.length, 'tool')}, ${plural(analysis.routes.length, 'route')}, ${summarize(analysis.diagnostics)}`)
  return 0
}

export async function runDoctor({ config, output }: CommandContext, json: boolean): Promise<number> {
  const analysis = await analyze(config)
  const diagnostics = [...checkEnvironment(config.cwd), ...sortDiagnostics(analysis.diagnostics)]
  if (json) {
    output.write(JSON.stringify({ diagnostics }, null, 2))
  } else {
    printDiagnostics(output, diagnostics)
    output.write(`actionmcp doctor: ${plural(analysis.tools.length, 'tool')} checked, ${summarize(diagnostics)}`)
  }
  return hasErrors(diagnostics) ? 1 : 0
}

function describeAnnotations(tool: AnalyzedTool): string {
  const labels = [
    tool.annotations.readOnlyHint ? 'read-only' : undefined,
    tool.annotations.consequentialHint ? 'consequential' : undefined,
    tool.annotations.untrustedContentHint ? 'untrusted-output' : undefined,
  ].filter((label) => label !== undefined)
  return labels.join(',') || '-'
}

function describeTool(output: Output, tool: AnalyzedTool): void {
  const rows = [
    ['name', tool.name],
    ['kind', tool.kind],
    ['description', tool.description || '(resolved at runtime)'],
    ['source', `${tool.source.file}:${tool.source.line} (${tool.source.export})`],
    ['annotations', describeAnnotations(tool)],
    ['confirm', tool.confirm],
    ['adapter', tool.adapter ?? '-'],
    ['validated', tool.validated ? 'yes, before the handler runs' : 'no, the action validates its own input'],
    ['schema', tool.schemaSource],
  ]
  for (const line of table(rows)) output.write(line)
  if (tool.inputSchema) output.write(JSON.stringify(tool.inputSchema, null, 2))
  else if (tool.inputSource) output.write(`input: ${tool.inputSource}`)
}
