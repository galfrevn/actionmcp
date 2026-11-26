import { AgentToolError } from 'actionmcp/server'
import { cookies } from 'next/headers'

export async function requireUser(): Promise<string> {
  const user = (await cookies()).get('user')?.value
  if (!user) {
    throw new AgentToolError('unauthorized', 'Sign in before using this tool.')
  }
  return user
}
