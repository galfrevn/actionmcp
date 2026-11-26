import type { Node } from 'oxc-parser'
import type { ConfirmPolicy } from '../core/types'
import type { DiagnosticCode } from './diagnostics'
import { readObjectLiteral, staticBoolean, staticString } from './source'

export interface OptionIssue {
  code: DiagnosticCode
  detail: string
  offset: number
}

export interface ToolOptionsReading {
  name?: string
  title?: string
  description?: string
  readOnly?: boolean
  consequential?: boolean
  untrustedOutput?: boolean
  confirm?: ConfirmPolicy
  input?: Node
  output?: Node
  issues: OptionIssue[]
}

const CONFIRM_POLICIES: readonly string[] = ['always', 'consequential', 'never']
const BOOLEAN_OPTIONS = ['readOnly', 'consequential', 'untrustedOutput'] as const

export function readToolOptions(node: Node | undefined, callOffset: number): ToolOptionsReading {
  const issues: OptionIssue[] = []
  if (node?.type !== 'ObjectExpression') {
    issues.push({ code: 'AT005', detail: 'the options are not an object literal', offset: node?.start ?? callOffset })
    return { issues }
  }
  const { properties, hasSpread } = readObjectLiteral(node)
  const reading: ToolOptionsReading = { issues }

  if (hasSpread) {
    issues.push({ code: 'AT005', detail: 'the options contain a spread, which hides values from the analyzer', offset: node.start })
  }

  const description = properties.get('description')
  const descriptionText = staticString(description)
  if (descriptionText !== undefined) {
    reading.description = descriptionText
    if (descriptionText.trim() === '')
      issues.push({ code: 'AT003', detail: 'the description is empty', offset: description?.start ?? node.start })
  } else if (description) {
    issues.push({ code: 'AT005', detail: 'the description is not a string literal', offset: description.start })
  } else if (!hasSpread) {
    issues.push({ code: 'AT003', detail: 'the description is missing', offset: node.start })
  }

  const name = properties.get('name')
  if (name) {
    const nameText = staticString(name)
    if (nameText === undefined) issues.push({ code: 'AT001', detail: 'the name is not a string literal', offset: name.start })
    else reading.name = nameText
  }

  const title = staticString(properties.get('title'))
  if (title !== undefined) reading.title = title

  for (const key of BOOLEAN_OPTIONS) {
    const property = properties.get(key)
    if (!property) continue
    const value = staticBoolean(property)
    if (value === undefined) issues.push({ code: 'AT005', detail: `\`${key}\` is not a boolean literal`, offset: property.start })
    else reading[key] = value
  }

  const confirm = properties.get('confirm')
  if (confirm) {
    const policy = staticString(confirm)
    if (policy === undefined) {
      issues.push({ code: 'AT005', detail: '`confirm` is not a string literal', offset: confirm.start })
    } else if (CONFIRM_POLICIES.includes(policy)) {
      reading.confirm = policy as ConfirmPolicy
    } else {
      issues.push({ code: 'AT005', detail: `\`confirm\` is "${policy}", not 'always', 'consequential', or 'never'`, offset: confirm.start })
    }
  }

  const input = properties.get('input')
  if (input) reading.input = input
  const output = properties.get('output')
  if (output) reading.output = output
  return reading
}
