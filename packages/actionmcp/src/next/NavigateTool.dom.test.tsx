import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RouteEntry } from '../core/types'
import { loadPolyfill, type ModelContext } from '../core/webmcp'
import { NavigateTool } from './NavigateTool'

const push = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const routes: RouteEntry[] = [
  { pattern: '/', params: [] },
  { pattern: '/projects/[id]', params: ['id'] },
]

let context: ModelContext
let root: Root | undefined
let container: HTMLElement

const flush = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))

async function render(name?: string): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(<NavigateTool routes={routes} name={name} />))
  await flush()
}

async function call(name: string, input: object): Promise<unknown> {
  const tool = (await context.getTools()).find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Tool ${name} is not registered`)
  const output = context.executeTool(tool, input)
  await flush()
  return JSON.parse(await output) as unknown
}

beforeAll(async () => {
  Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
  const loaded = await loadPolyfill()
  if (!loaded) throw new Error('The polyfill did not install.')
  context = loaded
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  push.mockClear()
  await flush()
})

describe('NavigateTool', () => {
  it('registers a tool that lists the routes and needs no confirmation', async () => {
    await render()
    const [tool] = await context.getTools()
    expect(tool).toMatchObject({ name: 'navigate', annotations: { readOnlyHint: false } })
    expect(JSON.stringify(tool?.inputSchema)).toContain('"enum":["/","/projects/[id]"]')
  })

  it('pushes the URL that it builds from the route, the parameters, and the query', async () => {
    await render()
    const output = await call('navigate', { route: '/projects/[id]', params: { id: 'a b' }, query: { tab: 'members' } })
    expect(output).toEqual({ ok: true, data: { url: '/projects/a%20b?tab=members' } })
    expect(push).toHaveBeenCalledExactlyOnceWith('/projects/a%20b?tab=members')
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('returns invalid_input and does not navigate for a route outside the list or a dot segment', async () => {
    await render('app.navigate')
    expect(await call('app.navigate', { route: '/admin' })).toMatchObject({ ok: false, error: { code: 'invalid_input' } })
    expect(await call('app.navigate', { route: '/projects/[id]', params: { id: '..' } })).toMatchObject({
      ok: false,
      error: { code: 'invalid_input' },
    })
    expect(push).not.toHaveBeenCalled()
  })
})
