export interface Todo {
  id: string
  text: string
  done: boolean
}

const shared = globalThis as { exampleTodos?: Map<string, Todo[]> }
const todosByUser = (shared.exampleTodos ??= new Map())

export function todosOf(user: string): Todo[] {
  let todos = todosByUser.get(user)
  if (!todos) {
    todos = []
    todosByUser.set(user, todos)
  }
  return todos
}
