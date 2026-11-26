'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '../lib/auth'
import { createNoteSchema, inviteMemberSchema } from '../lib/schemas'
import { store } from '../lib/store'

export interface ActionState {
  error?: string
  success?: string
}

export async function inviteMember(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser()
  const parsed = inviteMemberSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
    teams: formData.getAll('teams').map(String),
    notify: formData.get('notify') === 'on',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }
  const { email, role, teams = [], notify = false } = parsed.data
  if (store.invitations.some((invitation) => invitation.email === email)) {
    return { error: 'An invitation has already been sent to this email.' }
  }
  store.invitations.push({ email, role, teams, notify })
  revalidatePath('/')
  return { success: `Invitation sent to ${email}.` }
}

export async function createNote(formData: FormData): Promise<void> {
  await requireUser()
  const { text } = createNoteSchema.parse({ text: formData.get('text') })
  store.notes.push(text)
  revalidatePath('/')
}
