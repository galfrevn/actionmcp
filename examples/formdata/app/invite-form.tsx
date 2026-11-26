'use client'

import { useActionState } from 'react'
import { inviteMember, type ActionState } from './actions'

export function InviteForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(inviteMember, {})
  return (
    <form action={formAction}>
      <input name="email" type="email" placeholder="person@acme.com" aria-label="Email" required />
      <select name="role" defaultValue="member" aria-label="Role">
        <option value="member">Member</option>
        <option value="owner">Owner</option>
      </select>
      <button type="submit" disabled={pending}>
        Invite
      </button>
      {state.error ? <span role="alert">{state.error}</span> : null}
      {state.success ? <span role="status">{state.success}</span> : null}
    </form>
  )
}
