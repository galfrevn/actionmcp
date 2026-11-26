import { compareText } from '../core/compare'

export type DiagnosticLevel = 'error' | 'warn'

export interface DiagnosticRule {
  level: DiagnosticLevel
  summary: string
  fix: string
}

export const DIAGNOSTIC_RULES = {
  AT001: {
    level: 'error',
    summary: 'Invalid tool name',
    fix: 'Use a string literal with 1 to 128 characters from A-Z, a-z, 0-9, "_", "-", and ".".',
  },
  AT002: {
    level: 'error',
    summary: 'Duplicate or reserved tool name',
    fix: 'Rename the tool with the `name` option, or remove the duplicate registration.',
  },
  AT003: {
    level: 'error',
    summary: 'Empty description',
    fix: 'Describe what the tool does, its side effects, and what it returns.',
  },
  AT004: {
    level: 'error',
    summary: 'Tool is not an exported Server Function',
    fix: 'Export the function from a file that starts with the \'use server\' directive.',
  },
  AT005: {
    level: 'error',
    summary: 'Tool options are not literals',
    fix: 'Pass an object literal with a string literal `description`. Metadata must come from source code, never from data.',
  },
  AT006: {
    level: 'error',
    summary: 'Unknown @agent modifier',
    fix: 'Use readonly, consequential, untrusted-output, formdata, or name=<tool-name>.',
  },
  AT007: {
    level: 'error',
    summary: 'Registry file cannot be analyzed',
    fix: 'Default-export defineAgentTools({ ... }) with an object literal whose values are tool(...) calls.',
  },
  AT101: {
    level: 'warn',
    summary: 'Schema cannot be converted to JSON Schema',
    fix: 'The tool is registered without inputSchema. Use agent() or tool() with a Standard Schema validator.',
  },
  AT102: {
    level: 'warn',
    summary: 'JSDoc tool without detectable runtime validation',
    fix: 'Validate the input inside the action, or wrap the action in agent() with an input schema.',
  },
  AT103: {
    level: 'warn',
    summary: "Consequential tool with confirm: 'never'",
    fix: "Remove confirm: 'never' so the page asks a human before the tool runs.",
  },
  AT104: {
    level: 'warn',
    summary: 'More than 32 tools',
    fix: 'Scope tools per route with <AgentTools include={[...]} /> in segment layouts.',
  },
  AT105: {
    level: 'warn',
    summary: 'Action without a detectable authentication call',
    fix: 'Call your auth function inside the action, or list its name in the `auth` option.',
  },
  AT106: {
    level: 'warn',
    summary: 'Output with free-form strings without untrustedOutput',
    fix: 'Set untrustedOutput: true when the output can contain user-generated or third-party content.',
  },
  AT107: {
    level: 'warn',
    summary: 'Input asks for personal data that the handler does not use',
    fix: 'Remove the field from the input schema. Request only identifiers and domain values.',
  },
  AT108: {
    level: 'warn',
    summary: 'Description shorter than 20 characters',
    fix: 'Describe what the tool does, its side effects, and what it returns.',
  },
  AT109: {
    level: 'warn',
    summary: 'agent() call that the analyzer cannot register',
    fix: "Assign the agent() call to an exported const in a 'use server' file, or list the function in agent-tools.ts. To share logic, wrap the handler and not the agent() call.",
  },
  AT201: {
    level: 'error',
    summary: 'Unsupported Next.js version',
    fix: 'Install Next.js 16.x.',
  },
  AT202: {
    level: 'error',
    summary: 'Unsupported React version',
    fix: 'Install React 19.2 or later.',
  },
  AT203: {
    level: 'warn',
    summary: 'Validator without Standard JSON Schema support',
    fix: 'Upgrade to Zod 4.2+, ArkType 2.1.28+, or Valibot 1.2+ with @valibot/to-json-schema.',
  },
  AT204: {
    level: 'warn',
    summary: 'Origin trial token is not set',
    fix: 'Set NEXT_PUBLIC_WEBMCP_OT_TOKEN, or pass originTrialToken to <AgentTools />, to enable WebMCP in Chrome and Edge without flags.',
  },
  AT205: {
    level: 'warn',
    summary: 'Explicit tool without an input schema',
    fix: "Move the action's schema out of the 'use server' file into a regular module and pass it as `input`.",
  },
  AT206: {
    level: 'error',
    summary: 'The @agent path needs ts-json-schema-generator',
    fix: 'Install it as a development dependency: npm install --save-dev ts-json-schema-generator.',
  },
} as const satisfies Record<string, DiagnosticRule>

export type DiagnosticCode = keyof typeof DIAGNOSTIC_RULES

export interface Diagnostic {
  code: DiagnosticCode
  level: DiagnosticLevel
  message: string
  fix: string
  file: string
  line: number
  column: number
  tool?: string
}

export interface DiagnosticLocation {
  file: string
  line: number
  column: number
}

export function createDiagnostic(
  code: DiagnosticCode,
  location: DiagnosticLocation,
  detail?: string,
  tool?: string,
): Diagnostic {
  const rule: DiagnosticRule = DIAGNOSTIC_RULES[code]
  return {
    code,
    level: rule.level,
    message: detail ? `${rule.summary}: ${detail}` : rule.summary,
    fix: rule.fix,
    ...location,
    ...(tool === undefined ? {} : { tool }),
  }
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.level === 'error')
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`
  return `${diagnostic.level === 'error' ? 'error' : 'warn '} ${diagnostic.code} ${location} ${diagnostic.message}\n      fix: ${diagnostic.fix}`
}

export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.toSorted(
    (left, right) =>
      compareText(left.file, right.file) || left.line - right.line || left.column - right.column || compareText(left.code, right.code),
  )
}
