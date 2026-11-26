import { readDatabase } from '../lib/db'

export default function Page() {
  const { members } = readDatabase()
  return (
    <main>
      <h1>Home</h1>
      <p>
        The team has {members.length} members and {members.filter((member) => member.role === 'owner').length} owners.
      </p>
    </main>
  )
}
