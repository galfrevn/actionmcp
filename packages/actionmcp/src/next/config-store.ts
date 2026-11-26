import type { AgentToolsConfig } from '../analyzer/config'

const RECORDED_CONFIG = Symbol.for('actionmcp.config')

type ConfigStore = { [RECORDED_CONFIG]?: AgentToolsConfig }

export function recordConfig(config: AgentToolsConfig): void {
  ;(globalThis as ConfigStore)[RECORDED_CONFIG] = config
}

export function readRecordedConfig(): AgentToolsConfig | undefined {
  return (globalThis as ConfigStore)[RECORDED_CONFIG]
}

export function clearRecordedConfig(): void {
  delete (globalThis as ConfigStore)[RECORDED_CONFIG]
}
