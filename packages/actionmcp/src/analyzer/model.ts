import type { ConfirmPolicy, JsonSchema, RouteEntry, ToolAdapter, ToolAnnotations } from '../core/types'
import type { Diagnostic } from './diagnostics'

export type AnalyzedToolKind = 'agent' | 'jsdoc' | 'explicit' | 'navigate'

export type SchemaSource = 'standard-schema' | 'typescript' | 'none'

export interface ToolSource {
  file: string
  export: string
  line: number
}

export interface AnalyzedTool {
  name: string
  kind: AnalyzedToolKind
  source: ToolSource
  description: string
  schemaSource: SchemaSource
  annotations: ToolAnnotations
  confirm: ConfirmPolicy
  adapter?: ToolAdapter
  validated: boolean
  diagnostics: string[]
  inputSchema?: JsonSchema
  inputSource?: string
}

export interface AnalysisResult {
  tools: AnalyzedTool[]
  routes: RouteEntry[]
  diagnostics: Diagnostic[]
  registry: string | undefined
}
