export interface Task {
  id: string
  title: string
  priority: 'low' | 'high'
  assignee: string
}

const shared = globalThis as { fixtureTasks?: Task[] }

export const tasks: Task[] = (shared.fixtureTasks ??= [
  { id: 't1', title: 'Write the release notes', priority: 'high', assignee: 'ana' },
  { id: 't2', title: 'Update the changelog', priority: 'low', assignee: 'design' },
])
