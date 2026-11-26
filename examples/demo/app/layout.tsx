import { AgentTools, AgentToolsDevtools } from 'actionmcp'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'actionmcp demo',
  description: 'A Next.js app whose Server Actions are WebMCP tools. The assistant on the page asks you before each change.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AgentTools />
        <AgentToolsDevtools />
      </body>
    </html>
  )
}
