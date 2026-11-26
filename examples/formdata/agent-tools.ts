import 'server-only'
import { defineAgentTools, fromFormDataAction, tool } from 'actionmcp/server'
import { inviteMember, removeMember } from './app/actions'
import { inviteMemberSchema, removeMemberSchema } from './lib/schemas'

export default defineAgentTools({
  'team.inviteMember': tool(fromFormDataAction(inviteMember), {
    description: 'Invite a person to the current team by email with a role. Returns a confirmation message.',
    title: 'Invite member',
    input: inviteMemberSchema,
  }),
  'team.removeMember': tool(fromFormDataAction(removeMember), {
    description: 'Remove a member from the current team by email. The member loses access immediately.',
    title: 'Remove member',
    input: removeMemberSchema,
  }),
})
