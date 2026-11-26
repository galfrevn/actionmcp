import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProject, type TemporaryProject } from '../analyzer/__fixtures__/project'
import { resolveConfig } from '../analyzer/config'

class FakeWatcher extends EventEmitter {
  close = vi.fn()
}

const watchers: FakeWatcher[] = []
const failures: Error[] = []

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    watch: vi.fn(() => {
      const failure = failures.shift()
      if (failure) throw failure
      const watcher = new FakeWatcher()
      watchers.push(watcher)
      return watcher
    }),
  }
})

const { watchProject } = await import('./watch')

let project: TemporaryProject | undefined

afterEach(() => {
  project?.remove()
  project = undefined
  watchers.length = 0
  failures.length = 0
})

describe('watchProject errors', () => {
  it('reports an error of a watcher, closes it, and keeps the others', () => {
    project = createProject({ 'app/page.tsx': 'export default function Page() { return null }\n', 'lib/a.ts': '' })
    const errors: unknown[] = []
    const handle = watchProject(resolveConfig({}, project.cwd), { onResult: () => {}, onError: (error) => errors.push(error) })
    expect(watchers).toHaveLength(3)
    const limit = Object.assign(new Error('ENOSPC: System limit for number of file watchers reached'), { code: 'ENOSPC' })
    expect(() => watchers[0]?.emit('error', limit)).not.toThrow()
    expect(errors).toEqual([limit])
    expect(watchers[0]?.close).toHaveBeenCalledOnce()
    handle.close()
    expect(watchers.map((watcher) => watcher.close.mock.calls.length)).toEqual([1, 1, 1])
  })

  it('reports a watcher that cannot start and starts the others', () => {
    project = createProject({ 'app/page.tsx': 'export default function Page() { return null }\n', 'lib/a.ts': '' })
    const errors: unknown[] = []
    const failure = new Error('EMFILE: too many open files, watch')
    failures.push(failure)
    const handle = watchProject(resolveConfig({}, project.cwd), { onResult: () => {}, onError: (error) => errors.push(error) })
    expect(errors).toEqual([failure])
    expect(watchers).toHaveLength(2)
    handle.close()
  })
})
