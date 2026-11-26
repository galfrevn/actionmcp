'use server'

import { AgentToolError, agent } from 'actionmcp/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '../lib/session'
import { todosOf } from '../lib/todos'

const todoSchema = z.object({ id: z.string(), text: z.string(), done: z.boolean() })
const todoId = z.object({ id: z.string().describe('Todo identifier, as returned by listTodos') })

export const listTodos = agent(
  {
    description: 'List the todos of the signed-in user. Returns every item with its id, text, and done flag.',
    readOnly: true,
    untrustedOutput: true,
    output: z.array(todoSchema),
  },
  async () => todosOf(await requireUser()),
)

export const addTodo = agent(
  {
    description: 'Add an item to the todo list of the signed-in user. Returns the created item.',
    title: 'Add todo',
    input: z.object({ text: z.string().trim().min(1).max(200).describe('Todo text') }),
    output: todoSchema,
    untrustedOutput: true,
  },
  async ({ text }) => {
    const todos = todosOf(await requireUser())
    const todo = { id: crypto.randomUUID(), text, done: false }
    todos.push(todo)
    revalidatePath('/')
    return todo
  },
)

export const toggleTodo = agent(
  {
    description: 'Mark a todo of the signed-in user as done, or as not done if it already is. Returns the updated item.',
    title: 'Toggle todo',
    input: todoId,
    output: todoSchema,
    untrustedOutput: true,
  },
  async ({ id }) => {
    const todo = todosOf(await requireUser()).find((candidate) => candidate.id === id)
    if (!todo) throw new AgentToolError('not_found', `There is no todo with the id ${id}.`)
    todo.done = !todo.done
    revalidatePath('/')
    return todo
  },
)

export const removeTodo = agent(
  {
    description: 'Permanently remove a todo of the signed-in user. Returns the id of the removed item.',
    title: 'Remove todo',
    input: todoId,
  },
  async ({ id }) => {
    const todos = todosOf(await requireUser())
    const index = todos.findIndex((candidate) => candidate.id === id)
    if (index === -1) throw new AgentToolError('not_found', `There is no todo with the id ${id}.`)
    todos.splice(index, 1)
    revalidatePath('/')
    return { id }
  },
)
