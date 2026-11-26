import { join, relative, sep } from 'node:path'
import type { NextConfig } from 'next'
import { resolveConfig, type AgentToolsConfig, type ResolvedConfig } from './analyzer/config'
import { formatDiagnostic, hasErrors, type Diagnostic } from './analyzer/diagnostics'
import { REGISTRY_FILE, generate } from './generator/index'
import { watchProject } from './generator/watch'
import { recordConfig } from './next/config-store'

export type { AgentToolsConfig } from './analyzer/config'

type NextConfigContext = { defaultConfig: NextConfig }
type NextConfigFunction = (phase: string, context: NextConfigContext) => NextConfig | Promise<NextConfig>

export const REGISTRY_ALIAS = 'actionmcp/registry'

const BUILD_PHASE = 'phase-production-build'
const DEVELOPMENT_PHASE = 'phase-development-server'
const PREPARED = Symbol.for('actionmcp.prepared')

type PreparedStore = { [PREPARED]?: Map<string, Promise<void>> }

export function withAgentTools(options: AgentToolsConfig = {}) {
  recordConfig(options)
  return (nextConfig: NextConfig | NextConfigFunction = {}): NextConfigFunction =>
    async (phase, context) => {
      const base = typeof nextConfig === 'function' ? await nextConfig(phase, context) : nextConfig
      const config = resolveConfig(options, process.cwd())
      await prepareOnce(phase, config)
      return applyRegistryAlias(base, config)
    }
}

export function applyRegistryAlias(nextConfig: NextConfig, config: ResolvedConfig): NextConfig {
  const registry = join(config.outDir, REGISTRY_FILE)
  const relativeRegistry = `./${relative(config.cwd, registry).split(sep).join('/')}`
  const userWebpack = nextConfig.webpack
  return {
    ...nextConfig,
    turbopack: {
      ...nextConfig.turbopack,
      resolveAlias: { ...nextConfig.turbopack?.resolveAlias, [REGISTRY_ALIAS]: relativeRegistry },
    },
    webpack(webpackConfig, webpackContext) {
      webpackConfig.resolve ??= {}
      webpackConfig.resolve.alias = { ...webpackConfig.resolve.alias, [REGISTRY_ALIAS]: registry }
      return userWebpack ? userWebpack(webpackConfig, webpackContext) : webpackConfig
    },
  }
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
