import { AgentTools } from 'actionmcp'
import type { ReactNode } from 'react'

export default function SectionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AgentTools polyfill include={['alpha.*']} />
    </>
  )
}
