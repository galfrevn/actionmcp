import { cookies } from 'next/headers'

export default async function Page() {
  const user = (await cookies()).get('user')?.value
  return (
    <main>
      <h1>Account</h1>
      <p data-testid="user">{user ?? 'signed out'}</p>
    </main>
  )
}
