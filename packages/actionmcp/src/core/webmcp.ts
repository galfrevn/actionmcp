import type { WebMCP } from 'webmcp-types'
import { isValidToolName } from './names'

export type ModelContext = WebMCP.ModelContext & {
  waitForToolsUntil?: (promise: Promise<unknown>) => void
}

export type ModelContextTool = WebMCP.ModelContextTool

export type WebMCPStatus = 'native' | 'polyfill' | 'unavailable'

export interface RegisterToolsOptions {
  signal: AbortSignal
  exposedTo?: readonly string[] | undefined
  onCollision?: ((requestedName: string, registeredName: string) => void) | undefined
}

const MAX_NAME_ATTEMPTS = 3
export const AVAILABILITY_CHECK_DELAYS_MS: readonly number[] = [250, 1000, 4000]
const availabilityListeners = new Set<() => void>()
let availabilityCheck: ReturnType<typeof setTimeout> | undefined
let pendingPolyfill: Promise<ModelContext | undefined> | undefined

export function getModelContext(): ModelContext | undefined {
  if (typeof document === 'undefined') return undefined
  const context = document.modelContext
  return context && typeof context.registerTool === 'function' ? context : undefined
}

export function getWebMCPStatus(): WebMCPStatus {
  const context = getModelContext()
  if (!context) return 'unavailable'
  return Function.prototype.toString.call(context.registerTool).includes('[native code]') ? 'native' : 'polyfill'
}

export function loadPolyfill(): Promise<ModelContext | undefined> {
  pendingPolyfill ??= import('@w3c/webmcp-polyfill').then(({ installWebMCP }) => {
    installWebMCP()
    announceAvailability()
    return getModelContext()
  })
  return pendingPolyfill
}

function announceAvailability(): void {
  clearTimeout(availabilityCheck)
  availabilityCheck = undefined
  for (const listener of availabilityListeners) listener()
  availabilityListeners.clear()
}

function scheduleAvailabilityCheck(attempt: number): void {
  const delay = AVAILABILITY_CHECK_DELAYS_MS[attempt]
  if (availabilityCheck !== undefined || delay === undefined) return
  availabilityCheck = setTimeout(() => {
    availabilityCheck = undefined
    if (getModelContext()) announceAvailability()
    else scheduleAvailabilityCheck(attempt + 1)
  }, delay)
}

export function whenModelContextAvailable(signal: AbortSignal): Promise<ModelContext | undefined> {
  const context = getModelContext()
  if (context) return Promise.resolve(context)
  return new Promise((resolve) => {
    const onAbort = () => {
      availabilityListeners.delete(listener)
      if (availabilityListeners.size === 0) {
        clearTimeout(availabilityCheck)
        availabilityCheck = undefined
      }
      resolve(undefined)
    }
    const listener = () => {
      signal.removeEventListener('abort', onAbort)
      resolve(getModelContext())
    }
    if (signal.aborted) {
      resolve(undefined)
      return
    }
    availabilityListeners.add(listener)
    signal.addEventListener('abort', onAbort, { once: true })
    scheduleAvailabilityCheck(0)
  })
}

export function resolveModelContext(polyfill: boolean, signal: AbortSignal): Promise<ModelContext | undefined> {
  const context = getModelContext()
  if (context) return Promise.resolve(context)
  return polyfill ? loadPolyfill() : whenModelContextAvailable(signal)
}

export function registerTools(
  context: ModelContext,
  tools: readonly ModelContextTool[],
  options: RegisterToolsOptions,
): Promise<PromiseSettledResult<string>[]> {
  const registrations = Promise.allSettled(tools.map((tool) => registerTool(context, tool, options, 1)))
  if (typeof context.waitForToolsUntil === 'function') {
    context.waitForToolsUntil(registrations)
  }
  return registrations
}

function suffixedName(name: string, attempt: number): string {
  return attempt === 1 ? name : `${name}_${attempt}`
}

async function registerTool(
  context: ModelContext,
  tool: ModelContextTool,
  options: RegisterToolsOptions,
  attempt: number,
): Promise<string> {
  const name = suffixedName(tool.name, attempt)
  const registerOptions: WebMCP.ModelContextRegisterToolOptions = { signal: options.signal }
  if (options.exposedTo) registerOptions.exposedTo = [...options.exposedTo]
  try {
    await context.registerTool({ ...tool, name }, registerOptions)
  } catch (error) {
    const collided = error instanceof DOMException && error.name === 'InvalidStateError'
    const canRetry = attempt < MAX_NAME_ATTEMPTS && isValidToolName(suffixedName(tool.name, attempt + 1))
    if (!collided || options.signal.aborted || !canRetry) throw error
    return registerTool(context, tool, options, attempt + 1)
  }
  if (attempt > 1) options.onCollision?.(tool.name, name)
  return name
}
