import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'
import { isRecord } from './guards'
import type { JsonSchema } from './types'

export type AgentSchema<Output = unknown> = StandardSchemaV1<unknown, Output>

export type SchemaDirection = 'input' | 'output'

export type SchemaConversion = { ok: true; schema: JsonSchema } | { ok: false; reason: string }

export interface SchemaIssue {
  message: string
  path: Array<string | number>
}

export type ValidationOutcome<T> = { ok: true; value: T } | { ok: false; issues: SchemaIssue[] }

const JSON_SCHEMA_TARGET = 'draft-2020-12'
const DEFINITION_REFERENCE = /^#\/\$defs\/(.+)$/

class CyclicReferenceError extends Error {}

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  const isObjectLike = (typeof value === 'object' || typeof value === 'function') && value !== null
  return isObjectLike && isRecord((value as { '~standard'?: unknown })['~standard'])
}

export function convertSchema(schema: StandardSchemaV1, direction: SchemaDirection = 'input'): SchemaConversion {
  const { jsonSchema } = schema['~standard'] as Partial<StandardJSONSchemaV1.Props>
  if (!jsonSchema) {
    return { ok: false, reason: 'The validator does not implement Standard JSON Schema.' }
  }
  try {
    const libraryOptions = schema['~standard'].vendor === 'zod' ? zodOptions(direction) : undefined
    const converted = sanitizeJsonSchema(
      jsonSchema[direction]({ target: JSON_SCHEMA_TARGET, ...(libraryOptions ? { libraryOptions } : {}) }),
    )
    if (direction === 'input' && converted.type !== 'object') {
      return { ok: false, reason: 'A tool input schema must describe an object.' }
    }
    return { ok: true, schema: converted }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

interface ZodOverrideContext {
  zodSchema: { _zod: { def: { type: string; coerce?: boolean } } }
  jsonSchema: JsonSchema
}

const ZOD_UNREPRESENTABLE_TYPES = new Set(['bigint', 'symbol', 'undefined', 'void', 'nan', 'custom', 'function', 'transform', 'map', 'set'])

function zodOptions(direction: SchemaDirection): Record<string, unknown> {
  return {
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema }: ZodOverrideContext) => {
      const { _zod: internals } = zodSchema
      const { type, coerce } = internals.def
      if (type === 'date') {
        if (direction === 'input' && !coerce) {
          throw new Error('A z.date() field cannot come from an agent, because a tool input is JSON. Use z.coerce.date().')
        }
        jsonSchema.type = 'string'
        jsonSchema.format = 'date-time'
      } else if (ZOD_UNREPRESENTABLE_TYPES.has(type) && Object.keys(jsonSchema).length === 0) {
        throw new Error(`The Zod type "${type}" cannot be represented in JSON Schema.`)
      }
    },
  }
}

export function sanitizeJsonSchema(schema: JsonSchema): JsonSchema {
  const definitions = isRecord(schema.$defs) ? schema.$defs : {}
  try {
    const { $defs: _definitions, ...root } = schema
    return clean(root, definitions, []) as JsonSchema
  } catch (error) {
    if (error instanceof CyclicReferenceError) {
      return clean(schema, undefined, []) as JsonSchema
    }
    throw error
  }
}

function clean(node: unknown, definitions: Record<string, unknown> | undefined, expanding: readonly string[]): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => clean(item, definitions, expanding))
  }
  if (!isRecord(node)) {
    return node
  }
  const target = definitions && referencedDefinition(node, definitions)
  if (target) {
    if (expanding.includes(target)) {
      throw new CyclicReferenceError(target)
    }
    const { $ref: _reference, ...siblings } = node
    const inlined = clean(definitions[target], definitions, [...expanding, target])
    return { ...(isRecord(inlined) ? inlined : {}), ...(clean(siblings, definitions, expanding) as JsonSchema) }
  }
  const result: JsonSchema = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema') continue
    if (key === 'description' && typeof value === 'string') {
      const description = value.trim()
      if (description) result.description = description
      continue
    }
    result[key] = clean(value, definitions, expanding)
  }
  return result
}

function referencedDefinition(node: Record<string, unknown>, definitions: Record<string, unknown>): string | undefined {
  if (typeof node.$ref !== 'string') return undefined
  const name = DEFINITION_REFERENCE.exec(node.$ref)?.[1]
  return name !== undefined && name in definitions ? name : undefined
}

export async function validateWithSchema<T>(schema: AgentSchema<T>, value: unknown): Promise<ValidationOutcome<T>> {
  const result = await schema['~standard'].validate(value)
  if (result.issues) {
    return { ok: false, issues: result.issues.map(toSchemaIssue) }
  }
  return { ok: true, value: result.value }
}

function toSchemaIssue(issue: StandardSchemaV1.Issue): SchemaIssue {
  const path = (issue.path ?? []).map((segment) => {
    const key = typeof segment === 'object' ? segment.key : segment
    return typeof key === 'number' ? key : String(key)
  })
  return { message: issue.message, path }
}
