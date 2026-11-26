import { AgentToolError } from 'actionmcp/server'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'demo-user'

export async function getUser(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value
}

export async function requireUser(): Promise<string> {
  const user = await getUser()
  if (!user) {
    throw new AgentToolError('unauthorized', 'Sign in before using this tool.')
  }
  return user
}

export async function startSession(user: string): Promise<void> {
  ;(await cookies()).set(SESSION_COOKIE, user, { httpOnly: true, sameSite: 'lax', path: '/' })
}

export async function endSession(): Promise<void> {
  ;(await cookies()).delete(SESSION_COOKIE)
}
