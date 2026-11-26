import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const alias = { 'actionmcp/registry': fileURLToPath(new URL('./src/registry.ts', import.meta.url)) }

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/**/*.dom.test.{ts,tsx}'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.dom.test.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/__fixtures__/**'],
      thresholds: {
        'src/core/**': { statements: 85, branches: 85, functions: 85, lines: 85 },
        'src/server/**': { statements: 85, branches: 85, functions: 85, lines: 85 },
        'src/generator/**': { statements: 85, branches: 85, functions: 85, lines: 85 },
      },
    },
  },
})
