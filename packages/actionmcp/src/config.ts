import { join, relative, sep } from 'node:path'
import { resolveConfig, type AgentToolsConfig, type ResolvedConfig } from './analyzer/config'
import { formatDiagnostic, hasErrors, type Diagnostic } from './analyzer/diagnostics'
import { REGISTRY_FILE, generate } from './generator/index'
import { watchProject } from './generator/watch'
import { recordConfig } from './next/config-store'

export type { AgentToolsConfig } from './analyzer/config'

export interface ConfigContext {
  defaultConfig: object
}

export type ConfigFunction<Config extends object> = (phase: string, context: ConfigContext) => Config | Promise<Config>

interface WebpackConfiguration {
  resolve?: { alias?: Record<string, unknown> }
}

type WebpackHook = (configuration: WebpackConfiguration, context: unknown) => unknown

interface AliasableConfig {
  turbopack?: { resolveAlias?: Record<string, unknown> }
  webpack?: WebpackHook | null
}

export const REGISTRY_ALIAS = 'actionmcp/registry'

const BUILD_PHASE = 'phase-production-build'
const DEVELOPMENT_PHASE = 'phase-development-server'
const PREPARED = Symbol.for('actionmcp.prepared')

type PreparedStore = { [PREPARED]?: Map<string, Promise<void>> }

export function withAgentTools(options: AgentToolsConfig = {}) {
  recordConfig(options)
  return <Config extends object = object>(nextConfig?: Config | ConfigFunction<Config>): ConfigFunction<Config> =>
    async (phase, context) => {
      const base = typeof nextConfig === 'function' ? await nextConfig(phase, context) : (nextConfig ?? ({} as Config))
      const config = resolveConfig(options, process.cwd())
      await prepareOnce(phase, config)
      return applyRegistryAlias(base, config)
    }
}

export function applyRegistryAlias<Config extends object>(nextConfig: Config, config: ResolvedConfig): Config {
  const registry = join(config.outDir, REGISTRY_FILE)
  const relativeRegistry = `./${relative(config.cwd, registry).split(sep).join('/')}`
  const { turbopack, webpack: userWebpack }: AliasableConfig = nextConfig
  const aliased: AliasableConfig = {
    turbopack: { ...turbopack, resolveAlias: { ...turbopack?.resolveAlias, [REGISTRY_ALIAS]: relativeRegistry } },
    webpack(configuration, context) {
      configuration.resolve ??= {}
      configuration.resolve.alias = { ...configuration.resolve.alias, [REGISTRY_ALIAS]: registry }
      return userWebpack ? userWebpack(configuration, context) : configuration
    },
  }
  return { ...nextConfig, ...aliased }
}

function prepareOnce(phase: string, config: ResolvedConfig): Promise<void> {
  if (phase !== BUILD_PHASE && phase !== DEVELOPMENT_PHASE) return Promise.resolve()
  const store = globalThis as PreparedStore
  const prepared = (store[PREPARED] ??= new Map())
  const key = `${phase}:${config.cwd}`
  let pending = prepared.get(key)
  if (!pending) {
    pending = phase === BUILD_PHASE ? prepareBuild(config) : prepareDevelopment(config)
    prepared.set(key, pending)
  }
  return pending
}

async function prepareBuild(config: ResolvedConfig): Promise<void> {
  const { analysis } = await generate(config)
  report(analysis.diagnostics)
  if (hasErrors(analysis.diagnostics)) {
    const errors = analysis.diagnostics.filter((diagnostic) => diagnostic.level === 'error')
    throw new Error(`actionmcp found ${errors.length} error(s) in the agent tools:\n${errors.map(formatDiagnostic).join('\n')}`)
  }
}

async function prepareDevelopment(config: ResolvedConfig): Promise<void> {
  const { analysis } = await generate(config)
  report(analysis.diagnostics)
  let previous = JSON.stringify(analysis.diagnostics)
  watchProject(config, {
    persistent: false,
    onResult: (result) => {
      const current = JSON.stringify(result.analysis.diagnostics)
      if (current !== previous) report(result.analysis.diagnostics)
      previous = current
    },
    onError: (error) => console.error('actionmcp: could not regenerate the tool registry.', error),
  })
}

function report(diagnostics: readonly Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const print = diagnostic.level === 'error' ? console.error : console.warn
    print(`actionmcp ${formatDiagnostic(diagnostic)}`)
  }
}
