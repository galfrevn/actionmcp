# Changelog

This project follows [Semantic Versioning](https://semver.org). While the version is 0.x, a minor release can contain breaking changes.

## Unreleased

### Added

- The `AT008` error for a plain function that the registry file lists by reference. Before, `inspect` reported it as a valid tool and the app failed when it rendered.
- The `AT110` warning for an exported `agent()` or `@agent` tool in a file that the `scan` globs do not cover. Before, the tool was left out with no message.
- `agent()` logs the issues on the server when the return value of a handler does not match the `output` schema.
- In development, `<AgentTools />` logs each tool that the browser refuses to register, with the error. Before, a refused registration left no trace.
- `<AgentTools />` checks each `exposedTo` origin. An origin that the browser would refuse, such as `agent.example` without a scheme, throws in development and is left out with a warning in production. Before, the browser refused every tool of that `<AgentTools />` and nothing was logged.
- In development, the warning for a taken tool name says when two `<AgentTools />` on the page register the same tool, and suggests `include` or `exclude`.
- The `cwd` option of `withAgentTools()`, for `next build apps/web` and other runs from outside the project directory. `withAgentTools()` warns when the project directory has no `app` or `src/app` directory. Before, such a run analyzed the directory where `next` ran and found no tools, with no message.
- The `initialState` option of `fromFormDataAction()`, the previous state that the browser passes to the action. Before, the action always received `undefined`, so an action that read `previousState` failed.

### Changed

- The analyzer follows a relative import of the registry file. It reads an `agent()` tool that the registry lists from a file outside the `scan` globs, and it tells apart two tools with the same export name.
- An `onBeforeExecute` hook that throws blocks the call with the `blocked` code. Before, the call was rejected.
- `agent()` and `tool()` throw a `TypeError` for a `confirm` value that is not a policy and for a `readOnly`, `consequential`, or `untrustedOutput` value that is not a boolean.
- **Breaking:** the `AT005` error also covers `readOnly`, `consequential`, `untrustedOutput`, and `confirm` values that are not literals, an unknown `confirm` policy, and a spread in the options. Before, the analyzer ignored them, so `manifest.json` and `AT103` could disagree with the tool that ran.
- The confirmation dialog lists the fields in the order of the input schema, then the fields that the schema does not declare, labeled with the `extra` label of `ConfirmLabels`. A long value scrolls inside its own row. Before, the agent chose the order of the rows and the label of an undeclared field, and a long value could push the other fields out of view.
- The input schema of the `navigate` tool describes each route with the literal `metadata.title` of its page and the names of its parameters. Before, the agent saw only the patterns.

### Fixed

- An error in `onAfterExecute`, or in a listener of the devtools panel, no longer rejects a tool call whose action already ran.
- A tool whose `confirm` option is not `'always'`, `'consequential'`, or `'never'` asks for confirmation. Before, it ran without one.
- The analyzer reads a `tool(...)` call that the registry file lists through a local `const`. Before, it reported the entry with an empty description and the default `confirm` policy, whatever the call set, and `AT103` did not apply. A local binding that is not such a `const` is an `AT007` error.
- The devtools panel records the result of an action that ran after the agent cancelled the call, and marks the call "cancelled by the agent". Before, it recorded the call as aborted while the action still ran.
- `notFound()`, `forbidden()`, and `unauthorized()` in an action return the `not_found`, `forbidden`, and `unauthorized` codes to the agent. An action that the server no longer knows after a deployment returns `stale_page`, and a server error in production returns `The tool failed.` Before, all of them returned `failed` with an internal Next.js message.
- An `input` validator of `agent()` that throws returns a `failed` result, or the code of an `AgentToolError`, and the error is logged on the server. Before, the error escaped the result and the agent received the Next.js error.
- The `errors` field of a form action state, such as `{ errors: { name: ['Required'] } }`, returns `invalid_input` with an issue for each message, and `{ error: { message } }` returns `failed`. An empty `validationErrors` is no longer a failure. Before, the first two returned `ok: true` and the third returned `invalid_input` without issues.
- A Zod schema with `z.coerce.date()` in the input, or a Zod date in the output, converts to JSON Schema with `{ type: 'string', format: 'date-time' }`. Before, one date field left the tool without its whole schema. `z.date()` in an input still produces `AT101`, with a message that suggests `z.coerce.date()`.
- An input schema that is a union of objects, such as `z.discriminatedUnion()`, or an `@agent` parameter whose type is a union of object types, is registered with `type: 'object'` next to its `oneOf` or `anyOf`. Before, it produced `AT101` and the tool had no `inputSchema`.
- The confirmations of every `<AgentTools />` on a page share one queue, so one dialog is open at a time. Before, each `<AgentTools />` had its own queue, and a root layout and a segment layout could open two dialogs at once.
- A registration that fails with `InvalidStateError` is retried with a suffix only when the suffixed name is valid. Before, an invalid name was retried as `name_2` and `name_3`.
- The `navigate` tool counts a `generateStaticParams` in a layout, such as `app/[lang]/layout.tsx`, for the dynamic segments at or above it. Before, only a `generateStaticParams` in the page counted, so an app under `app/[lang]` had no `navigate` tool by default.
- An error of a file watcher in `next dev` or `actionmcp generate --watch`, such as `ENOSPC` or `EMFILE`, is reported and stops only that watcher. Before, it crashed the process.
- In watch mode, a scan root such as `lib/` and a default registry file such as `agent-tools.ts` that are created after the start are watched and analyzed. Before, they needed a restart.
- A tool in a `.mts` file is an `AT004` error that asks to rename the file to `.ts`. Next.js does not apply `'use server'` to `.mts` files, so before, the generated registry passed a plain function to the client and `next build` failed while prerendering.

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
