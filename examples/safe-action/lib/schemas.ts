import { z } from 'zod'

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2, 'The display name needs at least 2 characters.').max(40).describe('Public display name'),
  bio: z.string().trim().max(160, 'The bio can have at most 160 characters.').default('').describe('Short public bio'),
})
