import { createSelector } from '../core/match'
import { applyPrefix, checkToolNames, describeNameIssue } from '../core/names'
import { convertSchema } from '../core/schema'
import type { JsonSchema, SerializableToolDef } from '../core/types'
import type { AgentToolRegistry, RegistryEntry } from './registry'

export interface ToolSelection {
  include?: readonly string[] | undefined
  exclude?: readonly string[] | undefined
  prefix?: string | undefined
}

export const MAX_TOOLS_PER_ROUTE = 32

const resolved = new WeakMap<AgentToolRegistry, SerializableToolDef[]>()

export function resolveTools(registry: AgentToolRegistry): SerializableToolDef[] {
  let tools = resolved.get(registry)
  if (!tools) {
    tools = registry.entries.map(resolveEntry)
    resolved.set(registry, tools)
  }
  return tools
}

export function selectTools(registry: AgentToolRegistry, selection: ToolSelection): SerializableToolDef[] {
  const isSelected = createSelector(selection)
  const tools = resolveTools(registry)
    .filter((tool) => isSelected(tool.name))
    .map((tool) => ({ ...tool, name: applyPrefix(tool.name, selection.prefix) }))
  const issues = checkToolNames(tools.map((tool) => tool.name))
  if (issues.length === 0) return tools
  const message = issues.map(describeNameIssue).join(' ')
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`actionmcp: ${message}`)
  }
  console.warn(`actionmcp: ${message}`)
  const rejected = new Set(issues.map((issue) => issue.name))
  return tools.filter((tool) => !rejected.has(tool.name))
}

export function wrapOutputSchema(data: JsonSchema): JsonSchema {
  return {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      data,
      error: {
        type: 'object',
        properties: { code: { type: 'string' }, message: { type: 'string' } },
        required: ['code', 'message'],
      },
    },
    required: ['ok'],
  }
}

function resolveEntry(entry: RegistryEntry): SerializableToolDef {
  const inputSchema = entry.inputSchema ?? convertEntrySchema(entry, 'input')
  const outputSchema = convertEntrySchema(entry, 'output')
  return {
    name: entry.name,
    description: entry.description,
    annotations: entry.annotations,
    confirm: entry.confirm,
    action: entry.action,
    ...(entry.title ? { title: entry.title } : {}),
    ...(inputSchema ? { inputSchema } : {}),
    ...(outputSchema ? { outputSchema: wrapOutputSchema(outputSchema) } : {}),
    ...(entry.adapter ? { adapter: entry.adapter } : {}),
  }
}

function convertEntrySchema(entry: RegistryEntry, direction: 'input' | 'output'): JsonSchema | undefined {
  const schema = entry[direction]
  if (!schema) return undefined
  const conversion = convertSchema(schema, direction)
  if (conversion.ok) return conversion.schema
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `actionmcp: AT101 The ${direction} schema of "${entry.name}" cannot be converted to JSON Schema, so the tool is registered without it. ${conversion.reason}`,
    )
  }
  return undefined
}
