import { describe, expect, it, vi } from 'vitest'

const install = vi.fn()
let failures = 1

vi.mock('@w3c/webmcp-polyfill', () => {
  if (failures > 0) {
    failures -= 1
    throw new Error('Failed to fetch dynamically imported module')
  }
  return { installWebMCP: install }
})

describe('loadPolyfill', () => {
  it('loads the polyfill again after a failed import', async () => {
    Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
    const { loadPolyfill } = await import('./webmcp')
    await expect(loadPolyfill()).rejects.toThrow()
    vi.resetModules()
    await expect(loadPolyfill()).resolves.toBeUndefined()
    expect(install).toHaveBeenCalledOnce()
  })
})
