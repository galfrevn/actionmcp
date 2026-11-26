import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface AgentToolsConfig {
  registry?: string
  scan?: string[]
  outDir?: string
  jsdoc?: boolean
  auth?: string[]
}

export interface ResolvedConfig {
  cwd: string
  registry: string | undefined
  scan: string[]
  outDir: string
  jsdoc: boolean
  auth: string[]
}

export const DEFAULT_SCAN = ['app/**', 'lib/**', 'src/**']
export const DEFAULT_OUT_DIR = '.agent-tools'
export const DEFAULT_REGISTRY_FILES = ['agent-tools.ts', 'agent-tools.tsx', 'agent-tools.js', 'agent-tools.mjs', 'src/agent-tools.ts']
export const DEFAULT_AUTH_FUNCTIONS = [
  'auth',
  'getSession',
  'getServerSession',
  'verifySession',
  'requireUser',
  'requireAuth',
  'requireSession',
  'getUser',
  'getCurrentUser',
  'currentUser',
]

export function resolveConfig(config: AgentToolsConfig = {}, cwd: string = process.cwd()): ResolvedConfig {
  return {
    cwd,
    registry: resolveRegistry(config.registry, cwd),
    scan: config.scan ?? DEFAULT_SCAN,
    outDir: resolve(cwd, config.outDir ?? DEFAULT_OUT_DIR),
    jsdoc: config.jsdoc ?? false,
    auth: config.auth ?? DEFAULT_AUTH_FUNCTIONS,
  }
}

function resolveRegistry(registry: string | undefined, cwd: string): string | undefined {
  if (registry) return resolve(cwd, registry)
  const found = DEFAULT_REGISTRY_FILES.map((file) => resolve(cwd, file)).find((file) => existsSync(file))
  return found
}
