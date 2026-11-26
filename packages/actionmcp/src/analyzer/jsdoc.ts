import type { ToolAdapter } from '../core/types'

export interface AgentTag {
  description: string
  name?: string
  readOnly: boolean
  consequential: boolean
  untrustedOutput: boolean
  formData: boolean
  unknownModifiers: string[]
}

const AGENT_TAG = /(?:^|\s)@agent(?![\w-])([^\n]*)/
const ANY_TAG = /(?:^|\s)@[A-Za-z]/
const NAME_MODIFIER = /^name=(.+)$/

export function parseAgentTag(comment: string): AgentTag | undefined {
  const text = comment
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, '').trimEnd())
    .join('\n')
  const match = AGENT_TAG.exec(text)
  if (!match) return undefined
  const firstTag = ANY_TAG.exec(text)?.index ?? text.length
  const tag: AgentTag = {
    description: text.slice(0, firstTag).replace(/\s+/g, ' ').trim(),
    readOnly: false,
    consequential: false,
    untrustedOutput: false,
    formData: false,
    unknownModifiers: [],
  }
  for (const modifier of (match[1] ?? '').split(/\s+/).filter(Boolean)) {
    const name = NAME_MODIFIER.exec(modifier)?.[1]
    if (name !== undefined) tag.name = name
    else if (modifier === 'readonly') tag.readOnly = true
    else if (modifier === 'consequential') tag.consequential = true
    else if (modifier === 'untrusted-output') tag.untrustedOutput = true
    else if (modifier === 'formdata') tag.formData = true
    else tag.unknownModifiers.push(modifier)
  }
  return tag
}

export function formDataAdapter(parameterCount: number): ToolAdapter {
  return parameterCount >= 2 ? 'formdata' : 'form'
}
