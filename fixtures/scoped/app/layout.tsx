import { AgentTools } from 'actionmcp'
import Link from 'next/link'
import type { ReactNode } from 'react'

export const metadata = { title: 'Scoped fixture' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Home</Link> <Link href="/a">Section A</Link> <Link href="/b">Section B</Link>
        </nav>
        {children}
        <AgentTools polyfill include={['ping']} />
      </body>
    </html>
  )
}
