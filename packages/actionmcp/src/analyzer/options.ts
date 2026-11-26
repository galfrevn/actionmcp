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

export function readToolOptions(node: Node | undefined, callOffset: number): ToolOptionsReading {
  const issues: OptionIssue[] = []
  if (node?.type !== 'ObjectExpression') {
    issues.push({ code: 'AT005', detail: 'the options are not an object literal', offset: node?.start ?? callOffset })
    return { issues }
  }
  const { properties, hasSpread } = readObjectLiteral(node)
  const reading: ToolOptionsReading = { issues }

  const description = properties.get('description')
  const descriptionText = staticString(description)
  if (descriptionText !== undefined) {
    reading.description = descriptionText
    if (descriptionText.trim() === '') issues.push({ code: 'AT003', detail: 'the description is empty', offset: description?.start ?? node.start })
  } else if (description || hasSpread) {
    issues.push({ code: 'AT005', detail: 'the description is not a string literal', offset: description?.start ?? node.start })
  } else {
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

  const readOnly = staticBoolean(properties.get('readOnly'))
  if (readOnly !== undefined) reading.readOnly = readOnly
  const consequential = staticBoolean(properties.get('consequential'))
  if (consequential !== undefined) reading.consequential = consequential
  const untrustedOutput = staticBoolean(properties.get('untrustedOutput'))
  if (untrustedOutput !== undefined) reading.untrustedOutput = untrustedOutput

  const confirm = staticString(properties.get('confirm'))
  if (confirm !== undefined && CONFIRM_POLICIES.includes(confirm)) reading.confirm = confirm as ConfirmPolicy

  const input = properties.get('input')
  if (input) reading.input = input
  const output = properties.get('output')
  if (output) reading.output = output
  return reading
}
