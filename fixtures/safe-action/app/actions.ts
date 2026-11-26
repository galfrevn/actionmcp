'use server'

import { cookies } from 'next/headers'
import { actionClient } from '../lib/safe-action'
import { loginSchema } from '../lib/schemas'

export const loginUser = actionClient.inputSchema(loginSchema).action(async ({ parsedInput }) => {
  if (parsedInput.username === 'locked') {
    throw new Error('This account is locked.')
  }
  const cookieStore = await cookies()
  cookieStore.set('user', parsedInput.username)
  return { username: parsedInput.username }
})
