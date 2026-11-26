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

## Proposed repo layout

```
actionmcp/
├─ packages/
│  └─ actionmcp/
│     ├─ src/
│     │  ├─ core/            # framework-agnostic (ADR-008): types, normalization, names, WebMCP adapter
│     │  │  ├─ webmcp.ts     # thin layer over document.modelContext (feature detection, register, wait)
│     │  │  ├─ names.ts      # name validation and reservation
│     │  │  ├─ schema.ts     # Standard JSON Schema → JSON Schema draft-2020-12
│     │  │  └─ result.ts     # AgentResult / normalization / errors
│     │  ├─ server/          # agent(), tool(), defineAgentTools(), adapters
│     │  ├─ react/           # AgentTools (RSC), Registrar, Provider, Confirm, Devtools
│     │  ├─ next/            # withAgentTools(), navigate (router), Next-specific integration
│     │  ├─ analyzer/        # scan, types, diagnostics
│     │  ├─ generator/       # emits registry.ts and manifest.json
│     │  └─ cli/             # generate | inspect | doctor
│     └─ package.json        # exports: ".", "./server", "./config", "./client", "./registry" (alias)
├─ examples/
│  ├─ basic/                 # full todo app (Path A)
│  ├─ formdata/              # useActionState (Path B)
│  ├─ safe-action/           # next-safe-action (Path B)
│  ├─ jsdoc/                 # Path C
│  └─ chat/                  # in-app chat with AI SDK
├─ fixtures/                 # minimal Next 16 apps for integration and e2e tests
└─ documentation/
```

The monorepo uses pnpm and turbo. v0.1 publishes a single package and separates `core/` by convention, with import linting ([ADR-008](decisions.md#adr-008-framework-agnostic-core-one-package-in-v01)).

## Modules

### 1. Analyzer (Node, build/dev)

Input: `AgentToolsConfig`. Output: an in-memory `AnalysisResult` and the diagnostics.

**Quick scan** (`oxc-parser`, no type checker):

1. Walks the `scan` globs and skips `node_modules`, `.next`, and `outDir`.
2. For each file with a module-level `'use server'` directive:
   - Looks for `export const X = agent(` (imported from `actionmcp/server`, resolving the import alias) → `kind: 'agent'`.
   - Looks for exported functions whose JSDoc contains `@agent` → `kind: 'jsdoc'` (Path C, experimental).
3. If `registry` is set (Path B), marks it to be imported without analysis, because its metadata is resolved at runtime.
4. If `navigate` is active in any usage, scans `app/` to build the [route table](#tool-navigate).

**Types** (only for `kind: 'jsdoc'`, Path C, experimental):

- Creates a TypeScript `Program` with `typescript@6.0.x` pinned as its own dependency. Native TS 7 has no stable JS API (see [research.md](research.md#5-schema-inference)). Uses the user's `tsconfig.json`.
- `ts-json-schema-generator` produces the schema for the **first parameter**. If the parameter is `FormData`, or the signature is `(prev, formData)`, it emits `AT101` and suggests Path B.
- Property descriptions come from the JSDoc of each property in the type.
- Caches by a hash of the file content and the `tsconfig`, so `--watch` is incremental.

**Diagnostics:** see the table in [spec.md](spec.md#cli). Every diagnostic includes `file:line:col` and a suggested `fix`.

### 2. Generator

Writes two files to `outDir` (default `.agent-tools/`, which is added to `.gitignore`):

**`registry.ts`** (server-only). Example output. The `jsdoc` block is Path C and experimental:

```ts
// @generated by actionmcp — do not edit
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
  generatedAt: string
  nextVersion: string
  tools: Array<{
    name: string
    kind: 'agent' | 'jsdoc' | 'explicit' | 'navigate'
    source: { file: string; export: string; line: number }
    schemaSource: 'standard-schema' | 'typescript' | 'none'
    annotations: { readOnlyHint: boolean; consequentialHint: boolean; untrustedContentHint: boolean }
    confirm: 'always' | 'consequential' | 'never'
    adapter?: 'formdata' | 'safe-action'
    validated: boolean
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
- In `next dev` it starts `generate --watch` in the same process (the pattern used by contentlayer, velite, and others). **Unverified**: check in S0 that it does not duplicate on config restarts.
- Adds `turbopack.resolveAlias['actionmcp/registry'] = './.agent-tools/registry.ts'`, and the equivalent for webpack. This lets `<AgentTools />` import the registry without props. **Unverified**: check in S0 how `resolveAlias` resolves a package in `node_modules` that imports the alias.
- Without `withAgentTools()`: `<AgentTools registry={registry} />` with a manual import (documented escape hatch).

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
  adapter?: 'formdata' | 'safe-action'
  action: (input: unknown) => Promise<unknown>   // server reference
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

`runTool`:

1. **Confirmation:** if `confirm === 'always'`, or if it is `'consequential'` and the tool is consequential, shows the `Confirm` component. By default this is an accessible native `<dialog>` with the name, the description, and the formatted input. If the user cancels, it rejects with `DOMException('…', 'NotAllowedError')`.
2. Runs `onBeforeExecute` from `AgentToolsProvider`, if present. If it returns `false`, the call is cancelled.
3. **Adapter:** with `formdata`, converts the object to `FormData` (arrays as repeated keys, booleans as `'on'` or omitted) and calls `action(undefined, fd)`. With `safe-action`, unwraps the result.
4. Calls the Server Function. This is Next's native RPC: a POST with the encrypted ID, the origin check, and an RSC response that **revalidates the UI on its own**.
5. **Normalization:**
   - An `AgentResult` with `ok: false`, `{ serverError }`, `{ validationErrors }`, or `{ error: string }` (`ActionState` style) → `throw new DOMException(message, 'OperationError')`. The AI SDK converts it to `isError: true`.
   - If there is no error → JSON that is safe for `structuredClone`.
6. **Cancellation:** if `signal` aborts, the result is ignored and the call rejects with `AbortError`. **Server Actions in flight cannot be cancelled.** This is documented as a limitation.

**Sequential dispatch:** Next runs Server Actions one at a time per client ([research.md](research.md#4-nextjs)). Tools queue behind other actions, including the UI's. This is documented. In phase 2, `readOnly` tools are added through GET route handlers.

### Redirect and navigation

- If the action calls `redirect()`, Next navigates on the client. **Unverified**: check in S0 whether the action's Promise resolves, rejects, or stays pending, and whether the segment's `Registrar` unmounts before the result is returned.
- Planned mitigation:
  - If the tool triggers navigation, return `{ ok: true, navigatedTo: url }` before the signal aborts. To do that, intercept the redirect with the router's `onNavigate`, or with `useLinkStatus`/`usePathname`. **Unverified**: the exact mechanism needs investigation.
  - If that is not possible, document: "tools that redirect lose their result until continuations exist."
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

- Runs `router.push(href)` and returns `{ ok: true, url }` immediately.
- Limited by `navigate.routes` (globs). By default, only static routes and dynamic routes with `generateStaticParams` or other explicit declarations are included. **Unverified**: decide in S2. The full list could expose internal routes.

### Reserved names

`snapshot`, `act`, `query` (UI SDK); `pause_hmr`, `resume_hmr`, `nextjs_inspect`, `nextjs_compile_route` (Next dev tools, PR #98443); `navigate` (ours, unless overridden).

If a name collides at runtime (`registerTool` rejects with `InvalidStateError`), the tool is registered with the configured prefix or with a `_2` suffix, and the collision is logged in dev. Coexisting with Shopify tools (`get_cart`, …) is the user's responsibility, through `prefix`.

### Devtools

`<AgentToolsDevtools />` renders only when `process.env.NODE_ENV === 'development'`. It is a floating button with a panel:

- registered tools (via `getTools()`, both ours and third-party);
- the schema and annotations of each tool;
- a JSON form for `executeTool()`;
- call history with input, output, duration, and whether a confirmation was shown;
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
2. **Open question:** build on `use-webmcp-tool`, or on a custom layer ([ADR-010](decisions.md#adr-010-client-registration-layer-owned-and-thin)).
3. **Open question:** the default route policy for `navigate`.
4. **Resolved.** v0.1 supports Next.js 16.x only. Next.js 15.5 (React 19.0 and 19.1) is out of scope and will be reconsidered after v0.1 ([ADR-013](decisions.md#adr-013-supported-nextjs-versions)).
