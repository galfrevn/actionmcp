import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/registry.ts', 'src/server/index.ts'],
  format: 'esm',
  platform: 'neutral',
  unbundle: true,
  dts: true,
  clean: true,
  external: ['actionmcp/registry'],
})
