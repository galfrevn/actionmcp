# Specification

> Name: `actionmcp` ([ADR-006](decisions.md#adr-006-package-name)).
> Status: v0.1 is implemented and not published to npm. Last reviewed: 2026-11-26.

## Pitch

**"Your server actions are already an API. With one line, they are also tools for agents."**

`actionmcp` converts Server Functions (server actions) and the routes of a Next.js App Router app into typed WebMCP tools. The tools register on the browser's `document.modelContext`, with the user's session, state, and UI. The user chooses what is exposed (opt-in), and the library handles:

- the input JSON Schema,
- the annotations (`readOnlyHint`, `consequentialHint`, `untrustedContentHint`),
- registration and unregistration per route,
- human confirmation for consequential actions,
- integration with the app's own chat through AI SDK.

The API in short (the reference is in [Public API](#public-api-v01)):

```ts
// app/actions.ts
'use server'
import { agent } from 'actionmcp/server'
import { z } from 'zod'

export const addTodo = agent(
  { description: 'Add an item to the current user’s todo list', input: z.object({ text: z.string().min(1).max(200) }) },
  async ({ text }) => { /* auth + db */ },
)
```

```tsx
// app/layout.tsx
import { AgentTools } from 'actionmcp'
// …
<AgentTools />
```

## Problem

1. **Browser agents operate websites by clicking.** They read screenshots or the accessibility tree, guess which button to press, and break with each redesign. WebMCP addresses this: the page exposes its actions as tools with a schema. But each tool still has to be written by hand with `registerTool`. The official AI SDK example does it this way too (see [research.md](research.md#ai-sdk)).
2. **In Next.js, the actions already exist as Server Functions.** They are already endpoints with validation, auth, and UI revalidation. Duplicating them as manual client tools is repeated work and a source of bugs: the tool's schema drifts from the action's schema.
3. **No library generates app tools from Next.js primitives in a safe way.** The Next.js PR that adds WebMCP (#98443) exposes only development tools. The only library that tries to auto-discover server actions (`webmcp-next`) uses unsafe defaults and is unmaintained (see [research.md](research.md#competitors)).

## Why now (with dates)

| Date | Fact | Source |
|---|---|---|
| 2026-06-09 | Chrome opens the WebMCP Origin Trial from Chrome 149 | https://developer.chrome.com/blog/ai-webmcp-origin-trial |
| 2026-08 | OpenAI launches "Site tools" (imperative WebMCP) in the built-in browser of ChatGPT Desktop, Codex, and Work | https://learn.chatgpt.com/docs/webmcp |
| 2026-08 / 2026-10 | Shopify exposes WebMCP tools on all Liquid stores and in Hydrogen 2026-10 | https://shopify.dev/docs/api/web-mcp |
| 2026-11-12 | Brave Leo support becomes the default (ships in Brave 1.102.2, planned for 2027-01-05) | https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md |
| 2026-11-23 | AI SDK publishes `Experimental_WebMCPTransport`, `createMCPTools`, and a Next.js example | vercel/ai PRs #25184–#25186 |
| 2026-11-25 | AI SDK fixes tool routing for Chrome 160 changes (PR #25507) | vercel/ai |

The window is weeks to a few months. The Next.js and AI SDK teams are working on WebMCP now. See [roadmap.md](roadmap.md#risks).

## Project goal

- **Primary:** an open-source library for Next.js apps that is maintained, tested, and aligned with the current WebMCP spec. Next.js may ship native WebMCP support. The public API stays small so it can be upstreamed or replaced.
- **Secondary:** real adoption in SaaS apps and internal tools built with Next.js. Shopify (commerce) and no-code platforms do not cover these.

Concrete targets for the 30 days after launch:

- at least 3 third-party apps using it (issues, showcases);
- a benchmark published with raw logs (see [testing.md](testing.md#demo-and-benchmark)). The harness exists. No results are published yet.

## Non-goals

- **It is not an agent or a browser.** We do not run models in the user's browser, except in the optional AI SDK chat example.
- **We do not expose anything by default.** Nothing becomes a tool without explicit opt-in (see [ADR-003](decisions.md#adr-003-strictly-opt-in-exposure)).
- **We do not create a new endpoint.** The tools call the server action through Next.js's native mechanism (see [ADR-004](decisions.md#adr-004-execute-through-the-native-server-function-rpc)).
- **We do not compete in e-commerce.** Shopify already registers native WebMCP tools in its stores (see [research.md](research.md#shopify)).
- **We do not replace UI SDK.** UI SDK exposes components (`snapshot`/`act`/`query`). We expose domain actions. The two are complementary.
- **v0.1 has no backend MCP server, no declarative forms, and no adapters for other frameworks.** All of that is phase 2.
- **We do not solve authorization.** The action stays responsible for its own auth and IDOR checks, as Next.js already requires.

## Product spec

> Every public identifier, error message, and UI string is in **English** ([ADR-007](decisions.md#adr-007-all-documentation-in-english)). The examples in this section already follow that rule.

### Scope

#### v0.1 (MVP, weeks S1–S5)

1. **`agent()`**: wrapper that defines a Server Function as a tool, with Standard Schema validation on the server.
2. **`defineAgentTools()`**: explicit registry that exposes **existing** actions without changing them. Includes FormData adapters for `(previousState, formData)` and `(formData)` actions, and one for next-safe-action.
3. **JSDoc `@agent`** (experimental, opt-in): marks an exported Server Function with typed parameters. The schema is inferred from the TypeScript types, with no runtime validation (see [Path C](#path-c-jsdoc-agent-experimental-zero-dependencies-no-runtime-validation)).
4. **`<AgentTools />`** (Server Component): registers the tools in `document.modelContext`. Its scope depends on where it is placed.
5. **Typed `navigate` tool**, generated from `app/` (opt-in).
6. **Human confirmation** for consequential tools: an in-page dialog by default, replaceable ([ADR-012](decisions.md#adr-012-confirmation-for-consequential-tools-by-default)).
7. **CLI**: `generate` (with `--watch`), `inspect`, and `doctor`.
8. **`withAgentTools()`** for `next.config.ts`: codegen in dev and build, plus the registry alias.
9. **`<AgentToolsDevtools />`**: development panel to view and run tools.
10. **In-app chat example** with AI SDK (`Experimental_WebMCPTransport`).
11. **Optional polyfill** (`@w3c/webmcp-polyfill`) and a helper for the origin trial token.

#### Phase 2 (after launch, depending on traction)

- **Declarative forms:** inject `toolname`, `tooldescription`, and `toolparamdescription` into `<form action={…}>`.
- **Backend MCP route** generated from the same definitions, for headless agents with their own auth.
- **Adapters** for React Router (RSC) and TanStack Start. **Unverified**: check their server function APIs.
- **Optional UI SDK integration** (suggest `act` as a fallback, or group tools).
- **Continuations** once the spec and browsers implement them.
- **Resources/GET:** read-only route handlers exposed as `readOnly` tools, so they do not queue behind actions.

#### Out of scope

- Pages Router.
- Exposing inline actions (defined inside a Server Component) in v0.1.
- Running models in the browser.
- Managing auth or business permissions.
- Next.js 15.x. v0.1 supports Next.js 16.x only ([ADR-013](decisions.md#adr-013-supported-nextjs-versions)).

### Developer experience

#### Path A: `agent()` (recommended, validated)

```ts
// app/todos/actions.ts
'use server'
import { agent } from 'actionmcp/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

export const addTodo = agent(
  {
    description: 'Add an item to the signed-in user’s todo list. Returns the created item.',
    input: z.object({ text: z.string().min(1).max(200).describe('Todo text') }),
  },
  async ({ text }) => {
    const user = await requireUser()          // auth is still the action's responsibility
    const todo = await db.todo.create({ data: { text, userId: user.id } })
    revalidatePath('/todos')
    return { id: todo.id, text: todo.text }   // return only what is needed
  },
)

export const listTodos = agent(
  { description: 'List the signed-in user’s todos', readOnly: true },
  async () => { /* … */ },
)
```

```tsx
// app/todos/layout.tsx  → these tools exist only while the user is on /todos/**
import { AgentTools } from 'actionmcp'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<AgentTools /></>
}
```

#### Path B: `defineAgentTools()` (existing actions, unchanged)

```ts
// agent-tools.ts (project root, server-only)
import 'server-only'
import { defineAgentTools, tool, fromFormDataAction, fromSafeAction } from 'actionmcp/server'
import { inviteTeamMember, deleteAccount } from '@/app/(login)/actions'
import { inviteTeamMemberSchema, deleteAccountSchema } from '@/lib/schemas'  // schema moved to an exportable module
import { loginUser } from '@/app/actions/auth'                                  // next-safe-action action

export default defineAgentTools({
  inviteTeamMember: tool(fromFormDataAction(inviteTeamMember), {
    description: 'Invite a person to the current team by email with a role',
    input: inviteTeamMemberSchema,
  }),
  deleteAccount: tool(fromFormDataAction(deleteAccount), {
    description: 'Permanently delete the signed-in user’s account. Irreversible.',
    input: deleteAccountSchema,
    consequential: true,
  }),
  loginUser: tool(fromSafeAction(loginUser), { description: 'Sign in', input: loginSchema }),
})
```

**A `'use server'` file can export only async functions.** Its local schemas cannot be imported from other modules, so Path B requires moving each schema to a regular module. `doctor` detects this and suggests the change.

#### Path C: JSDoc `@agent` (experimental, zero dependencies, no runtime validation)

Path C is experimental and opt-in in v0.1. Enable it with `withAgentTools({ jsdoc: true })`.

```ts
'use server'

/**
 * Rename the current project.
 * @agent consequential
 */
export async function renameProject(input: { projectId: string; name: string }) { /* validate by hand */ }
```

- The schema is inferred from the types during `generate` (`ts-json-schema-generator` with TypeScript 6 pinned).
- **No runtime validation.** `doctor` emits warning `AT102` when the action does not validate its input. It uses a heuristic: the body does not call `parse`, `safeParse`, `parseAsync`, `safeParseAsync`, `validate`, or `assert*`.
- Modifiers on the tag line:
  - `@agent`
  - `@agent readonly`
  - `@agent consequential`
  - `@agent untrusted-output`
  - `@agent name=project.rename`
  - `@agent formdata` (the function takes `(previousState, formData)` or `(formData)`)
- An unknown modifier is an error (`AT006`).

### Public API (v0.1)

The declarations below are abridged. The [API reference](api-reference.md) describes each export.

#### `actionmcp/server`

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec'

export interface ToolBehaviorOptions {
  /** Tool name. Default: the export name or the registry key. Must match /^[A-Za-z0-9_.-]{1,128}$/. */
  name?: string
  /** Human-readable label for browser UIs. */
  title?: string
  /** Required. What it does, side effects, what it returns. */
  description: string
  /** Maps to readOnlyHint. Default false. */
  readOnly?: boolean
  /** Maps to consequentialHint. Default: !readOnly. */
  consequential?: boolean
  /** Maps to untrustedContentHint: output contains user-generated or third-party content. Default false. */
  untrustedOutput?: boolean
  /** Human confirmation in the page before executing. Default: 'consequential'.
   *  'never' is for teams that rely on the agent's own UI. It triggers AT103 on consequential tools. */
  confirm?: 'always' | 'consequential' | 'never'
}

export interface AgentToolOptions extends ToolBehaviorOptions {
  /** Validated on the server before the handler runs. Omit for no-input tools. */
  input?: StandardSchemaV1
  /** Validated on the server after the handler runs, and sent as outputSchema. */
  output?: StandardSchemaV1
}

/** Returns an async Server Function (valid export of a 'use server' file) with attached metadata.
 *  The handler receives the validated input. A tool without `input` takes no arguments. */
export function agent<Input extends StandardSchemaV1, Data>(
  options: ToolBehaviorOptions & { input: Input },
  handler: (input: StandardSchemaV1.InferOutput<Input>) => Promise<Data>,
): (input: StandardSchemaV1.InferInput<Input>) => Promise<AgentResult<Data>>
export function agent<Data>(options: ToolBehaviorOptions, handler: () => Promise<Data>): () => Promise<AgentResult<Data>>

export type AgentResult<Data> =
  | { ok: true; data: Data }
  | { ok: false; error: { code: AgentErrorCode; message: string; issues?: SchemaIssue[] } }

/** The library uses the first five codes. A handler can add its own with AgentToolError. */
export type AgentErrorCode = 'invalid_input' | 'unauthorized' | 'failed' | 'declined' | 'blocked' | (string & {})

export interface SchemaIssue { message: string; path: Array<string | number> }

export function tool(action: ServerFunction | AdaptedAction, options: AgentToolOptions): AgentToolDefinition

/** A value is a tool() definition, or an agent() tool to register under another name. */
export function defineAgentTools(tools: Record<string, AgentToolDefinition | ServerFunction>): AgentToolRegistry

/** (prevState, formData) => … → the browser builds FormData from the agent input. */
export function fromFormDataAction(action: (prev: never, formData: FormData) => Promise<unknown>): AdaptedAction
/** (formData) => … → the same, for a form action with one parameter. */
export function fromFormAction(action: (formData: FormData) => Promise<unknown>): AdaptedAction
/** Unwraps { data, serverError, validationErrors } from next-safe-action. */
export function fromSafeAction(action: (input: never) => Promise<unknown>): AdaptedAction

/** Used by the generated registry. */
export function createRegistry(sources: RegistrySources): AgentToolRegistry

/** Thrown by a handler to return a controlled error to the agent. */
export class AgentToolError extends Error { constructor(code: string, message: string) }
```

`agent()` returns failures as values. A handler that throws `AgentToolError` produces `{ ok: false, error: { code, message } }`. Any other error produces `code: 'failed'` with a generic message in production. Errors that carry a `digest`, such as the one that `redirect()` throws, are rethrown.

#### `actionmcp` (components)

```ts
export interface AgentToolsProps {
  /** Registry to use instead of the generated one. For setups without withAgentTools(). */
  registry?: AgentToolRegistry
  /** Which tools from the registry to register in this subtree. Default: all. `*` is a wildcard. */
  include?: string[]
  exclude?: string[]
  /** Prefix for tool names, e.g. 'acme.'. */
  prefix?: string
  /** Register the typed navigate tool. Default: false. */
  navigate?: boolean | { routes?: string[] /* globs over route patterns */ }
  /** Passed as-is to registerTool options. */
  exposedTo?: string[]
  /** Load @w3c/webmcp-polyfill if document.modelContext is missing. Default: false. */
  polyfill?: boolean
  /** Renders <meta http-equiv="origin-trial">. Default: process.env.NEXT_PUBLIC_WEBMCP_OT_TOKEN. */
  originTrialToken?: string
}
export function AgentTools(props: AgentToolsProps): ReactNode   // Server Component

/** Client-side provider for hooks (functions can't cross from RSC to the client). */
export function AgentToolsProvider(props: {
  children: ReactNode
  onBeforeExecute?: (call: ToolCall) => boolean | Promise<boolean>
  onAfterExecute?: (call: ToolCall, result: unknown) => void
  confirmComponent?: ComponentType<ConfirmProps>
}): ReactNode

export function AgentToolsDevtools(): ReactNode            // renders only in development

export interface ToolCall { name: string; input: unknown; annotations: ToolAnnotations; source: 'agent' }
export interface ConfirmProps { call: ToolCall; title?: string; description: string; onConfirm: () => void; onCancel: () => void }
```

`actionmcp/client` exports `AgentToolsProvider`, `AgentToolsDevtools`, `ConfirmDialog`, and their types. Import from it inside a `'use client'` file, because the root entry also exports the Server Component.

#### `actionmcp/config`

```ts
// next.config.ts
import { withAgentTools } from 'actionmcp/config'
export default withAgentTools({ /* AgentToolsConfig */ })(nextConfig)

export interface AgentToolsConfig {
  /** Explicit registry (Path B). Default: './agent-tools.ts' if it exists. */
  registry?: string
  /** Scan globs for agent() and @agent. Default: ['app/**', 'lib/**', 'src/**']. */
  scan?: string[]
  /** Output folder. Default: '.agent-tools'. */
  outDir?: string
  /** Enable the experimental @agent JSDoc path (Path C; requires the TS checker). Default: false. */
  jsdoc?: boolean
  /** Names of the functions that authenticate the caller, for AT105.
   *  Default: auth, getSession, getServerSession, verifySession, requireUser, requireAuth,
   *  requireSession, getUser, getCurrentUser, currentUser. */
  auth?: string[]
}
```

#### CLI

| Command | What it does | Output |
|---|---|---|
| `actionmcp generate [--watch]` | Scans, validates, and writes `.agent-tools/registry.ts` and `.agent-tools/manifest.json`. | Exit 1 on `AT0xx` errors |
| `actionmcp inspect [--json] [tool]` | Lists the tools, their annotations, schema source, source (file:line), and diagnostics. With a tool name, it prints the details and the inferred or declared input schema. | Table or JSON |
| `actionmcp doctor [--json]` | Runs the project diagnostics and checks the Next.js, React, and validator versions and the origin trial token. | List of `ATxxx` codes with their fix. Exit 1 on errors |

The CLI reads the `withAgentTools()` options from `next.config`. The flags `--registry`, `--scan` (repeatable), `--out-dir`, `--jsdoc`, and `--cwd` override them.

Diagnostic codes. Every diagnostic has a file, a line, a column, and a suggested fix:

| Code | Level | Meaning |
|---|---|---|
| `AT001` | error | Invalid tool name (spec: 1–128 characters, `[A-Za-z0-9_.-]`), or a name that is not a string literal |
| `AT002` | error | Duplicate or reserved name (`snapshot`, `act`, `query`, `pause_hmr`, `resume_hmr`, `nextjs_inspect`, `nextjs_compile_route`, `navigate`) |
| `AT003` | error | Empty description |
| `AT004` | error | `agent()` or `@agent` on a function that is not exported, or in a file without `'use server'` |
| `AT005` | error | `description` is not a literal (it could come from untrusted data), or the options are not an object literal |
| `AT006` | error | Unknown `@agent` modifier |
| `AT007` | error | The registry file is not a `defineAgentTools({ ... })` call with an object literal of `tool(...)` calls |
| `AT101` | warn | Schema cannot be converted to JSON Schema (registered without `inputSchema`). For Standard Schema validators the check runs when the app renders, and the warning is logged in development. |
| `AT102` | warn | JSDoc tool without detectable runtime validation |
| `AT103` | warn | Consequential tool with `confirm: 'never'` |
| `AT104` | warn | More than 32 tools (the AI SDK example limit; agent-browser truncates at 16) |
| `AT105` | warn | Action without a detectable call to a configured auth function. Checked for `agent()` and `@agent` tools. |
| `AT106` | warn | `output` schema with free-form strings and no `untrustedOutput` (heuristic) |
| `AT107` | warn | Input schema with personal fields (`email`, `phone`, `address`, `birthdate`, `birthday`, `dob`, `ssn`, `passport`) that the handler does not use |
| `AT108` | warn | Description shorter than 20 characters |
| `AT201` | error | Next.js is missing or is not 16.x (`doctor`) |
| `AT202` | error | React is missing or older than 19.2 (`doctor`) |
| `AT203` | warn | A validator without Standard JSON Schema support is installed (`doctor`) |
| `AT204` | warn | The origin trial token is not set (`doctor`) |
| `AT205` | warn | An adapted action is registered without an `input` schema |

### Alternatives considered

| Alternative | Why not (for now) |
|---|---|
| **Expose every `'use server'` export by default** (like webmcp-next) | Huge attack surface and opaque intent. It would violate opt-in ([ADR-003](decisions.md#adr-003-strictly-opt-in-exposure)). |
| **`POST /api/agent-tools` dispatcher endpoint** | Duplicates the endpoint, bypasses the Server Actions security model, and creates a generic RPC ([ADR-004](decisions.md#adr-004-execute-through-the-native-server-function-rpc)). |
| **SWC/Babel plugin** | Turbopack has no webpack plugins. Babel deoptimizes the build. Loaders work file by file with no global view ([ADR-001](decisions.md#adr-001-codegen-instead-of-a-compiler-plugin)). |
| **Statically parse Zod** | Fragile and incomplete. Standard JSON Schema resolves it at runtime for any validator ([ADR-002](decisions.md#adr-002-standard-schema-first-typescript-types-as-fallback)). |
| **`useAgentTool()` hook per tool** (like `use-webmcp-tool`) | Already exists (Chrome). Our value is the bridge to the server and automatic generation. Planned for v0.2: export one as an escape hatch. |
| **`AbortSignal` from `usePathname()` in the root layout** | Scoping by composition (where `<AgentTools />` is mounted) is simpler, explicit, and compatible with nested layouts ([ADR-005](decisions.md#adr-005-rsc-registry-and-route-scoping-by-composition)). |
