'use server'

import { revalidatePath } from 'next/cache'
import { inviteMemberSchema, removeMemberSchema } from '../lib/schemas'
import { requireUser } from '../lib/session'
import { members } from '../lib/team'

export interface ActionState {
  error?: string
  success?: string
}

export async function inviteMember(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser()
  const parsed = inviteMemberSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }
  if (members.some((member) => member.email === parsed.data.email)) {
    return { error: `${parsed.data.email} is already a member.` }
  }
  members.push(parsed.data)
  revalidatePath('/')
  return { success: `Invited ${parsed.data.email} as ${parsed.data.role}.` }
}

export async function removeMember(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser()
  const parsed = removeMemberSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }
  const index = members.findIndex((member) => member.email === parsed.data.email)
  if (index === -1) {
    return { error: `${parsed.data.email} is not a member.` }
  }
  members.splice(index, 1)
  revalidatePath('/')
  return { success: `Removed ${parsed.data.email}.` }
}
