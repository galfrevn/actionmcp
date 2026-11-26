# Changelog

This project follows [Semantic Versioning](https://semver.org). While the version is 0.x, a minor release can contain breaking changes.

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
