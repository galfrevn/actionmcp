import { AgentTools } from 'actionmcp'
import type { ReactNode } from 'react'

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AgentTools polyfill navigate={{ routes: ['/projects/*', '/docs/**'] }} prefix="projects." />
    </>
  )
}
