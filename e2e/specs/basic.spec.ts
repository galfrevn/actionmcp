import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { fixtureUrl } from '../support/fixtures'
import { allow, callTool, cancel, confirmDialog, expectTools, isSettled, listTools } from '../support/webmcp'

const url = fixtureUrl('basic')

test.describe('basic fixture: agent() tools', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([{ name: 'user', value: 'ana', url }])
    await page.goto(url)
    await expectTools(page, ['addTodo', 'listTodos'])
  })

  test('registers the tools with schemas and annotations', async ({ page }) => {
    const tools = await listTools(page)
    const addTodo = tools.find((tool) => tool.name === 'addTodo')
    const listTodos = tools.find((tool) => tool.name === 'listTodos')
    expect(addTodo).toMatchObject({
      title: 'Add todo',
      description: 'Add an item to the todo list of the signed-in user. Returns the created item.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', minLength: 1, maxLength: 200, description: 'Todo text' } },
        required: ['text'],
      },
      annotations: { readOnlyHint: false, consequentialHint: true, untrustedContentHint: true },
    })
    expect(addTodo?.outputSchema).toMatchObject({ type: 'object', required: ['ok'] })
    expect(listTodos).toMatchObject({
      inputSchema: null,
      annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: false },
    })
  })

  test('renders the origin trial token in the head of the server HTML', async ({ request }) => {
    const html = await (await request.get(url)).text()
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('<meta http-equiv="origin-trial" content="fixture-origin-trial-token"')
  })

  test('runs a read-only tool without a confirmation', async ({ page }) => {
    const output = await callTool(page, 'listTodos')
    expect(output.ok).toBe(true)
    await expect(confirmDialog(page)).toHaveCount(0)
  })

  test('blocks a consequential tool until a human allows it, then revalidates the UI', async ({ page }, testInfo) => {
    const text = `Buy milk ${testInfo.project.name} ${Date.now()}`
    const pending = callTool(page, 'addTodo', { text })
    await expect(confirmDialog(page)).toBeVisible()
    await expect(confirmDialog(page)).toContainText('Add todo')
    await expect(confirmDialog(page)).toContainText(text)
    expect(await isSettled(pending, 1000)).toBe(false)
    await expect(page.getByTestId('todos')).not.toContainText(text)

    await allow(page)
    const output = await pending
    expect(output).toMatchObject({ ok: true, data: { text } })
    await expect(page.getByTestId('todos')).toContainText(text)
    await expect(confirmDialog(page)).toHaveCount(0)
  })

  test('returns only the fields that the output schema declares', async ({ page }) => {
    const pending = callTool(page, 'addTodo', { text: `Filtered ${Date.now()}` })
    await allow(page)
    const output = await pending
    expect(output.ok && Object.keys(output.data as object).toSorted()).toEqual(['id', 'text'])
  })

  test('does not run the action when the human cancels', async ({ page }) => {
    const text = `Cancelled ${Date.now()}`
    const pending = callTool(page, 'addTodo', { text })
    await cancel(page)
    expect(await pending).toEqual({ ok: false, error: { code: 'declined', message: 'The user declined this action.' } })
    await page.reload()
    await expect(page.getByTestId('todos')).not.toContainText(text)
  })

  test('treats Escape as a cancel', async ({ page }) => {
    const pending = callTool(page, 'addTodo', { text: `Escaped ${Date.now()}` })
    await expect(confirmDialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    expect(await pending).toMatchObject({ ok: false, error: { code: 'declined' } })
  })

  test('returns validation issues from the server without running the handler', async ({ page }) => {
    const before = await callTool(page, 'listTodos')
    const pending = callTool(page, 'addTodo', { text: '' })
    await allow(page)
    const output = await pending
    expect(output).toMatchObject({ ok: false, error: { code: 'invalid_input', message: 'Invalid input.' } })
    expect(output.ok ? [] : output.error.issues?.map((issue) => issue.path)).toEqual([['text']])
    expect(JSON.stringify(output)).not.toMatch(/node_modules|\.ts:\d+|stack/)
    expect(await callTool(page, 'listTodos')).toEqual(before)
  })

  test('returns the auth error of the action', async ({ context, page }) => {
    await context.clearCookies()
    expect(await callTool(page, 'listTodos')).toEqual({
      ok: false,
      error: { code: 'unauthorized', message: 'Sign in before using this tool.' },
    })
  })

  test('the confirmation dialog has no accessibility violations', async ({ page }) => {
    const pending = callTool(page, 'addTodo', { text: 'Accessible' })
    await expect(confirmDialog(page)).toBeVisible()
    const results = await new AxeBuilder({ page }).include('dialog[data-actionmcp-confirm]').analyze()
    expect(results.violations).toEqual([])
    await expect(confirmDialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused()
    await cancel(page)
    await pending
  })

  test('renders no devtools in production', async ({ page }) => {
    await expect(page.locator('[data-actionmcp-devtools]')).toHaveCount(0)
  })
})
