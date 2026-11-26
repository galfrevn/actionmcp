import { createRequire } from 'node:module'
import { join } from 'node:path'
import type ts from 'typescript'

export interface TypeToolchain {
  typescript: typeof ts
  generator: typeof import('ts-json-schema-generator')
}

export const SCHEMA_GENERATOR_PACKAGE = 'ts-json-schema-generator'

export function toolchainOrigins(cwd: string): string[] {
  return [join(cwd, 'package.json'), import.meta.url]
}

export function loadTypeToolchain(origins: readonly string[], generatorPackage = SCHEMA_GENERATOR_PACKAGE): TypeToolchain | undefined {
  for (const origin of origins) {
    const entry = resolveFrom(origin, generatorPackage)
    if (entry === undefined) continue
    const requireFromGenerator = createRequire(entry)
    return {
      generator: requireFromGenerator(entry) as TypeToolchain['generator'],
      typescript: requireFromGenerator('typescript') as typeof ts,
    }
  }
  return undefined
}

function resolveFrom(origin: string, specifier: string): string | undefined {
  try {
    return createRequire(origin).resolve(specifier)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') return undefined
    throw error
  }
}
