import { tasks } from '../lib/store'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <main>
      <h1>Tasks</h1>
      <ul data-testid="tasks">
        {tasks.map((task) => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
    </main>
  )
}
