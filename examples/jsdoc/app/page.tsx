import { tasks } from '../lib/tasks'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <main>
      <h1>Tasks</h1>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <span className={task.done ? 'done' : undefined} style={{ flex: 1 }}>
              {task.title}
            </span>
            <span className="muted">{task.priority}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
