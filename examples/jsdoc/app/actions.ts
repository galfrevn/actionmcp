'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '../lib/session'
import { tasks } from '../lib/tasks'

export type Priority = 'low' | 'high'

export interface TaskFilters {
  /** Free-text search over task titles. */
  query?: string
  /** Only tasks with this priority. */
  priority?: Priority
  /** Include tasks that are already done. */
  includeDone?: boolean
}

export interface RenameTaskInput {
  /** Task identifier, as returned by searchTasks. */
  taskId: string
  /** New title, 1 to 120 characters. */
  title: string
}

const filtersSchema = z.object({
  query: z.string().optional(),
  priority: z.enum(['low', 'high']).optional(),
  includeDone: z.boolean().optional(),
})

const renameSchema = z.object({ taskId: z.string(), title: z.string().trim().min(1).max(120) })

/**
 * Search the tasks of the current workspace. Returns the matching tasks.
 * @agent readonly untrusted-output
 */
export async function searchTasks(filters: TaskFilters) {
  await requireUser()
  const { query, priority, includeDone } = filtersSchema.parse(filters)
  return tasks.filter(
    (task) =>
      (includeDone || !task.done) &&
      (!priority || task.priority === priority) &&
      (!query || task.title.toLowerCase().includes(query.toLowerCase())),
  )
}

/**
 * Rename a task of the current workspace. Returns the updated task.
 * @agent consequential name=task.rename
 */
export async function renameTask(input: RenameTaskInput) {
  await requireUser()
  const { taskId, title } = renameSchema.parse(input)
  const task = tasks.find((candidate) => candidate.id === taskId)
  if (!task) {
    return { error: `There is no task with the id ${taskId}.` }
  }
  task.title = title
  revalidatePath('/')
  return task
}
