<p align="center">
  <img src="https://raw.githubusercontent.com/galfrevn/actionmcp/main/.github/assets/banner.gif" alt="actionmcp. A Server Action wrapped in agent(), the actionmcp inspect output for it, and an agent calling it in the browser after a person allows it." width="100%" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/actionmcp"><img src="https://shieldcn.dev/npm/actionmcp.svg?logo=npm&variant=secondary&mode=dark&font=geist" alt="npm version" /></a>
  <a href="https://github.com/galfrevn/actionmcp/actions/workflows/ci.yml"><img src="https://shieldcn.dev/github/ci/galfrevn/actionmcp.svg?workflow=ci.yml&branch=main&variant=secondary&mode=dark&font=geist" alt="CI status" /></a>
  <a href="https://www.npmjs.com/package/actionmcp#provenance"><img src="https://shieldcn.dev/badge/npm-provenance.svg?logo=lu:ShieldCheck&variant=secondary&mode=dark&font=geist" alt="npm provenance" /></a>
  <a href="https://www.npmjs.com/package/actionmcp"><img src="https://shieldcn.dev/badge/types-TypeScript.svg?logo=typescript&variant=secondary&mode=dark&font=geist" alt="TypeScript types" /></a>
  <a href="https://github.com/galfrevn/actionmcp/blob/main/LICENSE"><img src="https://shieldcn.dev/npm/license/actionmcp.svg?logo=lu:Scale&variant=secondary&mode=dark&font=geist" alt="MIT license" /></a>
  <br />
  <a href="https://github.com/galfrevn/actionmcp#requirements"><img src="https://shieldcn.dev/badge/dynamic/json.svg?url=https%3A%2F%2Fregistry.npmjs.org%2Factionmcp%2Flatest&query=peerDependencies.next&label=Next.js&logo=nextdotjs&variant=secondary&mode=dark&font=geist" alt="Next.js peer version" /></a>
  <a href="https://github.com/galfrevn/actionmcp#requirements"><img src="https://shieldcn.dev/badge/dynamic/json.svg?url=https%3A%2F%2Fregistry.npmjs.org%2Factionmcp%2Flatest&query=peerDependencies.react&label=React&logo=react&variant=secondary&mode=dark&font=geist" alt="React peer version" /></a>
  <a href="https://github.com/galfrevn/actionmcp#requirements"><img src="https://shieldcn.dev/npm/node/actionmcp.svg?logo=nodedotjs&label=Node.js&variant=secondary&mode=dark&font=geist" alt="Node.js version" /></a>
  <a href="https://webmachinelearning.github.io/webmcp/"><img src="https://shieldcn.dev/badge/WebMCP-draft.svg?logo=lu:Bot&variant=secondary&mode=dark&font=geist" alt="WebMCP draft" /></a>
  <a href="https://standardschema.dev"><img src="https://shieldcn.dev/badge/Standard%20Schema-Zod%20%C2%B7%20Valibot%20%C2%B7%20ArkType.svg?logo=lu:Braces&variant=secondary&mode=dark&font=geist" alt="Standard Schema: Zod, Valibot, ArkType" /></a>
</p>

actionmcp turns the Server Functions and routes that you opt in, in a Next.js App Router app, into typed WebMCP tools. Browser agents discover the tools on `document.modelContext` and call them with the user's session.

The documentation is in the repository: https://github.com/galfrevn/actionmcp#readme

## Install

```bash
npm install actionmcp
```

actionmcp requires Next.js 16.x and React 19.2 or later. The experimental `@agent` tag also needs `ts-json-schema-generator` as a development dependency.

## Usage

`next.config.ts`:

```ts
import { withAgentTools } from 'actionmcp/config'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default withAgentTools()(nextConfig)
```

`app/todos/actions.ts`:

```ts
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

`app/todos/layout.tsx`:

```tsx
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

The checklist for each tool and the threat model are in [security.md](https://github.com/galfrevn/actionmcp/blob/main/documentation/security.md).

## License

MIT
