import { expect, test } from '@playwright/test'
import { fixtureUrl } from '../support/fixtures'
import { callTool, expectTools, listTools } from '../support/webmcp'

const STATIC_ROUTES = ['/', '/feed', '/feed/photo', '/login', '/posts/[slug]', '/pricing', '/projects', '/todos']

async function routeEnum(page: Parameters<typeof listTools>[0], name: string): Promise<string[]> {
  const tool = (await listTools(page)).find((candidate) => candidate.name === name)
  const properties = tool?.inputSchema?.properties as { route?: { enum?: string[] } } | undefined
  return properties?.route?.enum ?? []
}

test.describe('navigate fixture: typed navigation tool', () => {
  test('lists static routes and routes with generateStaticParams by default', async ({ page }) => {
    await page.goto(fixtureUrl('navigate'))
    await expectTools(page, ['navigate'])
    expect(await routeEnum(page, 'navigate')).toEqual(STATIC_ROUTES)
    const [tool] = await listTools(page)
    expect(tool).toMatchObject({
      description: 'Navigate this app to one of its pages. Available tools may change after navigating.',
      annotations: { readOnlyHint: false, consequentialHint: false },
    })
  })

  test('leaves out groups, slots, intercepted routes, private folders, handlers, and unlisted dynamic routes', async ({ page }) => {
    await page.goto(fixtureUrl('navigate'))
    await expectTools(page, ['navigate'])
    const routes = await routeEnum(page, 'navigate')
    for (const excluded of ['/(marketing)/pricing', '/@modal/login', '/feed/(.)photo', '/_internal', '/api/health', '/projects/[id]', '/docs/[...path]']) {
      expect(routes).not.toContain(excluded)
    }
  })

  test('navigates without a confirmation and returns the URL', async ({ page }) => {
    await page.goto(fixtureUrl('navigate'))
    await expectTools(page, ['navigate'])
    expect(await callTool(page, 'navigate', { route: '/todos', query: { filter: 'open' } })).toEqual({
      ok: true,
      data: { url: '/todos?filter=open' },
    })
    await expect(page).toHaveURL(fixtureUrl('navigate', '/todos?filter=open'))
    await expect(page.getByRole('heading', { name: 'Todos' })).toBeVisible()
    await expectTools(page, ['navigate'])
  })

  test('fills dynamic segments from params', async ({ page }) => {
    await page.goto(fixtureUrl('navigate'))
    await expectTools(page, ['navigate'])
    await callTool(page, 'navigate', { route: '/posts/[slug]', params: { slug: 'hello-world' } })
    await expect(page.getByRole('heading', { name: 'Post hello-world' })).toBeVisible()
  })

  test('rejects unknown routes and missing params without navigating', async ({ page }) => {
    await page.goto(fixtureUrl('navigate'))
    await expectTools(page, ['navigate'])
    expect(await callTool(page, 'navigate', { route: '/projects/[id]', params: { id: '1' } })).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: 'Unknown route "/projects/[id]".' },
    })
    expect(await callTool(page, 'navigate', { route: 'https://evil.example/' })).toMatchObject({ ok: false })
    expect(await callTool(page, 'navigate', { route: '/posts/[slug]' })).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: 'Missing route parameter "slug".' },
    })
    await expect(page).toHaveURL(fixtureUrl('navigate'))
  })

  test('limits a segment to the routes that match its globs and applies the prefix', async ({ page }) => {
    await page.goto(fixtureUrl('navigate', '/projects'))
    await expectTools(page, ['navigate', 'projects.navigate'])
    expect(await routeEnum(page, 'projects.navigate')).toEqual(['/docs/[...path]', '/projects/[id]'])

    await callTool(page, 'projects.navigate', { route: '/projects/[id]', params: { id: '42' } })
    await expect(page.getByRole('heading', { name: 'Project 42' })).toBeVisible()
    await expectTools(page, ['navigate', 'projects.navigate'])

    await callTool(page, 'projects.navigate', { route: '/docs/[...path]', params: { path: 'guides/getting-started' } })
    await expect(page.getByRole('heading', { name: 'Docs guides / getting-started' })).toBeVisible()
    await expectTools(page, ['navigate'])
  })

  test('rejects parameters that would resolve to a route outside the list', async ({ page }) => {
    await page.goto(fixtureUrl('navigate', '/projects'))
    await expectTools(page, ['navigate', 'projects.navigate'])
    expect(await callTool(page, 'projects.navigate', { route: '/docs/[...path]', params: { path: '../login' } })).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: 'The route parameter "path" cannot contain the path segment "..".' },
    })
    expect(await callTool(page, 'projects.navigate', { route: '/projects/[id]', params: { id: '..' } })).toMatchObject({
      ok: false,
      error: { code: 'invalid_input' },
    })
    await expect(page).toHaveURL(fixtureUrl('navigate', '/projects'))
  })
})
