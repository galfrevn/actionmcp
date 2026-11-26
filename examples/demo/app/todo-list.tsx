'use client'

import type { AgentResult } from 'actionmcp/server'
import { useRef, useState, useTransition } from 'react'
import { MAX_TEXT_LENGTH, MAX_TODOS } from '../lib/limits'
import type { Todo } from '../lib/todos'
import { addTodo, removeTodo, toggleTodo } from './actions'

export function TodoList({ todos }: { todos: Todo[] }) {
  const form = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  const run = (action: () => Promise<AgentResult<unknown>>, onSuccess?: () => void) => {
    startTransition(async () => {
      const result = await action()
      setError(result.ok ? undefined : result.error.message)
      if (result.ok) onSuccess?.()
    })
  }

  return (
    <>
      <form
        ref={form}
        action={(formData) =>
          run(
            () => addTodo({ text: String(formData.get('text') ?? '') }),
            () => form.current?.reset(),
          )
        }
      >
        <input name="text" placeholder="What needs to be done?" aria-label="Todo text" required maxLength={MAX_TEXT_LENGTH} />
        <button type="submit" disabled={pending}>
          Add
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      <ul aria-label="Todos">
        {todos.map((todo) => (
          <li key={todo.id}>
            <input
              type="checkbox"
              checked={todo.done}
              aria-label={`Mark "${todo.text}" as done`}
              onChange={() => run(() => toggleTodo({ id: todo.id }))}
            />
            <span className={todo.done ? 'done' : undefined} style={{ flex: 1 }}>
              {todo.text}
            </span>
            <button type="button" onClick={() => run(() => removeTodo({ id: todo.id }))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <p className="muted">
        {todos.length} of {MAX_TODOS} todos.
      </p>
    </>
  )
}
