'use client'

import { AgentToolsProvider, type ConfirmProps } from 'actionmcp/client'
import { useEffect, type ReactNode } from 'react'

function AutoConfirm({ onConfirm }: ConfirmProps) {
  useEffect(() => {
    onConfirm()
  }, [onConfirm])
  return null
}

export function Confirmation({ automatic, children }: { automatic: boolean; children: ReactNode }) {
  return automatic ? <AgentToolsProvider confirmComponent={AutoConfirm}>{children}</AgentToolsProvider> : children
}
