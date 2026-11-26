import { expect, test } from '@playwright/test'
import { fixtureUrl } from '../support/fixtures'
import { allow, callTool, expectTools } from '../support/webmcp'

const url = fixtureUrl('safe-action')

test.describe('safe-action fixture: next-safe-action', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(url)
    await expectTools(page, ['loginUser'])
  })

  test('unwraps data', async ({ page }) => {
    const pending = callTool(page, 'loginUser', { username: 'valentin', password: 'correct-horse' })
    await allow(page)
    expect(await pending).toEqual({ ok: true, data: { username: 'valentin' } })
    await expect(page.getByTestId('user')).toHaveText('valentin')
  })

  test('maps validationErrors to invalid_input issues', async ({ page }) => {
    const pending = callTool(page, 'loginUser', { username: 'v', password: 'short' })
    await allow(page)
    expect(await pending).toEqual({
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'Invalid input.',
        issues: [
          { message: 'The username needs at least 3 characters.', path: ['username'] },
          { message: 'The password needs at least 8 characters.', path: ['password'] },
        ],
      },
    })
  })

  test('maps serverError to a failure', async ({ page }) => {
    const pending = callTool(page, 'loginUser', { username: 'locked', password: 'correct-horse' })
    await allow(page)
    expect(await pending).toEqual({ ok: false, error: { code: 'failed', message: 'This account is locked.' } })
  })
})
