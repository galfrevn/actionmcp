export interface FixtureServer {
  name: string
  directory: string
  port: number
  mode: 'start' | 'dev'
}

const FIXTURES = ['basic', 'formdata', 'safe-action', 'jsdoc', 'scoped', 'navigate', 'redirect', 'hostile', 'coexist'] as const
const EXAMPLES = ['basic', 'formdata', 'safe-action', 'jsdoc', 'chat', 'demo'] as const

export type FixtureName = (typeof FIXTURES)[number] | 'basic-dev'
export type ExampleName = (typeof EXAMPLES)[number]

const FIXTURE_BASE_PORT = 4101
const EXAMPLE_BASE_PORT = 4151

export const fixtureServers: FixtureServer[] = [
  ...FIXTURES.map((name, index) => ({ name, directory: `fixtures/${name}`, port: FIXTURE_BASE_PORT + index, mode: 'start' as const })),
  { name: 'basic-dev', directory: 'fixtures/basic', port: FIXTURE_BASE_PORT + FIXTURES.length, mode: 'dev' },
]

export const exampleServers: FixtureServer[] = EXAMPLES.map((name, index) => ({
  name,
  directory: `examples/${name}`,
  port: EXAMPLE_BASE_PORT + index,
  mode: 'start',
}))

function serverUrl(servers: readonly FixtureServer[], name: string, path: string): string {
  const server = servers.find((candidate) => candidate.name === name)
  if (!server) throw new Error(`Unknown app "${name}".`)
  return `http://localhost:${server.port}${path}`
}

export function fixtureUrl(name: FixtureName, path = '/'): string {
  return serverUrl(fixtureServers, name, path)
}

export function exampleUrl(name: ExampleName, path = '/'): string {
  return serverUrl(exampleServers, name, path)
}
