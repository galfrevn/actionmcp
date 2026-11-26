import { expect, test } from '@playwright/test'
import { fixtureUrl } from '../support/fixtures'
import { allow, callTool, expectTools, listTools } from '../support/webmcp'

const url = fixtureUrl('jsdoc')

test.describe('jsdoc fixture: @agent tags', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([{ name: 'user', value: 'ana', url }])
    await page.goto(url)
    await expectTools(page, ['searchTasks', 'task.rename'])
  })

  test('exposes only the tagged functions', async ({ page }) => {
    expect((await listTools(page)).map((tool) => tool.name)).not.toContain('deleteAllTasks')
  })

  test('infers optional fields, enums, unions, and property descriptions from the types', async ({ page }) => {
    const tools = await listTools(page)
    expect(tools.find((tool) => tool.name === 'searchTasks')).toMatchObject({
      description: 'Search the tasks of the current workspace. Returns the matching tasks.',
      annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text search over task titles.' },
          priority: { type: 'string', enum: ['low', 'high'] },
          assignee: {
            description: 'Who the task is assigned to.',
            anyOf: [
              { type: 'object', properties: { kind: { type: 'string', const: 'user' }, id: { type: 'string' } }, required: ['kind', 'id'] },
              { type: 'object', properties: { kind: { type: 'string', const: 'team' }, slug: { type: 'string' } }, required: ['kind', 'slug'] },
            ],
          },
        },
      },
    })
    expect(tools.find((tool) => tool.name === 'searchTasks')?.inputSchema).not.toHaveProperty('required')
    expect(tools.find((tool) => tool.name === 'task.rename')).toMatchObject({
      annotations: { readOnlyHint: false, consequentialHint: true },
      inputSchema: { required: ['taskId', 'title'] },
    })
  })

  test('runs a read-only tool with a union input', async ({ page }) => {
    const output = await callTool(page, 'searchTasks', { priority: 'low', assignee: { kind: 'team', slug: 'design' } })
    expect(output).toMatchObject({ ok: true, data: [{ id: 't2', priority: 'low', assignee: 'design' }] })
  })

  test('asks for confirmation before a consequential tool and revalidates the UI', async ({ page }, testInfo) => {
    const title = `Renamed by ${testInfo.project.name} ${Date.now()}`
    const pending = callTool(page, 'task.rename', { taskId: 't1', title })
    await allow(page)
    expect(await pending).toMatchObject({ ok: true, data: { id: 't1', title } })
    await expect(page.getByTestId('tasks')).toContainText(title)
  })

  test('returns the error of an action that validates by hand', async ({ page }) => {
    const pending = callTool(page, 'task.rename', { taskId: 'missing', title: 'New title' })
    await allow(page)
    expect(await pending).toEqual({ ok: false, error: { code: 'failed', message: 'There is no task with the id missing.' } })
  })
})
