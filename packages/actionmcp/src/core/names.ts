export const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/

export const NAVIGATE_TOOL_NAME = 'navigate'

export const RESERVED_TOOL_NAMES: readonly string[] = [
  'snapshot',
  'act',
  'query',
  'pause_hmr',
  'resume_hmr',
  'nextjs_inspect',
  'nextjs_compile_route',
  NAVIGATE_TOOL_NAME,
]

export type NameIssueReason = 'invalid' | 'reserved' | 'duplicate'

export interface NameIssue {
  code: 'AT001' | 'AT002'
  name: string
  reason: NameIssueReason
}

export function isValidToolName(name: string): boolean {
  return TOOL_NAME_PATTERN.test(name)
}

export function isReservedToolName(name: string): boolean {
  return RESERVED_TOOL_NAMES.includes(name)
}

export function applyPrefix(name: string, prefix: string | undefined): string {
  return prefix ? `${prefix}${name}` : name
}

export function checkToolNames(names: readonly string[]): NameIssue[] {
  const seen = new Set<string>()
  const issues: NameIssue[] = []
  for (const name of names) {
    if (!isValidToolName(name)) {
      issues.push({ code: 'AT001', name, reason: 'invalid' })
    } else if (isReservedToolName(name)) {
      issues.push({ code: 'AT002', name, reason: 'reserved' })
    } else if (seen.has(name)) {
      issues.push({ code: 'AT002', name, reason: 'duplicate' })
    }
    seen.add(name)
  }
  return issues
}

export function describeNameIssue(issue: NameIssue): string {
  if (issue.reason === 'invalid') {
    return `Invalid tool name "${issue.name}". Use 1 to 128 characters from A-Z, a-z, 0-9, "_", "-", and ".".`
  }
  if (issue.reason === 'reserved') {
    return `The tool name "${issue.name}" is reserved.`
  }
  return `The tool name "${issue.name}" is registered more than once.`
}
