import 'server-only'
import { defineAgentTools, fromFormDataAction, tool } from 'actionmcp/server'
import { deleteAccount, inviteTeamMember, listMembers, removeTeamMember, updateAccount } from './app/actions'
import { deleteAccountSchema, inviteMemberSchema, removeMemberSchema, updateAccountSchema } from './lib/schemas'

export default defineAgentTools({
  'team.listMembers': listMembers,
  'team.inviteMember': tool(fromFormDataAction(inviteTeamMember), {
    description: 'Invite a person to the current team by email with a role. Returns a confirmation message.',
    title: 'Invite member',
    input: inviteMemberSchema,
  }),
  'team.removeMember': tool(fromFormDataAction(removeTeamMember), {
    description: 'Remove a member from the current team by member id. The member loses access immediately.',
    title: 'Remove member',
    input: removeMemberSchema,
  }),
  'account.update': tool(fromFormDataAction(updateAccount), {
    description: 'Change the name of the current account. Returns a confirmation message.',
    title: 'Update account',
    input: updateAccountSchema,
  }),
  'account.delete': tool(fromFormDataAction(deleteAccount), {
    description: 'Permanently delete the current account and all of its data. This cannot be undone.',
    title: 'Delete account',
    input: deleteAccountSchema,
    consequential: true,
  }),
})
