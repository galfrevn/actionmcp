import { expect, test } from '@playwright/test'
import { fixtureUrl } from '../support/fixtures'
import { callTool, expectTools } from '../support/webmcp'

test.describe('coexist fixture: third-party tools on the same page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(fixtureUrl('coexist'))
    await expectTools(page, ['act', 'getProfile', 'get_cart', 'get_cart_2', 'page_title', 'pause_hmr', 'query', 'snapshot'])
  })

  test('registers next to tools from other libraries without replacing them', async ({ page }) => {
    expect(await callTool(page, 'snapshot')).toEqual({ owner: 'third-party', name: 'snapshot' })
    expect(await callTool(page, 'getProfile')).toEqual({ ok: true, data: { name: 'Ana' } })
  })

  test('registers under a suffixed name when another library owns the name', async ({ page }) => {
    expect(await callTool(page, 'get_cart')).toEqual({ owner: 'third-party', name: 'get_cart' })
    expect(await callTool(page, 'get_cart_2')).toEqual({ ok: true, data: { items: 2 } })
  })

  test('works with a polyfill that the app installs itself', async ({ page }) => {
    const title = await page.evaluate(async () => {
      const context = document.modelContext
      const tool = (await context?.getTools())?.find((candidate) => candidate.name === 'page_title')
      return tool && context ? context.executeTool(tool, {}) : undefined
    })
    expect(title).toContain('Coexist fixture')
  })
})
