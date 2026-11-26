import { store } from '../lib/store'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <main>
      <h1>Todos</h1>
      <ul data-testid="todos">
        {store.todos.map((todo) => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
    </main>
  )
}
