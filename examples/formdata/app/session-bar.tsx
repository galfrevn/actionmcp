import { getUser } from '../lib/session'
import { signIn, signOut } from './session-actions'

export async function SessionBar() {
  const user = await getUser()
  return (
    <div className="session">
      <span className="muted">{user ? `Signed in as ${user}` : 'Signed out. The tools return an auth error until you sign in.'}</span>
      <form action={user ? signOut : signIn} style={{ margin: 0 }}>
        <button type="submit">{user ? 'Sign out' : 'Sign in as demo'}</button>
      </form>
    </div>
  )
}
