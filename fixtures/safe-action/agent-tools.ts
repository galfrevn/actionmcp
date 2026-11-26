import 'server-only'
import { defineAgentTools, fromSafeAction, tool } from 'actionmcp/server'
import { loginUser } from './app/actions'
import { loginSchema } from './lib/schemas'

export default defineAgentTools({
  loginUser: tool(fromSafeAction(loginUser), {
    description: 'Sign in with a username and a password. Returns the signed-in username.',
    input: loginSchema,
  }),
})
