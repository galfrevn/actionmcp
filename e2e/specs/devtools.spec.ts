import { expect, test } from '@playwright/test'
import { fixtureUrl } from '../support/fixtures'
import { expectTools } from '../support/webmcp'

const url = fixtureUrl('basic-dev')

test.describe('devtools panel in development', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([{ name: 'user', value: 'ana', url }])
    await page.goto(url)
    await expectTools(page, ['addTodo', 'listTodos'])
  })

  test('shows the WebMCP status and the registered tools', async ({ page }, testInfo) => {
    const toggle = page.locator('[data-actionmcp-devtools="toggle"]')
    await expect(toggle).toHaveText('Agent tools · 2')
    await toggle.click()
    const panel = page.locator('[data-actionmcp-devtools="panel"]')
    const expectedStatus = testInfo.project.name === 'native' ? 'WebMCP: native' : 'WebMCP: polyfill (native agents do not see these tools)'
    await expect(panel.locator('[data-actionmcp-devtools="status"]')).toHaveText(expectedStatus)
    await expect(panel.getByRole('button', { name: /addTodo · consequential, untrusted output/ })).toBeVisible()
    await expect(panel.getByRole('button', { name: /listTodos · read-only/ })).toBeVisible()
  })

  test('runs a tool with JSON input and records the call', async ({ page }) => {
    await page.locator('[data-actionmcp-devtools="toggle"]').click()
    const panel = page.locator('[data-actionmcp-devtools="panel"]')
    await panel.getByRole('button', { name: /listTodos/ }).click()
    await panel.getByRole('button', { name: 'Run listTodos' }).click()
    await expect(panel.locator('[data-actionmcp-devtools="output"]')).toContainText('"ok":true')
    const call = panel.locator('[data-actionmcp-devtools="call"]').first()
    await expect(call).toContainText('listTodos')
    await expect(call).toContainText('confirmation none')
  })
})
