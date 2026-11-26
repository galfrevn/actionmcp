import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export interface TemporaryProject {
  cwd: string
  write: (file: string, content: string) => void
  remove: () => void
}

export function createProject(files: Record<string, string>): TemporaryProject {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'actionmcp-')))
  const write = (file: string, content: string) => {
    const target = join(cwd, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  for (const [file, content] of Object.entries(files)) write(file, content)
  return { cwd, write, remove: () => rmSync(cwd, { recursive: true, force: true }) }
}
