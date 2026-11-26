import { z } from 'zod'

export const inviteMemberSchema = z.object({
  email: z.email('Enter a valid email address.').describe('Email address of the person to invite'),
  role: z.enum(['member', 'owner']).describe('Role in the team'),
  teams: z.array(z.string()).optional().describe('Team identifiers to add the person to'),
  notify: z.boolean().optional().describe('Send an email notification'),
})

export const createNoteSchema = z.object({
  text: z.string().min(1, 'Write something first.').max(280).describe('Note text'),
})
