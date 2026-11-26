'use server'

import { agent } from 'actionmcp/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '../lib/auth'
import { store } from '../lib/store'

export const listTodos = agent(
  { description: 'List the todos of the signed-in user. Returns an array of items.', readOnly: true },
  async () => {
    await requireUser()
    return store.todos
  },
)

export const addTodo = agent(
  {
    description: 'Add an item to the todo list of the signed-in user. Returns the created item.',
    title: 'Add todo',
    input: z.object({ text: z.string().min(1).max(200).describe('Todo text') }),
    output: z.object({ id: z.number(), text: z.string() }),
    untrustedOutput: true,
  },
  async ({ text }) => {
    const owner = await requireUser()
    const todo = { id: store.nextId++, text, owner }
    store.todos.push({ id: todo.id, text })
    revalidatePath('/')
    return todo
  },
)
