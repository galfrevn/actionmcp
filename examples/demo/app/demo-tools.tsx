'use client'

import { AgentToolsProvider, ConfirmDialog, type ConfirmProps } from 'actionmcp/client'
import { createContext, useContext, type ReactNode } from 'react'
import type { Todo } from '../lib/todos'

const TodosContext = createContext<Todo[]>([])

function targetId(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || !('id' in input)) return undefined
  return typeof input.id === 'string' ? input.id : undefined
}

function heading(name: string, todo: Todo): string | undefined {
  if (name === 'removeTodo') return `Remove “${todo.text}”?`
  if (name === 'toggleTodo') return todo.done ? `Mark “${todo.text}” as not done?` : `Mark “${todo.text}” as done?`
  return undefined
}

function ConfirmTodoChange(props: ConfirmProps): ReactNode {
  const todos = useContext(TodosContext)
  const id = targetId(props.call.input)
  if (id === undefined) return <ConfirmDialog {...props} />
  const todo = todos.find((candidate) => candidate.id === id)
  if (!todo) {
    return <ConfirmDialog {...props} description={`${props.description} No todo on this page has this id.`} />
  }
  const title = heading(props.call.name, todo)
  return title ? <ConfirmDialog {...props} labels={{ ...props.labels, title }} /> : <ConfirmDialog {...props} />
}

export function DemoTools({ todos, children }: { todos: Todo[]; children: ReactNode }): ReactNode {
  return (
    <TodosContext value={todos}>
      <AgentToolsProvider confirmComponent={ConfirmTodoChange}>{children}</AgentToolsProvider>
    </TodosContext>
  )
}
