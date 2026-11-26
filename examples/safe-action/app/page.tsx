import { profileOf } from '../lib/profile'
import { getUser } from '../lib/session'

export default async function Page() {
  const user = await getUser()
  const profile = user ? profileOf(user) : undefined
  return (
    <main>
      <h1>Profile</h1>
      {profile ? (
        <dl>
          <dt className="muted">Display name</dt>
          <dd data-testid="display-name">{profile.displayName}</dd>
          <dt className="muted">Bio</dt>
          <dd data-testid="bio">{profile.bio || 'No bio yet.'}</dd>
        </dl>
      ) : (
        <p className="muted">Sign in to see your profile.</p>
      )}
    </main>
  )
}
