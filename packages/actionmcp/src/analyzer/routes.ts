import { compareText } from '../core/compare'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { RouteEntry } from '../core/types'
import { parseModule, readObjectLiteral, staticString } from './source'

const PAGE_FILE = /^page\.(?:tsx|ts|jsx|js|mdx)$/
const ROUTE_GROUP = /^\([^.].*\)$/
const INTERCEPTING_ROUTE = /^\(\.{1,3}\)/
const OPTIONAL_CATCH_ALL = /^\[\[\.\.\.(.+)\]\]$/
const CATCH_ALL = /^\[\.\.\.(.+)\]$/
const DYNAMIC = /^\[(.+)\]$/
const APP_DIRECTORIES = ['app', 'src/app']

type PageMetadata = Pick<RouteEntry, 'title' | 'staticParams'>

export type PageMetadataCache = Map<string, { stamp: string; metadata: PageMetadata }>

export function findAppDirectory(cwd: string): string | undefined {
  return APP_DIRECTORIES.map((directory) => join(cwd, directory)).find((directory) => existsSync(directory))
}

export function scanRoutes(cwd: string, cache: PageMetadataCache = new Map()): RouteEntry[] {
  const appDirectory = findAppDirectory(cwd)
  if (!appDirectory) {
    cache.clear()
    return []
  }
  const routes = new Map<string, RouteEntry>()
  const pages = new Set<string>()
  visit(appDirectory, [], { routes, pages, cache })
  for (const file of cache.keys()) {
    if (!pages.has(file)) cache.delete(file)
  }
  return [...routes.values()].toSorted((left, right) => compareText(left.pattern, right.pattern))
}

interface RouteScan {
  routes: Map<string, RouteEntry>
  pages: Set<string>
  cache: PageMetadataCache
}

function visit(directory: string, segments: readonly string[], scan: RouteScan): void {
  const entries = readdirSync(directory, { withFileTypes: true })
  const page = entries.find((entry) => entry.isFile() && PAGE_FILE.test(entry.name))
  if (page) {
    const pageFile = join(directory, page.name)
    scan.pages.add(pageFile)
    const route = toRoute(segments, cachedPageMetadata(pageFile, scan.cache))
    if (!scan.routes.has(route.pattern)) scan.routes.set(route.pattern, route)
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || isExcluded(entry.name, segments.length === 0)) continue
    visit(join(directory, entry.name), ROUTE_GROUP.test(entry.name) ? segments : [...segments, entry.name], scan)
  }
}

function cachedPageMetadata(pageFile: string, cache: PageMetadataCache): PageMetadata {
  const { mtimeMs, size } = statSync(pageFile)
  const stamp = `${mtimeMs}:${size}`
  let cached = cache.get(pageFile)
  if (cached?.stamp !== stamp) {
    cached = { stamp, metadata: readPageMetadata(pageFile) }
    cache.set(pageFile, cached)
  }
  return cached.metadata
}

function isExcluded(name: string, isRoot: boolean): boolean {
  return name.startsWith('_') || name.startsWith('@') || INTERCEPTING_ROUTE.test(name) || name === 'node_modules' || (isRoot && name === 'api')
}

function toRoute(segments: readonly string[], metadata: PageMetadata): RouteEntry {
  const route: RouteEntry = { pattern: `/${segments.join('/')}`, params: [] }
  for (const segment of segments) {
    const optionalCatchAll = OPTIONAL_CATCH_ALL.exec(segment)?.[1]
    const catchAll = CATCH_ALL.exec(segment)?.[1]
    const dynamic = DYNAMIC.exec(segment)?.[1]
    if (optionalCatchAll !== undefined) {
      route.params.push(optionalCatchAll)
      route.optionalCatchAll = optionalCatchAll
    } else if (catchAll !== undefined) {
      route.params.push(catchAll)
      route.catchAll = catchAll
    } else if (dynamic !== undefined) {
      route.params.push(dynamic)
    }
  }
  return { ...route, ...metadata }
}

function readPageMetadata(pageFile: string): PageMetadata {
  if (pageFile.endsWith('.mdx')) return {}
  const code = readFileSync(pageFile, 'utf8')
  if (!code.includes('generateStaticParams') && !code.includes('metadata')) return {}
  const metadata: PageMetadata = {}
  for (const statement of parseModule(pageFile, code).program.body) {
    if (statement.type !== 'ExportNamedDeclaration' || !statement.declaration) continue
    const { declaration } = statement
    if (declaration.type === 'FunctionDeclaration' && declaration.id?.name === 'generateStaticParams') {
      metadata.staticParams = true
    }
    if (declaration.type !== 'VariableDeclaration') continue
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== 'Identifier') continue
      if (declarator.id.name === 'generateStaticParams') metadata.staticParams = true
      if (declarator.id.name === 'metadata' && declarator.init?.type === 'ObjectExpression') {
        const title = staticString(readObjectLiteral(declarator.init).properties.get('title'))
        if (title) metadata.title = title
      }
    }
  }
  return metadata
}
