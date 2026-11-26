'use server'

import { AgentToolError, agent } from 'actionmcp/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { MAX_TEXT_LENGTH } from '../lib/limits'
import { newTodoId, requireTodos, todoSchema, writeTodos } from '../lib/todos'

const todoId = z.object({ id: z.string().describe('Todo identifier, as returned by listTodos') })

export const listTodos = agent(
  {
    description: 'List the todos of the current visitor. Returns every item with its id, text, and done flag.',
    readOnly: true,
    untrustedOutput: true,
    output: z.array(todoSchema),
  },
  async () => requireTodos(),
)

export const addTodo = agent(
  {
    description: 'Add an item to the todo list of the current visitor. The list holds up to 8 items. Returns the created item.',
    title: 'Add todo',
    input: z.object({ text: z.string().trim().min(1).max(MAX_TEXT_LENGTH).describe('Todo text') }),
    output: todoSchema,
    untrustedOutput: true,
  },
  async ({ text }) => {
    const todos = await requireTodos()
    const todo = { id: newTodoId(), text, done: false }
    await writeTodos([...todos, todo])
    revalidatePath('/')
    return todo
  },
)

export const toggleTodo = agent(
  {
    description: 'Mark a todo of the current visitor as done, or as not done if it already is. Returns the updated item.',
    title: 'Toggle todo',
    input: todoId,
    output: todoSchema,
    untrustedOutput: true,
  },
  async ({ id }) => {
    const todos = await requireTodos()
    const todo = todos.find((candidate) => candidate.id === id)
    if (!todo) throw new AgentToolError('not_found', `There is no todo with the id ${id}.`)
    const updated = { ...todo, done: !todo.done }
    await writeTodos(todos.map((candidate) => (candidate.id === id ? updated : candidate)))
    revalidatePath('/')
    return updated
  },
)

export const removeTodo = agent(
  {
    description: 'Permanently remove a todo of the current visitor. Returns the id of the removed item.',
    title: 'Remove todo',
    input: todoId,
  },
  async ({ id }) => {
    const todos = await requireTodos()
    if (!todos.some((candidate) => candidate.id === id)) {
      throw new AgentToolError('not_found', `There is no todo with the id ${id}.`)
    }
    await writeTodos(todos.filter((candidate) => candidate.id !== id))
    revalidatePath('/')
    return { id }
  },
)
