import generatedRegistry from 'actionmcp/registry'
import type { ReactNode } from 'react'
import { NAVIGATE_TOOL_NAME, applyPrefix } from '../core/names'
import { NavigateTool } from '../next/NavigateTool'
import { selectRoutes, type NavigateOptions } from '../next/routes'
import type { AgentToolRegistry } from '../server/registry'
import { MAX_TOOLS_PER_ROUTE, selectTools } from '../server/resolve'
import { Registrar } from './Registrar'

export interface AgentToolsProps {
  registry?: AgentToolRegistry
  include?: string[]
  exclude?: string[]
  prefix?: string
  navigate?: boolean | NavigateOptions
  exposedTo?: string[]
  polyfill?: boolean
  originTrialToken?: string
}

export function AgentTools({
  registry = generatedRegistry,
  include,
  exclude,
  prefix,
  navigate = false,
  exposedTo,
  polyfill = false,
  originTrialToken = process.env.NEXT_PUBLIC_WEBMCP_OT_TOKEN,
}: AgentToolsProps): ReactNode {
  const tools = selectTools(registry, { include, exclude, prefix })
  const routes = navigate ? selectRoutes(registry.routes, navigate) : []
  if (process.env.NODE_ENV !== 'production' && tools.length > MAX_TOOLS_PER_ROUTE) {
    console.warn(
      `actionmcp: AT104 ${tools.length} tools are registered by one <AgentTools />. Agents may truncate lists longer than ${MAX_TOOLS_PER_ROUTE}. Use include or exclude to scope them.`,
    )
  }
  return (
    <>
      {originTrialToken ? <meta httpEquiv="origin-trial" content={originTrialToken} /> : null}
      <Registrar tools={tools} polyfill={polyfill} exposedTo={exposedTo} />
      {routes.length > 0 ? (
        <NavigateTool routes={routes} name={applyPrefix(NAVIGATE_TOOL_NAME, prefix)} polyfill={polyfill} exposedTo={exposedTo} />
      ) : null}
    </>
  )
}
