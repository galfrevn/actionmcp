import { AgentTools } from 'actionmcp'
import type { ReactNode } from 'react'

export default function StartLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AgentTools polyfill include={['leaveStart']} />
    </>
  )
}
