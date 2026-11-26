import { AgentTools, AgentToolsDevtools } from 'actionmcp'
import type { ReactNode } from 'react'

export const metadata = { title: 'Basic fixture' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AgentTools polyfill originTrialToken="fixture-origin-trial-token" />
        <AgentToolsDevtools />
      </body>
    </html>
  )
}
