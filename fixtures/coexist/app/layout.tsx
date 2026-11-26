import { AgentTools } from 'actionmcp'
import type { ReactNode } from 'react'
import { ThirdPartyTools } from './third-party-tools'

export const metadata = { title: 'Coexist fixture' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThirdPartyTools />
        {children}
        <AgentTools />
      </body>
    </html>
  )
}
