# Getting started

This guide adds actionmcp to an existing Next.js App Router app and exposes one Server Function as a WebMCP tool.

The [examples](../examples) show the result of each step.

## Requirements

- Next.js 16.x and React 19.2 or later.
- A validator that implements Standard JSON Schema: Zod 4.2 or later, ArkType 2.1.28 or later, or Valibot 1.2 or later with `@valibot/to-json-schema`.
- Node.js 22.18 or later.
- For the experimental `@agent` tag only: `ts-json-schema-generator` as a development dependency.

## 1. Install

```bash
npm install actionmcp
```

## 2. Wrap the Next.js config

`withAgentTools()` scans the project, writes the tool registry to `.agent-tools/`, and points `<AgentTools />` at it. It runs once during `next build` and watches for changes during `next dev`.

`next.config.ts`:

```ts
import { withAgentTools } from 'actionmcp/config'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default withAgentTools()(nextConfig)
```

Add the output folder to `.gitignore`:

```gitignore
.agent-tools/
```

## 3. Mark a Server Function as a tool

Nothing is exposed until you opt in. Wrap the function in `agent()`, in a file that starts with `'use server'`.

`app/todos/actions.ts`:

```ts
'use server'

import { agent } from 'actionmcp/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/session'
import { db } from '@/lib/db'

export const addTodo = agent(
  {
    description: 'Add an item to the todo list of the signed-in user. Returns the created item.',
    input: z.object({ text: z.string().min(1).max(200).describe('Todo text') }),
  },
  async ({ text }) => {
    const user = await requireUser()
    const todo = await db.todo.create({ data: { text, userId: user.id } })
    revalidatePath('/todos')
    return { id: todo.id, text: todo.text }
  },
)

export const listTodos = agent(
  { description: 'List the todos of the signed-in user. Returns every item.', readOnly: true },
  async () => {
    const user = await requireUser()
    return db.todo.findMany({ where: { userId: user.id } })
  },
)
```

What `agent()` does:

- It validates the input on the server with the schema before the handler runs.
- It returns `{ ok: true, data }` or `{ ok: false, error }`. It does not throw for validation or handler errors.
- It marks the tool as consequential unless you set `readOnly: true`.

The analyzer looks for `agent()` in `app/`, `lib/`, and `src/`. For a file in another folder, add a glob to the `scan` option of `withAgentTools()`.

The description must be a string literal. The build stops with `AT005` if it is not, because tool metadata must come from source code and never from data.

Your UI can call the same function: `await addTodo({ text })`.

## 4. Register the tools in a layout

`<AgentTools />` is a Server Component. The tools exist while the layout that renders it is mounted.

`app/layout.tsx`:

```tsx
import { AgentTools } from 'actionmcp'
import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AgentTools />
      </body>
    </html>
  )
}
```

To scope tools to one part of the app, render `<AgentTools include={['todos.*']} />` in that segment's layout instead. `include` and `exclude` take tool names, with `*` as a wildcard.

## 5. Check the result

```bash
npx actionmcp inspect
```

```text
NAME       KIND   ANNOTATIONS    CONFIRM        SCHEMA           SOURCE                   DIAGNOSTICS
addTodo    agent  consequential  consequential  standard-schema  app/todos/actions.ts:9   -
listTodos  agent  read-only      consequential  none             app/todos/actions.ts:22  -
2 tools, 1 route, 0 errors, 0 warnings
```

`npx actionmcp doctor` also checks the installed versions and reports each problem with a fix.

## 6. Try it in a browser

Add the devtools panel during development. It lists the registered tools, runs them with JSON input, and shows whether WebMCP is native or comes from the polyfill.

In `app/layout.tsx`, import `AgentToolsDevtools` from `actionmcp` and render both components inside `<body>`:

```tsx
<AgentTools polyfill />
<AgentToolsDevtools />
```

`polyfill` loads `@w3c/webmcp-polyfill` when the browser has no `document.modelContext`. **Native browser agents do not see tools that the polyfill registers.** The polyfill is for the devtools panel, tests, and an in-app chat. For a native agent, use a browser from the [implementation status page](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md) of the WebMCP draft.

When an agent calls `addTodo`, the page shows a dialog with the tool name, the description, and the input. The action runs after you select "Allow". `listTodos` runs without a dialog, because it is read-only.

## Expose existing actions without changing them

If your actions already use `useActionState` or next-safe-action, list them in `agent-tools.ts` instead of wrapping them.

`agent-tools.ts` (project root):

```ts
import 'server-only'
import { defineAgentTools, fromFormDataAction, fromSafeAction, tool } from 'actionmcp/server'
import { inviteMember } from './app/team/actions'
import { updateProfile } from './app/profile/actions'
import { inviteMemberSchema, updateProfileSchema } from './lib/schemas'

export default defineAgentTools({
  'team.inviteMember': tool(fromFormDataAction(inviteMember), {
    description: 'Invite a person to the current team by email with a role. Returns a confirmation message.',
    input: inviteMemberSchema,
  }),
  'profile.update': tool(fromSafeAction(updateProfile), {
    description: 'Update the public profile of the signed-in user. Returns the saved profile.',
    input: updateProfileSchema,
  }),
})
```

A `'use server'` file can export only async functions, so the schemas must live in a regular module such as `lib/schemas.ts`. The action and the registry then import the same schema.

| Adapter | Action signature |
|---|---|
| `fromFormDataAction` | `(previousState, formData) => Promise<State>` |
| `fromFormAction` | `(formData) => Promise<void>` |
| `fromSafeAction` | a next-safe-action action |
| none | `(input) => Promise<Result>` |

A listed action validates its own input, as it already does for your UI. The `input` schema describes the tool to the agent.

## Add the navigation tool

```tsx
<AgentTools navigate />
```

The `navigate` tool lets an agent open a page of the app. By default it lists the routes without dynamic segments and the dynamic routes whose page exports `generateStaticParams`. Pass `navigate={{ routes: ['/projects/*'] }}` to choose the routes yourself.

## Next steps

- [Security](security.md): what actionmcp protects and what stays your responsibility.
- [API reference](api-reference.md): every export and option.
- [FAQ](faq.md).
- The [examples](../examples): one app per way to define tools, and an in-app chat with the AI SDK.
