'use client'

import type { ReactNode } from 'react'
import type { SerializableToolDef } from '../core/types'
import { recoverRedirect } from '../next/redirect'
import { useAgentTools } from './useAgentTools'

export interface RegistrarProps {
  tools: SerializableToolDef[]
  polyfill?: boolean | undefined
  exposedTo?: string[] | undefined
}

export function Registrar({ tools, polyfill, exposedTo }: RegistrarProps): ReactNode {
  return useAgentTools(tools, { polyfill, exposedTo, recoverError: recoverRedirect })
}
