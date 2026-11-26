import type { AgentResult } from './result'

export type ConfirmationOutcome = 'none' | 'accepted' | 'declined'

export interface ToolCallRecord {
  name: string
  input: unknown
  startedAt: number
  durationMs: number
  confirmation: ConfirmationOutcome
  result: AgentResult<unknown> | { aborted: true }
}

type ToolCallListener = (record: ToolCallRecord) => void

const listeners = new Set<ToolCallListener>()

export function subscribeToToolCalls(listener: ToolCallListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publishToolCall(record: ToolCallRecord): void {
  for (const listener of listeners) {
    try {
      listener(record)
    } catch (error) {
      console.error('actionmcp: a tool call listener failed.', error)
    }
  }
}
