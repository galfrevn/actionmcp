import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { publishToolCall } from '../core/events'
import { succeed } from '../core/result'
import type { SerializableToolDef } from '../core/types'
import { loadPolyfill } from '../core/webmcp'
import { DevtoolsPanel } from './DevtoolsPanel'
import { Registrar } from './Registrar'

let root: Root | undefined
let container: HTMLElement

const flush = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))

const listTodos: SerializableToolDef = {
  name: 'listTodos',
  description: 'List the todos of the signed-in user.',
  inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
  annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: true },
  confirm: 'consequential',
  action: vi.fn(async (input: { limit?: number }) => succeed({ limit: input.limit ?? null })),
}

async function render(node: ReactNode): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(node))
  await flush()
}

function find(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`No element matches ${selector}`)
  return element
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => element.click())
  await flush()
}

async function type(element: HTMLTextAreaElement, value: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  await act(async () => {
    setValue?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeAll(async () => {
  Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
  await loadPolyfill()
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  await flush()
})

describe('DevtoolsPanel', () => {
  it('counts the registered tools and stays closed until the toggle is selected', async () => {
    await render(
      <>
        <Registrar tools={[listTodos]} />
        <DevtoolsPanel />
      </>,
    )
    expect(find('[data-actionmcp-devtools="toggle"]').textContent).toBe('Agent tools · 1')
    expect(document.querySelector('[data-actionmcp-devtools="panel"]')).toBeNull()
  })

  it('reports the polyfill, describes a tool, runs it with JSON input, and records the call', async () => {
    await render(
      <>
        <Registrar tools={[listTodos]} />
        <DevtoolsPanel />
      </>,
    )
    await click(find('[data-actionmcp-devtools="toggle"]'))
    expect(find('[data-actionmcp-devtools="status"]').textContent).toBe('WebMCP: polyfill (native agents do not see these tools)')
    expect(find('[data-actionmcp-devtools="panel"]').textContent).toContain('No calls yet.')

    const tool = find('[data-actionmcp-devtools="panel"] button[aria-pressed]')
    expect(tool.textContent).toBe('listTodos · read-only, untrusted output')
    await click(tool)
    expect(find('[data-actionmcp-devtools="panel"]').textContent).toContain('List the todos of the signed-in user.')

    await type(find('[data-actionmcp-devtools="panel"] textarea') as HTMLTextAreaElement, '{"limit":3}')
    await click(find('[data-actionmcp-devtools="run"]'))
    expect(listTodos.action).toHaveBeenCalledWith({ limit: 3 })
    expect(JSON.parse(find('[data-actionmcp-devtools="output"]').textContent ?? '')).toEqual({ ok: true, data: { limit: 3 } })
    expect(find('[data-actionmcp-devtools="call"] summary').textContent).toMatch(/^listTodos · \d+ ms · confirmation none$/)
  })

  it('marks a call that the agent cancelled', async () => {
    await render(<DevtoolsPanel />)
    await click(find('[data-actionmcp-devtools="toggle"]'))
    await act(async () =>
      publishToolCall({
        name: 'charge',
        input: {},
        startedAt: 1,
        durationMs: 5,
        confirmation: 'accepted',
        cancelled: true,
        result: { ok: true, data: { charged: true } },
      }),
    )
    expect(find('[data-actionmcp-devtools="call"] summary').textContent).toBe(
      'charge · 5 ms · confirmation accepted · cancelled by the agent',
    )
  })

  it('shows the error when the input is not JSON', async () => {
    await render(
      <>
        <Registrar tools={[listTodos]} />
        <DevtoolsPanel />
      </>,
    )
    await click(find('[data-actionmcp-devtools="toggle"]'))
    await click(find('[data-actionmcp-devtools="panel"] button[aria-pressed]'))
    await type(find('[data-actionmcp-devtools="panel"] textarea') as HTMLTextAreaElement, '{not json')
    await click(find('[data-actionmcp-devtools="run"]'))
    expect(find('[data-actionmcp-devtools="output"]').textContent).toMatch(/^SyntaxError: /)
  })

  it('labels consequential tools and tools without annotations, and shows a missing input schema', async () => {
    const annotations = { readOnlyHint: false, consequentialHint: false, untrustedContentHint: false }
    const tools: SerializableToolDef[] = [
      { ...listTodos, name: 'deleteAccount', annotations: { ...annotations, consequentialHint: true }, confirm: 'never' },
      {
        name: 'ping',
        description: 'Check that the session is valid.',
        annotations,
        confirm: 'never',
        action: vi.fn(async () => succeed('pong')),
      },
    ]
    await render(
      <>
        <Registrar tools={tools} />
        <DevtoolsPanel />
      </>,
    )
    await click(find('[data-actionmcp-devtools="toggle"]'))
    const labels = [...document.querySelectorAll('[data-actionmcp-devtools="panel"] button[aria-pressed]')].map(
      (button) => button.textContent,
    )
    expect(labels).toEqual(['deleteAccount · consequential', 'ping · no annotations'])
    await click(find('[data-actionmcp-devtools="panel"] button[aria-pressed]:nth-of-type(2)'))
    expect(find('[data-actionmcp-devtools="panel"] pre').textContent).toBe('No input schema')
    await click(find('[data-actionmcp-devtools="run"]'))
    expect(JSON.parse(find('[data-actionmcp-devtools="output"]').textContent ?? '')).toEqual({ ok: true, data: 'pong' })
  })

  it('says that no tools are registered on an empty page', async () => {
    await render(<DevtoolsPanel />)
    await click(find('[data-actionmcp-devtools="toggle"]'))
    expect(find('[data-actionmcp-devtools="panel"]').textContent).toContain('No tools are registered on this page.')
  })
})
