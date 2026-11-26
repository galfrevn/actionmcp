import { readDatabase } from '../../lib/db'
import { ActionForm } from '../action-form'
import { inviteTeamMember, removeTeamMember } from '../actions'

export default function TeamPage() {
  const { members } = readDatabase()
  return (
    <main>
      <h1>Team</h1>
      <ActionForm action={inviteTeamMember} submitLabel="Invite">
        <input name="email" type="email" placeholder="person@example.com" aria-label="Email" required />
        <select name="role" defaultValue="member" aria-label="Role">
          <option value="member">Member</option>
          <option value="owner">Owner</option>
        </select>
      </ActionForm>
      <ul>
        {members.map((member) => (
          <li key={member.id}>
            <span style={{ flex: 1 }}>
              {member.name} <span className="muted">{member.email}</span>
            </span>
            <span className="muted">{member.role}</span>
            <ActionForm action={removeTeamMember} submitLabel={`Remove ${member.name}`}>
              <input type="hidden" name="memberId" value={member.id} />
            </ActionForm>
          </li>
        ))}
      </ul>
    </main>
  )
}
