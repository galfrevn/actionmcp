import { createSafeActionClient } from 'next-safe-action'
import { requireUser } from './session'

export const actionClient = createSafeActionClient({
  handleServerError: (error) => error.message,
})

export const authActionClient = actionClient.use(async ({ next }) => next({ ctx: { user: await requireUser() } }))
