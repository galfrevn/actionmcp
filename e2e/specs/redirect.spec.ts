import { expect, test } from '@playwright/test'
import { fixtureUrl } from '../support/fixtures'
import { allow, callTool, expectTools } from '../support/webmcp'

test.describe('redirect fixture: actions that call redirect()', () => {
  test('returns the new location from a tool of the root layout', async ({ page }) => {
    await page.goto(fixtureUrl('redirect'))
    await expectTools(page, ['finishOnboarding'])
    const pending = callTool(page, 'finishOnboarding')
    await allow(page)
    expect(await pending).toEqual({ ok: true, data: { navigatedTo: '/done?from=root' } })
    await expect(page).toHaveURL(fixtureUrl('redirect', '/done?from=root'))
    await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible()
    await expectTools(page, ['finishOnboarding'])
  })

  test('returns the new location from a tool whose segment unmounts', async ({ page }) => {
    await page.goto(fixtureUrl('redirect', '/start'))
    await expectTools(page, ['finishOnboarding', 'leaveStart'])
    expect(await callTool(page, 'leaveStart')).toEqual({ ok: true, data: { navigatedTo: '/done?from=start' } })
    await expect(page).toHaveURL(fixtureUrl('redirect', '/done?from=start'))
    await expectTools(page, ['finishOnboarding'])
  })
})
