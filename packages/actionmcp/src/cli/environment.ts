import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { createDiagnostic, type Diagnostic } from '../analyzer/diagnostics'

const LOCATION = { file: 'package.json', line: 1, column: 1 }
const TOKEN_VARIABLE = 'NEXT_PUBLIC_WEBMCP_OT_TOKEN'

export function readPackageVersion(cwd: string, name: string): string | undefined {
  try {
    const manifestPath = createRequire(join(cwd, 'package.json')).resolve(`${name}/package.json`)
    return (JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: string }).version
  } catch {
    return undefined
  }
}

export function isAtLeast(version: string, minimum: string): boolean {
  const parse = (value: string) => value.split('-')[0]?.split('.').map(Number) ?? []
  const [current, required] = [parse(version), parse(minimum)]
  for (let index = 0; index < required.length; index += 1) {
    const difference = (current[index] ?? 0) - (required[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return true
}

export type Environment = Record<string, string | undefined>

export function checkEnvironment(cwd: string, env: Environment = process.env): Diagnostic[] {
  const version = (name: string) => readPackageVersion(cwd, name)
  const diagnostics: Diagnostic[] = []

  const next = version('next')
  if (!next) diagnostics.push(createDiagnostic('AT201', LOCATION, 'Next.js is not installed'))
  else if (!next.startsWith('16.')) diagnostics.push(createDiagnostic('AT201', LOCATION, `found next@${next}`))

  const react = version('react')
  if (!react) diagnostics.push(createDiagnostic('AT202', LOCATION, 'React is not installed'))
  else if (!isAtLeast(react, '19.2.0')) diagnostics.push(createDiagnostic('AT202', LOCATION, `found react@${react}`))

  const zod = version('zod')
  if (zod && !isAtLeast(zod, '4.2.0')) diagnostics.push(createDiagnostic('AT203', LOCATION, `found zod@${zod}`))
  const arktype = version('arktype')
  if (arktype && !isAtLeast(arktype, '2.1.28')) diagnostics.push(createDiagnostic('AT203', LOCATION, `found arktype@${arktype}`))
  const valibot = version('valibot')
  if (valibot && !isAtLeast(valibot, '1.2.0')) diagnostics.push(createDiagnostic('AT203', LOCATION, `found valibot@${valibot}`))
  else if (valibot && !version('@valibot/to-json-schema')) {
    diagnostics.push(createDiagnostic('AT203', LOCATION, 'valibot is installed without @valibot/to-json-schema'))
  }

  if (!hasOriginTrialToken(cwd, env)) diagnostics.push(createDiagnostic('AT204', LOCATION))
  return diagnostics
}

function hasOriginTrialToken(cwd: string, env: Environment): boolean {
  if (env[TOKEN_VARIABLE]) return true
  if (!existsSync(cwd)) return false
  return readdirSync(cwd)
    .filter((name) => name === '.env' || name.startsWith('.env.'))
    .some((name) => new RegExp(`^${TOKEN_VARIABLE}=.+`, 'm').test(readFileSync(join(cwd, name), 'utf8')))
}
