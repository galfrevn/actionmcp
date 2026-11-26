import { getUser } from '../lib/session'
import { todosOf } from '../lib/todos'
import { Chat } from './chat'
import { TodoList } from './todo-list'

export default async function Page() {
  const user = await getUser()
  if (!user) {
    return (
      <main>
        <h1>Todos</h1>
        <p className="muted">Sign in to see your todos and to use the assistant.</p>
      </main>
    )
  }
  return (
    <main className="layout">
      <section>
        <h1>Todos</h1>
        <TodoList todos={todosOf(user)} />
      </section>
      <Chat />
    </main>
  )
}
