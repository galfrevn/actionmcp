import type { StandardSchemaV1 } from '@standard-schema/spec'
import { isNonEmptyString } from '../core/guards'
import type {
  ConfirmPolicy,
  JsonSchema,
  RouteEntry,
  ServerFunction,
  ToolAdapter,
  ToolAnnotations,
} from '../core/types'
import { readAgentMeta, type AgentToolOptions } from './agent'

const REGISTRY: unique symbol = Symbol.for('actionmcp.registry') as never

export type ToolKind = 'agent' | 'jsdoc' | 'explicit'

export interface AdaptedAction {
  readonly action: ServerFunction
  readonly adapter: ToolAdapter
}

export interface AgentToolDefinition {
  readonly action: ServerFunction
  readonly options: AgentToolOptions
  readonly adapter?: ToolAdapter
}

export interface JsdocToolEntry {
  action: ServerFunction
  description: string
  inputSchema?: JsonSchema
  annotations?: Partial<ToolAnnotations>
  adapter?: ToolAdapter
  validated: false
}

export interface RegistryEntry {
  readonly name: string
  readonly kind: ToolKind
  readonly action: ServerFunction
  readonly title?: string
  readonly description: string
  readonly input?: StandardSchemaV1
  readonly output?: StandardSchemaV1
  readonly inputSchema?: JsonSchema
  readonly annotations: ToolAnnotations
  readonly confirm: ConfirmPolicy
  readonly adapter?: ToolAdapter
}

export interface AgentToolRegistry {
  readonly [REGISTRY]: true
  readonly entries: readonly RegistryEntry[]
  readonly routes: readonly RouteEntry[]
}

export interface RegistrySources {
  agent?: Record<string, ServerFunction>
  jsdoc?: Record<string, JsdocToolEntry>
  explicit?: AgentToolRegistry
  routes?: RouteEntry[]
}

export function fromFormDataAction(
  action: (previousState: never, formData: FormData) => Promise<unknown>,
): AdaptedAction {
  return { action, adapter: 'formdata' }
}

export function fromFormAction(action: (formData: FormData) => Promise<unknown>): AdaptedAction {
  return { action, adapter: 'form' }
}

export function fromSafeAction(action: (input: never) => Promise<unknown>): AdaptedAction {
  return { action, adapter: 'safe-action' }
}

export function tool(action: ServerFunction | AdaptedAction, options: AgentToolOptions): AgentToolDefinition {
  if (!isNonEmptyString(options.description)) {
    throw new TypeError('tool() requires a non-empty description.')
  }
  return typeof action === 'function' ? { action, options } : { action: action.action, options, adapter: action.adapter }
}

export function defineAgentTools(tools: Record<string, AgentToolDefinition | ServerFunction>): AgentToolRegistry {
  const entries = Object.entries(tools).map(([key, definition]) =>
    typeof definition === 'function' ? entryFromAgent(key, definition) : entryFromOptions(key, 'explicit', definition),
  )
  return buildRegistry(entries, [])
}

export function createRegistry(sources: RegistrySources): AgentToolRegistry {
  const explicit = sources.explicit?.entries ?? []
  const explicitActions = new Set(explicit.map((entry) => entry.action))
  const discovered = [
    ...Object.entries(sources.agent ?? {}).map(([name, action]) => entryFromAgent(name, action)),
    ...Object.entries(sources.jsdoc ?? {}).map(([name, entry]) => entryFromJsdoc(name, entry)),
  ]
  const entries = [...discovered.filter((entry) => !explicitActions.has(entry.action)), ...explicit]
  return buildRegistry(entries, [...(sources.routes ?? []), ...(sources.explicit?.routes ?? [])])
}

export function isAgentToolRegistry(value: unknown): value is AgentToolRegistry {
  return typeof value === 'object' && value !== null && (value as Partial<AgentToolRegistry>)[REGISTRY] === true
}

function buildRegistry(entries: RegistryEntry[], routes: RouteEntry[]): AgentToolRegistry {
  return { [REGISTRY]: true, entries, routes }
}

function entryFromAgent(name: string, action: ServerFunction): RegistryEntry {
  const meta = readAgentMeta(action)
  if (!meta) {
    throw new TypeError(`The export registered as "${name}" is not wrapped in agent().`)
  }
  return entryFromOptions(name, 'agent', { action, options: meta.options })
}

function entryFromOptions(key: string, kind: ToolKind, definition: AgentToolDefinition): RegistryEntry {
  const { action, options, adapter } = definition
  return {
    name: options.name ?? key,
    kind,
    action,
    description: options.description,
    annotations: resolveAnnotations(options.readOnly, options.consequential, options.untrustedOutput),
    confirm: options.confirm ?? 'consequential',
    ...(options.title ? { title: options.title } : {}),
    ...(options.input ? { input: options.input } : {}),
    ...(options.output ? { output: options.output } : {}),
    ...(adapter ? { adapter } : {}),
  }
}

function entryFromJsdoc(name: string, entry: JsdocToolEntry): RegistryEntry {
  const { readOnlyHint, consequentialHint, untrustedContentHint } = entry.annotations ?? {}
  return {
    name,
    kind: 'jsdoc',
    action: entry.action,
    description: entry.description,
    annotations: resolveAnnotations(readOnlyHint, consequentialHint, untrustedContentHint),
    confirm: 'consequential',
    ...(entry.inputSchema ? { inputSchema: entry.inputSchema } : {}),
    ...(entry.adapter ? { adapter: entry.adapter } : {}),
  }
}

export function resolveAnnotations(
  readOnly: boolean | undefined,
  consequential: boolean | undefined,
  untrustedOutput: boolean | undefined,
): ToolAnnotations {
  const readOnlyHint = readOnly ?? false
  return {
    readOnlyHint,
    consequentialHint: consequential ?? !readOnlyHint,
    untrustedContentHint: untrustedOutput ?? false,
  }
}
