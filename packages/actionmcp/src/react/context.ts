'use client'

import { createContext, type ComponentType } from 'react'
import type { JsonSchema, ToolCall } from '../core/types'

export interface ConfirmLabels {
  title: string
  intro: string
  input: string
  extra: string
  allow: string
  cancel: string
}

export interface ConfirmProps {
  call: ToolCall
  title?: string | undefined
  description: string
  inputSchema?: JsonSchema | undefined
  labels?: Partial<ConfirmLabels> | undefined
  onConfirm: () => void
  onCancel: () => void
}

export interface AgentToolsHooks {
  onBeforeExecute?: ((call: ToolCall) => boolean | Promise<boolean>) | undefined
  onAfterExecute?: ((call: ToolCall, result: unknown) => void) | undefined
  confirmComponent?: ComponentType<ConfirmProps> | undefined
  confirmLabels?: Partial<ConfirmLabels> | undefined
}

export const AgentToolsContext = createContext<AgentToolsHooks>({})
