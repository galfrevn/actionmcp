import { getUser } from '../lib/session'
import { members } from '../lib/team'
import { InviteForm } from './invite-form'

export default async function Page() {
  const user = await getUser()
  return (
    <main>
      <h1>Team</h1>
      {user ? <InviteForm /> : <p className="muted">Sign in to invite people.</p>}
      <ul>
        {members.map((member) => (
          <li key={member.email}>
            <span style={{ flex: 1 }}>{member.email}</span>
            <span className="muted">{member.role}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
