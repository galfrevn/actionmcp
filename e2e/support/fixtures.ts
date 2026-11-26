export interface FixtureServer {
  name: string
  directory: string
  port: number
  mode: 'start' | 'dev'
}

const PRODUCTION_FIXTURES = ['basic', 'formdata', 'safe-action', 'jsdoc', 'scoped', 'navigate', 'redirect', 'hostile', 'coexist'] as const

export type FixtureName = (typeof PRODUCTION_FIXTURES)[number] | 'basic-dev'

const BASE_PORT = 4101

export const fixtureServers: FixtureServer[] = [
  ...PRODUCTION_FIXTURES.map((name, index) => ({ name, directory: `fixtures/${name}`, port: BASE_PORT + index, mode: 'start' as const })),
  { name: 'basic-dev', directory: 'fixtures/basic', port: BASE_PORT + PRODUCTION_FIXTURES.length, mode: 'dev' },
]

export function fixtureUrl(name: FixtureName, path = '/'): string {
  const server = fixtureServers.find((candidate) => candidate.name === name)
  if (!server) throw new Error(`Unknown fixture "${name}".`)
  return `http://localhost:${server.port}${path}`
}
