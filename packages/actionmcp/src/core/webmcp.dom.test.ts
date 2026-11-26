import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  AVAILABILITY_CHECK_DELAYS_MS,
  getModelContext,
  getWebMCPStatus,
  loadPolyfill,
  registerTools,
  resolveModelContext,
  whenModelContextAvailable,
  type ModelContext,
  type ModelContextTool,
} from './webmcp'

function createTool(name: string, description = 'A test tool.'): ModelContextTool {
  return { name, description, execute: async () => ({ ok: true, data: name }) }
}

async function toolNames(context: ModelContext): Promise<string[]> {
  return (await context.getTools()).map((tool) => tool.name)
}

describe('without WebMCP', () => {
  it('finds no model context', () => {
    expect(getModelContext()).toBeUndefined()
    expect(getWebMCPStatus()).toBe('unavailable')
  })

  it('stops waiting when the signal aborts', async () => {
    const controller = new AbortController()
    const pending = whenModelContextAvailable(controller.signal)
    controller.abort()
    await expect(pending).resolves.toBeUndefined()
  })

  describe('a context that is installed after the page loads', () => {
    const lateContext = { registerTool: async () => {} } as unknown as ModelContext
    const totalDelay = AVAILABILITY_CHECK_DELAYS_MS.reduce((total, delay) => total + delay, 0)

    afterEach(() => {
      vi.useRealTimers()
      Reflect.deleteProperty(document, 'modelContext')
    })

    it('resolves waiting callers at the next check', async () => {
      vi.useFakeTimers()
      const first = whenModelContextAvailable(new AbortController().signal)
      const second = resolveModelContext(false, new AbortController().signal)
      await vi.advanceTimersByTimeAsync(AVAILABILITY_CHECK_DELAYS_MS[0] ?? 0)
      Object.defineProperty(document, 'modelContext', { value: lateContext, configurable: true })
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(AVAILABILITY_CHECK_DELAYS_MS[1] ?? 0)
      await expect(first).resolves.toBe(lateContext)
      await expect(second).resolves.toBe(lateContext)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('stops checking after the last delay and checks again for a later caller', async () => {
      vi.useFakeTimers()
      const controller = new AbortController()
      const early = whenModelContextAvailable(controller.signal)
      await vi.advanceTimersByTimeAsync(totalDelay)
      expect(vi.getTimerCount()).toBe(0)
      Object.defineProperty(document, 'modelContext', { value: lateContext, configurable: true })
      await vi.advanceTimersByTimeAsync(totalDelay)
      controller.abort()
      await expect(early).resolves.toBeUndefined()

      Reflect.deleteProperty(document, 'modelContext')
      const later = whenModelContextAvailable(new AbortController().signal)
      expect(vi.getTimerCount()).toBe(1)
      Object.defineProperty(document, 'modelContext', { value: lateContext, configurable: true })
      await vi.advanceTimersByTimeAsync(AVAILABILITY_CHECK_DELAYS_MS[0] ?? 0)
      await expect(later).resolves.toBe(lateContext)
    })

    it('stops checking when every caller has aborted', async () => {
      vi.useFakeTimers()
      const controller = new AbortController()
      const pending = whenModelContextAvailable(controller.signal)
      expect(vi.getTimerCount()).toBe(1)
      controller.abort()
      await expect(pending).resolves.toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('does not wait for a signal that is already aborted', async () => {
      vi.useFakeTimers()
      await expect(whenModelContextAvailable(AbortSignal.abort())).resolves.toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('resolves waiting callers once the polyfill is installed', async () => {
    Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
    const waiting = resolveModelContext(false, new AbortController().signal)
    const loaded = await resolveModelContext(true, new AbortController().signal)
    expect(loaded).toBe(document.modelContext)
    await expect(waiting).resolves.toBe(document.modelContext)
  })
})

describe('with the polyfill', () => {
  let context: ModelContext

  beforeAll(async () => {
    Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
    const loaded = await loadPolyfill()
    if (!loaded) throw new Error('The polyfill did not install.')
    context = loaded
  })

  it('reports the polyfill status', () => {
    expect(getWebMCPStatus()).toBe('polyfill')
  })

  it('returns the existing context without loading anything', async () => {
    const signal = new AbortController().signal
    await expect(resolveModelContext(false, signal)).resolves.toBe(context)
    await expect(whenModelContextAvailable(signal)).resolves.toBe(context)
    await expect(loadPolyfill()).resolves.toBe(context)
  })

  it('registers tools and unregisters them when the signal aborts', async () => {
    const controller = new AbortController()
    const results = await registerTools(context, [createTool('alpha'), createTool('beta')], { signal: controller.signal })
    expect(results).toEqual([
      { status: 'fulfilled', value: 'alpha' },
      { status: 'fulfilled', value: 'beta' },
    ])
    expect(await toolNames(context)).toEqual(['alpha', 'beta'])
    controller.abort()
    expect(await toolNames(context)).toEqual([])
  })

  it('emits toolchange when tools change', async () => {
    const controller = new AbortController()
    const onChange = vi.fn()
    context.addEventListener('toolchange', onChange)
    await registerTools(context, [createTool('gamma')], { signal: controller.signal })
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    controller.abort()
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    context.removeEventListener('toolchange', onChange)
  })

  it('executes a registered tool', async () => {
    const controller = new AbortController()
    await registerTools(context, [createTool('delta')], { signal: controller.signal })
    const [tool] = await context.getTools()
    await expect(context.executeTool(tool!, {})).resolves.toBe('{"ok":true,"data":"delta"}')
    controller.abort()
  })

  it('registers under a suffixed name when the name is taken', async () => {
    const controller = new AbortController()
    const onCollision = vi.fn()
    await registerTools(context, [createTool('epsilon')], { signal: controller.signal })
    const results = await registerTools(context, [createTool('epsilon')], { signal: controller.signal, onCollision })
    expect(results).toEqual([{ status: 'fulfilled', value: 'epsilon_2' }])
    expect(onCollision).toHaveBeenCalledWith('epsilon', 'epsilon_2')
    expect(await toolNames(context)).toEqual(['epsilon', 'epsilon_2'])
    controller.abort()
  })

  it('reports a tool that cannot be registered without retrying under another invalid name', async () => {
    const controller = new AbortController()
    const registerTool = vi.spyOn(context, 'registerTool')
    const results = await registerTools(context, [createTool('bad name')], { signal: controller.signal })
    expect(results[0]?.status).toBe('rejected')
    expect(registerTool).toHaveBeenCalledOnce()
    expect(await toolNames(context)).toEqual([])
    registerTool.mockRestore()
  })

  it('does not retry a taken name when the suffix would make it too long', async () => {
    const controller = new AbortController()
    const name = 'n'.repeat(127)
    await registerTools(context, [createTool(name)], { signal: controller.signal })
    const registerTool = vi.spyOn(context, 'registerTool')
    const results = await registerTools(context, [createTool(name)], { signal: controller.signal })
    expect(results[0]?.status).toBe('rejected')
    expect(registerTool).toHaveBeenCalledOnce()
    registerTool.mockRestore()
    controller.abort()
  })

  it('passes exposedTo to the registration', async () => {
    const controller = new AbortController()
    const registerTool = vi.spyOn(context, 'registerTool')
    await registerTools(context, [createTool('zeta')], { signal: controller.signal, exposedTo: ['https://agent.example'] })
    expect(registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'zeta' }), {
      signal: controller.signal,
      exposedTo: ['https://agent.example'],
    })
    registerTool.mockRestore()
    controller.abort()
  })
})

describe('with a native-like context', () => {
  function createNativeContext(): ModelContext & { waitForToolsUntil: ReturnType<typeof vi.fn> } {
    return { registerTool: Math.max, waitForToolsUntil: vi.fn() } as never
  }

  it('reports the native status', () => {
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'modelContext')
    Object.defineProperty(document, 'modelContext', { value: createNativeContext(), configurable: true })
    expect(getWebMCPStatus()).toBe('native')
    Reflect.deleteProperty(document, 'modelContext')
    expect(Object.getOwnPropertyDescriptor(Document.prototype, 'modelContext')).toEqual(original)
  })

  it('does not report a bound or a script function as native', () => {
    const contexts = [
      { registerTool: Function.prototype.bind.call(async () => undefined, undefined) },
      { registerTool: async () => undefined },
      Object.create({ constructor: function ModelContext() {} }, { registerTool: { value: Math.max } }),
    ]
    for (const context of contexts) {
      Object.defineProperty(document, 'modelContext', { value: context, configurable: true })
      expect(getWebMCPStatus()).toBe('polyfill')
      Reflect.deleteProperty(document, 'modelContext')
    }
  })

  it('announces pending registrations with waitForToolsUntil', async () => {
    const context = createNativeContext()
    const results = await registerTools(context, [createTool('eta')], { signal: new AbortController().signal })
    expect(results).toEqual([{ status: 'fulfilled', value: 'eta' }])
    expect(context.waitForToolsUntil).toHaveBeenCalledWith(expect.any(Promise))
  })

  it.each(['NotAllowedError', 'InvalidStateError'])('registers the tools when waitForToolsUntil throws %s', async (name) => {
    const context = createNativeContext()
    context.waitForToolsUntil.mockImplementation(() => {
      throw new DOMException('The document cannot provide tools.', name)
    })
    const results = await registerTools(context, [createTool('iota')], { signal: new AbortController().signal })
    expect(results).toEqual([{ status: 'fulfilled', value: 'iota' }])
  })

  it('rethrows an error of waitForToolsUntil that the browser does not define', () => {
    const context = createNativeContext()
    context.waitForToolsUntil.mockImplementation(() => {
      throw new TypeError('waitForToolsUntil is broken.')
    })
    expect(() => registerTools(context, [createTool('kappa')], { signal: new AbortController().signal })).toThrow(TypeError)
  })

  it('does not retry after the signal aborts', async () => {
    const controller = new AbortController()
    controller.abort()
    const registerTool = vi.fn(async () => {
      throw new DOMException('Duplicate tool name', 'InvalidStateError')
    })
    const results = await registerTools({ registerTool } as never, [createTool('theta')], { signal: controller.signal })
    expect(results[0]?.status).toBe('rejected')
    expect(registerTool).toHaveBeenCalledTimes(1)
  })
})
