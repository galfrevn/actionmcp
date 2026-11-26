import { expect, test } from '@playwright/test'
import { fixtureUrl } from '../support/fixtures'
import { callTool, countToolChanges, expectTools } from '../support/webmcp'

test.describe('scoped fixture: tools follow the layout that mounts them', () => {
  test('changes the tools on navigation and emits toolchange', async ({ page }) => {
    await page.goto(fixtureUrl('scoped'))
    await expectTools(page, ['ping'])
    const toolChanges = await countToolChanges(page)

    await page.getByRole('link', { name: 'Section A' }).click()
    await expect(page.getByRole('heading', { name: 'Section A' })).toBeVisible()
    await expectTools(page, ['alpha.read', 'alpha.write', 'ping'])
    const afterSectionA = await toolChanges()
    expect(afterSectionA).toBeGreaterThan(0)

    await page.goto(fixtureUrl('scoped', '/a'))
    await expectTools(page, ['alpha.read', 'alpha.write', 'ping'])
  })

  test('keeps the registration while the layout stays mounted', async ({ page }) => {
    await page.goto(fixtureUrl('scoped', '/a'))
    await expectTools(page, ['alpha.read', 'alpha.write', 'ping'])
    const toolChanges = await countToolChanges(page)
    await page.getByRole('link', { name: 'Details' }).click()
    await expect(page.getByRole('heading', { name: 'Section A details' })).toBeVisible()
    await expectTools(page, ['alpha.read', 'alpha.write', 'ping'])
    expect(await toolChanges()).toBe(0)
  })

  test('unregisters segment tools when leaving and applies the prefix of the new segment', async ({ page }) => {
    await page.goto(fixtureUrl('scoped', '/a'))
    await expectTools(page, ['alpha.read', 'alpha.write', 'ping'])
    await page.getByRole('link', { name: 'Section B' }).click()
    await expectTools(page, ['ping', 'team.beta.read'])
    expect(await callTool(page, 'team.beta.read')).toEqual({ ok: true, data: { title: 'Beta' } })
    await page.getByRole('link', { name: 'Home' }).click()
    await expectTools(page, ['ping'])
  })
})
