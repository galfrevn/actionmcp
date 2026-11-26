import 'server-only'
import { defineAgentTools, fromSafeAction, tool } from 'actionmcp/server'
import { updateProfile } from './app/actions'
import { updateProfileSchema } from './lib/schemas'

export default defineAgentTools({
  'profile.update': tool(fromSafeAction(updateProfile), {
    description: 'Update the public profile of the signed-in user. Returns the saved display name and bio.',
    title: 'Update profile',
    input: updateProfileSchema,
    untrustedOutput: true,
  }),
})
