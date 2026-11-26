import { StrictMode, act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { succeed } from '../core/result'
import type { SerializableToolDef } from '../core/types'
import { loadPolyfill, type ModelContext } from '../core/webmcp'
import { ConfirmDialog } from './Confirm'
import type { ConfirmProps } from './context'
import { AgentToolsProvider } from './Provider'
import { Registrar } from './Registrar'

let context: ModelContext
let root: Root | undefined
let container: HTMLElement

const flush = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))

function createTool(overrides: Partial<SerializableToolDef> = {}): SerializableToolDef {
  return {
    name: 'deleteAccount',
    description: 'Permanently delete the account.',
    annotations: { readOnlyHint: false, consequentialHint: true, untrustedContentHint: false },
    confirm: 'consequential',
    action: vi.fn(async () => succeed({ deleted: true })),
    ...overrides,
  }
}

async function render(node: ReactNode): Promise<void> {
  if (!root) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  await act(async () => root?.render(node))
  await flush()
}

async function toolNames(): Promise<string[]> {
  return (await context.getTools()).map((tool) => tool.name)
}

async function execute(name: string, input: object = {}): Promise<{ output: Promise<unknown> }> {
  const tool = (await context.getTools()).find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Tool ${name} is not registered`)
  const output = context.executeTool(tool, input).then((serialized) => JSON.parse(serialized) as unknown)
  await flush()
  return { output }
}

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find((element) => element.textContent === label)
  if (!match) throw new Error(`No button labeled ${label}`)
  return match
}

beforeAll(async () => {
  Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
  const loaded = await loadPolyfill()
  if (!loaded) throw new Error('The polyfill did not install.')
  context = loaded
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  await flush()
})

describe('Registrar', () => {
  it('registers the tools and unregisters them on unmount', async () => {
    await render(<Registrar tools={[createTool(), createTool({ name: 'listTodos' })]} />)
    expect(await toolNames()).toEqual(['deleteAccount', 'listTodos'])
    await act(async () => root?.unmount())
    root = undefined
    expect(await toolNames()).toEqual([])
  })

  it('registers each tool once under StrictMode', async () => {
    await render(
      <StrictMode>
        <Registrar tools={[createTool()]} />
      </StrictMode>,
    )
    expect(await toolNames()).toEqual(['deleteAccount'])
  })

  it('exposes the definition without internal fields', async () => {
    const inputSchema = { type: 'object', properties: { id: { type: 'string' } } }
    await render(<Registrar tools={[createTool({ title: 'Delete account', inputSchema, adapter: 'formdata' })]} />)
    const [tool] = await context.getTools()
    expect(tool).toMatchObject({
      name: 'deleteAccount',
      title: 'Delete account',
      description: 'Permanently delete the account.',
      inputSchema,
      annotations: { readOnlyHint: false, consequentialHint: true, untrustedContentHint: false },
    })
  })

  it('logs a tool that the browser rejects in development', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await render(<Registrar tools={[createTool({ name: 'bad name' }), createTool()]} />)
    expect(await toolNames()).toEqual(['deleteAccount'])
    expect(logged).toHaveBeenCalledWith('actionmcp: the browser rejected the tool "bad name".', expect.any(DOMException))
    logged.mockRestore()
  })

  it('keeps the registration when the same definitions render again', async () => {
    const onChange = vi.fn()
    await render(<Registrar tools={[createTool()]} />)
    context.addEventListener('toolchange', onChange)
    await render(<Registrar tools={[createTool()]} />)
    expect(onChange).not.toHaveBeenCalled()
    context.removeEventListener('toolchange', onChange)
  })

  it('calls the latest action after a re-render', async () => {
    const first = createTool({ confirm: 'never' })
    const second = createTool({ confirm: 'never', action: vi.fn(async () => succeed('second')) })
    await render(<Registrar tools={[first]} />)
    await render(<Registrar tools={[second]} />)
    await expect((await execute('deleteAccount')).output).resolves.toEqual({ ok: true, data: 'second' })
    expect(first.action).not.toHaveBeenCalled()
  })

  it('registers again when the definitions change', async () => {
    await render(<Registrar tools={[createTool()]} />)
    await render(<Registrar tools={[createTool({ name: 'renamed' })]} />)
    expect(await toolNames()).toEqual(['renamed'])
  })

  it('blocks a consequential tool until a human allows it', async () => {
    const tool = createTool()
    await render(<Registrar tools={[tool]} />)
    let settled = false
    const execution = (await execute('deleteAccount', { id: 'u1' })).output.then((output) => {
      settled = true
      return output
    })
    const dialog = document.querySelector('dialog')
    expect(dialog?.hasAttribute('open')).toBe(true)
    expect(dialog?.textContent).toContain('deleteAccount')
    expect(dialog?.textContent).toContain('Permanently delete the account.')
    expect(dialog?.querySelector('dt')?.textContent).toBe('id')
    expect(dialog?.querySelector('dd')?.textContent).toBe('u1')
    expect(settled).toBe(false)
    expect(tool.action).not.toHaveBeenCalled()
    await act(async () => button('Allow').click())
    await expect(execution).resolves.toEqual({ ok: true, data: { deleted: true } })
    expect(tool.action).toHaveBeenCalledWith({ id: 'u1' })
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('does not run the action when the human cancels', async () => {
    const tool = createTool()
    await render(<Registrar tools={[tool]} />)
    const execution = (await execute('deleteAccount')).output
    await act(async () => button('Cancel').click())
    await expect(execution).resolves.toMatchObject({ ok: false, error: { code: 'declined' } })
    expect(tool.action).not.toHaveBeenCalled()
  })

  it('treats closing the dialog with Escape as a cancel', async () => {
    const tool = createTool()
    await render(<Registrar tools={[tool]} />)
    const execution = (await execute('deleteAccount')).output
    await act(async () => document.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true })))
    await expect(execution).resolves.toMatchObject({ ok: false, error: { code: 'declined' } })
    expect(tool.action).not.toHaveBeenCalled()
  })

  it('declines pending confirmations when it unmounts', async () => {
    const tool = createTool()
    await render(<Registrar tools={[tool]} />)
    const execution = (await execute('deleteAccount')).output
    await act(async () => root?.unmount())
    root = undefined
    await expect(execution).resolves.toMatchObject({ ok: false, error: { code: 'declined' } })
    expect(tool.action).not.toHaveBeenCalled()
  })

  it('shows one confirmation at a time', async () => {
    await render(<Registrar tools={[createTool(), createTool({ name: 'removeMember' })]} />)
    const first = (await execute('deleteAccount')).output
    const second = (await execute('removeMember')).output
    expect(document.querySelectorAll('dialog')).toHaveLength(1)
    await act(async () => button('Allow').click())
    await expect(first).resolves.toMatchObject({ ok: true })
    expect(document.querySelector('dialog')?.textContent).toContain('removeMember')
    await act(async () => button('Cancel').click())
    await expect(second).resolves.toMatchObject({ ok: false })
  })

  it('shows one confirmation at a time across two registrars', async () => {
    await render(
      <>
        <Registrar tools={[createTool()]} />
        <AgentToolsProvider confirmLabels={{ allow: 'Permitir' }}>
          <Registrar tools={[createTool({ name: 'removeMember' })]} />
        </AgentToolsProvider>
      </>,
    )
    const first = (await execute('deleteAccount')).output
    const second = (await execute('removeMember')).output
    expect(document.querySelectorAll('dialog')).toHaveLength(1)
    expect(document.querySelector('dialog')?.textContent).toContain('deleteAccount')
    await act(async () => button('Allow').click())
    await expect(first).resolves.toMatchObject({ ok: true })
    expect(document.querySelectorAll('dialog')).toHaveLength(1)
    expect(document.querySelector('dialog')?.textContent).toContain('removeMember')
    await act(async () => button('Permitir').click())
    await expect(second).resolves.toMatchObject({ ok: true })
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('shows the next confirmation of another registrar when the first one unmounts', async () => {
    const Page = ({ withFirst }: { withFirst: boolean }) => (
      <>
        {withFirst ? <Registrar tools={[createTool()]} /> : null}
        <Registrar tools={[createTool({ name: 'removeMember' })]} />
      </>
    )
    await render(<Page withFirst />)
    const first = (await execute('deleteAccount')).output
    const second = (await execute('removeMember')).output
    await render(<Page withFirst={false} />)
    await expect(first).resolves.toMatchObject({ ok: false, error: { code: 'declined' } })
    expect(document.querySelector('dialog')?.textContent).toContain('removeMember')
    await act(async () => button('Cancel').click())
    await expect(second).resolves.toMatchObject({ ok: false, error: { code: 'declined' } })
  })

  it('runs a read-only tool without a dialog', async () => {
    const tool = createTool({
      name: 'listTodos',
      annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: false },
      action: vi.fn(async () => succeed(['a'])),
    })
    await render(<Registrar tools={[tool]} />)
    await expect((await execute('listTodos')).output).resolves.toEqual({ ok: true, data: ['a'] })
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('reports notFound() in an action as the not_found code', async () => {
    const action = vi.fn(async () =>
      Promise.reject(Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })),
    )
    await render(<Registrar tools={[createTool({ confirm: 'never', action })]} />)
    await expect((await execute('deleteAccount')).output).resolves.toMatchObject({ ok: false, error: { code: 'not_found' } })
  })

  it('reports a redirect() as a navigation result', async () => {
    const action = vi.fn(async () => Promise.reject(Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;push;/done;307;' })))
    await render(<Registrar tools={[createTool({ confirm: 'never', action })]} />)
    await expect((await execute('deleteAccount')).output).resolves.toEqual({ ok: true, data: { navigatedTo: '/done' } })
  })
})

describe('AgentToolsProvider', () => {
  it('uses the custom confirm component', async () => {
    const AutoConfirm = ({ call, onConfirm }: ConfirmProps) => (
      <button type="button" onClick={onConfirm}>
        Approve {call.name}
      </button>
    )
    const tool = createTool()
    await render(
      <AgentToolsProvider confirmComponent={AutoConfirm}>
        <Registrar tools={[tool]} />
      </AgentToolsProvider>,
    )
    const execution = (await execute('deleteAccount')).output
    expect(document.querySelector('dialog')).toBeNull()
    await act(async () => button('Approve deleteAccount').click())
    await expect(execution).resolves.toMatchObject({ ok: true })
  })

  it('passes confirmLabels and the input schema to the dialog', async () => {
    const tool = createTool({ inputSchema: { type: 'object', properties: { id: { type: 'string', title: 'Account' } } } })
    await render(
      <AgentToolsProvider confirmLabels={{ allow: 'Permitir', cancel: 'Cancelar' }}>
        <Registrar tools={[tool]} />
      </AgentToolsProvider>,
    )
    const execution = (await execute('deleteAccount', { id: 'acme' })).output
    expect(document.querySelector('dialog dt')?.textContent).toBe('Account')
    expect(document.activeElement?.textContent).toBe('Cancelar')
    await act(async () => button('Permitir').click())
    await expect(execution).resolves.toMatchObject({ ok: true })
  })

  it('runs onBeforeExecute after the confirmation and onAfterExecute after the action', async () => {
    const order: string[] = []
    const tool = createTool({
      confirm: 'never',
      action: vi.fn(async () => {
        order.push('action')
        return succeed(1)
      }),
    })
    const onBeforeExecute = vi.fn(() => {
      order.push('before')
      return true
    })
    const onAfterExecute = vi.fn(() => {
      order.push('after')
    })
    await render(
      <AgentToolsProvider onBeforeExecute={onBeforeExecute} onAfterExecute={onAfterExecute}>
        <Registrar tools={[tool]} />
      </AgentToolsProvider>,
    )
    await expect((await execute('deleteAccount', { id: 1 })).output).resolves.toEqual({ ok: true, data: 1 })
    expect(order).toEqual(['before', 'action', 'after'])
    expect(onBeforeExecute).toHaveBeenCalledWith(expect.objectContaining({ name: 'deleteAccount', input: { id: 1 }, source: 'agent' }))
    expect(onAfterExecute).toHaveBeenCalledWith(expect.objectContaining({ name: 'deleteAccount' }), { ok: true, data: 1 })
  })

  it('blocks the call when onBeforeExecute returns false', async () => {
    const tool = createTool({ confirm: 'never' })
    await render(
      <AgentToolsProvider onBeforeExecute={() => false}>
        <Registrar tools={[tool]} />
      </AgentToolsProvider>,
    )
    await expect((await execute('deleteAccount')).output).resolves.toMatchObject({ ok: false, error: { code: 'blocked' } })
    expect(tool.action).not.toHaveBeenCalled()
  })
})

describe('ConfirmDialog', () => {
  it('labels the dialog with the tool title and description', async () => {
    const call = { name: 'team.invite', input: { email: 'ana@acme.com' }, annotations: createTool().annotations, source: 'agent' as const }
    await render(
      <ConfirmDialog call={call} title="Invite member" description="Invite a person." onConfirm={() => {}} onCancel={() => {}} />,
    )
    const dialog = document.querySelector('dialog')
    const label = document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '')
    const description = document.getElementById(dialog?.getAttribute('aria-describedby') ?? '')
    expect(label?.textContent).toContain('Invite member')
    expect(description?.textContent).toContain('Invite a person.')
    expect(dialog?.dataset.actionmcpConfirm).toBe('team.invite')
  })

  it('focuses Cancel so that Enter never approves by default', async () => {
    const call = { name: 'team.invite', input: {}, annotations: createTool().annotations, source: 'agent' as const }
    await render(<ConfirmDialog call={call} description="Invite a person." onConfirm={() => {}} onCancel={() => {}} />)
    expect(document.activeElement?.textContent).toBe('Cancel')
  })

  it('lists each input field with the title from the schema, or with its name', async () => {
    const call = {
      name: 'team.invite',
      input: { email: 'ana@acme.com', role: 'admin', seats: 3, tags: ['a', 'b'] },
      annotations: createTool().annotations,
      source: 'agent' as const,
    }
    const inputSchema = {
      type: 'object',
      properties: { email: { type: 'string', title: 'Email address' }, role: { type: 'string', title: ' ' } },
    }
    await render(
      <ConfirmDialog call={call} description="Invite a person." inputSchema={inputSchema} onConfirm={() => {}} onCancel={() => {}} />,
    )
    const names = [...document.querySelectorAll('dialog dt')].map((element) => element.textContent)
    const values = [...document.querySelectorAll('dialog dd')].map((element) => element.textContent)
    expect(names).toEqual(['Email address', 'role', 'seats (not in the schema)', 'tags (not in the schema)'])
    expect(values).toEqual(['ana@acme.com', 'admin', '3', JSON.stringify(['a', 'b'], null, 2)])
    expect(document.querySelector('[data-actionmcp-confirm-input]')?.getAttribute('aria-label')).toBe('Action input')
  })

  it('lists the fields in schema order and the undeclared fields after them, whatever order the call uses', async () => {
    const call = {
      name: 'payments.send',
      input: { 'Recipient (verified)': 'alice', note: 'Thanks', amount: 900, recipient: 'mallory' },
      annotations: createTool().annotations,
      source: 'agent' as const,
    }
    const inputSchema = {
      type: 'object',
      properties: {
        recipient: { type: 'string', title: 'Recipient' },
        amount: { type: 'number', title: 'Amount' },
        note: { type: 'string' },
      },
    }
    await render(
      <ConfirmDialog call={call} description="Send a payment." inputSchema={inputSchema} onConfirm={() => {}} onCancel={() => {}} />,
    )
    const names = [...document.querySelectorAll('dialog dt')].map((element) => element.textContent)
    const values = [...document.querySelectorAll('dialog dd')].map((element) => element.textContent)
    expect(names).toEqual(['Recipient', 'Amount', 'note', 'Recipient (verified) (not in the schema)'])
    expect(values).toEqual(['mallory', '900', 'Thanks', 'alice'])
  })

  it('scrolls a long value inside its own row so that it cannot hide the other fields', async () => {
    const call = {
      name: 'notes.add',
      input: { text: 'x'.repeat(500), lines: 'a\nb\nc\nd\ne', title: 'Short' },
      annotations: createTool().annotations,
      source: 'agent' as const,
    }
    await render(<ConfirmDialog call={call} description="Add a note." onConfirm={() => {}} onCancel={() => {}} />)
    const [text, lines, title] = [...document.querySelectorAll<HTMLElement>('dialog dd')]
    expect(text?.tabIndex).toBe(0)
    expect(text?.style.maxHeight).toBe('6rem')
    expect(text?.style.overflow).toBe('auto')
    expect(lines?.tabIndex).toBe(0)
    expect(title?.hasAttribute('tabindex')).toBe(false)
    expect(title?.style.maxHeight).toBe('')
    expect(document.querySelector<HTMLElement>('[data-actionmcp-confirm-input]')?.style.maxHeight).toBe('')
  })

  it('translates the label of an undeclared field', async () => {
    const call = { name: 'a', input: { extra: 1 }, annotations: createTool().annotations, source: 'agent' as const }
    const inputSchema = { type: 'object', properties: {} }
    await render(
      <ConfirmDialog
        call={call}
        description="Run it."
        inputSchema={inputSchema}
        labels={{ extra: 'fuera del schema' }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(document.querySelector('dialog dt')?.textContent).toBe('extra (fuera del schema)')
  })

  it('renders an input value as text and never as markup', async () => {
    const call = {
      name: 'notes.add',
      input: { text: '<img src=x onerror=alert(1)>' },
      annotations: createTool().annotations,
      source: 'agent' as const,
    }
    await render(<ConfirmDialog call={call} description="Add a note." onConfirm={() => {}} onCancel={() => {}} />)
    expect(document.querySelector('dialog img')).toBeNull()
    expect(document.querySelector('dialog dd')?.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('shows an input that is not an object as JSON and leaves out an empty input', async () => {
    const annotations = createTool().annotations
    await render(
      <ConfirmDialog
        call={{ name: 'a', input: [1, 2], annotations, source: 'agent' }}
        description="Run it."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(document.querySelector('[data-actionmcp-confirm-input]')?.textContent).toBe(JSON.stringify([1, 2], null, 2))
    await render(
      <ConfirmDialog
        call={{ name: 'a', input: {}, annotations, source: 'agent' }}
        description="Run it."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(document.querySelector('[data-actionmcp-confirm-input]')).toBeNull()
    await render(
      <ConfirmDialog
        call={{ name: 'a', input: undefined, annotations, source: 'agent' }}
        description="Run it."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(document.querySelector('[data-actionmcp-confirm-input]')).toBeNull()
  })

  it('replaces the labels that it receives and keeps the defaults for the rest', async () => {
    const call = { name: 'team.invite', input: { email: 'ana@acme.com' }, annotations: createTool().annotations, source: 'agent' as const }
    const labels = { title: '¿Permitir «{tool}»?', intro: 'Un agente quiere ejecutar esta acción.', allow: 'Permitir' }
    await render(
      <ConfirmDialog
        call={call}
        title="Invitar"
        description="Invita a una persona."
        labels={labels}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    const dialog = document.querySelector('dialog')
    expect(dialog?.querySelector('h2')?.textContent).toBe('¿Permitir «Invitar»?')
    expect(dialog?.querySelector('p')?.textContent).toBe('Un agente quiere ejecutar esta acción. Invita a una persona.')
    expect([...(dialog?.querySelectorAll('button') ?? [])].map((element) => element.textContent)).toEqual(['Cancel', 'Permitir'])
    expect(document.activeElement?.textContent).toBe('Cancel')
  })
})
