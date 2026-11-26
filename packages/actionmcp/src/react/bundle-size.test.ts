import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { rolldown } from 'rolldown'
import { describe, expect, it } from 'vitest'

const CLIENT_BUDGET_BYTES = 4608

describe('client bundle budget', () => {
  it('keeps Registrar and Confirm under 4.5 KB gzip without the polyfill', async () => {
    const bundle = await rolldown({
      input: fileURLToPath(new URL('./Registrar.tsx', import.meta.url)),
      logLevel: 'silent',
      external: ['react', 'react/jsx-runtime', '@w3c/webmcp-polyfill'],
      transform: { define: { 'process.env.NODE_ENV': '"production"' } },
    })
    const { output } = await bundle.generate({ format: 'esm', minify: true })
    const code = output.map((chunk) => (chunk.type === 'chunk' ? chunk.code : '')).join('')
    const gzipped = gzipSync(code).byteLength

    expect(code).toContain('showModal')
    expect(code).not.toContain('installWebMCP()')
    expect(gzipped).toBeLessThan(CLIENT_BUDGET_BYTES)
  })
})
