import { compareText } from '../core/compare'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type ts from 'typescript'
import { isRecord } from '../core/guards'
import { sanitizeJsonSchema } from '../core/schema'
import type { JsonSchema } from '../core/types'
import { SCHEMA_GENERATOR_PACKAGE, loadTypeToolchain, toolchainOrigins, type TypeToolchain } from './toolchain'

export interface TypeTarget {
  file: string
  parameterOffset: number
}

export type TypeInference = { ok: true; schema: JsonSchema } | { ok: false; reason: string; missingToolchain?: true }

export interface InferenceOptions {
  cwd: string
  cacheFile?: string
}

interface CacheEntry {
  hash: string
  inference: TypeInference
}

const CACHE_VERSION = 1
const UNREADABLE_TYPE: TypeInference = { ok: false, reason: 'The type could not be read.' }
const MISSING_TOOLCHAIN: TypeInference = {
  ok: false,
  reason: `${SCHEMA_GENERATOR_PACKAGE} is not installed`,
  missingToolchain: true,
}

export function inferParameterSchemas(targets: readonly TypeTarget[], options: InferenceOptions): TypeInference[] {
  if (targets.length === 0) return []
  const cache = readCache(options.cacheFile)
  const tsconfig = findTsconfig(options.cwd)
  const tsconfigText = tsconfig ? readFileSync(tsconfig, 'utf8') : ''
  const hashes = targets.map((target) => hashTarget(target, tsconfigText))
  const isCached = (target: TypeTarget, index: number) => cache.get(cacheKey(target))?.hash === hashes[index]
  const missing = targets.filter((target, index) => !isCached(target, index))
  if (missing.length === 0) return targets.map((target) => cache.get(cacheKey(target))?.inference ?? UNREADABLE_TYPE)

  const toolchain = loadTypeToolchain(toolchainOrigins(options.cwd))
  if (!toolchain) {
    return targets.map(
      (target, index) => (isCached(target, index) ? cache.get(cacheKey(target))?.inference : undefined) ?? MISSING_TOOLCHAIN,
    )
  }
  const inferred = inferWithTypeScript(toolchain, missing, options.cwd, tsconfig)
  missing.forEach((target, index) => {
    const inference = inferred[index]
    const hash = hashes[targets.indexOf(target)]
    if (inference && hash !== undefined) cache.set(cacheKey(target), { hash, inference })
  })
  writeCache(options.cacheFile, cache, targets)
  return targets.map((target) => cache.get(cacheKey(target))?.inference ?? UNREADABLE_TYPE)
}

export function normalizeTypeSchema(schema: Record<string, unknown>): TypeInference {
  const { $schema: _dialect, definitions, ...rest } = schema
  const renamed = renameDefinitionReferences(
    isRecord(definitions) && Object.keys(definitions).length > 0 ? { ...rest, $defs: definitions } : rest,
  )
  const sanitized = sanitizeJsonSchema(renamed as JsonSchema)
  if (sanitized.type !== 'object') {
    return { ok: false, reason: 'the first parameter is not an object type' }
  }
  return { ok: true, schema: sanitized }
}

function renameDefinitionReferences(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(renameDefinitionReferences)
  if (!isRecord(node)) return node
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      key === '$ref' && typeof value === 'string' ? value.replace(/^#\/definitions\//, '#/$defs/') : renameDefinitionReferences(value),
    ]),
  )
}

function inferWithTypeScript(
  { typescript, generator: generatorModule }: TypeToolchain,
  targets: readonly TypeTarget[],
  cwd: string,
  tsconfig: string | undefined,
): TypeInference[] {
  const { SchemaGenerator, createFormatter, createParser, DEFAULT_CONFIG } = generatorModule
  const compilerOptions: ts.CompilerOptions = {
    ...readCompilerOptions(typescript, cwd, tsconfig),
    noEmit: true,
    skipLibCheck: true,
  }
  const program = typescript.createProgram([...new Set(targets.map((target) => target.file))], compilerOptions)
  const config = {
    ...DEFAULT_CONFIG,
    expose: 'none' as const,
    topRef: false,
    jsDoc: 'extended' as const,
    additionalProperties: true,
    skipTypeCheck: true,
  }
  const generator = new SchemaGenerator(program, createParser(program, config), createFormatter(config), config)

  return targets.map((target) => {
    const sourceFile = program.getSourceFile(target.file)
    const parameter = sourceFile && findParameter(typescript, sourceFile, target.parameterOffset)
    if (!parameter?.type) return { ok: false, reason: 'the first parameter has no type annotation' }
    try {
      return normalizeTypeSchema(generator.createSchemaFromNodes([parameter.type]) as Record<string, unknown>)
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? (error.message.split('\n')[0] ?? error.name) : String(error) }
    }
  })
}

function findParameter(typescript: typeof ts, sourceFile: ts.SourceFile, offset: number): ts.ParameterDeclaration | undefined {
  const search = (node: ts.Node): ts.ParameterDeclaration | undefined => {
    if (offset < node.getFullStart() || offset >= node.getEnd()) return undefined
    if (typescript.isParameter(node) && node.getStart(sourceFile) === offset) return node
    return typescript.forEachChild(node, search)
  }
  return search(sourceFile)
}

function readCompilerOptions(typescript: typeof ts, cwd: string, tsconfig: string | undefined): ts.CompilerOptions {
  if (!tsconfig) {
    return {
      strict: true,
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ESNext,
      moduleResolution: typescript.ModuleResolutionKind.Bundler,
      jsx: typescript.JsxEmit.Preserve,
    }
  }
  const { config } = typescript.readConfigFile(tsconfig, typescript.sys.readFile) as { config?: unknown }
  return typescript.parseJsonConfigFileContent(config ?? {}, typescript.sys, cwd).options
}

function findTsconfig(cwd: string): string | undefined {
  const file = join(cwd, 'tsconfig.json')
  return existsSync(file) ? file : undefined
}

function cacheKey(target: TypeTarget): string {
  return `${target.file}#${target.parameterOffset}`
}

function hashTarget(target: TypeTarget, tsconfigText: string): string {
  return createHash('sha256')
    .update(String(CACHE_VERSION))
    .update(readFileSync(target.file))
    .update(tsconfigText)
    .update(String(target.parameterOffset))
    .digest('hex')
}

function readCache(cacheFile: string | undefined): Map<string, CacheEntry> {
  if (!cacheFile || !existsSync(cacheFile)) return new Map()
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8')) as Record<string, CacheEntry>))
  } catch {
    return new Map()
  }
}

function writeCache(cacheFile: string | undefined, cache: Map<string, CacheEntry>, targets: readonly TypeTarget[]): void {
  if (!cacheFile) return
  const live = new Set(targets.map(cacheKey))
  const entries = [...cache].filter(([key]) => live.has(key)).toSorted(([left], [right]) => compareText(left, right))
  mkdirSync(dirname(cacheFile), { recursive: true })
  writeFileSync(cacheFile, `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`)
}
