import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/config.ts', 'src/registry.ts', 'src/server/index.ts', 'src/cli/bin.ts'],
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  unbundle: true,
  dts: true,
  clean: true,
  external: ['actionmcp/registry'],
  inputOptions: {
    onLog(level, log, defaultHandler) {
      if (log.code !== 'MODULE_LEVEL_DIRECTIVE') defaultHandler(level, log)
    },
  },
})
