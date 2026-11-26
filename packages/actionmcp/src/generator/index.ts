import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { analyze, createAnalysisCache, type AnalysisCache } from '../analyzer/index'
import type { ResolvedConfig } from '../analyzer/config'
import type { AnalysisResult } from '../analyzer/model'
import { renderManifest, renderRegistry } from './render'

export const REGISTRY_FILE = 'registry.ts'
export const MANIFEST_FILE = 'manifest.json'

export interface GenerateResult {
  analysis: AnalysisResult
  written: string[]
  durationMs: number
}

export async function generate(config: ResolvedConfig, cache: AnalysisCache = createAnalysisCache()): Promise<GenerateResult> {
  const startedAt = performance.now()
  const analysis = await analyze(config, cache)
  const files = {
    [REGISTRY_FILE]: renderRegistry(analysis, config),
    [MANIFEST_FILE]: renderManifest(analysis, readNextVersion(config.cwd)),
  }
  mkdirSync(config.outDir, { recursive: true })
  const written = Object.entries(files).flatMap(([name, content]) => (writeIfChanged(join(config.outDir, name), content) ? [name] : []))
  return { analysis, written, durationMs: performance.now() - startedAt }
}

export function readNextVersion(cwd: string): string {
  try {
    const manifestPath = createRequire(join(cwd, 'package.json')).resolve('next/package.json')
    return (JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string }).version
  } catch {
    return 'unknown'
  }
}

function writeIfChanged(file: string, content: string): boolean {
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return false
  writeFileSync(file, content)
  return true
}

export { createAnalysisCache } from '../analyzer/index'
export type { Manifest, ManifestTool } from './render'
