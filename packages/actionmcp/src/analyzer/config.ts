import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface AgentToolsConfig {
  cwd?: string
  registry?: string
  scan?: string[]
  outDir?: string
  jsdoc?: boolean
  auth?: string[]
}

export interface ResolvedConfig {
  cwd: string
  registry: string | undefined
  registryFromOption: boolean
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
    registry: config.registry ? resolve(cwd, config.registry) : findDefaultRegistry(cwd),
    registryFromOption: config.registry !== undefined && config.registry !== '',
    scan: config.scan ?? DEFAULT_SCAN,
    outDir: resolve(cwd, config.outDir ?? DEFAULT_OUT_DIR),
    jsdoc: config.jsdoc ?? false,
    auth: config.auth ?? DEFAULT_AUTH_FUNCTIONS,
  }
}

export function findDefaultRegistry(cwd: string): string | undefined {
  return DEFAULT_REGISTRY_FILES.map((file) => resolve(cwd, file)).find((file) => existsSync(file))
}
