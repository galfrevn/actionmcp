import type { StandardSchemaV1 } from '@standard-schema/spec'
import { isNonEmptyString } from '../core/guards'
import {
  AgentToolError,
  GENERIC_FAILURE_MESSAGE,
  INVALID_INPUT_MESSAGE,
  INVALID_OUTPUT_MESSAGE,
  fail,
  isFrameworkSignal,
  succeed,
  type AgentResult,
} from '../core/result'
import { validateWithSchema } from '../core/schema'
import type { ConfirmPolicy } from '../core/types'

export const AGENT_META: unique symbol = Symbol.for('actionmcp.meta') as never

const CONFIRM_POLICIES: readonly unknown[] = ['always', 'consequential', 'never']
const BOOLEAN_OPTIONS = ['readOnly', 'consequential', 'untrustedOutput'] as const

export interface ToolBehaviorOptions {
  name?: string
  title?: string
  description: string
  readOnly?: boolean
  consequential?: boolean
  untrustedOutput?: boolean
  confirm?: ConfirmPolicy
}

export interface AgentToolOptions extends ToolBehaviorOptions {
  input?: StandardSchemaV1 | undefined
  output?: StandardSchemaV1 | undefined
}

export interface AgentToolMeta {
  readonly options: AgentToolOptions
}

export interface AgentToolMarker {
  readonly [AGENT_META]: AgentToolMeta
}

export type AgentTool<Args extends unknown[] = never[], Data = unknown> = ((...args: Args) => Promise<AgentResult<Data>>) & AgentToolMarker

type InputOf<Schema extends StandardSchemaV1> = StandardSchemaV1.InferInput<Schema>
type OutputOf<Schema extends StandardSchemaV1> = StandardSchemaV1.InferOutput<Schema>

export function agent<Input extends StandardSchemaV1, Output extends StandardSchemaV1>(
  options: ToolBehaviorOptions & { input: Input; output: Output },
  handler: (input: OutputOf<Input>) => Promise<InputOf<Output>>,
): AgentTool<[input: InputOf<Input>], OutputOf<Output>>
export function agent<Input extends StandardSchemaV1, Data>(
  options: ToolBehaviorOptions & { input: Input; output?: undefined },
  handler: (input: OutputOf<Input>) => Promise<Data>,
): AgentTool<[input: InputOf<Input>], Data>
export function agent<Output extends StandardSchemaV1>(
  options: ToolBehaviorOptions & { input?: undefined; output: Output },
  handler: () => Promise<InputOf<Output>>,
): AgentTool<[], OutputOf<Output>>
export function agent<Data>(
  options: ToolBehaviorOptions & { input?: undefined; output?: undefined },
  handler: () => Promise<Data>,
): AgentTool<[], Data>
export function agent(options: AgentToolOptions, handler: (input: never) => Promise<unknown>): AgentTool {
  assertToolOptions(options, 'agent()')
  const execute = async (input?: unknown): Promise<AgentResult<unknown>> =>
    runHandler(options, handler as (input: unknown) => Promise<unknown>, input)
  return Object.defineProperty(execute, AGENT_META, { value: { options } }) as unknown as AgentTool
}

export function assertToolOptions(options: AgentToolOptions, caller: string): void {
  if (!isNonEmptyString(options.description)) {
    throw new TypeError(`${caller} requires a non-empty description.`)
  }
  for (const key of BOOLEAN_OPTIONS) {
    const value = options[key]
    if (value !== undefined && typeof value !== 'boolean') {
      throw new TypeError(`${caller} requires \`${key}\` to be a boolean.`)
    }
  }
  if (options.confirm !== undefined && !CONFIRM_POLICIES.includes(options.confirm)) {
    throw new TypeError(`${caller} requires \`confirm\` to be 'always', 'consequential', or 'never'.`)
  }
}

export function readAgentMeta(value: unknown): AgentToolMeta | undefined {
  return typeof value === 'function' ? (value as Partial<AgentToolMarker>)[AGENT_META] : undefined
}

async function runHandler(
  options: AgentToolOptions,
  handler: (input: unknown) => Promise<unknown>,
  rawInput: unknown,
): Promise<AgentResult<unknown>> {
  let input: unknown
  if (options.input) {
    const validation = await validateWithSchema(options.input, rawInput)
    if (!validation.ok) return fail('invalid_input', INVALID_INPUT_MESSAGE, validation.issues)
    input = validation.value
  }
  try {
    const data = await handler(input)
    if (!options.output) return succeed(data)
    const validation = await validateWithSchema(options.output, data)
    if (validation.ok) return succeed(validation.value)
    console.error(`actionmcp: the output of ${describeTool(options)} does not match its output schema.`, validation.issues)
    return fail('failed', INVALID_OUTPUT_MESSAGE)
  } catch (error) {
    if (isFrameworkSignal(error)) throw error
    if (error instanceof AgentToolError) return fail(error.code, error.message)
    console.error(error)
    const exposeMessage = process.env.NODE_ENV !== 'production' && error instanceof Error
    return fail('failed', exposeMessage ? error.message : GENERIC_FAILURE_MESSAGE)
  }
}

function describeTool(options: AgentToolOptions): string {
  return options.name ? `the tool "${options.name}"` : `the tool described as "${options.description}"`
}
