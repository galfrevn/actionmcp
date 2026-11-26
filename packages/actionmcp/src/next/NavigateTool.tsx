'use client'

import { useRouter } from 'next/navigation'
import { useMemo, type ReactNode } from 'react'
import { NAVIGATE_TOOL_NAME } from '../core/names'
import { fail, succeed } from '../core/result'
import type { RouteEntry, SerializableToolDef } from '../core/types'
import { useAgentTools } from '../react/useAgentTools'
import { NAVIGATE_DESCRIPTION, buildHref, navigateInputSchema, type NavigateInput } from './routes'

export interface NavigateToolProps {
  routes: RouteEntry[]
  name?: string | undefined
  polyfill?: boolean | undefined
  exposedTo?: string[] | undefined
}

export function NavigateTool({ routes, name = NAVIGATE_TOOL_NAME, polyfill, exposedTo }: NavigateToolProps): ReactNode {
  const router = useRouter()
  const tools = useMemo<SerializableToolDef[]>(
    () => [
      {
        name,
        description: NAVIGATE_DESCRIPTION,
        inputSchema: navigateInputSchema(routes),
        annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: false },
        confirm: 'never',
        action: async (input: NavigateInput) => {
          try {
            const url = buildHref(routes, input)
            router.push(url)
            return succeed({ url })
          } catch (error) {
            return fail('invalid_input', error instanceof Error ? error.message : String(error))
          }
        },
      },
    ],
    [routes, name, router],
  )
  return useAgentTools(tools, { polyfill, exposedTo })
}
