import { createMatcher } from '../core/match'
import type { JsonSchema, RouteEntry } from '../core/types'

export interface NavigateOptions {
  routes?: string[]
}

export interface NavigateInput {
  route: string
  params?: Record<string, string>
  query?: Record<string, string>
}

const DOT_SEGMENTS = new Set(['.', '..'])

export const NAVIGATE_DESCRIPTION =
  'Navigate this app to one of its pages. Available tools may change after navigating.'

export function selectRoutes(routes: readonly RouteEntry[], options: NavigateOptions | true): RouteEntry[] {
  if (options === true || !options.routes) {
    return routes.filter((route) => route.params.length === 0 || route.staticParams === true)
  }
  const isAllowed = createMatcher(options.routes)
  return routes.filter((route) => isAllowed(route.pattern))
}

export function navigateInputSchema(routes: readonly RouteEntry[]): JsonSchema {
  return {
    type: 'object',
    properties: {
      route: { type: 'string', enum: routes.map((route) => route.pattern) },
      params: { type: 'object', additionalProperties: { type: 'string' } },
      query: { type: 'object', additionalProperties: { type: 'string' } },
    },
    required: ['route'],
  }
}

export function buildHref(routes: readonly RouteEntry[], input: NavigateInput): string {
  const route = routes.find((candidate) => candidate.pattern === input.route)
  if (!route) {
    throw new RangeError(`Unknown route "${String(input.route)}".`)
  }
  const params = input.params ?? {}
  const segments = route.pattern.split('/').flatMap((segment) => resolveSegment(segment, params))
  const path = segments.join('/') || '/'
  const query = new URLSearchParams(input.query ?? {}).toString()
  return query ? `${path}?${query}` : path
}

function resolveSegment(segment: string, params: Record<string, string>): string[] {
  const optionalCatchAll = /^\[\[\.\.\.(.+)\]\]$/.exec(segment)?.[1]
  if (optionalCatchAll !== undefined) {
    return splitPath(optionalCatchAll, params[optionalCatchAll] ?? '')
  }
  const catchAll = /^\[\.\.\.(.+)\]$/.exec(segment)?.[1]
  if (catchAll !== undefined) {
    const parts = splitPath(catchAll, requireParam(params, catchAll))
    if (parts.length === 0) throw new RangeError(`Missing route parameter "${catchAll}".`)
    return parts
  }
  const dynamic = /^\[(.+)\]$/.exec(segment)?.[1]
  return [dynamic === undefined ? segment : encodeSegment(dynamic, requireParam(params, dynamic))]
}

function requireParam(params: Record<string, string>, name: string): string {
  const value = params[name]
  if (typeof value !== 'string' || value.length === 0) {
    throw new RangeError(`Missing route parameter "${name}".`)
  }
  return value
}

function splitPath(name: string, value: string): string[] {
  return value
    .split('/')
    .filter(Boolean)
    .map((part) => encodeSegment(name, part))
}

function encodeSegment(name: string, value: string): string {
  if (DOT_SEGMENTS.has(value)) {
    throw new RangeError(`The route parameter "${name}" cannot contain the path segment "${value}".`)
  }
  return encodeURIComponent(value)
}
