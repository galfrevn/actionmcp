import { AgentTools } from 'actionmcp'
import type { ReactNode } from 'react'

export const metadata = { title: 'JSDoc fixture' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AgentTools polyfill />
      </body>
    </html>
  )
}
