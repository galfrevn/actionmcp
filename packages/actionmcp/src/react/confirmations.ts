import type { SerializableToolDef, ToolCall } from '../core/types'

export interface PendingConfirmation {
  id: number
  owner: object
  call: ToolCall
  tool: SerializableToolDef
  settle: (accepted: boolean) => void
}

const listeners = new Set<() => void>()
let queue: readonly PendingConfirmation[] = []
let lastId = 0

export function nextConfirmationId(): number {
  lastId += 1
  return lastId
}

export function enqueueConfirmation(confirmation: PendingConfirmation): void {
  queue = [...queue, confirmation]
  notify()
}

export function dequeueConfirmation(confirmation: PendingConfirmation): void {
  queue = queue.filter((entry) => entry !== confirmation)
  notify()
}

export function currentConfirmation(): PendingConfirmation | undefined {
  return queue[0]
}

export function subscribeToConfirmations(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(): void {
  for (const listener of listeners) listener()
}
