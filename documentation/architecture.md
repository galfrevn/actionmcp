# Architecture

## Overview

```
 BUILD / DEV (Node)                                    RUNTIME
 ┌───────────────────────────────────────────────┐   ┌──────────────────────────────────────────────────────┐
 │  analyzer                                     │   │  <AgentTools/>  (Server Component)                   │
 │  ├─ scan (oxc-parser): 'use server', exports, │   │  ├─ import registry (alias actionmcp/registry        │
 │  │   agent(), @agent JSDoc, app/ routes       │   │  │   → .agent-tools/registry.ts)                     │
 │  ├─ types (TS 6 + ts-json-schema-generator)   │   │  ├─ resolve inputSchema:                             │
 │  │   only for @agent tools                    │   │  │    Standard JSON Schema ~standard.jsonSchema      │
 │  └─ diagnostics ATxxx                         │   │  │    or embedded JSON (JSDoc path)                  │
 │  generator                                    │   │  ├─ filter include/exclude/prefix                    │
 │  ├─ .agent-tools/registry.ts  (server-only)   │   │  └─ serializable props + Server Function refs        │
 │  └─ .agent-tools/manifest.json                │   │                     │                                │
 │  cli: generate | inspect | doctor             │   │                     ▼                                │
 │  config: withAgentTools() → watch + alias     │   │  <Registrar/> (Client Component)                     │
 │                                               │   │  ├─ detects document.modelContext (optional polyfill)│
 │                                               │   │  ├─ registerTool(def, {signal, exposedTo})           │
 │                                               │   │  ├─ waitForToolsUntil(registrations)                 │
 │                                               │   │  ├─ execute → confirm? → action(input)               │
 │                                               │   │  │   (native Server Actions RPC) → normalize         │
 │                                               │   │  └─ unmount → abort() → unregister                   │
 └───────────────────────────────────────────────┘   └──────────────────────────────────────────────────────┘
Consumers: ChatGPT Desktop (Site tools) · Chrome OT · Edge OT · agent-browser · in-app chat (AI SDK)
```

## Repo layout

```
actionmcp/
├─ packages/
│  └─ actionmcp/
│     ├─ src/
│     │  ├─ core/            # framework-agnostic (ADR-008): types, names, schema, results, execution, WebMCP adapter
│     │  │  ├─ webmcp.ts     # thin layer over document.modelContext (feature detection, register, polyfill)
│     │  │  ├─ names.ts      # name validation and reservation
│     │  │  ├─ schema.ts     # Standard JSON Schema → JSON Schema draft-2020-12
│     │  │  ├─ result.ts     # AgentResult, normalization, errors
│     │  │  └─ execute.ts    # confirmation, hooks, adapters, cancellation
│     │  ├─ server/          # agent(), tool(), defineAgentTools(), createRegistry(), adapters
│     │  ├─ react/           # AgentTools (RSC), Registrar, Provider, Confirm, Devtools
│     │  ├─ next/            # navigate tool, redirect handling, recorded config
│     │  ├─ analyzer/        # scan, explicit registry, routes, types, diagnostics
│     │  ├─ generator/       # emits registry.ts and manifest.json; watch mode
│     │  ├─ cli/             # generate | inspect | doctor
│     │  └─ config.ts        # withAgentTools()
│     └─ package.json        # exports: ".", "./server", "./client", "./config", "./registry"
├─ examples/                 # basic (path A), formdata and safe-action (path B), jsdoc (path C), chat (AI SDK)
├─ fixtures/                 # minimal Next 16 apps for integration and e2e tests
├─ e2e/                      # Playwright specs, run with the polyfill and with native WebMCP
├─ tests/                    # integration (next build) and packed-tarball tests
├─ bench/                    # demo app and benchmark harness
└─ documentation/
```

The monorepo uses pnpm and turbo. v0.1 publishes a single package and separates `core/` by convention. An oxlint rule and `src/core/isolation.test.ts` enforce the separation ([ADR-008](decisions.md#adr-008-framework-agnostic-core-one-package-in-v01)).

## Modules

### 1. Analyzer (Node, build/dev)

Input: `AgentToolsConfig`. Output: an in-memory `AnalysisResult` and the diagnostics.

**Quick scan** (`oxc-parser`, no type checker):

1. Walks the `scan` globs and skips `node_modules`, `.next`, and `outDir`. It parses only the files whose text mentions `actionmcp/server`, `@agent`, or `AgentTools`.
2. For each parsed file:
   - Looks for `export const X = agent(` (imported from `actionmcp/server`, resolving the import alias) → `kind: 'agent'`.
   - Looks for exported functions whose JSDoc contains `@agent` → `kind: 'jsdoc'` (Path C, experimental).
3. If `registry` is set (Path B), reads the file statically to list its tools and to check their literal options. The values that the runtime uses still come from the module itself. A registry that the analyzer cannot read is an error (`AT007`), so that `inspect` always shows every tool.
4. Scans `app/` to build the [route table](#tool-navigate). The manifest lists the `navigate` tool when a layout uses `<AgentTools navigate />`.
5. An `agent()` tool that the registry file lists by reference is registered once, under the registry's name.

**Types** (only for `kind: 'jsdoc'`, Path C, experimental):

- Creates a TypeScript `Program` with `typescript@6.0.x` pinned as its own dependency. Native TS 7 has no stable JS API (see [research.md](research.md#5-schema-inference)). Uses the user's `tsconfig.json`.
- `ts-json-schema-generator` produces the schema for the **first parameter**. If a parameter is `FormData`, or the tag has the `formdata` modifier, it emits `AT101`, suggests Path B, and selects a FormData adapter by the number of parameters.
- Property descriptions come from the JSDoc of each property in the type.
- Caches by a hash of the file content and the `tsconfig` in `outDir/cache/types.json`, so `--watch` is incremental. A change in a type that another file declares does not invalidate the cache. Delete the cache file in that case.

**Diagnostics:** see the table in [spec.md](spec.md#cli). Every diagnostic includes `file:line:col` and a suggested `fix`.

### 2. Generator

Writes two files to `outDir` (default `.agent-tools/`). Add the folder to `.gitignore`, or commit `manifest.json` so that pull requests show changes to the exposed tools. Both files are deterministic: two runs over the same sources produce identical bytes, and a file is rewritten only when its content changes.

**`registry.ts`** (server-only). Example output. The `jsdoc` block is Path C and experimental:

```ts
// @generated by actionmcp. Do not edit.
import 'server-only'
import { createRegistry } from 'actionmcp/server'
import * as m0 from '../app/todos/actions'
import * as m1 from '../app/projects/actions'
import explicit from '../agent-tools'

export default createRegistry({
  agent: { addTodo: m0.addTodo, listTodos: m0.listTodos },
  jsdoc: {
    renameProject: {
      action: m1.renameProject,
      description: 'Rename the current project.',
      inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, name: { type: 'string' } }, required: ['projectId', 'name'] },
      annotations: { consequentialHint: true },
      validated: false,
    },
  },
  explicit,
  routes: [/* RouteEntry[] only when navigate is in use */],
})
```

**`manifest.json`**: consumed by `inspect`, `doctor`, the generated documentation, and the tests. It is stable and versioned:

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
    validated: boolean                    // true when actionmcp validates the input before the handler
    diagnostics: string[]                 // ATxxx codes
  }>
  routes: RouteEntry[]
}
```

**Why codegen and not a compiler plugin:** see [ADR-001](decisions.md#adr-001-codegen-instead-of-a-compiler-plugin). In short:

- Turbopack does not support webpack plugins, and loaders transform one file at a time.
- We need a view of the whole project (which tools exist) and an inspectable artifact.
- Codegen is a known pattern in Next: `next typegen` and `.next/types`.

### 3. `withAgentTools()` (config)

- Runs `generate` once when the config loads during `next build`. If there is an `AT0xx` error, it aborts the build with a clear message.
- In `next dev` it runs `generate` once and then watches the scan roots in the same process (the pattern used by contentlayer, velite, and others). Next.js replaces the server process on a config restart, so the watcher does not duplicate (spike SP4).
- Adds `turbopack.resolveAlias['actionmcp/registry'] = './.agent-tools/registry.ts'`, and the equivalent for webpack. This lets `<AgentTools />` import the registry without props. The alias resolves for an import inside `node_modules/actionmcp` with both bundlers (spike SP3).
- Without `withAgentTools()`: `<AgentTools registry={registry} />` with a manual import (documented escape hatch). Without the alias, `actionmcp/registry` resolves to an empty registry that ships with the package.
- It records its options so that the CLI can read them from `next.config`.

### 4. Runtime: `<AgentTools />` (RSC) and `<Registrar />` (client)

**RSC:**

1. `import registry from 'actionmcp/registry'`.
2. For each tool, computes the serializable definition:
   - For `agent`/`explicit`: reads the metadata attached to the function (symbol `AGENT_META`) and calls `schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' })`.
   - For `jsdoc`: uses the embedded JSON.
   - Caches the result at module level, because it is deterministic.
3. Applies `include`/`exclude`/`prefix` and validates names (error in dev, warning in prod).
4. Renders `<meta http-equiv="origin-trial" content={token} />` if there is a token. React 19 hoists it to `<head>`.
5. Renders `<Registrar tools={defs} navigate={routes?} polyfill exposedTo />`. Each `def.action` is a reference to the Server Function. React allows passing it as a prop from a Server Component to a Client Component.

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
  action: (...args: never[]) => Promise<unknown>   // server reference
}
```

**Client (`Registrar`):**

```ts
useEffect(() => {
  const mc = document.modelContext ?? (polyfill ? await loadPolyfill() : undefined)
  if (!mc) return                                   // silent no-op; Devtools shows "WebMCP unavailable"
  const ac = new AbortController()
  const registrations = defs.map((def) =>
    mc.registerTool(
      { name, title, description, inputSchema, outputSchema, annotations,
        execute: (input, { signal }) => runTool(def, input, signal, hooks) },
      { signal: ac.signal, exposedTo },
    ),
  )
  mc.waitForToolsUntil?.(Promise.allSettled(registrations))   // feature-detect: added to the spec on 2026-11-24
  return () => ac.abort()
}, [defsKey])
```

The block above is a sketch. The implementation is `src/react/useAgentTools.tsx` and `src/core/webmcp.ts`.

The registration is keyed by the serialized definitions, so a re-render of the Server Component with the same tools does not unregister anything. The `execute` callback reads the latest Server Function reference from a ref.

`executeTool` (`src/core/execute.ts`):

1. **Confirmation:** if `confirm === 'always'`, or if it is `'consequential'` and the tool is consequential, shows the `Confirm` component. By default this is an accessible native `<dialog>` with the name, the description, and the formatted input. The focus starts on "Cancel". Confirmations queue, so one dialog is visible at a time. If the user cancels, the tool returns `{ ok: false, error: { code: 'declined' } }` and the action does not run.
2. Runs `onBeforeExecute` from `AgentToolsProvider`, if present. If it returns `false`, the tool returns `{ ok: false, error: { code: 'blocked' } }`.
3. **Adapter:** with `formdata`, converts the object to `FormData` (arrays as repeated keys, `true` as `'on'`, `false` omitted) and calls `action(undefined, formData)`. With `form`, it calls `action(formData)`. With `safe-action`, it unwraps the result.
4. Calls the Server Function. This is Next's native RPC: a POST with the encrypted ID, the origin check, and an RSC response that **revalidates the UI on its own**.
5. **Normalization:** every outcome becomes one envelope ([ADR-015](decisions.md#adr-015-tool-failures-are-results-not-rejections)).
   - An `AgentResult` passes through.
   - `{ serverError }` becomes `failed`, `{ validationErrors }` becomes `invalid_input` with issues, and `{ error: string }` (`ActionState` style) becomes `failed`.
   - Anything else becomes `{ ok: true, data }`, converted to JSON-safe values.
   - A thrown error becomes `failed`, except a `redirect()`, which becomes a navigation result.
6. **Cancellation:** if `signal` aborts, the call rejects with `AbortError` and an open confirmation closes. **Server Actions in flight cannot be cancelled.** This is documented as a limitation.

**Sequential dispatch:** Next runs Server Actions one at a time per client ([research.md](research.md#4-nextjs)). Tools queue behind other actions, including the UI's. This is documented. In phase 2, `readOnly` tools are added through GET route handlers.

### Redirect and navigation

Spike SP2 measured the behavior on Next.js 16.4.6:

- If the action calls `redirect()`, Next navigates on the client and the action's Promise rejects with an error whose `digest` is `NEXT_REDIRECT;<type>;<url>;<status>;`.
- The client reads the URL from the digest and returns `{ ok: true, data: { navigatedTo: url } }`. The result is delivered even when the navigation unmounts the segment that registered the tool.
- `agent()` rethrows every error that carries a `digest`, so `redirect()`, `notFound()`, and similar signals keep their meaning inside a handler.
- The root layout does not unmount on navigation, so global tools survive. Segment tools re-register when the user returns, and consumers receive `toolchange`.

### Tool `navigate`

Generated from `app/`:

- Ignores route groups `(x)`, private folders `_x`, slots `@x`, intercepting routes `(.)x`, `route.ts`, and `api/`.
- Dynamic segments `[id]`, `[...slug]`, and `[[...slug]]` become parameters.

```ts
interface RouteEntry { pattern: string; params: string[]; catchAll?: string; optionalCatchAll?: string; title?: string }

// Registered tool:
{
  name: 'navigate',
  description: 'Navigate this app to one of its pages. Available tools may change after navigating.',
  inputSchema: {
    type: 'object',
    properties: {
      route: { type: 'string', enum: ['/', '/todos', '/projects/[id]', /* … */] },
      params: { type: 'object', additionalProperties: { type: 'string' } },
      query: { type: 'object', additionalProperties: { type: 'string' } },
    },
    required: ['route'],
  },
  annotations: { readOnlyHint: false, consequentialHint: false },
}
```

- Runs `router.push(href)` and returns `{ ok: true, data: { url } }` immediately. An unknown route or a missing parameter returns `invalid_input` and does not navigate.
- Limited by `navigate.routes` (globs). By default, only static routes and dynamic routes whose page exports `generateStaticParams` are included ([ADR-016](decisions.md#adr-016-default-routes-of-the-navigate-tool)).
- A `RouteEntry` also carries `staticParams?: true` and, when the page exports a literal `metadata.title`, `title`.

### Reserved names

`snapshot`, `act`, `query` (UI SDK); `pause_hmr`, `resume_hmr`, `nextjs_inspect`, `nextjs_compile_route` (Next dev tools, PR #98443); `navigate` (ours, unless overridden).

If a name collides at runtime (`registerTool` rejects with `InvalidStateError`), the tool is registered with a `_2` suffix, and the collision is logged in dev. `fixtures/coexist` covers this. Coexisting with Shopify tools (`get_cart`, …) is the user's responsibility, through `prefix`.

### Devtools

`<AgentToolsDevtools />` renders only when `process.env.NODE_ENV === 'development'`. It is a floating button with a panel:

- registered tools (via `getTools()`, both ours and third-party);
- the schema and annotations of each tool;
- a JSON form for `executeTool()`;
- call history of actionmcp tools with input, result, duration, and whether a confirmation was shown;
- WebMCP status: native, polyfill, or unavailable.

We recommend the Model Context Tool Inspector extension for Chrome.

### In-app chat (AI SDK)

The example in `examples/chat` replicates the official pattern ([research.md](research.md#ai-sdk)):

- **Client:** `createMCPClient({ transport: new Experimental_WebMCPTransport({ modelContext: document.modelContext }) })`, `listTools()` in `prepareSendMessagesRequest`, and `onToolCall` → `callTool` → `addToolOutput`.
- **Server:** `createMCPTools(definitions)` → `streamText`. Validate the count (≤32) and the format, and reject attachments.
- **Requires `polyfill`** in browsers without native WebMCP support.
- Optional v0.2 helper: `useAgentToolsChat()`, which encapsulates that boilerplate.

## Compatibility with Next PR #98443

- We use different names and do not change `debugging: true`.
- If Next later adds native "application tools," the plan is for `<AgentTools />` to delegate to that API. For that reason, the `SerializableToolDef` format imitates the spec's `ModelContextTool`, without exotic fields.
- This keeps the design easy to propose upstream: the shape is small enough for Next.js to adopt.

## Open architecture decisions

1. **Resolved.** The `confirm` option defaults to `'consequential'`, so the in-page dialog runs before any consequential tool ([ADR-012](decisions.md#adr-012-confirmation-for-consequential-tools-by-default)).
2. **Resolved.** The registration layer is owned and thin ([ADR-010](decisions.md#adr-010-client-registration-layer-owned-and-thin)).
3. **Resolved.** `navigate` lists static routes and routes with `generateStaticParams` by default ([ADR-016](decisions.md#adr-016-default-routes-of-the-navigate-tool)).
4. **Resolved.** v0.1 supports Next.js 16.x only. Next.js 15.5 (React 19.0 and 19.1) is out of scope and will be reconsidered after v0.1 ([ADR-013](decisions.md#adr-013-supported-nextjs-versions)).
