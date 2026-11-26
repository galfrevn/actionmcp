# Architecture

actionmcp has two halves. A build step finds the tools and writes a registry. A runtime registers the tools in the browser and runs them through the Server Function RPC.

```
 BUILD / DEV (Node)                                    RUNTIME
 ┌───────────────────────────────────────────────┐   ┌──────────────────────────────────────────────────────┐
 │  analyzer                                     │   │  <AgentTools/>  (Server Component)                   │
 │  ├─ scan (oxc-parser): 'use server', exports, │   │  ├─ imports the registry (alias actionmcp/registry   │
 │  │   agent(), @agent JSDoc, app/ routes       │   │  │   → .agent-tools/registry.ts)                     │
 │  ├─ types (TypeScript 6): only for @agent     │   │  ├─ resolves each input schema to JSON Schema        │
 │  └─ diagnostics ATxxx                         │   │  ├─ filters with include / exclude / prefix          │
 │  generator                                    │   │  └─ passes definitions + Server Function references  │
 │  ├─ .agent-tools/registry.ts  (server-only)   │   │                     │                                │
 │  └─ .agent-tools/manifest.json                │   │                     ▼                                │
 │  cli: generate | inspect | doctor             │   │  <Registrar/> (Client Component)                     │
 │  config: withAgentTools() → watch + alias     │   │  ├─ finds document.modelContext (optional polyfill)  │
 │                                               │   │  ├─ registerTool(definition, { signal, exposedTo })  │
 │                                               │   │  ├─ execute → confirm? → action(input)               │
 │                                               │   │  │   (native Server Function RPC) → result           │
 │                                               │   │  └─ unmount → abort() → unregister                   │
 └───────────────────────────────────────────────┘   └──────────────────────────────────────────────────────┘
```

## Repository layout

```
actionmcp/
├─ packages/
│  └─ actionmcp/
│     ├─ src/
│     │  ├─ core/            # framework-agnostic: types, names, schema, results, execution, WebMCP layer
│     │  ├─ server/          # agent(), tool(), defineAgentTools(), createRegistry(), adapters
│     │  ├─ react/           # AgentTools (Server Component), Registrar, Provider, Confirm, Devtools
│     │  ├─ next/            # navigate tool, redirect handling
│     │  ├─ analyzer/        # scan, explicit registry, routes, types, diagnostics
│     │  ├─ generator/       # registry.ts and manifest.json, watch mode
│     │  ├─ cli/             # generate | inspect | doctor
│     │  └─ config.ts        # withAgentTools()
│     └─ package.json        # exports: ".", "./server", "./client", "./config", "./registry"
├─ examples/                 # one app per way to define tools, and an in-app chat
├─ fixtures/                 # minimal Next.js apps for integration and end-to-end tests
├─ e2e/                      # Playwright specs
├─ tests/                    # integration and packed-tarball tests
├─ bench/                    # demo app and benchmark harness
└─ documentation/
```

`src/core` imports nothing from `next`, `react`, or the other folders. An oxlint rule and `src/core/isolation.test.ts` enforce this.

## Analyzer

Input: the `withAgentTools()` options. Output: the list of tools, the route table, and the diagnostics.

1. It walks the `scan` globs and skips `node_modules`, `.next`, and the output folder. It parses, with `oxc-parser`, only the files whose text mentions `actionmcp/server`, `@agent`, or `AgentTools`.
2. In each parsed file it looks for:
   - exported `agent()` calls, resolving the import from `actionmcp/server` and its aliases;
   - exported functions whose JSDoc has the `@agent` tag, when `jsdoc` is enabled.
3. It reads the registry file (`agent-tools.ts`) statically to list its tools and check their literal options. A registry that it cannot read is an error, so that `inspect` always shows every tool.
4. It scans `app/` to build the route table for the [navigate tool](#the-navigate-tool).

An `agent()` tool that the registry file lists by reference is registered once, under the registry's name.

For `@agent` tools, the analyzer creates a TypeScript program with its own TypeScript 6 and the project's `tsconfig.json`. `ts-json-schema-generator` produces the schema of the first parameter, with property descriptions from the JSDoc of each property. The result is cached in `.agent-tools/cache/types.json` by a hash of the file content and the `tsconfig`. A change in a type that another file declares does not invalidate the cache. Delete the cache file in that case.

Every diagnostic has a code, a file, a line, a column, and a suggested fix. The codes are in the [API reference](api-reference.md#diagnostics).

## Generator

The generator writes two files to the output folder, `.agent-tools/` by default. Both are deterministic: two runs over the same sources produce identical bytes, and a file is rewritten only when its content changes.

`registry.ts` is server-only:

```ts
// @generated by actionmcp. Do not edit.
import 'server-only'
import { createRegistry } from 'actionmcp/server'
import * as m0 from '../app/projects/actions'
import * as m1 from '../app/todos/actions'
import explicit from '../agent-tools'

export default createRegistry({
  agent: { addTodo: m1.addTodo, listTodos: m1.listTodos },
  jsdoc: {
    renameProject: {
      action: m0.renameProject,
      description: 'Rename the current project.',
      inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, name: { type: 'string' } }, required: ['projectId', 'name'] },
      annotations: { readOnlyHint: false, consequentialHint: true, untrustedContentHint: false },
      validated: false,
    },
  },
  explicit,
  routes: [{ pattern: '/', params: [] }],
})
```

A tool with an error-level diagnostic is left out of the registry.

`manifest.json` lists every tool for `inspect`, `doctor`, and code review:

```ts
interface Manifest {
  version: 1
  nextVersion: string
  tools: Array<{
    name: string
    kind: 'agent' | 'jsdoc' | 'explicit' | 'navigate'
    description: string
    source: { file: string; export: string; line: number }
    schemaSource: 'standard-schema' | 'typescript' | 'none'
    annotations: { readOnlyHint: boolean; consequentialHint: boolean; untrustedContentHint: boolean }
    confirm: 'always' | 'consequential' | 'never'
    adapter?: 'formdata' | 'form' | 'safe-action'
    validated: boolean
    diagnostics: string[]
  }>
  routes: RouteEntry[]
}
```

`validated` is `true` when actionmcp validates the input before the handler runs.

## `withAgentTools()`

- During `next build` it runs the generator once. An error-level diagnostic stops the build with the file and the line.
- During `next dev` it runs the generator once and then watches the scan roots in the same process. Next.js replaces the server process when the config changes, so the watcher does not duplicate.
- It sets `turbopack.resolveAlias['actionmcp/registry']` and the webpack `resolve.alias` equivalent, so `<AgentTools />` imports the generated registry without props. Without the alias, `actionmcp/registry` resolves to an empty registry that ships with the package.
- It records its options so that the CLI can read them from `next.config`.

## Runtime

### `<AgentTools />`

The Server Component:

1. imports the registry;
2. computes each definition once per registry. For `agent()` and `tool()` it reads the options and calls `schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' })`. For `@agent` it uses the schema that the generator embedded;
3. applies `include`, `exclude`, and `prefix`, and checks the names;
4. renders the origin trial `<meta>` if there is a token. React hoists it to `<head>`;
5. renders the client `Registrar` with the definitions. Each definition carries its Server Function reference, which React can pass from a Server Component to a Client Component.

```ts
interface SerializableToolDef {
  name: string
  title?: string
  description: string
  inputSchema?: object
  outputSchema?: object
  annotations: { readOnlyHint: boolean; consequentialHint: boolean; untrustedContentHint: boolean }
  confirm: 'always' | 'consequential' | 'never'
  adapter?: 'formdata' | 'form' | 'safe-action'
  action: (...args: never[]) => Promise<unknown>
}
```

### `Registrar`

The Client Component registers the definitions on `document.modelContext` with one `AbortController`, and aborts it on unmount. That is how tools follow the layout that mounts them.

- The registration is keyed by the serialized definitions. A re-render of the Server Component with the same tools unregisters nothing.
- The `execute` callback reads the latest Server Function reference from a ref.
- If `document.modelContext` is missing and `polyfill` is set, it loads `@w3c/webmcp-polyfill`. Without either, it does nothing.
- It calls `waitForToolsUntil` when the browser has it.
- If a name is already taken, the tool is registered with a `_2` suffix and a warning is logged in development.

### Executing a tool

`src/core/execute.ts` runs these steps for each call:

1. **Confirmation.** If `confirm` is `'always'`, or it is `'consequential'` and the tool is consequential, the page shows the confirmation component. Confirmations queue, so one dialog is visible at a time. If the user cancels, the tool returns `{ ok: false, error: { code: 'declined' } }` and the action does not run.
2. **Hook.** `onBeforeExecute` from `AgentToolsProvider` runs, if present. `false` returns `{ ok: false, error: { code: 'blocked' } }`.
3. **Adapter.** With `formdata`, the input becomes a `FormData` and the call is `action(undefined, formData)`. With `form`, it is `action(formData)`. With `safe-action`, the result is unwrapped.
4. **Call.** The Server Function reference is called. Next.js sends a POST with the encrypted action ID, checks the origin, and revalidates the UI from the response.
5. **Result.** Every outcome becomes one envelope, `{ ok: true, data }` or `{ ok: false, error }`. `{ serverError }` and `{ error: string }` become `failed`, `{ validationErrors }` becomes `invalid_input`, and a thrown error becomes `failed`.
6. **Cancellation.** If the consumer aborts, the call rejects with `AbortError` and an open confirmation closes. A Server Function in flight cannot be cancelled.

Next.js dispatches Server Functions one at a time per client, so a tool call queues behind other actions, including the ones the UI starts.

### Redirects

When an action calls `redirect()`, Next.js navigates and the client Promise rejects with an error whose `digest` is `NEXT_REDIRECT;<type>;<url>;<status>;`. The client reads the URL and returns `{ ok: true, data: { navigatedTo: url } }`. The result is delivered even when the navigation unmounts the layout that registered the tool.

`agent()` rethrows every error that carries a `digest`, so `redirect()` and `notFound()` keep their meaning inside a handler.

### The navigate tool

The route table comes from `app/`:

- Route groups `(x)` are removed from the path.
- Private folders `_x`, slots `@x`, intercepting routes `(.)x`, route handlers, and `app/api` are ignored.
- Dynamic segments `[id]`, `[...slug]`, and `[[...slug]]` become parameters.

```ts
interface RouteEntry {
  pattern: string
  params: string[]
  catchAll?: string
  optionalCatchAll?: string
  title?: string
  staticParams?: boolean
}
```

The tool's input schema lists the allowed patterns as an enum. The tool builds the URL from `params` and `query`, calls `router.push()`, and returns `{ ok: true, data: { url } }`. It accepts only a route from its enum. It rejects a parameter that contains the path segment `.` or `..`, because the browser would resolve that segment to a route outside the enum.

### Reserved names

`snapshot`, `act`, `query`, `pause_hmr`, `resume_hmr`, `nextjs_inspect`, `nextjs_compile_route`, and `navigate`. Other libraries and Next.js development tools use the first seven.

### Devtools

`<AgentToolsDevtools />` renders only when `NODE_ENV` is `development`, and its panel is loaded lazily. The panel reads the tools with `getTools()`, runs them with `executeTool()`, and subscribes to the calls that actionmcp executes.

## Design decisions

### Code generation instead of a compiler plugin

The registry needs a view of the whole project. Turbopack does not run webpack plugins, loaders see one file at a time, and SWC plugins are WASM modules tied to a compiler version. A separate generation step gives the same output with Turbopack and with webpack, and leaves a manifest that people can inspect and review. The cost is a watcher in development and an alias for the registry. The `registry` prop of `<AgentTools />` works without the alias.

### Standard Schema, and TypeScript types as a fallback

`agent()` and `tool()` take the validator as a value. The JSON Schema comes from Standard JSON Schema at runtime on the server, and `agent()` validates with the same object, so the schema that the agent sees and the validation cannot drift apart. Any validator that implements the standard works, and actionmcp never parses validator source code. Zod 3 does not implement Standard JSON Schema.

The `@agent` tag infers the schema from TypeScript types instead and does not validate at runtime. It is experimental and off by default.

### Opt-in exposure

A function is a tool only if it is wrapped in `agent()`, listed with `tool()`, or tagged with `@agent`. There is no mode that exposes every Server Function, because exposure is a security decision that a default cannot make.

### Execution through the Server Function RPC

The browser calls the Server Function reference, the same mechanism that the UI uses. There is no dispatcher endpoint, so a tool has exactly the permissions of the user, and the UI revalidates after an agent action with no extra code. The costs are sequential dispatch and no cancellation of an action in flight. Every exposed action is referenced by the client, so Next.js keeps it in the client's list of actions.

### Registry in a Server Component, scope by composition

Schemas are evaluated on the server, so the validator never reaches the client bundle. Only JSON and Server Function references cross to the client. Tools exist while the `<AgentTools />` that includes them is mounted, which follows the layouts that the App Router already resolves.

### Failures are results, not rejections

Browsers replace every rejected `execute` with `OperationError: Tool execution failed.`. The name and the message of the thrown error do not reach the agent. actionmcp therefore resolves with an envelope for every outcome, so an agent can read validation issues and can tell a declined confirmation from a crash. `execute` rejects only when the consumer cancels the call. When a tool declares an `output` schema, the registered `outputSchema` describes the envelope, with the declared schema under `data`.

### Confirmation by default

No agent guarantees its own confirmation for consequential tools, so the page asks. In agents that also confirm, a user can see two confirmations. `confirm: 'never'` turns the page dialog off for one tool and produces the `AT103` warning.

### Default routes of the navigate tool

`navigate` lists the routes without dynamic segments, plus the dynamic routes whose page exports `generateStaticParams`. A dynamic route gives the agent a free-form parameter, so it needs an explicit glob in `navigate.routes`.

### `agent()` validates its output

When a tool declares an `output` schema, `agent()` validates the handler's return value on the server and returns the validated value. A validator that strips unknown keys, such as a Zod object, removes undeclared fields. If validation fails, the tool returns a `failed` result and none of the data. For `tool()` and `@agent`, the action runs unchanged, so `output` only describes the result.

### A thin, owned registration layer

`src/core/webmcp.ts` is a small layer over `document.modelContext` with feature detection for each optional method. It registers a batch of tools with one signal, wraps `execute`, and loads the polyfill on demand. The types come from `webmcp-types`.

### Supported versions

actionmcp supports the App Router on Next.js 16.x and React 19.2 or later.
