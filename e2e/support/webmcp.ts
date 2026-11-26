import { expect, type Page } from '@playwright/test'

export interface ToolSummary {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown> | null
  outputSchema: Record<string, unknown> | null
  annotations: { readOnlyHint?: boolean; consequentialHint?: boolean; untrustedContentHint?: boolean } | null
}

export type ToolOutput =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string; issues?: Array<{ message: string; path: Array<string | number> }> } }

export async function listTools(page: Page): Promise<ToolSummary[]> {
  return page.evaluate(async () => {
    const context = document.modelContext
    if (!context) return []
    const tools = await context.getTools()
    return tools.map(({ name, title, description, inputSchema, outputSchema, annotations }) => ({
      name,
      title,
      description,
      inputSchema: inputSchema as Record<string, unknown> | null,
      outputSchema: outputSchema as Record<string, unknown> | null,
      annotations,
    }))
  })
}

export async function toolNames(page: Page): Promise<string[]> {
  return (await listTools(page)).map((tool) => tool.name).toSorted()
}

export async function expectTools(page: Page, names: string[]): Promise<void> {
  await expect.poll(() => toolNames(page), { timeout: 15_000 }).toEqual(names.toSorted())
}

export function callTool(page: Page, name: string, input: Record<string, unknown> = {}): Promise<ToolOutput> {
  return page.evaluate(
    async ([toolName, toolInput]) => {
      const context = document.modelContext
      const tool = (await context?.getTools())?.find((candidate) => candidate.name === toolName)
      if (!context || !tool) throw new Error(`The tool "${toolName}" is not registered.`)
      return JSON.parse(await context.executeTool(tool, toolInput)) as ToolOutput
    },
    [name, input] as const,
  )
}

export function confirmDialog(page: Page) {
  return page.locator('dialog[data-actionmcp-confirm][open]')
}

export async function allow(page: Page): Promise<void> {
  await confirmDialog(page).getByRole('button', { name: 'Allow' }).click()
}

export async function cancel(page: Page): Promise<void> {
  await confirmDialog(page).getByRole('button', { name: 'Cancel' }).click()
}

export async function isSettled(promise: Promise<unknown>, withinMs: number): Promise<boolean> {
  let settled = false
  void promise.then(
    () => (settled = true),
    () => (settled = true),
  )
  await new Promise((resolve) => setTimeout(resolve, withinMs))
  return settled
}

export async function countToolChanges(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const state = window as unknown as { toolChanges: number }
    state.toolChanges = 0
    document.modelContext?.addEventListener('toolchange', () => {
      state.toolChanges += 1
    })
  })
  return () => page.evaluate(() => (window as unknown as { toolChanges: number }).toolChanges)
}
