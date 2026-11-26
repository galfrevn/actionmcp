'use client'

import { createContext, type ComponentType } from 'react'
import type { ToolCall } from '../core/types'

export interface ConfirmProps {
  call: ToolCall
  title?: string | undefined
  description: string
  onConfirm: () => void
  onCancel: () => void
}

export interface AgentToolsHooks {
  onBeforeExecute?: ((call: ToolCall) => boolean | Promise<boolean>) | undefined
  onAfterExecute?: ((call: ToolCall, result: unknown) => void) | undefined
  confirmComponent?: ComponentType<ConfirmProps> | undefined
}

export const AgentToolsContext = createContext<AgentToolsHooks>({})
