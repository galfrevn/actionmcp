import { createSafeActionClient } from 'next-safe-action'
import { z } from 'zod'

const actionClient = createSafeActionClient({
  handleServerError: (error) => error.message,
})

export const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
})

export const loginUser = actionClient.inputSchema(loginSchema).action(async ({ parsedInput }) => {
  if (parsedInput.username === 'locked') {
    throw new Error('This account is locked')
  }
  return { username: parsedInput.username }
})
