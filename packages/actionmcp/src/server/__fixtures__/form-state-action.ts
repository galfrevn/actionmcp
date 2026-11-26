import { z } from 'zod'

export type ActionState = { error?: string; success?: string; [key: string]: unknown }

type ValidatedActionFunction<S extends z.ZodType, T> = (data: z.infer<S>, formData: FormData) => Promise<T>

export function validatedAction<S extends z.ZodType, T>(schema: S, action: ValidatedActionFunction<S, T>) {
  return async (_previousState: ActionState, formData: FormData) => {
    const result = schema.safeParse(Object.fromEntries(formData))
    if (!result.success) {
      return { error: result.error.issues[0]?.message ?? 'Invalid input' }
    }
    return action(result.data, formData)
  }
}

export const inviteTeamMemberSchema = z.object({
  email: z.email('Invalid email'),
  role: z.enum(['member', 'owner']),
})

export const invitations: Array<{ email: string; role: string }> = []

export const inviteTeamMember = validatedAction(inviteTeamMemberSchema, async (data) => {
  if (invitations.some((invitation) => invitation.email === data.email)) {
    return { error: 'An invitation has already been sent to this email' }
  }
  invitations.push(data)
  return { success: 'Invitation sent successfully' }
})
