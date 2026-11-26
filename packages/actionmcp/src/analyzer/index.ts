import { compareText } from '../core/compare'
import { readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { glob } from 'tinyglobby'
import { createSelector } from '../core/match'
import { NAVIGATE_TOOL_NAME, describeNameIssue, isReservedToolName, isValidToolName, type NameIssue } from '../core/names'
import { NAVIGATE_DESCRIPTION } from '../next/routes'
import { MAX_TOOLS_PER_ROUTE } from '../server/resolve'
import type { ResolvedConfig } from './config'
import { createDiagnostic, sortDiagnostics, type Diagnostic } from './diagnostics'
import { scanRegistryModule, type ToolReference } from './explicit'
import type { AnalysisResult, AnalyzedTool } from './model'
import { scanRoutes, type PageMetadataCache } from './routes'
import {
  mayContainTools,
  mayReexportAgent,
  readAgentReexports,
  scanModule,
  type AgentToolsElement,
  type ModuleScan,
  type ScanOptions,
} from './scan'
import { parseModule, type ParsedModule } from './source'
import { inferParameterSchemas } from './types'
import { createImportResolver, isFile, type ImportResolver } from './imports'

export interface AnalysisCache {
  modules: Map<string, { stamp: string; scan: ModuleScan | undefined }>
  pages: PageMetadataCache
  outside?: string[]
  reexports?: Map<string, { stamp: string; names: string[] }>
}

interface ScanContext {
  options: ScanOptions
  key: string
}

const SOURCE_FILE = /\.(?:tsx?|jsx?|mts|mjs)$/
const TYPES_CACHE_FILE = 'cache/types.json'
const PACKAGE_MANIFEST = { file: 'package.json', line: 1, column: 1 }
const PROJECT_SOURCES = '**/*.{ts,tsx,js,jsx,mts,mjs}'
const IGNORED_SOURCES = ['**/node_modules/**', '**/.next/**', '**/*.d.ts']
const IGNORED_OUTSIDE_SCAN = ['**/dist/**', '**/build/**', '**/coverage/**', '**/*.{test,spec}.*']

export function createAnalysisCache(): AnalysisCache {
  return { modules: new Map(), pages: new Map() }
}

export async function analyze(config: ResolvedConfig, cache: AnalysisCache = createAnalysisCache()): Promise<AnalysisResult> {
  const files = await listSourceFiles(config)
  const registryFile = config.registry ? toRelative(config.cwd, config.registry) : undefined
  const scanned = new Set(files)
  const resolveImport = createImportResolver(config.cwd)
  const context = scanContext(config, agentEntries(config, cache, files), resolveImport)
  const scans = files.filter((file) => file !== registryFile).flatMap((file) => scanFile(config, cache, file, context) ?? [])

  const tools = scans.flatMap((scan) => scan.tools)
  const diagnostics = scans.flatMap((scan) => scan.diagnostics)
  resolveTypes(config, scans, diagnostics)

  const adopted = new Set<string>()
  if (config.registry && registryFile) {
    const module = parseModule(registryFile, readFileSync(config.registry, 'utf8'))
    const registry = scanRegistryModule(module)
    for (const reference of registry.references) {
      diagnostics.push(...adoptReference(config, module, tools, reference, adopted, resolveImport, context.options))
    }
    tools.push(...registry.tools)
    diagnostics.push(...registry.diagnostics)
  }
  diagnostics.push(...(await findToolsOutsideScan(config, cache, scanned, registryFile, adopted, context)))
  const cached = new Set([...files, ...(cache.outside ?? [])])
  for (const file of cache.modules.keys()) {
    if (!cached.has(file)) cache.modules.delete(file)
  }

  const routes = scanRoutes(config.cwd, cache.pages)
  if (scans.some((scan) => scan.usesNavigate)) tools.push(navigateTool())
  diagnostics.push(
    ...checkNames(tools),
    ...checkToolCount(
      tools,
      scans.flatMap((scan) => scan.agentToolsElements),
    ),
  )

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
    ignore: [...IGNORED_SOURCES, `${outDir}/**`],
  })
  return files.filter((file) => SOURCE_FILE.test(file)).toSorted()
}

function agentEntries(config: ResolvedConfig, cache: AnalysisCache, files: readonly string[]): Map<string, ReadonlySet<string>> {
  const reexports = (cache.reexports ??= new Map())
  const entries = new Map<string, ReadonlySet<string>>()
  for (const file of files) {
    const absolute = join(config.cwd, file)
    const { mtimeMs, size } = statSync(absolute)
    const stamp = `${mtimeMs}:${size}`
    let cached = reexports.get(file)
    if (cached?.stamp !== stamp) {
      const code = readFileSync(absolute, 'utf8')
      cached = { stamp, names: mayReexportAgent(code) ? readAgentReexports(parseModule(file, code)) : [] }
      reexports.set(file, cached)
    }
    if (cached.names.length > 0) entries.set(file, new Set(cached.names))
  }
  const listed = new Set(files)
  for (const file of reexports.keys()) {
    if (!listed.has(file)) reexports.delete(file)
  }
  return entries
}

function scanContext(
  config: ResolvedConfig,
  entries: ReadonlyMap<string, ReadonlySet<string>>,
  resolveImport: ImportResolver,
): ScanContext {
  const options: ScanOptions = { jsdoc: config.jsdoc, auth: config.auth }
  if (entries.size === 0) return { options, key: '' }
  const key = [...entries].map(([file, names]) => `${file}=${[...names].join(',')}`).join(';')
  const resolveAgentNames = (source: string, fromFile: string) => {
    const target = resolveImport(fromFile, source)
    return target === undefined ? undefined : entries.get(target)
  }
  return { options: { ...options, resolveAgentNames }, key }
}

function scanFile(config: ResolvedConfig, cache: AnalysisCache, file: string, context: ScanContext): ModuleScan | undefined {
  const absolute = join(config.cwd, file)
  const { mtimeMs, size } = statSync(absolute)
  const stamp = `${mtimeMs}:${size}:${config.jsdoc}:${context.key}`
  let cached = cache.modules.get(file)
  if (cached?.stamp !== stamp) {
    const code = readFileSync(absolute, 'utf8')
    const parse = mayContainTools(code) || (context.key !== '' && code.includes('use server'))
    const scan = parse ? scanModule(parseModule(file, code), context.options) : undefined
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

function adoptReference(
  config: ResolvedConfig,
  registry: ParsedModule,
  tools: AnalyzedTool[],
  reference: ToolReference,
  adopted: Set<string>,
  resolveImport: ImportResolver,
  options: ScanOptions,
): Diagnostic[] {
  const { tool, exportName, importSource } = reference
  const target = importSource === undefined ? undefined : resolveImport(registry.file, importSource)
  const matches = tools.filter(
    (candidate) =>
      candidate.kind === 'agent' && candidate.source.export === exportName && (target === undefined || candidate.source.file === target),
  )
  if (matches.length > 1) return []
  const [discovered] = matches
  if (discovered) {
    tools.splice(tools.indexOf(discovered), 1)
    adoptTool(tool, discovered, adopted)
    return []
  }
  if (target === undefined) return []
  const scan = scanModule(parseModule(target, readFileSync(join(config.cwd, target), 'utf8')), options)
  const outside = scan.tools.find((candidate) => candidate.kind === 'agent' && candidate.source.export === exportName)
  if (outside) {
    const related = scan.diagnostics.filter((diagnostic) => diagnostic.tool !== undefined && diagnostic.tool === outside.name)
    adoptTool(tool, outside, adopted)
    return related
  }
  if (!scan.plainFunctions.includes(exportName)) return []
  tool.diagnostics.push('AT008')
  const detail = `"${reference.localName}" is a plain function in ${target}`
  return [createDiagnostic('AT008', registry.locate(reference.offset), detail, tool.name)]
}

function adoptTool(tool: AnalyzedTool, discovered: AnalyzedTool, adopted: Set<string>): void {
  const { name, kind } = tool
  Object.assign(tool, discovered, { name, kind })
  adopted.add(toolKey(discovered.source.file, discovered.source.export))
}

function toolKey(file: string, exportName: string): string {
  return `${file}#${exportName}`
}

async function findToolsOutsideScan(
  config: ResolvedConfig,
  cache: AnalysisCache,
  scanned: ReadonlySet<string>,
  registryFile: string | undefined,
  adopted: ReadonlySet<string>,
  context: ScanContext,
): Promise<Diagnostic[]> {
  cache.outside ??= await listOutsideCandidates(config, scanned, registryFile)
  const diagnostics: Diagnostic[] = []
  for (const file of cache.outside) {
    if (scanned.has(file) || !isFile(join(config.cwd, file))) continue
    for (const tool of scanFile(config, cache, file, context)?.tools ?? []) {
      const isServerFunction = tool.source.export !== '' && !tool.diagnostics.includes('AT004')
      if (!isServerFunction || adopted.has(toolKey(file, tool.source.export))) continue
      diagnostics.push(createDiagnostic('AT110', { file, line: tool.source.line, column: 1 }, `"${tool.name}"`, tool.name))
    }
  }
  return diagnostics
}

async function listOutsideCandidates(
  config: ResolvedConfig,
  scanned: ReadonlySet<string>,
  registryFile: string | undefined,
): Promise<string[]> {
  const outDir = toRelative(config.cwd, config.outDir)
  const files = await glob(PROJECT_SOURCES, {
    cwd: config.cwd,
    onlyFiles: true,
    ignore: [...IGNORED_SOURCES, ...IGNORED_OUTSIDE_SCAN, `${outDir}/**`],
  })
  return files
    .filter((file) => !scanned.has(file) && file !== registryFile && mayContainTools(readFileSync(join(config.cwd, file), 'utf8')))
    .toSorted()
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

function checkToolCount(tools: readonly AnalyzedTool[], elements: readonly AgentToolsElement[]): Diagnostic[] {
  const registered = tools.filter((tool) => tool.kind !== 'navigate')
  if (elements.length === 0) {
    const overflow = registered[MAX_TOOLS_PER_ROUTE]
    if (!overflow) return []
    const location = { file: overflow.source.file, line: overflow.source.line, column: 1 }
    return [createDiagnostic('AT104', location, `${registered.length} tools are defined`)]
  }
  return elements.flatMap((element) => {
    if (!element.readable) return []
    const isSelected = createSelector({ include: element.include, exclude: element.exclude })
    const count = registered.filter((tool) => isSelected(tool.name)).length
    if (count <= MAX_TOOLS_PER_ROUTE) return []
    const { file, line, column } = element
    return [createDiagnostic('AT104', { file, line, column }, `this <AgentTools /> registers ${count} tools`)]
  })
}

function toRelative(cwd: string, file: string): string {
  return relative(cwd, file).split(sep).join('/')
}

export type { AgentToolsConfig, ResolvedConfig } from './config'
export { resolveConfig } from './config'
export type { Diagnostic, DiagnosticCode, DiagnosticLevel } from './diagnostics'
export { DIAGNOSTIC_RULES, formatDiagnostic, hasErrors } from './diagnostics'
export type { AnalysisResult, AnalyzedTool } from './model'
