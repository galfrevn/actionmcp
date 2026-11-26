'use client'

import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { executeTool, type ToolRuntime } from '../core/execute'
import type { AgentResult } from '../core/result'
import type { SerializableToolDef, ToolCall } from '../core/types'
import { registerTools, resolveModelContext, type ModelContextTool } from '../core/webmcp'
import { ConfirmDialog } from './Confirm'
import { AgentToolsContext } from './context'

export interface AgentToolsRegistration {
  polyfill?: boolean | undefined
  exposedTo?: readonly string[] | undefined
  recoverError?: ((error: unknown) => AgentResult<unknown> | undefined) | undefined
}

interface PendingConfirmation {
  call: ToolCall
  tool: SerializableToolDef
  settle: (accepted: boolean) => void
}

export function useAgentTools(tools: readonly SerializableToolDef[], registration: AgentToolsRegistration): ReactNode {
  const { polyfill = false, exposedTo, recoverError } = registration
  const hooks = useContext(AgentToolsContext)
  const [pending, setPending] = useState<readonly PendingConfirmation[]>([])
  const unsettled = useRef(new Set<PendingConfirmation>())

  const confirm = useCallback<ToolRuntime['confirm']>(
    (call, tool, signal) =>
      new Promise<boolean>((resolve) => {
        const confirmation: PendingConfirmation = {
          call,
          tool,
          settle: (accepted) => {
            unsettled.current.delete(confirmation)
            setPending((queue) => queue.filter((entry) => entry !== confirmation))
            resolve(accepted)
          },
        }
        unsettled.current.add(confirmation)
        signal.addEventListener('abort', () => confirmation.settle(false), { once: true })
        setPending((queue) => [...queue, confirmation])
      }),
    [],
  )

  const latest = useRef({ tools, hooks, recoverError })
  useEffect(() => {
    latest.current = { tools, hooks, recoverError }
  })

  const registrationKey = JSON.stringify([tools, exposedTo, polyfill])
  const [stable, setStable] = useState({ key: registrationKey, tools, exposedTo, polyfill })
  if (stable.key !== registrationKey) {
    setStable({ key: registrationKey, tools, exposedTo, polyfill })
  }

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const definitions = stable.tools.map(
      ({ action: _action, confirm: _confirm, adapter: _adapter, ...definition }, index): ModelContextTool => ({
        ...definition,
        execute: (input, options) => {
          const current = latest.current
          const tool = current.tools[index]
          if (!tool) throw new DOMException('The tool is no longer registered.', 'InvalidStateError')
          return executeTool(tool, input, options.signal, {
            confirm,
            onBeforeExecute: current.hooks.onBeforeExecute,
            onAfterExecute: current.hooks.onAfterExecute,
            recoverError: current.recoverError,
          })
        },
      }),
    )
    void resolveModelContext(stable.polyfill, signal).then((context) => {
      if (!context || signal.aborted) return
      return registerTools(context, definitions, {
        signal,
        exposedTo: stable.exposedTo,
        onCollision: (requested, registered) => {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`actionmcp: the tool name "${requested}" is taken, so the tool is registered as "${registered}".`)
          }
        },
      })
    })
    return () => controller.abort()
  }, [stable, confirm])

  useEffect(() => {
    const confirmations = unsettled.current
    return () => {
      for (const confirmation of confirmations) confirmation.settle(false)
    }
  }, [])

  const current = pending[0]
  if (!current) return null
  const Confirm = hooks.confirmComponent ?? ConfirmDialog
  return (
    <Confirm
      call={current.call}
      title={current.tool.title}
      description={current.tool.description}
      onConfirm={() => current.settle(true)}
      onCancel={() => current.settle(false)}
    />
  )
}
