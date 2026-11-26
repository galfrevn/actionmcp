import { expect, test, type Page, type Route } from '@playwright/test'
import { exampleUrl } from '../support/fixtures'
import { allow, cancel, confirmDialog, expectTools } from '../support/webmcp'

const url = exampleUrl('chat')
const TOOLS = ['addTodo', 'listTodos', 'removeTodo', 'toggleTodo']

type StreamChunk = Record<string, unknown>

interface ChatRequest {
  messages: Array<{ role: string; parts: Array<Record<string, unknown>> }>
  tools: Array<{ name: string; description?: string; inputSchema?: unknown; annotations?: Record<string, boolean> }>
}

function streamBody(chunks: StreamChunk[]): string {
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`
}

function toolCall(toolName: string, input: Record<string, unknown>): StreamChunk[] {
  return [
    { type: 'start', messageId: `message-${toolName}` },
    { type: 'start-step' },
    { type: 'tool-input-available', toolCallId: `call-${toolName}`, toolName, input, dynamic: true },
    { type: 'finish-step' },
    { type: 'finish' },
  ]
}

function reply(text: string): StreamChunk[] {
  return [
    { type: 'start', messageId: 'message-reply' },
    { type: 'start-step' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: text },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish-step' },
    { type: 'finish' },
  ]
}

async function mockModel(page: Page, turns: StreamChunk[][]): Promise<ChatRequest[]> {
  const requests: ChatRequest[] = []
  await page.route('**/api/chat', async (route: Route) => {
    requests.push(route.request().postDataJSON() as ChatRequest)
    const chunks = turns[requests.length - 1] ?? reply('Done.')
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
      body: streamBody(chunks),
    })
  })
  return requests
}

async function open(page: Page): Promise<void> {
  await page.goto(url)
  const signIn = page.getByRole('button', { name: 'Sign in as demo' })
  if (await signIn.isVisible()) await signIn.click()
  await expectTools(page, TOOLS)
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled()
}

function lastToolOutput(request: ChatRequest | undefined): unknown {
  const parts = request?.messages.flatMap((message) => message.parts) ?? []
  return parts.findLast((part) => part.type === 'dynamic-tool')?.output
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

  test('the route rejects more than 32 tool definitions and invalid definitions', async ({ page }) => {
    await open(page)
    const post = (tools: unknown) =>
      page.evaluate(
        async (body) => (await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).status,
        { messages: [], tools },
      )
    const definition = (index: number) => ({ name: `tool${index}`, description: 'A tool.', inputSchema: { type: 'object' } })
    expect(await post(Array.from({ length: 33 }, (_value, index) => definition(index)))).toBe(400)
    expect(await post('not an array')).toBe(400)
    expect(await post([{ name: 'broken' }, { name: 'broken' }])).toBe(400)
  })
})
