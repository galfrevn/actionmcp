'use client'

import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { executeTool, type ToolRuntime } from '../core/execute'
import type { AgentResult } from '../core/result'
import type { SerializableToolDef } from '../core/types'
import { registerTools, resolveModelContext, type ModelContextTool } from '../core/webmcp'
import { ConfirmDialog } from './Confirm'
import {
  currentConfirmation,
  dequeueConfirmation,
  enqueueConfirmation,
  subscribeToConfirmations,
  type PendingConfirmation,
} from './confirmations'
import { AgentToolsContext } from './context'

export interface AgentToolsRegistration {
  polyfill?: boolean | undefined
  exposedTo?: readonly string[] | undefined
  recoverError?: ((error: unknown) => AgentResult<unknown> | undefined) | undefined
}

const noConfirmation = () => undefined

export function useAgentTools(tools: readonly SerializableToolDef[], registration: AgentToolsRegistration): ReactNode {
  const { polyfill = false, exposedTo, recoverError } = registration
  const hooks = useContext(AgentToolsContext)
  const [owner] = useState(() => ({}))
  const current = useSyncExternalStore(subscribeToConfirmations, currentConfirmation, noConfirmation)
  const unsettled = useRef(new Set<PendingConfirmation>())

  const confirm = useCallback<ToolRuntime['confirm']>(
    (call, tool, signal) =>
      new Promise<boolean>((resolve) => {
        const confirmation: PendingConfirmation = {
          owner,
          call,
          tool,
          settle: (accepted) => {
            if (!unsettled.current.delete(confirmation)) return
            dequeueConfirmation(confirmation)
            resolve(accepted)
          },
        }
        unsettled.current.add(confirmation)
        signal.addEventListener('abort', () => confirmation.settle(false), { once: true })
        enqueueConfirmation(confirmation)
      }),
    [owner],
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
          const state = latest.current
          const tool = state.tools[index]
          if (!tool) throw new DOMException('The tool is no longer registered.', 'InvalidStateError')
          return executeTool(tool, input, options.signal, {
            confirm,
            onBeforeExecute: state.hooks.onBeforeExecute,
            onAfterExecute: state.hooks.onAfterExecute,
            recoverError: state.recoverError,
          })
        },
      }),
    )
    void resolveModelContext(stable.polyfill, signal).then(async (context) => {
      if (!context || signal.aborted) return
      const results = await registerTools(context, definitions, {
        signal,
        exposedTo: stable.exposedTo,
        onCollision: (requested, registered) => {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`actionmcp: the tool name "${requested}" is taken, so the tool is registered as "${registered}".`)
          }
        },
      })
      if (process.env.NODE_ENV !== 'production' && !signal.aborted) {
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(`actionmcp: the browser rejected the tool "${definitions[index]?.name}".`, result.reason)
          }
        })
      }
    })
    return () => controller.abort()
  }, [stable, confirm])

  useEffect(() => {
    const confirmations = unsettled.current
    return () => {
      for (const confirmation of confirmations) confirmation.settle(false)
    }
  }, [])

  if (current?.owner !== owner) return null
  const Confirm = hooks.confirmComponent ?? ConfirmDialog
  return (
    <Confirm
      call={current.call}
      title={current.tool.title}
      description={current.tool.description}
      inputSchema={current.tool.inputSchema}
      labels={hooks.confirmLabels}
      onConfirm={() => current.settle(true)}
      onCancel={() => current.settle(false)}
    />
  )
}
