import { afterEach, describe, expect, it } from 'vitest'
import { createProject, type TemporaryProject } from '../analyzer/__fixtures__/project'
import { resolveConfig } from '../analyzer/config'
import { generate } from './index'

const FILE_COUNT = 500
const COLD_BUDGET_MS = 1500
const JSDOC_BUDGET_MS = 4000

let project: TemporaryProject | undefined

afterEach(() => {
  project?.remove()
  project = undefined
})

function agentModule(index: number): string {
  return `'use server'
import { agent } from 'actionmcp/server'
import { z } from 'zod'

export const tool${index} = agent(
  { description: 'Update record ${index} for the signed-in user. Returns the record.', input: z.object({ id: z.string(), value: z.number() }) },
  async ({ id, value }) => {
    await requireUser()
    return { id, value }
  },
)
`
}

function jsdocModule(index: number): string {
  return `'use server'

/**
 * Update record ${index} for the signed-in user. Returns the record.
 * @agent
 */
export async function update${index}(input: { id: string; value: number; note?: string }) {
  await requireUser()
  return schema.parse(input)
}
`
}

function plainModule(index: number): string {
  return `export function helper${index}(value: number) {\n  return value + ${index}\n}\n`
}

function createLargeProject(toolModule: (index: number) => string): TemporaryProject {
  const files: Record<string, string> = {
    'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler' } }),
  }
  for (let index = 0; index < FILE_COUNT; index += 1) {
    files[`lib/module${index}.ts`] = index % 20 === 0 ? toolModule(index) : plainModule(index)
  }
  return createProject(files)
}

describe('generate performance budget', () => {
  it(`handles ${FILE_COUNT} files in under ${COLD_BUDGET_MS} ms cold without the JSDoc path`, async () => {
    project = createLargeProject(agentModule)
    const { analysis, durationMs } = await generate(resolveConfig({}, project.cwd))
    expect(analysis.tools).toHaveLength(FILE_COUNT / 20)
    expect(durationMs).toBeLessThan(COLD_BUDGET_MS)
  })

  it(`handles ${FILE_COUNT} files in under ${JSDOC_BUDGET_MS} ms cold with the JSDoc path`, async () => {
    project = createLargeProject(jsdocModule)
    const { analysis, durationMs } = await generate(resolveConfig({ jsdoc: true }, project.cwd))
    expect(analysis.tools).toHaveLength(FILE_COUNT / 20)
    expect(analysis.tools.every((tool) => tool.inputSchema !== undefined)).toBe(true)
    expect(durationMs).toBeLessThan(JSDOC_BUDGET_MS)
  })
})
