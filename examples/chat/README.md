# Chat example

An in-app assistant that uses the page's own WebMCP tools through the AI SDK. The tools are the same `agent()` Server Functions that the todo list uses, and the same ones a browser agent sees.

## How it works

1. `<AgentTools />` registers the tools on `document.modelContext`.
2. `app/use-page-tools-chat.ts` connects an MCP client to the page with `Experimental_WebMCPTransport`. Before each request it lists the tools and sends their definitions to the server.
3. `app/api/chat/route.ts` turns the definitions into tools without `execute` with `createMCPTools()` and calls `streamText()`.
4. When the model calls a tool, `onToolCall` runs it in the browser with `callTool()`. A consequential tool shows the confirmation dialog first. The result goes back to the model with `addToolOutput()`.

The route rejects a request with more than 32 tool definitions, with invalid definitions, or with message parts other than text and tool results.

## Run

The assistant needs a model. The example uses OpenRouter or the Vercel AI Gateway.

```bash
cp examples/chat/.env.example examples/chat/.env.local
```

Set `OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY` in `examples/chat/.env.local`. If both are set, OpenRouter is used. `AI_MODEL` is optional and takes any model identifier that the provider serves.

```bash
pnpm install
pnpm --filter actionmcp build
pnpm --filter example-chat dev
```

Open http://localhost:3000, select "Sign in as demo", and ask the assistant to add a todo.

## The polyfill

`instrumentation-client.ts` imports `@w3c/webmcp-polyfill/auto`, so `document.modelContext` exists before the chat connects. The chat works in any browser this way. Native browser agents do not see tools that the polyfill registers.

## Before you deploy a chat like this

- The route forwards tool definitions that the browser sends. Keep the session check, and add rate limiting, because each request spends model tokens.
- A tool result can contain user-generated text. The tools in this example set `untrustedOutput`, and the instructions tell the model to treat todo text as data.

## Files

- `app/use-page-tools-chat.ts`: the WebMCP transport, `useChat`, and the tool call loop.
- `app/chat.tsx`: the chat UI.
- `app/api/chat/route.ts`: the model call.
- `lib/model.ts`: the choice between OpenRouter and the AI Gateway.
- `app/actions.ts`: the tools.
