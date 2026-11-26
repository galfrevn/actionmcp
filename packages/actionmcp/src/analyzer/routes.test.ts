import { rmSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, type TemporaryProject } from './__fixtures__/project'
import { findAppDirectory, scanRoutes, type PageMetadataCache } from './routes'

const PAGE = 'export default function Page() { return null }\n'

let project: TemporaryProject | undefined

afterEach(() => {
  project?.remove()
  project = undefined
})

describe('scanRoutes', () => {
  it('returns nothing without an app directory', () => {
    project = createProject({ 'lib/x.ts': '' })
    expect(findAppDirectory(project.cwd)).toBeUndefined()
    expect(scanRoutes(project.cwd)).toEqual([])
  })

  it('lists static, dynamic, and catch-all routes in a stable order', () => {
    project = createProject({
      'app/page.tsx': PAGE,
      'app/todos/page.tsx': PAGE,
      'app/projects/[id]/page.tsx': PAGE,
      'app/projects/[id]/settings/page.jsx': PAGE,
      'app/docs/[...path]/page.tsx': PAGE,
      'app/shop/[[...filters]]/page.tsx': PAGE,
      'app/about/page.mdx': '# About\n',
    })
    expect(scanRoutes(project.cwd)).toEqual([
      { pattern: '/', params: [] },
      { pattern: '/about', params: [] },
      { pattern: '/docs/[...path]', params: ['path'], catchAll: 'path' },
      { pattern: '/projects/[id]', params: ['id'] },
      { pattern: '/projects/[id]/settings', params: ['id'] },
      { pattern: '/shop/[[...filters]]', params: ['filters'], optionalCatchAll: 'filters' },
      { pattern: '/todos', params: [] },
    ])
  })

  it('supports src/app', () => {
    project = createProject({ 'src/app/page.tsx': PAGE })
    expect(scanRoutes(project.cwd)).toEqual([{ pattern: '/', params: [] }])
  })

  it('removes route groups from the path', () => {
    project = createProject({ 'app/(marketing)/pricing/page.tsx': PAGE, 'app/(dashboard)/(team)/members/page.tsx': PAGE })
    expect(scanRoutes(project.cwd).map((route) => route.pattern)).toEqual(['/members', '/pricing'])
  })

  it('ignores private folders, slots, intercepting routes, route handlers, and api', () => {
    project = createProject({
      'app/page.tsx': PAGE,
      'app/_components/page.tsx': PAGE,
      'app/@modal/login/page.tsx': PAGE,
      'app/feed/(.)photo/page.tsx': PAGE,
      'app/feed/(..)settings/page.tsx': PAGE,
      'app/feed/(...)root/page.tsx': PAGE,
      'app/api/health/page.tsx': PAGE,
      'app/webhooks/route.ts': 'export async function POST() {}\n',
      'app/empty/layout.tsx': PAGE,
      'app/blog/api/page.tsx': PAGE,
    })
    expect(scanRoutes(project.cwd).map((route) => route.pattern)).toEqual(['/', '/blog/api'])
  })

  it('reads a literal metadata title and generateStaticParams', () => {
    project = createProject({
      'app/page.tsx': `export const metadata = { title: 'Home' }\n${PAGE}`,
      'app/posts/[slug]/page.tsx': `export async function generateStaticParams() { return [] }\n${PAGE}`,
      'app/tags/[tag]/page.tsx': `export const generateStaticParams = async () => []\nexport const metadata = { title: computeTitle() }\n${PAGE}`,
      'app/plain/page.tsx': `const metadata = { title: 'Not exported' }\n${PAGE}`,
    })
    expect(scanRoutes(project.cwd)).toEqual([
      { pattern: '/', params: [], title: 'Home' },
      { pattern: '/plain', params: [] },
      { pattern: '/posts/[slug]', params: ['slug'], staticParams: true },
      { pattern: '/tags/[tag]', params: ['tag'], staticParams: true },
    ])
  })

  it('reuses the metadata of a page whose modification time and size did not change', () => {
    project = createProject({ 'app/page.tsx': `export const metadata = { title: 'Home' }\n${PAGE}` })
    const file = join(project.cwd, 'app/page.tsx')
    const cache: PageMetadataCache = new Map()
    const modified = new Date('2026-01-01T00:00:00Z')
    utimesSync(file, modified, modified)
    expect(scanRoutes(project.cwd, cache)).toEqual([{ pattern: '/', params: [], title: 'Home' }])

    project.write('app/page.tsx', `export const metadata = { title: 'Away' }\n${PAGE}`)
    utimesSync(file, modified, modified)
    expect(scanRoutes(project.cwd, cache)).toEqual([{ pattern: '/', params: [], title: 'Home' }])
    expect(scanRoutes(project.cwd)).toEqual([{ pattern: '/', params: [], title: 'Away' }])
  })

  it('refreshes a changed page and forgets a removed one', () => {
    project = createProject({
      'app/page.tsx': `export const metadata = { title: 'Home' }\n${PAGE}`,
      'app/about/page.tsx': PAGE,
    })
    const cache: PageMetadataCache = new Map()
    scanRoutes(project.cwd, cache)
    expect(cache.size).toBe(2)

    project.write('app/page.tsx', `export const metadata = { title: 'Start page' }\n${PAGE}`)
    rmSync(join(project.cwd, 'app/about'), { recursive: true })
    expect(scanRoutes(project.cwd, cache)).toEqual([{ pattern: '/', params: [], title: 'Start page' }])
    expect([...cache.keys()]).toEqual([join(project.cwd, 'app/page.tsx')])

    rmSync(join(project.cwd, 'app'), { recursive: true })
    expect(scanRoutes(project.cwd, cache)).toEqual([])
    expect(cache.size).toBe(0)
  })
})
