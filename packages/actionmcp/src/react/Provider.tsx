'use client'

import { useMemo, type ReactNode } from 'react'
import { AgentToolsContext, type AgentToolsHooks } from './context'

export interface AgentToolsProviderProps extends AgentToolsHooks {
  children: ReactNode
}

export function AgentToolsProvider({
  children,
  onBeforeExecute,
  onAfterExecute,
  confirmComponent,
  confirmLabels,
}: AgentToolsProviderProps): ReactNode {
  const hooks = useMemo(
    () => ({ onBeforeExecute, onAfterExecute, confirmComponent, confirmLabels }),
    [onBeforeExecute, onAfterExecute, confirmComponent, confirmLabels],
  )
  return <AgentToolsContext value={hooks}>{children}</AgentToolsContext>
}
