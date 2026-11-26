import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveConfig, type AgentToolsConfig, type ResolvedConfig } from '../analyzer/config'
import { clearRecordedConfig, readRecordedConfig } from '../next/config-store'
import type { Output } from './output'

export interface ConfigFlags {
  registry?: string | undefined
  scan?: string[] | undefined
  outDir?: string | undefined
  jsdoc?: boolean | undefined
}

const NEXT_CONFIG_FILES = ['next.config.ts', 'next.config.mts', 'next.config.mjs', 'next.config.js']

export async function loadProjectConfig(cwd: string, flags: ConfigFlags, output: Output): Promise<ResolvedConfig> {
  const recorded = await readNextConfig(cwd, output)
  const merged: AgentToolsConfig = { ...recorded }
  if (flags.registry !== undefined) merged.registry = flags.registry
  if (flags.scan !== undefined && flags.scan.length > 0) merged.scan = flags.scan
  if (flags.outDir !== undefined) merged.outDir = flags.outDir
  if (flags.jsdoc !== undefined) merged.jsdoc = flags.jsdoc
  return resolveConfig(merged, cwd)
}

async function readNextConfig(cwd: string, output: Output): Promise<AgentToolsConfig | undefined> {
  const file = NEXT_CONFIG_FILES.map((name) => join(cwd, name)).find((candidate) => existsSync(candidate))
  if (!file) return undefined
  clearRecordedConfig()
  try {
    await import(pathToFileURL(file).href)
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    output.error(`actionmcp: could not read withAgentTools() options from ${file}. Using defaults and flags. ${reason}`)
  }
  return readRecordedConfig()
}
