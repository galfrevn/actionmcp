import type { Page, Route } from '@playwright/test'

export type StreamChunk = Record<string, unknown>

export interface ChatRequest {
  messages: Array<{ role: string; parts: Array<Record<string, unknown>> }>
  tools: Array<{ name: string; description?: string; inputSchema?: unknown; annotations?: Record<string, boolean> }>
}

function streamBody(chunks: StreamChunk[]): string {
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`
}

export function toolCall(toolName: string, input: Record<string, unknown>): StreamChunk[] {
  return [
    { type: 'start', messageId: `message-${toolName}` },
    { type: 'start-step' },
    { type: 'tool-input-available', toolCallId: `call-${toolName}`, toolName, input, dynamic: true },
    { type: 'finish-step' },
    { type: 'finish' },
  ]
}

export function reply(text: string): StreamChunk[] {
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

export async function mockModel(page: Page, turns: StreamChunk[][]): Promise<ChatRequest[]> {
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

export function lastToolOutput(request: ChatRequest | undefined): unknown {
  const parts = request?.messages.flatMap((message) => message.parts) ?? []
  return parts.findLast((part) => part.type === 'dynamic-tool')?.output
}
