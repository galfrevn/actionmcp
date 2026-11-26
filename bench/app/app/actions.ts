'use server'

import { agent } from 'actionmcp/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { readDatabase, updateDatabase } from '../lib/db'
import { deleteAccountSchema, inviteMemberSchema, removeMemberSchema, updateAccountSchema } from '../lib/schemas'
import { getSession } from '../lib/session'

export interface ActionState {
  error?: string
  success?: string
}

function firstIssue(error: z.ZodError): ActionState {
  return { error: error.issues[0]?.message ?? 'Invalid input.' }
}

export const listMembers = agent(
  {
    description: 'List the members of the current team. Returns the id, name, email, and role of each member.',
    readOnly: true,
    untrustedOutput: true,
    output: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.enum(['member', 'owner']) })),
  },
  async () => {
    await getSession()
    return readDatabase().members
  },
)

export async function inviteTeamMember(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  await getSession()
  const parsed = inviteMemberSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return firstIssue(parsed.error)
  const { email, role } = parsed.data
  if (readDatabase().members.some((member) => member.email === email)) {
    return { error: `${email} is already a member.` }
  }
  updateDatabase((database) => {
    const name = email.split('@')[0] ?? email
    database.members.push({ id: `m${Date.now()}`, name, email, role })
  })
  revalidatePath('/team')
  return { success: `Invited ${email} as ${role}.` }
}

export async function removeTeamMember(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  await getSession()
  const parsed = removeMemberSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return firstIssue(parsed.error)
  const member = readDatabase().members.find((candidate) => candidate.id === parsed.data.memberId)
  if (!member) return { error: `There is no member with the id ${parsed.data.memberId}.` }
  updateDatabase((database) => {
    database.members = database.members.filter((candidate) => candidate.id !== member.id)
  })
  revalidatePath('/team')
  return { success: `Removed ${member.name}.` }
}

export async function updateAccount(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  await getSession()
  const parsed = updateAccountSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return firstIssue(parsed.error)
  updateDatabase((database) => {
    database.account.name = parsed.data.name
  })
  revalidatePath('/', 'layout')
  return { success: `The account is now named ${parsed.data.name}.` }
}

export async function deleteAccount(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  await getSession()
  const parsed = deleteAccountSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return firstIssue(parsed.error)
  updateDatabase((database) => {
    database.account.deleted = true
  })
  revalidatePath('/', 'layout')
  return { success: 'The account was deleted.' }
}
