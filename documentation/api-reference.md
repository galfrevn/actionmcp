# API reference

This page describes the exports of actionmcp. The API can change in any 0.x release.

| Entry point | Use it in | Exports |
|---|---|---|
| `actionmcp/server` | `'use server'` files and `agent-tools.ts` | `agent`, `tool`, `defineAgentTools`, `createRegistry`, `fromFormDataAction`, `fromFormAction`, `fromSafeAction`, `AgentToolError` |
| `actionmcp` | Server Components | `AgentTools`, and the client exports below |
| `actionmcp/client` | `'use client'` files | `AgentToolsProvider`, `AgentToolsDevtools`, `ConfirmDialog` |
| `actionmcp/config` | `next.config.ts` | `withAgentTools` |
| `actionmcp` (binary) | the terminal | `generate`, `inspect`, `doctor` |

## `actionmcp/server`

### `agent(options, handler)`

Defines a Server Function that is also a tool. Call it at the top level of a `'use server'` file and export the result.

```ts
export const renameProject = agent(
  {
    description: 'Rename a project of the signed-in user. Returns the updated project.',
    input: z.object({ projectId: z.string(), name: z.string().min(1).max(80) }),
    output: z.object({ id: z.string(), name: z.string() }),
  },
  async ({ projectId, name }) => {
    const user = await requireUser()
    return renameOwnedProject(user.id, projectId, name)
  },
)
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `description` | string literal | required | What the tool does, its side effects, and what it returns. |
| `input` | Standard Schema | none | Validated on the server before the handler. A tool without `input` ignores what the caller sends. |
| `output` | Standard Schema | none | Validated on the server after the handler. The validated value is returned, so a schema that strips unknown keys filters the output. |
| `name` | string literal | the export name | 1 to 128 characters from `A-Z`, `a-z`, `0-9`, `_`, `-`, and `.`. |
| `title` | string | none | Label for browser UIs and the confirmation dialog. |
| `readOnly` | boolean | `false` | Sets `readOnlyHint`. |
| `consequential` | boolean | `!readOnly` | Sets `consequentialHint`. |
| `untrustedOutput` | boolean | `false` | Sets `untrustedContentHint`. |
| `confirm` | `'always'`, `'consequential'`, `'never'` | `'consequential'` | When the page asks a human before the tool runs. |

The returned function has the signature `(input) => Promise<AgentResult<Data>>`, or `() => Promise<AgentResult<Data>>` for a tool without `input`.

### `AgentResult<Data>`

```ts
type AgentResult<Data> =
  | { ok: true; data: Data }
  | { ok: false; error: { code: string; message: string; issues?: Array<{ message: string; path: Array<string | number> }> } }
```

| Code | Source |
|---|---|
| `invalid_input` | The input did not match the schema. `issues` lists each problem. |
| `unauthorized` | By convention, thrown by your auth check with `AgentToolError`. |
| `failed` | The handler threw, or the output did not match the `output` schema. |
| `declined` | The user cancelled the confirmation. Added in the browser. |
| `blocked` | `onBeforeExecute` returned `false`. Added in the browser. |

### `AgentToolError`

```ts
throw new AgentToolError('not_found', 'There is no project with that id.')
```

Thrown inside an `agent()` handler, it becomes `{ ok: false, error: { code, message } }`. The message reaches the agent, so do not put internal details in it.

### `defineAgentTools(tools)` and `tool(action, options)`

Lists existing actions as tools. Put the call in `agent-tools.ts` at the project root, as the default export, with an object literal.

```ts
export default defineAgentTools({
  'team.inviteMember': tool(fromFormDataAction(inviteMember), {
    description: 'Invite a person to the current team by email with a role. Returns a confirmation message.',
    input: inviteMemberSchema,
  }),
})
```

- The key is the tool name, unless the options set `name`.
- `tool()` takes the same options as `agent()`. `input` and `output` describe the tool and are not enforced, because the action runs unchanged.
- A value can also be an `agent()` tool. It is then registered once, under the key.

### Adapters

| Function | Wraps | The browser calls |
|---|---|---|
| `fromFormDataAction(action)` | `(previousState, formData) => Promise<State>` | `action(undefined, formData)` |
| `fromFormAction(action)` | `(formData) => Promise<unknown>` | `action(formData)` |
| `fromSafeAction(action)` | a next-safe-action action | `action(input)`, then unwraps `data`, `serverError`, and `validationErrors` |

The `FormData` is built from the agent's input object: an array becomes repeated keys, `true` becomes `'on'`, `false`, `null`, and `undefined` are omitted, and a nested object becomes a JSON string.

A result of the form `{ error: 'message' }` becomes a `failed` result. Any other value becomes `{ ok: true, data }`.

### `createRegistry(sources)`

Builds the registry from generated code. The generated `.agent-tools/registry.ts` calls it. You do not call it yourself.

## `actionmcp`

### `<AgentTools />`

A Server Component that registers tools while it is mounted.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `include` | `string[]` | all tools | Names to register. `*` matches any characters. |
| `exclude` | `string[]` | none | Names to leave out. Applied after `include`. |
| `prefix` | `string` | none | Prepended to every name, including `navigate`. |
| `navigate` | `boolean` or `{ routes?: string[] }` | `false` | Registers the navigation tool. See below. |
| `polyfill` | `boolean` | `false` | Loads `@w3c/webmcp-polyfill` when `document.modelContext` is missing. |
| `exposedTo` | `string[]` | none | Origins passed to `registerTool`, for tools in cross-origin frames. |
| `originTrialToken` | `string` | `NEXT_PUBLIC_WEBMCP_OT_TOKEN` | Renders `<meta http-equiv="origin-trial">`. |
| `registry` | `AgentToolRegistry` | the generated registry | For setups without `withAgentTools()`. |

In development, an invalid, reserved, or duplicate name throws. In production it logs a warning and the tool is skipped.

### The `navigate` tool

Input: `{ route, params?, query? }`. `route` is one of the listed route patterns, such as `/projects/[id]`. `params` fills the dynamic segments, and a catch-all takes a path such as `guides/setup`. The tool calls `router.push()` and returns `{ ok: true, data: { url } }`. It needs no confirmation. A parameter that contains the path segment `.` or `..` returns an `invalid_input` result.

- `navigate` lists routes without dynamic segments and dynamic routes whose page exports `generateStaticParams`.
- `navigate={{ routes: ['/projects/*', '/docs/**'] }}` lists the routes whose pattern matches a glob. `*` stays inside one segment and `**` crosses segments.

Route groups, private folders, parallel route slots, intercepted routes, route handlers, and `app/api` are never listed.

### `<AgentToolsProvider />`

A Client Component that configures the tools registered below it.

| Prop | Type | Meaning |
|---|---|---|
| `onBeforeExecute` | `(call) => boolean \| Promise<boolean>` | Runs after the confirmation. `false` blocks the call. |
| `onAfterExecute` | `(call, result) => void` | Runs after the action, with the result that the agent receives. |
| `confirmComponent` | `ComponentType<ConfirmProps>` | Replaces the default dialog. Call `onConfirm` or `onCancel` exactly once. |
| `confirmLabels` | `Partial<ConfirmLabels>` | Replaces the text of the default dialog. A label that you leave out keeps its English default. |

`call` is `{ name, input, annotations, source: 'agent' }`.

### `<AgentToolsDevtools />`

A floating panel that renders only when `NODE_ENV` is `development`. It shows whether WebMCP is native, from the polyfill, or unavailable, lists every tool on the page, runs a tool with JSON input, and keeps a history of calls to actionmcp tools.

### `ConfirmDialog`

The default confirmation component, exported so that a custom one can wrap it.

The dialog shows the title, the tool description, and one row for each field of the input. The label of a row is the `title` of that property in the input schema, or the field name. With Zod, set it with `z.string().meta({ title: 'Email address' })`.

`ConfirmLabels` holds the text of the dialog:

| Label | Default |
|---|---|
| `title` | `Allow “{tool}”?`. `{tool}` is replaced with the tool title, or with the tool name. |
| `intro` | `An agent wants to run this action.` |
| `input` | `Action input`, the accessible name of the input list. |
| `allow` | `Allow` |
| `cancel` | `Cancel` |

```tsx
<AgentToolsProvider confirmLabels={{ title: '¿Permitir «{tool}»?', allow: 'Permitir', cancel: 'Cancelar' }}>
  {children}
</AgentToolsProvider>
```

The labels are plain strings, so a Server Component can pass translated text.

## `actionmcp/config`

### `withAgentTools(options)(nextConfig)`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `registry` | `string` | `./agent-tools.ts` if it exists | The explicit registry file. |
| `scan` | `string[]` | `['app/**', 'lib/**', 'src/**']` | Globs to scan for `agent()` and `@agent`. |
| `outDir` | `string` | `.agent-tools` | Where the registry and the manifest are written. |
| `jsdoc` | `boolean` | `false` | Enables the experimental `@agent` path. |
| `auth` | `string[]` | common names such as `auth` and `requireUser` | Function names that count as an auth check for `AT105`. |

`nextConfig` can be an object or a function. During `next build`, an `AT0xx` error stops the build with the file and the line.

## The `@agent` tag (experimental)

```ts
/**
 * Rename a task of the current workspace. Returns the updated task.
 * @agent consequential name=task.rename
 */
export async function renameTask(input: { taskId: string; title: string }) {
  const { taskId, title } = renameTaskSchema.parse(input)
  return renameOwnedTask(taskId, title)
}
```

Enable it with `jsdoc: true`, and install `ts-json-schema-generator` as a development dependency:

```bash
npm install --save-dev ts-json-schema-generator
```

The description is the comment text before the first tag. The input schema is inferred from the type of the first parameter. actionmcp does not validate the input at runtime, so the function validates it.

| Modifier | Effect |
|---|---|
| `readonly` | `readOnlyHint` |
| `consequential` | `consequentialHint` (already the default for a tool that is not read-only) |
| `untrusted-output` | `untrustedContentHint` |
| `name=<tool-name>` | The tool name |
| `formdata` | The function takes `(previousState, formData)` or `(formData)`. No schema is inferred. |

## CLI

```bash
npx actionmcp generate [--watch]
npx actionmcp inspect [tool] [--json]
npx actionmcp doctor [--json]
```

| Flag | Meaning |
|---|---|
| `--cwd <dir>` | Project directory. |
| `--registry <file>` | Explicit registry file. |
| `--scan <glob>` | Glob to scan. Repeatable. |
| `--out-dir <dir>` | Output folder. |
| `--jsdoc` | Enable the `@agent` path. |
| `--json` | Machine-readable output for `inspect` and `doctor`. |

Without flags, the CLI uses the options that `next.config` passes to `withAgentTools()`.

`generate` and `doctor` exit with status 1 when they find an error.

## Diagnostics

`generate`, `inspect`, and `doctor` report problems with a code, a file, a line, a column, and a suggested fix. An error stops `next build`.

| Code | Level | Meaning |
|---|---|---|
| `AT001` | error | Invalid tool name, or a name that is not a string literal |
| `AT002` | error | Duplicate or reserved name (`snapshot`, `act`, `query`, `pause_hmr`, `resume_hmr`, `nextjs_inspect`, `nextjs_compile_route`, `navigate`) |
| `AT003` | error | Empty description |
| `AT004` | error | `agent()` or `@agent` on a function that is not exported, or in a file without `'use server'` |
| `AT005` | error | `description` is not a string literal, or the options are not an object literal |
| `AT006` | error | Unknown `@agent` modifier |
| `AT007` | error | The registry file is not a `defineAgentTools({ ... })` call with an object literal of `tool(...)` calls |
| `AT101` | warn | A schema cannot be converted to JSON Schema, so the tool is registered without `inputSchema`. For Standard Schema validators the check runs when the app renders, and the warning is logged in development. |
| `AT102` | warn | `@agent` function without detectable runtime validation |
| `AT103` | warn | Consequential tool with `confirm: 'never'` |
| `AT104` | warn | More than 32 tools |
| `AT105` | warn | `agent()` or `@agent` handler without a call to a configured auth function |
| `AT106` | warn | `output` schema with free-form strings and no `untrustedOutput` |
| `AT107` | warn | Input schema with a personal field (`email`, `phone`, `address`, `birthdate`, `birthday`, `dob`, `ssn`, `passport`) that the handler does not use |
| `AT108` | warn | Description shorter than 20 characters |
| `AT109` | warn | An `agent()` call that is not the value of a top-level `const` or of the default export, so the analyzer cannot register it. List the function in `agent-tools.ts`, or wrap the handler and not the `agent()` call. |
| `AT201` | error | Next.js is missing or is not 16.x (`doctor`) |
| `AT202` | error | React is missing or older than 19.2 (`doctor`) |
| `AT203` | warn | A validator without Standard JSON Schema support is installed (`doctor`) |
| `AT204` | warn | The origin trial token is not set (`doctor`) |
| `AT205` | warn | An adapted action is registered without an `input` schema |
| `AT206` | error | `jsdoc` is enabled and a tool needs an inferred schema, but `ts-json-schema-generator` is not installed |

`AT102` and `AT105` to `AT107` are heuristics over the source code.

## Generated files

- `.agent-tools/registry.ts`: imported by `<AgentTools />` through the `actionmcp/registry` alias. Do not edit it.
- `.agent-tools/manifest.json`: the list of tools with their source, annotations, confirmation policy, and diagnostics. Commit it if you want tool changes to show up in pull requests.
- `.agent-tools/cache/types.json`: the schema cache of the `@agent` path.
