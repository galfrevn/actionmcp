import { defineConfig } from '@playwright/test'
import { exampleServers, fixtureServers } from './e2e/support/fixtures'

const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e/specs',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : 4,
  reporter: isCI ? [['github'], ['list']] : [['list']],
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [{ name: 'polyfill' }, { name: 'native', use: { launchOptions: { args: ['--enable-features=WebMCP'] } } }],
  webServer: [...fixtureServers, ...exampleServers].map((server) => ({
    command: `pnpm exec next ${server.mode} -p ${server.port}`,
    cwd: server.directory,
    url: `http://localhost:${server.port}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  })),
})
