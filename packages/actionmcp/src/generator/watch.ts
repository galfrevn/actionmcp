import { existsSync, watch, type FSWatcher } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { findDefaultRegistry, type ResolvedConfig } from '../analyzer/config'
import { findAppDirectory } from '../analyzer/routes'
import { createAnalysisCache, generate, type GenerateResult } from './index'

export interface WatchHandle {
  close: () => void
}

export interface WatchOptions {
  onResult: (result: GenerateResult) => void
  onError: (error: unknown) => void
  debounceMs?: number
  persistent?: boolean
}

const GLOB_CHARACTERS = /[*?{[!]/
const IGNORED_SEGMENTS = new Set(['node_modules', '.next', '.git'])
const ROOT_KEY = 'root:'

export function watchRoots(config: ResolvedConfig): string[] {
  const candidates = config.scan.map((pattern) => {
    const segments = pattern.split('/')
    const firstDynamic = segments.findIndex((segment) => GLOB_CHARACTERS.test(segment))
    return join(config.cwd, ...segments.slice(0, firstDynamic === -1 ? segments.length - 1 : firstDynamic))
  })
  const appDirectory = findAppDirectory(config.cwd)
  if (appDirectory) candidates.push(appDirectory)
  const existing = [...new Set(candidates)].filter((directory) => existsSync(directory)).toSorted()
  return existing.filter((directory) => !existing.some((other) => other !== directory && isInside(directory, other)))
}

export function watchProject(config: ResolvedConfig, options: WatchOptions): WatchHandle {
  const cache = createAnalysisCache()
  const persistent = options.persistent ?? true
  const outDir = relative(config.cwd, config.outDir)
  let active = config
  let timer: NodeJS.Timeout | undefined
  let running = false
  let queued = false

  const run = async () => {
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      options.onResult(await generate(active, cache))
    } catch (error) {
      options.onError(error)
    } finally {
      running = false
      if (queued) {
        queued = false
        void run()
      }
    }
  }

  const schedule = (root: string, file: string | null) => {
    const changed = relative(config.cwd, join(root, file ?? ''))
    const segments = changed.split(sep)
    if (changed === outDir || changed.startsWith(`${outDir}${sep}`) || segments.some((segment) => IGNORED_SEGMENTS.has(segment))) return
    clearTimeout(timer)
    timer = setTimeout(() => void run(), options.debounceMs ?? 50)
  }

  const watchers = new Map<string, FSWatcher>()
  const add = (key: string, directory: string, recursive: boolean, listener: (file: string | null) => void): boolean => {
    if (watchers.has(key)) return false
    try {
      const watcher = watch(directory, { recursive, persistent }, (_event, file) => listener(file))
      watcher.on('error', (error) => {
        watcher.close()
        watchers.delete(key)
        options.onError(error)
      })
      watchers.set(key, watcher)
      return true
    } catch (error) {
      options.onError(error)
      return false
    }
  }

  const refresh = (): boolean => {
    for (const [key, watcher] of watchers) {
      if (key.startsWith(ROOT_KEY) && !existsSync(key.slice(ROOT_KEY.length))) {
        watcher.close()
        watchers.delete(key)
      }
    }
    let changed = false
    for (const root of watchRoots(active)) changed = add(`${ROOT_KEY}${root}`, root, true, (file) => schedule(root, file)) || changed
    if (!active.registryFromOption) {
      const registry = findDefaultRegistry(active.cwd)
      if (registry !== active.registry) {
        active = { ...active, registry }
        changed = true
      }
    }
    const { registry } = active
    if (registry) {
      const directory = dirname(registry)
      add(`registry:${registry}`, directory, false, (file) => {
        if (file === basename(registry)) schedule(directory, file)
      })
    }
    return changed
  }

  refresh()
  add('project', config.cwd, false, () => {
    if (refresh()) schedule(config.cwd, null)
  })
  return {
    close: () => {
      clearTimeout(timer)
      for (const watcher of watchers.values()) watcher.close()
      watchers.clear()
    },
  }
}

function isInside(directory: string, parent: string): boolean {
  const path = relative(parent, directory)
  return path !== '' && !path.startsWith('..')
}
