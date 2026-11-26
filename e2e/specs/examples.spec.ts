import { expect, test, type Page } from '@playwright/test'
import { exampleUrl, type ExampleName } from '../support/fixtures'
import { allow, callTool, confirmDialog, expectTools } from '../support/webmcp'

async function open(page: Page, example: ExampleName, tools: string[]): Promise<void> {
  await page.goto(exampleUrl(example))
  const signIn = page.getByRole('button', { name: 'Sign in as demo' })
  if (await signIn.isVisible()) {
    await signIn.click()
    await expect(page.getByText('Signed in as demo')).toBeVisible()
  }
  await expectTools(page, tools)
}

test.describe('examples', () => {
  test('basic: the tools need a session and share state with the UI', async ({ page }, testInfo) => {
    await page.goto(exampleUrl('basic'))
    await expectTools(page, ['addTodo', 'listTodos', 'removeTodo', 'toggleTodo'])
    expect(await callTool(page, 'listTodos')).toMatchObject({ ok: false, error: { code: 'unauthorized' } })

    await open(page, 'basic', ['addTodo', 'listTodos', 'removeTodo', 'toggleTodo'])
    const text = `Example todo ${testInfo.project.name} ${Date.now()}`
    const adding = callTool(page, 'addTodo', { text })
    await allow(page)
    const added = await adding
    expect(added).toMatchObject({ ok: true, data: { text, done: false } })
    await expect(page.getByText(text)).toBeVisible()

    const id = added.ok ? (added.data as { id: string }).id : ''
    const toggling = callTool(page, 'toggleTodo', { id })
    await allow(page)
    expect(await toggling).toMatchObject({ ok: true, data: { id, done: true } })
    await expect(page.getByLabel(`Mark "${text}" as done`)).toBeChecked()

    const missing = callTool(page, 'removeTodo', { id: 'missing' })
    await allow(page)
    expect(await missing).toEqual({ ok: false, error: { code: 'not_found', message: 'There is no todo with the id missing.' } })

    const removing = callTool(page, 'removeTodo', { id })
    await allow(page)
    expect(await removing).toEqual({ ok: true, data: { id } })
    await expect(page.getByText(text)).toHaveCount(0)
  })

  test('formdata: invites and removes a member through the existing actions', async ({ page }, testInfo) => {
    await open(page, 'formdata', ['team.inviteMember', 'team.removeMember'])
    const email = `example-${testInfo.project.name}-${Date.now()}@acme.com`
    const inviting = callTool(page, 'team.inviteMember', { email, role: 'member' })
    await expect(confirmDialog(page)).toContainText('Invite member')
    await allow(page)
    expect(await inviting).toEqual({ ok: true, data: { success: `Invited ${email} as member.` } })
    await expect(page.getByText(email)).toBeVisible()

    const removing = callTool(page, 'team.removeMember', { email })
    await allow(page)
    expect(await removing).toEqual({ ok: true, data: { success: `Removed ${email}.` } })
    await expect(page.getByText(email)).toHaveCount(0)
  })

  test('safe-action: maps data, validation errors, and server errors', async ({ page }, testInfo) => {
    await open(page, 'safe-action', ['profile.update'])
    const displayName = `Ana ${testInfo.project.name}`
    const updating = callTool(page, 'profile.update', { displayName, bio: 'Building tools.' })
    await allow(page)
    expect(await updating).toEqual({ ok: true, data: { displayName, bio: 'Building tools.' } })
    await expect(page.getByTestId('display-name')).toHaveText(displayName)

    const invalid = callTool(page, 'profile.update', { displayName: 'a' })
    await allow(page)
    expect(await invalid).toMatchObject({
      ok: false,
      error: { code: 'invalid_input', issues: [{ message: 'The display name needs at least 2 characters.', path: ['displayName'] }] },
    })

    const reserved = callTool(page, 'profile.update', { displayName: 'admin' })
    await allow(page)
    expect(await reserved).toEqual({ ok: false, error: { code: 'failed', message: 'The display name "admin" is reserved.' } })
  })

  test('jsdoc: searches and renames with schemas inferred from the types', async ({ page }, testInfo) => {
    await open(page, 'jsdoc', ['searchTasks', 'task.rename'])
    expect(await callTool(page, 'searchTasks', { priority: 'low' })).toMatchObject({ ok: true, data: [{ id: 't2' }] })
    const title = `Renamed ${testInfo.project.name} ${Date.now()}`
    const renaming = callTool(page, 'task.rename', { taskId: 't1', title })
    await allow(page)
    expect(await renaming).toMatchObject({ ok: true, data: { id: 't1', title } })
    await expect(page.getByText(title)).toBeVisible()
  })
})
