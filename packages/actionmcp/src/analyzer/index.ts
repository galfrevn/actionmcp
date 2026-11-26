import { compareText } from '../core/compare'
import { readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { glob } from 'tinyglobby'
import { NAVIGATE_TOOL_NAME, describeNameIssue, isReservedToolName, isValidToolName, type NameIssue } from '../core/names'
import { NAVIGATE_DESCRIPTION } from '../next/routes'
import { MAX_TOOLS_PER_ROUTE } from '../server/resolve'
import type { ResolvedConfig } from './config'
import { createDiagnostic, sortDiagnostics, type Diagnostic } from './diagnostics'
import { scanRegistryModule, type ToolReference } from './explicit'
import type { AnalysisResult, AnalyzedTool } from './model'
import { scanRoutes, type PageMetadataCache } from './routes'
import { mayContainTools, scanModule, type ModuleScan } from './scan'
import { parseModule } from './source'
import { inferParameterSchemas } from './types'

export interface AnalysisCache {
  modules: Map<string, { stamp: string; scan: ModuleScan | undefined }>
  pages: PageMetadataCache
}

const SOURCE_FILE = /\.(?:tsx?|jsx?|mts|mjs)$/
const TYPES_CACHE_FILE = 'cache/types.json'
const PACKAGE_MANIFEST = { file: 'package.json', line: 1, column: 1 }

export function createAnalysisCache(): AnalysisCache {
  return { modules: new Map(), pages: new Map() }
}

export async function analyze(config: ResolvedConfig, cache: AnalysisCache = createAnalysisCache()): Promise<AnalysisResult> {
  const files = await listSourceFiles(config)
  const registryFile = config.registry ? toRelative(config.cwd, config.registry) : undefined
  const scans = files.filter((file) => file !== registryFile).flatMap((file) => scanFile(config, cache, file) ?? [])
  const listed = new Set(files)
  for (const file of cache.modules.keys()) {
    if (!listed.has(file)) cache.modules.delete(file)
  }

  const tools = scans.flatMap((scan) => scan.tools)
  const diagnostics = scans.flatMap((scan) => scan.diagnostics)
  resolveTypes(config, scans, diagnostics)

  if (config.registry && registryFile) {
    const registry = scanRegistryModule(parseModule(registryFile, readFileSync(config.registry, 'utf8')))
    for (const reference of registry.references) adoptDiscoveredTool(tools, reference)
    tools.push(...registry.tools)
    diagnostics.push(...registry.diagnostics)
  }

  const routes = scanRoutes(config.cwd, cache.pages)
  if (scans.some((scan) => scan.usesNavigate)) tools.push(navigateTool())
  diagnostics.push(...checkNames(tools), ...checkToolCount(tools))

  return {
    tools: tools.toSorted((left, right) => compareText(left.name, right.name) || compareText(left.source.file, right.source.file)),
    routes,
    diagnostics: sortDiagnostics(diagnostics),
    registry: registryFile,
  }
}

async function listSourceFiles(config: ResolvedConfig): Promise<string[]> {
  const outDir = toRelative(config.cwd, config.outDir)
  const files = await glob(config.scan, {
    cwd: config.cwd,
    onlyFiles: true,
    ignore: ['**/node_modules/**', '**/.next/**', `${outDir}/**`, '**/*.d.ts'],
  })
  return files.filter((file) => SOURCE_FILE.test(file)).toSorted()
}

function scanFile(config: ResolvedConfig, cache: AnalysisCache, file: string): ModuleScan | undefined {
  const absolute = join(config.cwd, file)
  const { mtimeMs, size } = statSync(absolute)
  const stamp = `${mtimeMs}:${size}:${config.jsdoc}`
  let cached = cache.modules.get(file)
  if (cached?.stamp !== stamp) {
    const code = readFileSync(absolute, 'utf8')
    const scan = mayContainTools(code) ? scanModule(parseModule(file, code), config) : undefined
    cached = { stamp, scan }
    cache.modules.set(file, cached)
  }
  return cached.scan ? structuredClone(cached.scan) : undefined
}

function resolveTypes(config: ResolvedConfig, scans: readonly ModuleScan[], diagnostics: Diagnostic[]): void {
  const requests = scans.flatMap((scan) => scan.typeRequests)
  const inferences = inferParameterSchemas(
    requests.map((request) => ({ file: join(config.cwd, request.file), parameterOffset: request.parameterOffset })),
    { cwd: config.cwd, cacheFile: join(config.outDir, TYPES_CACHE_FILE) },
  )
  let missingToolchain = false
  requests.forEach(({ tool, file }, index) => {
    const inference = inferences[index]
    if (inference?.ok) {
      tool.inputSchema = inference.schema
      return
    }
    tool.schemaSource = 'none'
    const code = inference?.missingToolchain ? 'AT206' : 'AT101'
    if (!tool.diagnostics.includes(code)) tool.diagnostics.push(code)
    if (code === 'AT206') missingToolchain = true
    else diagnostics.push(createDiagnostic(code, { file, line: tool.source.line, column: 1 }, inference?.reason, tool.name))
  })
  if (missingToolchain) diagnostics.push(createDiagnostic('AT206', PACKAGE_MANIFEST))
}

function adoptDiscoveredTool(tools: AnalyzedTool[], { tool, exportName }: ToolReference): void {
  const matches = tools.filter((candidate) => candidate.kind === 'agent' && candidate.source.export === exportName)
  const [discovered] = matches
  if (!discovered || matches.length > 1) return
  tools.splice(tools.indexOf(discovered), 1)
  const { name, kind } = tool
  Object.assign(tool, discovered, { name, kind })
}

function navigateTool(): AnalyzedTool {
  return {
    name: NAVIGATE_TOOL_NAME,
    kind: 'navigate',
    source: { file: 'app', export: NAVIGATE_TOOL_NAME, line: 1 },
    description: NAVIGATE_DESCRIPTION,
    schemaSource: 'none',
    annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: false },
    confirm: 'never',
    validated: true,
    diagnostics: [],
  }
}

function checkNames(tools: readonly AnalyzedTool[]): Diagnostic[] {
  const firstByName = new Map<string, AnalyzedTool>()
  const diagnostics: Diagnostic[] = []
  for (const tool of tools) {
    if (tool.kind === 'navigate' || tool.name === '') continue
    const first = firstByName.get(tool.name)
    if (!first) firstByName.set(tool.name, tool)
    const issue = nameIssue(tool.name, first !== undefined)
    if (!issue) continue
    if (!tool.diagnostics.includes(issue.code)) tool.diagnostics.push(issue.code)
    const duplicateOf = first ? ` It is also defined at ${first.source.file}:${first.source.line}.` : ''
    const location = { file: tool.source.file, line: tool.source.line, column: 1 }
    diagnostics.push(createDiagnostic(issue.code, location, `${describeNameIssue(issue)}${duplicateOf}`, tool.name))
  }
  return diagnostics
}

function nameIssue(name: string, isDuplicate: boolean): NameIssue | undefined {
  if (!isValidToolName(name)) return { code: 'AT001', name, reason: 'invalid' }
  if (isReservedToolName(name)) return { code: 'AT002', name, reason: 'reserved' }
  return isDuplicate ? { code: 'AT002', name, reason: 'duplicate' } : undefined
}

function checkToolCount(tools: readonly AnalyzedTool[]): Diagnostic[] {
  const overflow = tools[MAX_TOOLS_PER_ROUTE]
  if (!overflow) return []
  const location = { file: overflow.source.file, line: overflow.source.line, column: 1 }
  return [createDiagnostic('AT104', location, `${tools.length} tools are defined`)]
}

function toRelative(cwd: string, file: string): string {
  return relative(cwd, file).split(sep).join('/')
}

export type { AgentToolsConfig, ResolvedConfig } from './config'
export { resolveConfig } from './config'
export type { Diagnostic, DiagnosticCode, DiagnosticLevel } from './diagnostics'
export { DIAGNOSTIC_RULES, formatDiagnostic, hasErrors } from './diagnostics'
export type { AnalysisResult, AnalyzedTool } from './model'
