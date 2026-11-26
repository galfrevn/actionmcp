# Basic example

A todo app that exposes four Server Functions as WebMCP tools with `agent()`.

| Tool | Annotations | Confirmation |
|---|---|---|
| `listTodos` | read-only, untrusted output | no |
| `addTodo` | consequential, untrusted output | yes |
| `toggleTodo` | consequential, untrusted output | yes |
| `removeTodo` | consequential | yes |

## Run

```bash
pnpm install
pnpm --filter actionmcp build
pnpm --filter example-basic dev
```

Open http://localhost:3000 and select "Sign in as demo". The tools return an `unauthorized` error until you sign in, because each action calls `requireUser()`.

## Try the tools

- Select "Agent tools" in the bottom right corner. The devtools panel lists the tools and runs them with JSON input. It renders only in development.
- Run `pnpm --filter example-basic inspect` to print the tools that the build registers.
- Run `pnpm --filter example-basic doctor` to check the project.

`<AgentTools polyfill />` loads `@w3c/webmcp-polyfill` when the browser has no native WebMCP. Native browser agents do not see tools that the polyfill registers. To test with a native agent, use a browser from the [implementation status page](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md) of the WebMCP draft.

## Files

- `app/actions.ts`: the four tools. The UI calls the same functions.
- `app/layout.tsx`: `<AgentTools />` registers the tools for every route.
- `next.config.ts`: `withAgentTools()` generates `.agent-tools/registry.ts` on build and in development.
- `lib/session.ts`: a demo session in a cookie. Replace it with your own auth.
