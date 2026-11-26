# actionmcp

WebMCP tools from your Server Actions.

actionmcp turns the Server Functions and routes that you opt in, in a Next.js App Router app, into typed WebMCP tools. Browser agents discover the tools on `document.modelContext` and call them with the user's session.

The documentation is in the repository: https://github.com/galfrevn/actionmcp#readme

## Install

```bash
npm install actionmcp
```

actionmcp requires Next.js 16.x and React 19.2 or later.

## Usage

```ts
// next.config.ts
import { withAgentTools } from 'actionmcp/config'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default withAgentTools()(nextConfig)
```

```ts
// app/todos/actions.ts
'use server'
import { agent } from 'actionmcp/server'
import { z } from 'zod'

export const addTodo = agent(
  {
    description: 'Add an item to the signed-in user’s todo list. Returns the created item.',
    input: z.object({ text: z.string().min(1).max(200) }),
  },
  async ({ text }) => {
    const user = await requireUser()
    return db.todo.create({ data: { text, userId: user.id } })
  },
)
```

```tsx
// app/todos/layout.tsx
import { AgentTools } from 'actionmcp'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AgentTools />
    </>
  )
}
```

## Security defaults

- Nothing becomes a tool without `agent()`, `tool()`, or `@agent`.
- A tool is consequential unless it is marked `readOnly`.
- An in-page dialog asks a human before a consequential tool runs.
- Tools run through the native Server Function RPC. actionmcp adds no endpoint.

The threat model is in [security.md](https://github.com/galfrevn/actionmcp/blob/main/documentation/security.md).

## License

MIT
