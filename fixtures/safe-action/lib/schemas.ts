import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(3, 'The username needs at least 3 characters.').describe('Account username'),
  password: z.string().min(8, 'The password needs at least 8 characters.').describe('Account password'),
})
