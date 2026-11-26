import { describe, expect, it } from 'vitest'
import type { RouteEntry } from '../core/types'
import { buildHref, navigateInputSchema, selectRoutes } from './routes'

const routes: RouteEntry[] = [
  { pattern: '/', params: [] },
  { pattern: '/todos', params: [] },
  { pattern: '/projects/[id]', params: ['id'] },
  { pattern: '/posts/[slug]', params: ['slug'], staticParams: true },
  { pattern: '/docs/[...path]', params: ['path'], catchAll: 'path' },
  { pattern: '/shop/[[...filters]]', params: ['filters'], optionalCatchAll: 'filters' },
]

const patterns = (selected: RouteEntry[]) => selected.map((route) => route.pattern)

describe('selectRoutes', () => {
  it('selects static routes and routes with static params by default', () => {
    expect(patterns(selectRoutes(routes, true))).toEqual(['/', '/todos', '/posts/[slug]'])
    expect(patterns(selectRoutes(routes, {}))).toEqual(['/', '/todos', '/posts/[slug]'])
  })

  it('selects only the routes that match the globs', () => {
    expect(patterns(selectRoutes(routes, { routes: ['/todos', '/projects/*'] }))).toEqual(['/todos', '/projects/[id]'])
    expect(patterns(selectRoutes(routes, { routes: ['/docs/**'] }))).toEqual(['/docs/[...path]'])
    expect(patterns(selectRoutes(routes, { routes: [] }))).toEqual([])
  })
})

describe('navigateInputSchema', () => {
  it('lists the allowed routes as an enum', () => {
    expect(navigateInputSchema(routes.slice(0, 2))).toEqual({
      type: 'object',
      properties: {
        route: { type: 'string', enum: ['/', '/todos'] },
        params: { type: 'object', additionalProperties: { type: 'string' } },
        query: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['route'],
    })
  })
})

describe('buildHref', () => {
  it('builds static paths', () => {
    expect(buildHref(routes, { route: '/' })).toBe('/')
    expect(buildHref(routes, { route: '/todos' })).toBe('/todos')
  })

  it('fills and encodes dynamic segments', () => {
    expect(buildHref(routes, { route: '/projects/[id]', params: { id: 'a b/c' } })).toBe('/projects/a%20b%2Fc')
  })

  it('fills catch-all segments', () => {
    expect(buildHref(routes, { route: '/docs/[...path]', params: { path: 'guides/getting started' } })).toBe(
      '/docs/guides/getting%20started',
    )
  })

  it('allows an optional catch-all to be empty', () => {
    expect(buildHref(routes, { route: '/shop/[[...filters]]' })).toBe('/shop')
    expect(buildHref(routes, { route: '/shop/[[...filters]]', params: { filters: 'shoes/red' } })).toBe('/shop/shoes/red')
  })

  it('appends the query string', () => {
    expect(buildHref(routes, { route: '/todos', query: { filter: 'open items', page: '2' } })).toBe('/todos?filter=open+items&page=2')
  })

  it('rejects a route outside the allowed list', () => {
    expect(() => buildHref(routes, { route: '/admin' })).toThrow('Unknown route "/admin"')
    expect(() => buildHref(routes, { route: '//evil.example' })).toThrow('Unknown route')
  })

  it('rejects missing parameters', () => {
    expect(() => buildHref(routes, { route: '/projects/[id]' })).toThrow('Missing route parameter "id"')
    expect(() => buildHref(routes, { route: '/projects/[id]', params: { id: '' } })).toThrow('Missing route parameter "id"')
    expect(() => buildHref(routes, { route: '/docs/[...path]', params: { path: '/' } })).toThrow('Missing route parameter "path"')
  })

  it('rejects dot segments that would resolve to a route outside the allowed list', () => {
    expect(() => buildHref(routes, { route: '/docs/[...path]', params: { path: '../admin' } })).toThrow(
      'The route parameter "path" cannot contain the path segment "..".',
    )
    expect(() => buildHref(routes, { route: '/docs/[...path]', params: { path: 'guides/./../..' } })).toThrow(
      'cannot contain the path segment "."',
    )
    expect(() => buildHref(routes, { route: '/projects/[id]', params: { id: '..' } })).toThrow('cannot contain the path segment ".."')
    expect(() => buildHref(routes, { route: '/projects/[id]', params: { id: '.' } })).toThrow('cannot contain the path segment "."')
    expect(() => buildHref(routes, { route: '/shop/[[...filters]]', params: { filters: '../todos' } })).toThrow(
      'cannot contain the path segment ".."',
    )
  })

  it('keeps dots inside a longer segment and encodes an encoded dot segment again', () => {
    expect(buildHref(routes, { route: '/projects/[id]', params: { id: 'v1.2..3' } })).toBe('/projects/v1.2..3')
    expect(buildHref(routes, { route: '/docs/[...path]', params: { path: '.../%2e%2e/file.md' } })).toBe('/docs/.../%252e%252e/file.md')
  })
})
