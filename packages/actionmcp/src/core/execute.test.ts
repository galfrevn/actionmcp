import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeToToolCalls, type ToolCallRecord } from './events'
import { executeTool, requiresConfirmation, type ToolRuntime } from './execute'
import { BLOCKED_MESSAGE, DECLINED_MESSAGE, GENERIC_FAILURE_MESSAGE, fail, succeed } from './result'
import type { ConfirmPolicy, SerializableToolDef, ToolAnnotations } from './types'

const readOnly: ToolAnnotations = { readOnlyHint: true, consequentialHint: false, untrustedContentHint: false }
const consequential: ToolAnnotations = { readOnlyHint: false, consequentialHint: true, untrustedContentHint: false }

function createTool(overrides: Partial<SerializableToolDef> = {}): SerializableToolDef {
  return {
    name: 'deleteAccount',
    description: 'Delete the account.',
    annotations: consequential,
    confirm: 'consequential',
    action: vi.fn(async () => succeed({ deleted: true })),
    ...overrides,
  }
}

function createRuntime(overrides: Partial<ToolRuntime> = {}): ToolRuntime {
  return { confirm: vi.fn(async () => true), ...overrides }
}

const neverAborted = () => new AbortController().signal

describe('requiresConfirmation', () => {
  it.each<[ConfirmPolicy, ToolAnnotations, boolean]>([
    ['always', readOnly, true],
    ['always', consequential, true],
    ['consequential', readOnly, false],
    ['consequential', consequential, true],
    ['never', readOnly, false],
    ['never', consequential, false],
  ])('confirm=%s with %j requires confirmation: %s', (confirm, annotations, expected) => {
    expect(requiresConfirmation({ confirm, annotations })).toBe(expected)
  })

  it.each(['Always', 'sometimes', '', undefined])('asks for confirmation when the policy is the unknown value %j', (confirm) => {
    expect(requiresConfirmation({ confirm: confirm as never, annotations: readOnly })).toBe(true)
    expect(requiresConfirmation({ confirm: confirm as never, annotations: consequential })).toBe(true)
  })

  it('asks for confirmation when the consequential hint is missing', () => {
    expect(requiresConfirmation({ confirm: 'consequential', annotations: { readOnlyHint: false } as never })).toBe(true)
  })
})

describe('executeTool', () => {
  let unsubscribe = () => {}

  afterEach(() => unsubscribe())

  function recordCalls(): ToolCallRecord[] {
    const records: ToolCallRecord[] = []
    unsubscribe = subscribeToToolCalls((record) => records.push(record))
    return records
  }

  it('runs a read-only tool without asking for confirmation', async () => {
    const tool = createTool({ annotations: readOnly, action: vi.fn(async () => succeed(['a'])) })
    const runtime = createRuntime()
    await expect(executeTool(tool, {}, neverAborted(), runtime)).resolves.toEqual({ ok: true, data: ['a'] })
    expect(runtime.confirm).not.toHaveBeenCalled()
  })

  it('asks for confirmation before a consequential tool and then runs it', async () => {
    const order: string[] = []
    const tool = createTool({
      action: vi.fn(async () => {
        order.push('action')
        return succeed(1)
      }),
    })
    const runtime = createRuntime({
      confirm: vi.fn(async () => {
        order.push('confirm')
        return true
      }),
    })
    const input = { id: 'u1' }
    await executeTool(tool, input, neverAborted(), runtime)
    expect(order).toEqual(['confirm', 'action'])
    expect(runtime.confirm).toHaveBeenCalledWith(
      { name: 'deleteAccount', input, annotations: consequential, source: 'agent' },
      tool,
      expect.any(AbortSignal),
    )
  })

  it('does not run the action when the user declines', async () => {
    const tool = createTool()
    const runtime = createRuntime({ confirm: vi.fn(async () => false) })
    await expect(executeTool(tool, {}, neverAborted(), runtime)).resolves.toEqual(fail('declined', DECLINED_MESSAGE))
    expect(tool.action).not.toHaveBeenCalled()
  })

  it('does not run the action until the confirmation settles', async () => {
    const tool = createTool()
    let accept: (accepted: boolean) => void = () => {}
    const runtime = createRuntime({ confirm: () => new Promise<boolean>((resolve) => (accept = resolve)) })
    let settled = false
    const execution = executeTool(tool, {}, neverAborted(), runtime).then((output) => {
      settled = true
      return output
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(settled).toBe(false)
    expect(tool.action).not.toHaveBeenCalled()
    accept(true)
    await expect(execution).resolves.toEqual({ ok: true, data: { deleted: true } })
  })

  it('does not run the action when onBeforeExecute returns false', async () => {
    const tool = createTool({ confirm: 'never' })
    const runtime = createRuntime({ onBeforeExecute: async () => false })
    await expect(executeTool(tool, {}, neverAborted(), runtime)).resolves.toEqual(fail('blocked', BLOCKED_MESSAGE))
    expect(tool.action).not.toHaveBeenCalled()
  })

  it('reports the result to onAfterExecute', async () => {
    const onAfterExecute = vi.fn()
    const tool = createTool({ confirm: 'never' })
    await executeTool(tool, { id: 1 }, neverAborted(), createRuntime({ onBeforeExecute: () => true, onAfterExecute }))
    expect(onAfterExecute).toHaveBeenCalledWith(expect.objectContaining({ name: 'deleteAccount', input: { id: 1 } }), {
      ok: true,
      data: { deleted: true },
    })
  })

  it('blocks the call and does not run the action when onBeforeExecute throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tool = createTool({ confirm: 'never' })
    const runtime = createRuntime({
      onBeforeExecute: async () => {
        throw new Error('gate offline')
      },
    })
    await expect(executeTool(tool, {}, neverAborted(), runtime)).resolves.toEqual(fail('blocked', BLOCKED_MESSAGE))
    expect(tool.action).not.toHaveBeenCalled()
    expect(logged).toHaveBeenCalledOnce()
    logged.mockRestore()
  })

  it('returns the result of an action that ran when onAfterExecute throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tool = createTool({ confirm: 'never' })
    const runtime = createRuntime({
      onAfterExecute: () => {
        throw new Error('analytics offline')
      },
    })
    await expect(executeTool(tool, {}, neverAborted(), runtime)).resolves.toEqual({ ok: true, data: { deleted: true } })
    expect(tool.action).toHaveBeenCalledOnce()
    expect(logged).toHaveBeenCalledOnce()
    logged.mockRestore()
  })

  it('returns the result of an action that ran when a tool call listener throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const records: ToolCallRecord[] = []
    const unsubscribeFailing = subscribeToToolCalls(() => {
      throw new Error('panel crashed')
    })
    const unsubscribeRecording = subscribeToToolCalls((record) => records.push(record))
    const tool = createTool({ confirm: 'never' })
    await expect(executeTool(tool, {}, neverAborted(), createRuntime())).resolves.toEqual({ ok: true, data: { deleted: true } })
    expect(records).toHaveLength(1)
    expect(logged).toHaveBeenCalledOnce()
    unsubscribeFailing()
    unsubscribeRecording()
    logged.mockRestore()
  })

  it('calls a FormData action with (undefined, FormData)', async () => {
    const action = vi.fn(async (_previous: unknown, formData: FormData) => ({ success: `Invited ${String(formData.get('email'))}` }))
    const tool = createTool({ adapter: 'formdata', confirm: 'never', action })
    const output = await executeTool(tool, { email: 'ana@acme.com', notify: true }, neverAborted(), createRuntime())
    expect(output).toEqual({ ok: true, data: { success: 'Invited ana@acme.com' } })
    const [previous, formData] = action.mock.calls[0] ?? []
    expect(previous).toBeUndefined()
    expect(formData?.get('notify')).toBe('on')
  })

  it('passes the initial state of a FormData action', async () => {
    const action = vi.fn(async (previous: { count: number }, _formData: FormData) => ({ count: previous.count + 1 }))
    const tool = createTool({ adapter: 'formdata', confirm: 'never', initialState: { count: 1 }, action })
    await expect(executeTool(tool, {}, neverAborted(), createRuntime())).resolves.toEqual({ ok: true, data: { count: 2 } })
    expect(action.mock.calls[0]?.[0]).toEqual({ count: 1 })
  })

  it('calls a form action with (FormData)', async () => {
    const action = vi.fn(async (formData: FormData) => ({ title: String(formData.get('title')) }))
    const tool = createTool({ adapter: 'form', confirm: 'never', action })
    await expect(executeTool(tool, { title: 'Hello' }, neverAborted(), createRuntime())).resolves.toEqual({
      ok: true,
      data: { title: 'Hello' },
    })
    expect(action.mock.calls[0]).toHaveLength(1)
  })

  it('unwraps a safe-action result', async () => {
    const tool = createTool({ adapter: 'safe-action', confirm: 'never', action: async () => ({ data: { id: 3 } }) })
    await expect(executeTool(tool, {}, neverAborted(), createRuntime())).resolves.toEqual({ ok: true, data: { id: 3 } })
  })

  it('returns a failure when the action throws', async () => {
    const tool = createTool({ confirm: 'never', action: async () => Promise.reject(new Error('Network down')) })
    await expect(executeTool(tool, {}, neverAborted(), createRuntime())).resolves.toEqual(fail('failed', 'Network down'))
  })

  it('returns a generic failure when the action throws a non-error', async () => {
    const tool = createTool({ confirm: 'never', action: async () => Promise.reject('nope') })
    await expect(executeTool(tool, {}, neverAborted(), createRuntime())).resolves.toEqual(fail('failed', GENERIC_FAILURE_MESSAGE))
  })

  it('lets the runtime recover a thrown error', async () => {
    const tool = createTool({ confirm: 'never', action: async () => Promise.reject(new Error('redirect')) })
    const runtime = createRuntime({ recoverError: () => succeed({ navigatedTo: '/done' }) })
    await expect(executeTool(tool, {}, neverAborted(), runtime)).resolves.toEqual({ ok: true, data: { navigatedTo: '/done' } })
  })

  it('rejects with AbortError when the signal is already aborted', async () => {
    const tool = createTool({ confirm: 'never' })
    const controller = new AbortController()
    controller.abort()
    await expect(executeTool(tool, {}, controller.signal, createRuntime())).rejects.toMatchObject({ name: 'AbortError' })
    expect(tool.action).not.toHaveBeenCalled()
  })

  it('rejects with AbortError when the call is cancelled during confirmation', async () => {
    const tool = createTool()
    const controller = new AbortController()
    const runtime = createRuntime({ confirm: () => new Promise<boolean>(() => {}) })
    const execution = executeTool(tool, {}, controller.signal, runtime)
    controller.abort()
    await expect(execution).rejects.toMatchObject({ name: 'AbortError' })
    expect(tool.action).not.toHaveBeenCalled()
  })

  it('rejects a cancelled call whose action is running and still reports the result of the action', async () => {
    const records = recordCalls()
    let finish: (value: unknown) => void = () => {}
    const tool = createTool({ confirm: 'never', action: vi.fn(() => new Promise((resolve) => (finish = resolve))) })
    const onAfterExecute = vi.fn()
    const controller = new AbortController()
    const execution = executeTool(tool, { id: 1 }, controller.signal, createRuntime({ onAfterExecute }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(tool.action).toHaveBeenCalledOnce()
    controller.abort()
    await expect(execution).rejects.toMatchObject({ name: 'AbortError' })
    expect(records).toEqual([])
    finish(succeed({ charged: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onAfterExecute).toHaveBeenCalledWith(expect.objectContaining({ name: 'deleteAccount' }), { ok: true, data: { charged: true } })
    expect(records.map((record) => [record.cancelled, record.result])).toEqual([[true, { ok: true, data: { charged: true } }]])
  })

  it('marks a call cancelled before its action ran', async () => {
    const records = recordCalls()
    const controller = new AbortController()
    const execution = executeTool(createTool(), {}, controller.signal, createRuntime({ confirm: () => new Promise<boolean>(() => {}) }))
    controller.abort()
    await expect(execution).rejects.toMatchObject({ name: 'AbortError' })
    expect(records.map((record) => [record.cancelled, record.result])).toEqual([[true, { aborted: true }]])
  })

  it('publishes a record for each call', async () => {
    const records = recordCalls()
    await executeTool(createTool(), { id: 1 }, neverAborted(), createRuntime())
    await executeTool(createTool(), {}, neverAborted(), createRuntime({ confirm: async () => false }))
    const controller = new AbortController()
    controller.abort()
    await executeTool(createTool(), {}, controller.signal, createRuntime()).catch(() => undefined)
    expect(records.map((record) => [record.name, record.confirmation, record.result])).toEqual([
      ['deleteAccount', 'accepted', { ok: true, data: { deleted: true } }],
      ['deleteAccount', 'declined', fail('declined', DECLINED_MESSAGE)],
      ['deleteAccount', 'none', { aborted: true }],
    ])
    expect(records.every((record) => record.durationMs >= 0)).toBe(true)
    expect(records.map((record) => record.cancelled)).toEqual([false, false, true])
  })
})
