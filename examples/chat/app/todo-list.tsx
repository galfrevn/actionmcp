'use client'

import { useRef, useTransition } from 'react'
import type { Todo } from '../lib/todos'
import { addTodo, removeTodo, toggleTodo } from './actions'

export function TodoList({ todos }: { todos: Todo[] }) {
  const form = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()

  const submit = (formData: FormData) => {
    startTransition(async () => {
      await addTodo({ text: String(formData.get('text') ?? '') })
      form.current?.reset()
    })
  }

  return (
    <>
      <form ref={form} action={submit}>
        <input name="text" placeholder="What needs to be done?" aria-label="Todo text" required maxLength={200} />
        <button type="submit" disabled={pending}>
          Add
        </button>
      </form>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <input
              type="checkbox"
              checked={todo.done}
              aria-label={`Mark "${todo.text}" as done`}
              onChange={() => startTransition(async () => void (await toggleTodo({ id: todo.id })))}
            />
            <span className={todo.done ? 'done' : undefined} style={{ flex: 1 }}>
              {todo.text}
            </span>
            <button type="button" onClick={() => startTransition(async () => void (await removeTodo({ id: todo.id })))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      {todos.length === 0 ? <p className="muted">No todos yet. Add one here, or ask an agent to add it.</p> : null}
    </>
  )
}
