import { AgentTools } from 'actionmcp'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { readDatabase } from '../lib/db'
import { Confirmation } from './confirmation'
import './globals.css'

export const metadata = { title: 'Team demo' }
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: ReactNode }) {
  const { account } = readDatabase()
  return (
    <html lang="en">
      <body>
        <Confirmation automatic={process.env.BENCH_AUTO_CONFIRM === '1'}>
          <div className="session">
            <strong data-testid="account-name">{account.deleted ? 'Account deleted' : account.name}</strong>
            <nav>
              <Link href="/">Home</Link> · <Link href="/team">Team</Link> · <Link href="/account">Account</Link>
            </nav>
          </div>
          {children}
          <AgentTools polyfill navigate />
        </Confirmation>
      </body>
    </html>
  )
}
