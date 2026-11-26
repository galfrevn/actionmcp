import { publishToolCall, type ConfirmationOutcome } from './events'
import { toFormData } from './formdata'
import { BLOCKED_MESSAGE, DECLINED_MESSAGE, GENERIC_FAILURE_MESSAGE, fail, normalizeActionResult, type AgentResult } from './result'
import type { SerializableToolDef, ToolCall } from './types'

export interface ToolRuntime {
  confirm: (call: ToolCall, tool: SerializableToolDef, signal: AbortSignal) => Promise<boolean>
  onBeforeExecute?: ((call: ToolCall) => boolean | Promise<boolean>) | undefined
  onAfterExecute?: ((call: ToolCall, result: unknown) => void) | undefined
  recoverError?: ((error: unknown) => AgentResult<unknown> | undefined) | undefined
}

export type ToolOutput = AgentResult<unknown>

export function requiresConfirmation(tool: Pick<SerializableToolDef, 'confirm' | 'annotations'>): boolean {
  return tool.confirm === 'always' || (tool.confirm === 'consequential' && tool.annotations.consequentialHint)
}

export async function executeTool(
  tool: SerializableToolDef,
  input: unknown,
  signal: AbortSignal,
  runtime: ToolRuntime,
): Promise<ToolOutput> {
  const call: ToolCall = { name: tool.name, input, annotations: tool.annotations, source: 'agent' }
  const startedAt = Date.now()
  let confirmation: ConfirmationOutcome = 'none'
  const publish = (result: ToolOutput | { aborted: true }) =>
    publishToolCall({ name: tool.name, input, startedAt, durationMs: Date.now() - startedAt, confirmation, result })

  const run = async (): Promise<ToolOutput> => {
    if (requiresConfirmation(tool)) {
      const accepted = await runtime.confirm(call, tool, signal)
      confirmation = accepted ? 'accepted' : 'declined'
      if (!accepted) return fail('declined', DECLINED_MESSAGE)
    }
    if (runtime.onBeforeExecute && (await runtime.onBeforeExecute(call)) === false) {
      return fail('blocked', BLOCKED_MESSAGE)
    }
    if (signal.aborted) return fail('failed', GENERIC_FAILURE_MESSAGE)
    const result = await invoke(tool, input, runtime)
    runtime.onAfterExecute?.(call, result)
    return result
  }

  try {
    const output = await untilAborted(run, signal)
    publish(output)
    return output
  } catch (error) {
    publish({ aborted: true })
    throw error
  }
}

function callAction(tool: SerializableToolDef, input: unknown): Promise<unknown> {
  const action = tool.action as (...args: unknown[]) => Promise<unknown>
  if (tool.adapter === 'formdata') return action(undefined, toFormData(input))
  if (tool.adapter === 'form') return action(toFormData(input))
  return action(input)
}

async function invoke(tool: SerializableToolDef, input: unknown, runtime: ToolRuntime): Promise<ToolOutput> {
  try {
    return normalizeActionResult(await callAction(tool, input), tool.adapter)
  } catch (error) {
    return (
      runtime.recoverError?.(error) ?? fail('failed', error instanceof Error && error.message ? error.message : GENERIC_FAILURE_MESSAGE)
    )
  }
}

function untilAborted<T>(start: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The tool call was cancelled.', 'AbortError'))
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    start()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}
