import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { SerializableToolDef } from '../core/types'
import { NavigateTool } from '../next/NavigateTool'
import { agent } from '../server/agent'
import { createRegistry } from '../server/registry'
import { AgentTools } from './AgentTools'
import { Registrar } from './Registrar'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const registry = createRegistry({
  agent: {
    'todos.add': agent({ description: 'Add an item to the todo list.', input: z.object({ text: z.string() }) }, async ({ text }) => text),
    'todos.list': agent({ description: 'List the todos of the signed-in user.', readOnly: true }, async () => []),
    'team.invite': agent({ description: 'Invite a person to the team by email.' }, async () => null),
  },
  routes: [
    { pattern: '/', params: [] },
    { pattern: '/projects/[id]', params: ['id'] },
  ],
})

function rendered(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<{ children?: ReactNode }>(node)) throw new Error('AgentTools did not return an element')
  return Children.toArray(node.props.children).filter((child) => isValidElement<Record<string, unknown>>(child))
}

function toolNames(node: ReactNode): string[] {
  const registrar = rendered(node).find((element) => element.type === Registrar)
  const tools = (registrar?.props.tools ?? []) as SerializableToolDef[]
  return tools.map((tool) => tool.name)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AgentTools', () => {
  it('passes every tool of the registry to the Registrar, with the polyfill off', () => {
    const [registrar, ...others] = rendered(AgentTools({ registry }))
    expect(others).toEqual([])
    expect(registrar?.type).toBe(Registrar)
    expect(registrar?.props.polyfill).toBe(false)
    expect(toolNames(AgentTools({ registry }))).toEqual(['todos.add', 'todos.list', 'team.invite'])
  })

  it('scopes the tools with include and exclude, and applies the prefix', () => {
    expect(toolNames(AgentTools({ registry, include: ['todos.*'], exclude: ['todos.add'], prefix: 'app_' }))).toEqual(['app_todos.list'])
  })

  it('renders the origin trial token from the prop or from the environment', () => {
    const fromProp = rendered(AgentTools({ registry, originTrialToken: 'prop-token' })).find((element) => element.type === 'meta')
    expect(fromProp?.props).toMatchObject({ httpEquiv: 'origin-trial', content: 'prop-token' })
    vi.stubEnv('NEXT_PUBLIC_WEBMCP_OT_TOKEN', 'env-token')
    const fromEnvironment = rendered(AgentTools({ registry })).find((element) => element.type === 'meta')
    expect(fromEnvironment?.props.content).toBe('env-token')
  })

  it('adds the navigate tool with the static routes, the prefix, and the registration options', () => {
    const navigate = rendered(
      AgentTools({ registry, navigate: true, prefix: 'app_', polyfill: true, exposedTo: ['https://agent.example'] }),
    ).find((element) => element.type === NavigateTool)
    expect(navigate?.props).toEqual({
      routes: [{ pattern: '/', params: [] }],
      name: 'app_navigate',
      polyfill: true,
      exposedTo: ['https://agent.example'],
    })
  })

  it('lists the routes that the navigate globs allow, and no navigate tool without a match', () => {
    const allowed = rendered(AgentTools({ registry, navigate: { routes: ['/projects/*'] } })).find(
      (element) => element.type === NavigateTool,
    )
    expect(allowed?.props.routes).toEqual([{ pattern: '/projects/[id]', params: ['id'] }])
    expect(rendered(AgentTools({ registry, navigate: { routes: ['/missing'] } })).some((element) => element.type === NavigateTool)).toBe(
      false,
    )
  })

  it('warns with AT104 above 32 tools and not at 32', () => {
    const many = (count: number) =>
      createRegistry({
        agent: Object.fromEntries(
          Array.from({ length: count }, (_, index) => [`tool${index}`, agent({ description: `Run task ${index}.` }, async () => index)]),
        ),
      })
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    AgentTools({ registry: many(32) })
    expect(warned).not.toHaveBeenCalled()
    AgentTools({ registry: many(33) })
    expect(warned).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('AT104 33 tools'))
    warned.mockRestore()
  })
})
