# actionmcp

WebMCP tools from your Server Actions.

actionmcp turns the Server Functions and routes that you opt in, in a Next.js App Router app, into typed [WebMCP](https://webmachinelearning.github.io/webmcp/) tools. Browser agents discover the tools on `document.modelContext` and call them with the user's session, through the same RPC that your UI uses.

> **Status:** v0.1 is implemented and tested in this repository. It is not published to npm yet. WebMCP is a Community Group draft, so expect breaking changes in 0.x releases.

## Usage

Wrap the Next.js config. This generates the tool registry during `next build` and `next dev`.

```ts
// next.config.ts
import { withAgentTools } from 'actionmcp/config'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default withAgentTools()(nextConfig)
```

Mark a Server Function as a tool, with a description and a Standard Schema input.

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
    const user = await requireUser() // your auth check stays in the action
    return db.todo.create({ data: { text, userId: user.id } })
  },
)
```

Register the tools in a layout. They exist while that layout is mounted.

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

The [getting started guide](documentation/getting-started.md) covers each step, the CLI, and the devtools panel.

## What you get

- **Three ways to opt in.** `agent()` for new or edited actions, `defineAgentTools()` for existing `useActionState` and next-safe-action actions without changing them, and an experimental `@agent` JSDoc tag.
- **Schemas from your validator.** The input schema comes from Zod, Valibot, or ArkType through Standard JSON Schema. `agent()` validates with the same schema on the server.
- **Scope by layout.** `<AgentTools include={['team.*']} />` in a segment layout registers those tools only under that segment.
- **A typed `navigate` tool**, generated from `app/`.
- **Results that an agent can act on.** A failure is a value such as `{ ok: false, error: { code: 'invalid_input', issues } }`, because browsers hide the reason of a rejected tool call.
- **A CLI.** `actionmcp inspect` lists what is exposed. `actionmcp doctor` reports problems with a fix for each.
- **A devtools panel** for development, and an [in-app chat example](examples/chat) that uses the same tools through the AI SDK.

## Security defaults

The full threat model is in [security.md](documentation/security.md). The short version is in the [security model](documentation/security-model.md).

- Opt-in only. Nothing becomes a tool without `agent()`, `tool()`, or `@agent`.
- Consequential by default. A tool is consequential unless it is marked `readOnly`.
- `confirm: 'consequential'` by default. An in-page dialog asks a human before a consequential tool runs.
- Native RPC only. Tools execute through the Server Function RPC, with no new endpoints.

Authentication, ownership checks, and rate limiting stay inside your actions. actionmcp does not add them.

## Where WebMCP runs today

Browser support changes often. Check the [implementation status page](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md) before you rely on any row. The rows below come from [research.md](documentation/research.md), section 1 and section 2.

**Verified** means the fact was checked against a primary source. **Secondary source** means a third party reported it.

| Consumer | Status | Marker | Source date |
|---|---|---|---|
| Chrome | Origin Trial from Chrome 149. Local testing with `chrome://flags/#enable-webmcp-testing`. The trial reportedly ends at Chrome 156. | Verified for the trial. Secondary source for the end version. | 2026-11-26 |
| Edge | Origin Trial in Edge 150. | Verified | 2026-11-26 |
| ChatGPT Desktop | "Site tools" in the built-in browser. Discovers tools at the top level and in iframes. | Verified | 2026-11-26 |
| Brave | Leo AI chat support in Brave 1.102.2, planned for 2027-01-05. | Verified | 2026-11-26 |
| `@w3c/webmcp-polyfill` v0.2.0 | Adds `document.modelContext` when the browser lacks it. Native browser agents do not see the polyfill's tools. | Verified | 2026-11-26 (release 2026-11-23) |

Firefox and Safari have standards positions only. This is **Verified** as of 2026-11-26 in the same source.

What this repository tests on every commit: Chromium 159 with the polyfill, and Chromium 159 with native WebMCP (`--enable-features=WebMCP`). actionmcp has not been tested in ChatGPT Desktop yet. The [manual checklist](e2e/manual/chatgpt.md) is open.

## How it works

1. A build step scans the project for `agent()` calls, the `agent-tools.ts` registry, and `@agent` tags. It writes `.agent-tools/registry.ts` and `.agent-tools/manifest.json`.
2. `<AgentTools />`, a Server Component, reads the registry, converts the schemas to JSON Schema on the server, and passes the definitions and the Server Function references to a Client Component.
3. The Client Component registers the tools on `document.modelContext` and unregisters them when its layout unmounts.
4. When an agent calls a tool, the page asks for confirmation if the tool is consequential, then calls the Server Function reference. Next.js sends the same POST as for a call from your UI and revalidates the page.

The validator, the registry, and the analyzer stay on the server. The client code for registration and confirmation is about 3 KB gzip, measured by [`bundle-size.test.ts`](packages/actionmcp/src/react/bundle-size.test.ts).

## Requirements

- Next.js 16.x with the App Router ([ADR-013](documentation/decisions.md#adr-013-supported-nextjs-versions)). CI builds the fixtures on 16.4.6 and 16.2.12.
- React 19.2 or later.
- Node.js 22.18 or later.
- A validator with Standard JSON Schema support: Zod 4.2+, ArkType 2.1.28+, or Valibot 1.2+ with `@valibot/to-json-schema`.

## Examples

| Example | Shows |
|---|---|
| [`examples/basic`](examples/basic) | A todo app with `agent()` tools |
| [`examples/formdata`](examples/formdata) | Existing `useActionState` actions with `fromFormDataAction()` |
| [`examples/safe-action`](examples/safe-action) | A next-safe-action action with `fromSafeAction()` |
| [`examples/jsdoc`](examples/jsdoc) | The experimental `@agent` tag |
| [`examples/chat`](examples/chat) | An in-app assistant with the AI SDK WebMCP transport |

```bash
pnpm install
pnpm build
pnpm --filter example-basic dev
```

## Documentation

- [Getting started](documentation/getting-started.md)
- [Security model](documentation/security-model.md)
- [API reference](documentation/api-reference.md)
- [FAQ](documentation/faq.md)

Design documents:

- [Specification](documentation/spec.md): the problem, non-goals, scope, public API, and CLI.
- [Architecture](documentation/architecture.md): modules, build flow, and runtime flow.
- [Security](documentation/security.md): threat model and non-negotiable defaults.
- [Testing](documentation/testing.md): test levels, fixtures, compatibility matrix, demo, and benchmark method.
- [Roadmap](documentation/roadmap.md): status, tasks, spike results, and risks.
- [Decisions](documentation/decisions.md): ADR-001 to ADR-017.
- [Research](documentation/research.md): WebMCP, browser, framework, and schema facts, each with a date and a marker.

## Benchmark

The [benchmark harness](bench/README.md) compares an agent that clicks through the UI with the same agent that calls the WebMCP tools. No results are published yet: a run needs a model key.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Participation is governed by the [code of conduct](CODE_OF_CONDUCT.md).

## Security

Report vulnerabilities privately. Do not open a public issue for them. See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).

actionmcp builds on the [WebMCP draft](https://webmachinelearning.github.io/webmcp/) of the Web Machine Learning Community Group, [`@w3c/webmcp-polyfill`](https://github.com/w3c-oss/webmcp-polyfill), [Standard Schema](https://standardschema.dev), the [AI SDK](https://github.com/vercel/ai), and [agent-browser](https://github.com/vercel-labs/agent-browser).
