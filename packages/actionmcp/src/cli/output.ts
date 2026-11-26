import { styleText } from 'node:util'
import type { Diagnostic } from '../analyzer/diagnostics'

export interface Output {
  write: (text: string) => void
  error: (text: string) => void
}

export const processOutput: Output = {
  write: (text) => process.stdout.write(`${text}\n`),
  error: (text) => process.stderr.write(`${text}\n`),
}

export function printDiagnostics(output: Output, diagnostics: readonly Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const isError = diagnostic.level === 'error'
    const label = styleText(isError ? 'red' : 'yellow', `${isError ? 'error' : 'warn '} ${diagnostic.code}`)
    const tool = diagnostic.tool ? ` [${diagnostic.tool}]` : ''
    output.write(`${label} ${diagnostic.file}:${diagnostic.line}:${diagnostic.column}${tool} ${diagnostic.message}`)
    output.write(`      fix: ${diagnostic.fix}`)
  }
}

export function summarize(diagnostics: readonly Diagnostic[]): string {
  const errors = diagnostics.filter((diagnostic) => diagnostic.level === 'error').length
  return `${plural(errors, 'error')}, ${plural(diagnostics.length - errors, 'warning')}`
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function table(rows: readonly (readonly string[])[]): string[] {
  const widths = rows.reduce<number[]>((result, row) => row.map((cell, index) => Math.max(result[index] ?? 0, cell.length)), [])
  return rows.map((row) => row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join('  ').trimEnd())
}
