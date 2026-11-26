import { afterEach, describe, expect, it } from 'vitest'
import { createProject, type TemporaryProject } from './__fixtures__/project'
import { createImportResolver } from './imports'

let project: TemporaryProject | undefined

afterEach(() => {
  project?.remove()
  project = undefined
})

describe('createImportResolver', () => {
  it('resolves relative imports with extensions and index files', () => {
    project = createProject({ 'lib/agent.ts': '', 'lib/tools/index.ts': '', 'app/actions.ts': '' })
    const resolve = createImportResolver(project.cwd)
    expect(resolve('app/actions.ts', '../lib/agent')).toBe('lib/agent.ts')
    expect(resolve('app/actions.ts', '../lib/tools')).toBe('lib/tools/index.ts')
    expect(resolve('app/actions.ts', '../missing')).toBeUndefined()
    expect(resolve('app/actions.ts', '../../outside')).toBeUndefined()
  })

  it('resolves the paths of tsconfig.json, with comments and trailing commas', () => {
    project = createProject({
      'tsconfig.json': `{
  // Next.js writes comments here
  "compilerOptions": {
    "baseUrl": ".",
    /* aliases */
    "paths": { "@/*": ["./src/*"], "~agent": ["./src/lib/agent.ts"], "@lib/*": ["./missing/*", "./src/lib/*"], },
  },
}`,
      'src/lib/agent.ts': '',
      'src/app/actions.ts': '',
    })
    const resolve = createImportResolver(project.cwd)
    expect(resolve('src/app/actions.ts', '@/lib/agent')).toBe('src/lib/agent.ts')
    expect(resolve('src/app/actions.ts', '~agent')).toBe('src/lib/agent.ts')
    expect(resolve('src/app/actions.ts', '~agent/other')).toBeUndefined()
    expect(resolve('src/app/actions.ts', '@lib/agent')).toBe('src/lib/agent.ts')
    expect(resolve('src/app/actions.ts', 'zod')).toBeUndefined()
  })

  it('ignores a tsconfig.json that cannot be read', () => {
    project = createProject({ 'tsconfig.json': '{ not json', 'lib/agent.ts': '' })
    expect(createImportResolver(project.cwd)('app/actions.ts', '@/lib/agent')).toBeUndefined()
  })
})
