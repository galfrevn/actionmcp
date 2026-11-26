import { AgentTools, AgentToolsDevtools } from 'actionmcp'
import type { ReactNode } from 'react'
import './globals.css'
import { SessionBar } from './session-bar'

export const metadata = { title: 'actionmcp chat example' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionBar />
        {children}
        <AgentTools />
        <AgentToolsDevtools />
      </body>
    </html>
  )
}
