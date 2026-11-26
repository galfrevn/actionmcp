import 'server-only'
import { defineAgentTools, fromFormAction, fromFormDataAction, tool } from 'actionmcp/server'
import { createNote, inviteMember } from './app/actions'
import { createNoteSchema, inviteMemberSchema } from './lib/schemas'

export default defineAgentTools({
  'team.inviteMember': tool(fromFormDataAction(inviteMember), {
    description: 'Invite a person to the current team by email with a role. Returns a confirmation message.',
    title: 'Invite member',
    input: inviteMemberSchema,
  }),
  'notes.create': tool(fromFormAction(createNote), {
    description: 'Create a short note for the signed-in user. Returns nothing.',
    input: createNoteSchema,
  }),
})
