# FAQ

## Why don't you expose every Server Action?

Because exposure is a security decision, and a default cannot make it for you. A named, described tool that an agent can call with the user's session has more reach than an unlisted endpoint, especially when the agent reads untrusted content. actionmcp exposes a function only when you wrap it in `agent()`, list it with `tool()`, or tag it with `@agent`. There is no flag that exposes everything ([ADR-003](decisions.md#adr-003-strictly-opt-in-exposure)).

## Does it work in Safari or Firefox?

Not with a native agent. Safari and Firefox have standards positions on WebMCP and no implementation, as of 2026-11-26. The [README](../README.md#where-webmcp-runs-today) lists the browsers and agents that support it.

The `polyfill` option adds `document.modelContext` in any browser. That is enough for an in-app chat, the devtools panel, and tests. A native browser agent does not see tools that the polyfill registers.

## Does a tool call go through a new endpoint?

No. The browser calls the Server Function reference, which is the POST that your UI already sends. Next.js applies the same action ID encryption and the same `Origin` check. `e2e/specs/hostile.spec.ts` checks that one tool call produces one request to the page URL with a `next-action` header.

## What does the agent receive when something fails?

A result, not an exception:

```json
{ "ok": false, "error": { "code": "invalid_input", "message": "Invalid input.", "issues": [{ "message": "Too small", "path": ["text"] }] } }
```

Browsers replace a rejected tool call with a fixed "Tool execution failed." message, so actionmcp returns failures as values ([ADR-015](decisions.md#adr-015-tool-failures-are-results-not-rejections)). The codes that the library uses are `invalid_input`, `unauthorized`, `failed`, `declined`, and `blocked`. A handler can return its own code with `throw new AgentToolError('not_found', 'There is no todo with that id.')`.

## Why does a dialog appear before a tool runs?

A tool that is not read-only is consequential by default, and the page asks a human before it runs. Some agents also ask, so a user can see two confirmations. No agent guarantees its own confirmation today, which is why the page asks ([ADR-012](decisions.md#adr-012-confirmation-for-consequential-tools-by-default)).

To skip the dialog for one tool, set `readOnly: true` if the tool only reads, or `confirm: 'never'` if you accept the risk. `doctor` reports `AT103` for the second case.

## Can I use my own confirmation UI?

Yes. Pass a component to `AgentToolsProvider`:

```tsx
'use client'

import { AgentToolsProvider, type ConfirmProps } from 'actionmcp/client'
import type { ReactNode } from 'react'

function Confirm({ call, description, onConfirm, onCancel }: ConfirmProps) {
  return (
    <div role="alertdialog" aria-label={`Allow ${call.name}?`}>
      <p>{description}</p>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" onClick={onConfirm}>
        Allow
      </button>
    </div>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  return <AgentToolsProvider confirmComponent={Confirm}>{children}</AgentToolsProvider>
}
```

## Which validators work?

Any validator that implements Standard JSON Schema: Zod 4.2 or later, ArkType 2.1.28 or later, and Valibot 1.2 or later through `toStandardJsonSchema()` from `@valibot/to-json-schema`. Zod 3 does not implement it.

If a schema validates but cannot produce JSON Schema, the tool is registered without `inputSchema` and actionmcp logs `AT101` in development.

## Why must my schema live outside the `'use server'` file?

Only for path B. A `'use server'` file can export only async functions, so `agent-tools.ts` cannot import a schema from it. Move the schema to a regular module and import it from both places. With `agent()` the schema stays next to the action.

## My action calls `redirect()`. What does the agent get?

`{ ok: true, data: { navigatedTo: '/the/target' } }`, and the page navigates. The tools of the new page replace the tools of the old one where their layouts differ.

## Do tools run in parallel?

No. Next.js dispatches Server Actions one at a time per client, so a tool call queues behind other actions, including the ones your UI starts. An action in flight cannot be cancelled. Planned for phase 2: read-only tools through GET route handlers.

## How do I avoid name clashes with other tools on the page?

Use `prefix`: `<AgentTools prefix="acme." />`. actionmcp reserves `snapshot`, `act`, `query`, `pause_hmr`, `resume_hmr`, `nextjs_inspect`, `nextjs_compile_route`, and `navigate`. If another library has already registered a name, the tool is registered with a `_2` suffix and a warning is logged in development.

## How many tools should one page register?

Keep it under 32. The AI SDK example rejects more than 32 definitions, and agent-browser truncates long catalogs. `generate` reports `AT104` above that number. Scope tools to the routes that need them with `include` in segment layouts.

## Can I use it without `withAgentTools()`?

Yes. Run `actionmcp generate` in a script, import the registry, and pass it as a prop:

```tsx
import { AgentTools } from 'actionmcp'
import registry from '@/.agent-tools/registry'

export function Tools() {
  return <AgentTools registry={registry} />
}
```

## Is the API stable?

No. WebMCP is a Community Group draft that changes often, and actionmcp is at 0.x. Expect breaking changes in minor versions until 1.0.

## Does it work with the Pages Router, or with Next.js 15?

No. v0.1 supports the App Router on Next.js 16.x ([ADR-013](decisions.md#adr-013-supported-nextjs-versions)).
