'use server'

import { revalidatePath } from 'next/cache'
import { profileOf } from '../lib/profile'
import { authActionClient } from '../lib/safe-action'
import { updateProfileSchema } from '../lib/schemas'

const RESERVED_NAMES = ['admin', 'support']

export const updateProfile = authActionClient.inputSchema(updateProfileSchema).action(async ({ parsedInput, ctx }) => {
  if (RESERVED_NAMES.includes(parsedInput.displayName.toLowerCase())) {
    throw new Error(`The display name "${parsedInput.displayName}" is reserved.`)
  }
  const profile = profileOf(ctx.user)
  profile.displayName = parsedInput.displayName
  profile.bio = parsedInput.bio
  revalidatePath('/')
  return { displayName: profile.displayName, bio: profile.bio }
})
