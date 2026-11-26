'use client'

import { Suspense, lazy, type ReactNode } from 'react'

const Panel =
  process.env.NODE_ENV === 'development'
    ? lazy(() => import('./DevtoolsPanel').then((module) => ({ default: module.DevtoolsPanel })))
    : undefined

export function AgentToolsDevtools(): ReactNode {
  if (!Panel) return null
  return (
    <Suspense fallback={null}>
      <Panel />
    </Suspense>
  )
}
