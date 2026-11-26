# Changelog

This project follows [Semantic Versioning](https://semver.org). While the version is 0.x, a minor release can contain breaking changes.

## Unreleased

### Added

- The `AT008` error for a plain function that the registry file lists by reference. Before, `inspect` reported it as a valid tool and the app failed when it rendered.
- The `AT110` warning for an exported `agent()` or `@agent` tool in a file that the `scan` globs do not cover. Before, the tool was left out with no message.
- `agent()` logs the issues on the server when the return value of a handler does not match the `output` schema.

### Changed

- The analyzer follows a relative import of the registry file. It reads an `agent()` tool that the registry lists from a file outside the `scan` globs, and it tells apart two tools with the same export name.
- An `onBeforeExecute` hook that throws blocks the call with the `blocked` code. Before, the call was rejected.

### Fixed

- An error in `onAfterExecute`, or in a listener of the devtools panel, no longer rejects a tool call whose action already ran.
- A tool whose `confirm` option is not `'always'`, `'consequential'`, or `'never'` asks for confirmation. Before, it ran without one.

## 0.2.0

### Changed

- **Breaking:** `ts-json-schema-generator` is an optional peer dependency, and `typescript` is no longer a dependency. An app that uses the experimental `@agent` tag must install the generator: `npm install --save-dev ts-json-schema-generator`. Without it, the `AT206` error stops `next build` and the `@agent` tools are left out of the registry. An app that does not use `@agent` needs no change.
- The confirmation dialog lists each field of the input with its value instead of the input as JSON. The label of a field is the `title` of its property in the input schema, or the field name.
- The `Release` workflow publishes with npm trusted publishing instead of an npm token.

### Added

- `confirmLabels` on `AgentToolsProvider`, and the `labels` and `inputSchema` props of `ConfirmDialog`, to translate the dialog without replacing it.
- The `AT109` warning for an `agent()` call that the analyzer cannot register, such as a call inside a factory function or wrapped in another call.
- Without the polyfill, tools are registered on a `document.modelContext` that a browser extension installs up to about five seconds after the page loads.

### Fixed

- The `navigate` tool rejects a parameter that contains the path segment `.` or `..`. Before, a call such as `{ route: '/docs/[...path]', params: { path: '../login' } }` opened a route outside the list of the tool.
- In watch mode, the generator no longer reads and parses every page again after each change.

## 0.1.0

### Added

- `agent()`: a wrapper that turns a Server Function into a WebMCP tool, with Standard Schema validation of the input and the output on the server.
- `defineAgentTools()` and `tool()`: an explicit registry for existing actions, with the adapters `fromFormDataAction()`, `fromFormAction()`, and `fromSafeAction()`.
- The experimental `@agent` JSDoc tag, with input schemas inferred from TypeScript types. It is off by default.
- `<AgentTools />`: a Server Component that registers tools for the layout that renders it, with `include`, `exclude`, `prefix`, `navigate`, `polyfill`, `exposedTo`, and `originTrialToken`.
- A typed `navigate` tool generated from the `app/` directory.
- An in-page confirmation dialog for consequential tools, and `AgentToolsProvider` with `onBeforeExecute`, `onAfterExecute`, and `confirmComponent`.
- `withAgentTools()` for `next.config`: code generation during the build and in development, and the registry alias for Turbopack and webpack.
- The `actionmcp` CLI with `generate`, `inspect`, and `doctor`, and the diagnostic codes `AT001` to `AT205`.
- `<AgentToolsDevtools />`: a development panel that lists and runs tools.
