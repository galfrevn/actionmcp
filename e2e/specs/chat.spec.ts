import { expect, test, type Page } from '@playwright/test'
import { lastToolOutput, mockModel, reply, toolCall } from '../support/chat'
import { exampleUrl } from '../support/fixtures'
import { allow, cancel, confirmDialog, expectTools } from '../support/webmcp'

const url = exampleUrl('chat')
const TOOLS = ['addTodo', 'listTodos', 'removeTodo', 'toggleTodo']

async function open(page: Page): Promise<void> {
  await page.goto(url)
  const signIn = page.getByRole('button', { name: 'Sign in as demo' })
  if (await signIn.isVisible()) await signIn.click()
  await expectTools(page, TOOLS)
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled()
}

test.describe('chat example: in-app assistant over the WebMCP transport', () => {
  test('sends the page tools to the server and runs a tool call in the browser', async ({ page }, testInfo) => {
    const text = `Chat todo ${testInfo.project.name} ${Date.now()}`
    const requests = await mockModel(page, [toolCall('addTodo', { text }), reply('I added it to your list.')])
    await open(page)

    await page.getByLabel('Message').fill('Add a todo')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(confirmDialog(page)).toContainText(text)
    await allow(page)
    await expect(page.getByTestId('messages')).toContainText('I added it to your list.')
    await expect(page.getByRole('listitem').filter({ hasText: text })).toBeVisible()

    expect(requests).toHaveLength(2)
    expect(requests[0]?.tools.map((tool) => tool.name).toSorted()).toEqual(TOOLS)
    expect(requests[0]?.tools.find((tool) => tool.name === 'addTodo')).toMatchObject({
      description: 'Add an item to the todo list of the signed-in user. Returns the created item.',
      inputSchema: { type: 'object', required: ['text'] },
      annotations: { readOnlyHint: false },
    })
    expect(JSON.stringify(lastToolOutput(requests[1]))).toContain(text)
  })

  test('returns a declined confirmation to the model without running the action', async ({ page }, testInfo) => {
    const text = `Declined todo ${testInfo.project.name} ${Date.now()}`
    const requests = await mockModel(page, [toolCall('addTodo', { text }), reply('I did not add it.')])
    await open(page)

    await page.getByLabel('Message').fill('Add a todo')
    await page.getByRole('button', { name: 'Send' }).click()
    await cancel(page)

    await expect(page.getByTestId('messages')).toContainText('I did not add it.')
    await expect(page.getByRole('listitem').filter({ hasText: text })).toHaveCount(0)
    expect(JSON.stringify(lastToolOutput(requests[1]))).toContain('The user declined this action.')
  })

  test('the route requires a session', async ({ request }) => {
    const response = await request.post(`${url}api/chat`, { data: { messages: [], tools: [] } })
    expect(response.status()).toBe(401)
  })

  test('the route accepts reasoning and provider parts from the model and rejects attachments', async ({ page }) => {
    await open(page)
    const tools = [{ name: 'listTodos', description: 'List the todos.', inputSchema: { type: 'object' } }]
    const user = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'What is on my list?' }] }
    const post = (parts: Array<Record<string, unknown>>) =>
      page.evaluate(
        async (body) => {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          await response.body?.cancel()
          return response.status
        },
        { tools, messages: [user, { id: 'a1', role: 'assistant', parts }] },
      )
    const toolResult = {
      type: 'dynamic-tool',
      toolName: 'listTodos',
      toolCallId: 'call-1',
      state: 'output-available',
      input: {},
      output: { content: [{ type: 'text', text: '{"ok":true,"data":[]}' }] },
    }
    expect(await post([{ type: 'step-start' }, { type: 'reasoning', text: 'Read the list first.', state: 'done' }, toolResult])).toBe(200)
    const providerPart = { type: 'custom', kind: 'anthropic.message_start', providerMetadata: { anthropic: { id: 'msg_1' } } }
    expect(await post([{ type: 'step-start' }, providerPart, toolResult])).toBe(200)
    expect(await post([{ type: 'file', mediaType: 'image/png', url: 'https://example.com/a.png' }])).toBe(400)
  })

  test('the route rejects more than 32 tool definitions and invalid definitions', async ({ page }) => {
    await open(page)
    const post = (tools: unknown) =>
      page.evaluate(
        async (body) =>
          (await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
            .status,
        { messages: [], tools },
      )
    const definition = (index: number) => ({ name: `tool${index}`, description: 'A tool.', inputSchema: { type: 'object' } })
    expect(await post(Array.from({ length: 33 }, (_value, index) => definition(index)))).toBe(400)
    expect(await post('not an array')).toBe(400)
    expect(await post([{ name: 'broken' }, { name: 'broken' }])).toBe(400)
  })
})
