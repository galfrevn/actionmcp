export interface Todo {
  id: number
  text: string
}

interface TodoStore {
  todos: Todo[]
  nextId: number
}

const shared = globalThis as { fixtureTodoStore?: TodoStore }

export const store: TodoStore = (shared.fixtureTodoStore ??= { todos: [], nextId: 1 })
