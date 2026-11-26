import { z } from 'zod'

const email = z.email('Enter a valid email address.')

export const inviteMemberSchema = z.object({
  email: email.describe('Email address of the person to invite'),
  role: z.enum(['member', 'owner']).describe('Role in the team'),
})

export const removeMemberSchema = z.object({
  memberId: z.string().min(1).describe('Member identifier, as returned by team.listMembers'),
})

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1, 'Enter an account name.').max(60).describe('New account name'),
})

export const deleteAccountSchema = z.object({
  confirmation: z.literal('DELETE', 'Type DELETE to confirm.').describe('The literal text DELETE'),
})
