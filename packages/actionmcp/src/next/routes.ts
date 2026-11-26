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

const PARAMS_DESCRIPTION =
  'The value of each dynamic segment of the route, by name. A catch-all segment takes a path such as "guides/setup".'
const QUERY_DESCRIPTION = 'Search parameters to add to the URL.'

export const NAVIGATE_DESCRIPTION = 'Navigate this app to one of its pages. Available tools may change after navigating.'

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
      route: { type: 'string', enum: routes.map((route) => route.pattern), description: describeRoutes(routes) },
      params: { type: 'object', additionalProperties: { type: 'string' }, description: PARAMS_DESCRIPTION },
      query: { type: 'object', additionalProperties: { type: 'string' }, description: QUERY_DESCRIPTION },
    },
    required: ['route'],
  }
}

function describeRoutes(routes: readonly RouteEntry[]): string {
  const described = routes.map((route) => {
    const details = [
      route.title ? `"${route.title}"` : undefined,
      route.params.length > 0 ? `params: ${route.params.join(', ')}` : undefined,
    ]
    const known = details.filter((detail) => detail !== undefined)
    return known.length > 0 ? `${route.pattern} (${known.join('; ')})` : route.pattern
  })
  return `The page to open: ${described.join(', ')}.`
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
