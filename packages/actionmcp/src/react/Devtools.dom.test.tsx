import { afterEach, describe, expect, it, vi } from 'vitest'

async function renderDevtools(): Promise<() => Promise<void>> {
  vi.resetModules()
  const { act, createElement } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { AgentToolsDevtools } = await import('./Devtools')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(createElement(AgentToolsDevtools)))
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
  return async () => {
    await act(async () => root.unmount())
    container.remove()
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AgentToolsDevtools', () => {
  it('renders the panel toggle in development', async () => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
    vi.stubEnv('NODE_ENV', 'development')
    const unmount = await renderDevtools()
    expect(document.querySelector('[data-actionmcp-devtools="toggle"]')).not.toBeNull()
    await unmount()
  })

  it('renders nothing in a production build', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const unmount = await renderDevtools()
    expect(document.querySelector('[data-actionmcp-devtools]')).toBeNull()
    await unmount()
  })
})
