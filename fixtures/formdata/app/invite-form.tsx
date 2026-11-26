'use client'

import { useActionState } from 'react'
import { inviteMember, type ActionState } from './actions'

export function InviteForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(inviteMember, {})
  return (
    <form action={formAction}>
      <label>
        Email <input name="email" type="email" required />
      </label>
      <label>
        Role{' '}
        <select name="role" defaultValue="member">
          <option value="member">Member</option>
          <option value="owner">Owner</option>
        </select>
      </label>
      <label>
        <input name="notify" type="checkbox" /> Notify by email
      </label>
      <button type="submit" disabled={pending}>
        Invite
      </button>
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">{state.success}</p> : null}
    </form>
  )
}
