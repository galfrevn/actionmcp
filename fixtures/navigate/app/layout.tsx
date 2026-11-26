import { AgentTools } from 'actionmcp'
import type { ReactNode } from 'react'

export const metadata = { title: 'Navigate fixture' }

export default function RootLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {modal}
        <AgentTools polyfill navigate />
      </body>
    </html>
  )
}
