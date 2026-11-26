import { z } from 'zod'

export const inviteMemberSchema = z.object({
  email: z.email('Enter a valid email address.').describe('Email address of the person to invite'),
  role: z.enum(['member', 'owner']).describe('Role in the team'),
})

export const removeMemberSchema = z.object({
  email: z.email('Enter a valid email address.').describe('Email address of the member to remove'),
})
