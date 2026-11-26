import { existsSync, readFileSync, readdirSync } from 'node:fs'
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

export function findAppDirectory(cwd: string): string | undefined {
  return APP_DIRECTORIES.map((directory) => join(cwd, directory)).find((directory) => existsSync(directory))
}

export function scanRoutes(cwd: string): RouteEntry[] {
  const appDirectory = findAppDirectory(cwd)
  if (!appDirectory) return []
  const routes = new Map<string, RouteEntry>()
  visit(appDirectory, [], routes)
  return [...routes.values()].toSorted((left, right) => left.pattern.localeCompare(right.pattern))
}

function visit(directory: string, segments: readonly string[], routes: Map<string, RouteEntry>): void {
  const entries = readdirSync(directory, { withFileTypes: true })
  const page = entries.find((entry) => entry.isFile() && PAGE_FILE.test(entry.name))
  if (page) {
    const route = toRoute(segments, join(directory, page.name))
    if (!routes.has(route.pattern)) routes.set(route.pattern, route)
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || isExcluded(entry.name, segments.length === 0)) continue
    visit(join(directory, entry.name), ROUTE_GROUP.test(entry.name) ? segments : [...segments, entry.name], routes)
  }
}

function isExcluded(name: string, isRoot: boolean): boolean {
  return name.startsWith('_') || name.startsWith('@') || INTERCEPTING_ROUTE.test(name) || name === 'node_modules' || (isRoot && name === 'api')
}

function toRoute(segments: readonly string[], pageFile: string): RouteEntry {
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
  return { ...route, ...readPageMetadata(pageFile) }
}

function readPageMetadata(pageFile: string): Pick<RouteEntry, 'title' | 'staticParams'> {
  if (pageFile.endsWith('.mdx')) return {}
  const code = readFileSync(pageFile, 'utf8')
  if (!code.includes('generateStaticParams') && !code.includes('metadata')) return {}
  const metadata: Pick<RouteEntry, 'title' | 'staticParams'> = {}
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
