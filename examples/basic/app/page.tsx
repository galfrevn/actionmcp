import { getUser } from '../lib/session'
import { todosOf } from '../lib/todos'
import { TodoList } from './todo-list'

export default async function Page() {
  const user = await getUser()
  return (
    <main>
      <h1>Todos</h1>
      {user ? <TodoList todos={todosOf(user)} /> : <p className="muted">Sign in to see your todos.</p>}
    </main>
  )
}
