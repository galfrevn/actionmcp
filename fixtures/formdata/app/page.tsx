import { store } from '../lib/store'
import { InviteForm } from './invite-form'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <main>
      <h1>Team</h1>
      <InviteForm />
      <ul data-testid="invitations">
        {store.invitations.map((invitation) => (
          <li key={invitation.email}>
            {invitation.email} · {invitation.role} · {invitation.teams.join('+') || 'no teams'} · {invitation.notify ? 'notify' : 'silent'}
          </li>
        ))}
      </ul>
      <ul data-testid="notes">
        {store.notes.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
      </ul>
    </main>
  )
}
