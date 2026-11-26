import { expect, test } from '@playwright/test'
import { fixtureUrl } from '../support/fixtures'
import { allow, callTool, expectTools, listTools } from '../support/webmcp'

const url = fixtureUrl('formdata')

test.describe('formdata fixture: defineAgentTools with FormData actions', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([{ name: 'user', value: 'ana', url }])
    await page.goto(url)
    await expectTools(page, ['notes.create', 'team.inviteMember'])
  })

  test('exposes the schema that was moved to a regular module', async ({ page }) => {
    const invite = (await listTools(page)).find((tool) => tool.name === 'team.inviteMember')
    expect(invite).toMatchObject({
      title: 'Invite member',
      inputSchema: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['member', 'owner'] },
          teams: { type: 'array', items: { type: 'string' } },
          notify: { type: 'boolean' },
        },
        required: ['email', 'role'],
      },
      annotations: { consequentialHint: true },
    })
  })

  test('calls a (prevState, formData) action with arrays and booleans', async ({ page }, testInfo) => {
    const email = `ana-${testInfo.project.name}-${Date.now()}@acme.com`
    const pending = callTool(page, 'team.inviteMember', { email, role: 'owner', teams: ['design', 'platform'], notify: true })
    await allow(page)
    expect(await pending).toEqual({ ok: true, data: { success: `Invitation sent to ${email}.` } })
    await expect(page.getByTestId('invitations')).toContainText(`${email} · owner · design+platform · notify`)
  })

  test('omits false booleans and missing arrays', async ({ page }, testInfo) => {
    const email = `ben-${testInfo.project.name}-${Date.now()}@acme.com`
    const pending = callTool(page, 'team.inviteMember', { email, role: 'member', notify: false })
    await allow(page)
    await pending
    await expect(page.getByTestId('invitations')).toContainText(`${email} · member · no teams · silent`)
  })

  test('maps an ActionState error to a failure', async ({ page }, testInfo) => {
    const invalid = callTool(page, 'team.inviteMember', { email: 'not-an-email', role: 'member' })
    await allow(page)
    expect(await invalid).toEqual({ ok: false, error: { code: 'failed', message: 'Enter a valid email address.' } })

    const email = `dup-${testInfo.project.name}-${Date.now()}@acme.com`
    const first = callTool(page, 'team.inviteMember', { email, role: 'member' })
    await allow(page)
    await first
    const second = callTool(page, 'team.inviteMember', { email, role: 'member' })
    await allow(page)
    expect(await second).toEqual({
      ok: false,
      error: { code: 'failed', message: 'An invitation has already been sent to this email.' },
    })
  })

  test('calls a single-parameter form action', async ({ page }, testInfo) => {
    const text = `Note ${testInfo.project.name} ${Date.now()}`
    const pending = callTool(page, 'notes.create', { text })
    await allow(page)
    expect(await pending).toEqual({ ok: true })
    await expect(page.getByTestId('notes')).toContainText(text)
  })

  test('leaves the action usable from its own form', async ({ page }, testInfo) => {
    const email = `form-${testInfo.project.name}-${Date.now()}@acme.com`
    await page.getByRole('textbox', { name: 'Email' }).fill(email)
    await page.getByRole('button', { name: 'Invite' }).click()
    await expect(page.getByRole('status')).toHaveText(`Invitation sent to ${email}.`)
    await expect(page.getByTestId('invitations')).toContainText(email)
  })
})
