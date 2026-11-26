import { AgentTools } from 'actionmcp'
import type { ReactNode } from 'react'

export const metadata = { title: 'Redirect fixture' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AgentTools polyfill include={['finishOnboarding']} />
      </body>
    </html>
  )
}
