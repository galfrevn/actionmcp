import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'
import { describe, expect, it } from 'vitest'

const coreDirectory = fileURLToPath(new URL('.', import.meta.url))
const ALLOWED_EXTERNALS = ['@standard-schema/spec', '@w3c/webmcp-polyfill', 'webmcp-types']

describe('core isolation', () => {
  it('bundles on its own without next, react, or the other layers', async () => {
    const entries = readdirSync(coreDirectory)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .map((file) => `${coreDirectory}${file}`)
    const externals: string[] = []
    const bundle = await rolldown({
      input: entries,
      logLevel: 'silent',
      external: (id) => {
        const isExternal = !id.startsWith('.') && !id.startsWith('/')
        if (isExternal) externals.push(id)
        return isExternal
      },
    })
    const { output } = await bundle.generate({ format: 'esm' })
    const modules = output.flatMap((chunk) => (chunk.type === 'chunk' ? chunk.moduleIds : []))

    expect(modules.length).toBeGreaterThanOrEqual(entries.length)
    expect(modules.filter((id) => !id.startsWith(coreDirectory))).toEqual([])
    expect([...new Set(externals)].toSorted()).toEqual(ALLOWED_EXTERNALS.filter((name) => externals.includes(name)))
    expect(externals.some((id) => id === 'next' || id.startsWith('next/') || id.startsWith('react'))).toBe(false)
  })
})
