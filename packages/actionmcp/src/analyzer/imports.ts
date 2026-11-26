import { readFileSync, statSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import { isRecord } from '../core/guards'

export type ImportResolver = (fromFile: string, specifier: string) => string | undefined

export const IMPORT_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']

interface PathAlias {
  prefix: string
  suffix: string
  wildcard: boolean
  targets: string[]
}

export function createImportResolver(cwd: string): ImportResolver {
  const aliases = readPathAliases(cwd)
  const findFile = (base: string) => {
    if (base.startsWith('..') || posix.isAbsolute(base)) return undefined
    return IMPORT_SUFFIXES.map((suffix) => `${base}${suffix}`).find((candidate) => isFile(join(cwd, candidate)))
  }
  return (fromFile, specifier) => {
    if (specifier.startsWith('.')) return findFile(posix.join(posix.dirname(fromFile), specifier))
    for (const alias of aliases) {
      const wildcard = matchAlias(alias, specifier)
      if (wildcard === undefined) continue
      for (const target of alias.targets) {
        const found = findFile(posix.normalize(target.replace('*', wildcard)))
        if (found) return found
      }
    }
    return undefined
  }
}

export function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
}

function readPathAliases(cwd: string): PathAlias[] {
  const file = join(cwd, 'tsconfig.json')
  if (!isFile(file)) return []
  let config: unknown
  try {
    config = JSON.parse(stripJsonComments(readFileSync(file, 'utf8')))
  } catch {
    return []
  }
  const options = isRecord(config) && isRecord(config.compilerOptions) ? config.compilerOptions : {}
  if (!isRecord(options.paths)) return []
  const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl : '.'
  const base = relative(cwd, join(cwd, baseUrl)).split(sep).join('/')
  return Object.entries(options.paths).flatMap(([pattern, targets]): PathAlias[] => {
    const parts = pattern.split('*')
    if (!Array.isArray(targets) || parts.length > 2) return []
    const strings = targets.filter((target): target is string => typeof target === 'string')
    return [
      {
        prefix: parts[0] ?? '',
        suffix: parts[1] ?? '',
        wildcard: parts.length === 2,
        targets: strings.map((target) => posix.join(base, target)),
      },
    ]
  })
}

function matchAlias(alias: PathAlias, specifier: string): string | undefined {
  if (!alias.wildcard) return specifier === alias.prefix ? '' : undefined
  const fits =
    specifier.length >= alias.prefix.length + alias.suffix.length && specifier.startsWith(alias.prefix) && specifier.endsWith(alias.suffix)
  return fits ? specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length) : undefined
}

function stripJsonComments(text: string): string {
  let output = ''
  let inString = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]
    if (inString) {
      output += character
      if (character === '\\') {
        output += next ?? ''
        index += 1
      } else if (character === '"') {
        inString = false
      }
    } else if (character === '"') {
      inString = true
      output += character
    } else if (character === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      output += '\n'
    } else if (character === '/' && next === '*') {
      index = text.indexOf('*/', index + 2)
      if (index === -1) break
      index += 1
    } else {
      output += character
    }
  }
  return output.replace(/,(\s*[}\]])/g, '$1')
}
