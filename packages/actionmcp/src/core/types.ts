export type ConfirmPolicy = 'always' | 'consequential' | 'never'

export type ToolAdapter = 'formdata' | 'safe-action'

export type JsonSchema = Record<string, unknown>

export interface ToolAnnotations {
  readOnlyHint: boolean
  consequentialHint: boolean
  untrustedContentHint: boolean
}

export type ServerFunction = (...args: never[]) => Promise<unknown>

export interface SerializableToolDef {
  name: string
  title?: string
  description: string
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
  annotations: ToolAnnotations
  confirm: ConfirmPolicy
  adapter?: ToolAdapter
  action: ServerFunction
}

export interface ToolCall {
  name: string
  input: unknown
  annotations: ToolAnnotations
  source: 'agent'
}

export interface RouteEntry {
  pattern: string
  params: string[]
  catchAll?: string
  optionalCatchAll?: string
  title?: string
  staticParams?: boolean
}
