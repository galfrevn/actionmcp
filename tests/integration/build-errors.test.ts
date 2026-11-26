import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixturePath, nextBuild, repositoryRoot, type Bundler } from './next'

const project = join(repositoryRoot, 'tests/integration/.tmp/broken')
const BROKEN_TOOL = `
const dynamicDescription = String(process.env.TOOL_DESCRIPTION)

export const brokenTool = agent({ description: dynamicDescription }, async () => {
  await requireUser()
})
`

beforeAll(() => {
  rmSync(project, { recursive: true, force: true })
  mkdirSync(project, { recursive: true })
  for (const entry of ['app', 'lib', 'next.config.ts', 'tsconfig.json', 'package.json']) {
    cpSync(fixturePath('basic', entry), join(project, entry), { recursive: true })
  }
  symlinkSync(fixturePath('basic', 'node_modules'), join(project, 'node_modules'))
  const actions = join(project, 'app/actions.ts')
  writeFileSync(actions, `${readFileSync(actions, 'utf8')}${BROKEN_TOOL}`)
})

afterAll(() => {
  rmSync(join(repositoryRoot, 'tests/integration/.tmp'), { recursive: true, force: true })
})

describe.each<Bundler>(['turbopack', 'webpack'])('next build with %s and an AT0xx error', (bundler) => {
  it('aborts with the diagnostic code, the file, and the line', async () => {
    const build = await nextBuild(project, bundler)
    expect(build.code).not.toBe(0)
    expect(build.output).toContain('actionmcp found 1 error(s) in the agent tools')
    expect(build.output).toMatch(/AT005 app\/actions\.ts:\d+:\d+ Tool options are not literals: the description is not a string literal/)
    expect(build.output).toContain('fix: Pass an object literal without spreads, with a string literal `description`')
  })
})
