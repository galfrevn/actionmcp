'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '../lib/auth'
import { tasks } from '../lib/store'

export type Priority = 'low' | 'high'

export interface TaskFilters {
  /** Free-text search over task titles. */
  query?: string
  priority?: Priority
  /** Who the task is assigned to. */
  assignee?: { kind: 'user'; id: string } | { kind: 'team'; slug: string }
}

function assertRenameInput(input: unknown): asserts input is { taskId: string; title: string } {
  const candidate = input as { taskId?: unknown; title?: unknown } | null
  if (typeof candidate?.taskId !== 'string' || typeof candidate.title !== 'string' || candidate.title.trim() === '') {
    throw new Error('Pass a taskId and a non-empty title.')
  }
}

/**
 * Search the tasks of the current workspace. Returns the matching tasks.
 * @agent readonly untrusted-output
 */
export async function searchTasks(filters: TaskFilters) {
  await requireUser()
  const assignee = filters.assignee?.kind === 'user' ? filters.assignee.id : filters.assignee?.slug
  return tasks.filter(
    (task) =>
      (!filters.query || task.title.toLowerCase().includes(String(filters.query).toLowerCase())) &&
      (!filters.priority || task.priority === filters.priority) &&
      (!assignee || task.assignee === assignee),
  )
}

/**
 * Rename a task of the current workspace. Returns the updated task.
 * @agent consequential name=task.rename
 */
export async function renameTask(input: { taskId: string; title: string }) {
  await requireUser()
  assertRenameInput(input)
  const task = tasks.find((candidate) => candidate.id === input.taskId)
  if (!task) {
    return { error: `There is no task with the id ${input.taskId}.` }
  }
  task.title = input.title.trim()
  revalidatePath('/')
  return task
}

export async function deleteAllTasks() {
  await requireUser()
  tasks.length = 0
}
