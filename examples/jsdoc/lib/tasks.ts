export interface Task {
  id: string
  title: string
  priority: 'low' | 'high'
  done: boolean
}

const shared = globalThis as { exampleTasks?: Task[] }

export const tasks: Task[] = (shared.exampleTasks ??= [
  { id: 't1', title: 'Write the release notes', priority: 'high', done: false },
  { id: 't2', title: 'Update the changelog', priority: 'low', done: false },
])
