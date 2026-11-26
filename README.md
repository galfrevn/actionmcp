# actionmcp

WebMCP tools from your Server Actions.

actionmcp will turn the opt-in Server Functions and routes of a Next.js App Router app into typed WebMCP tools that browser agents can discover and call.

> **Status:** design phase. There is no code and no npm release yet. The design is in [`documentation/`](#documentation).

## How it will work

The planned flow has four parts. You mark Server Functions as tools with `agent()`, with a description and a Standard Schema input. A build step scans the project and writes a generated registry of those tools. `<AgentTools />` in a layout registers the tools for that part of the app on `document.modelContext`. An agent call runs through the native Server Function RPC with the user's session, so actionmcp adds no endpoint.

## Planned usage

The API below is the planned v0.1 API from the [product spec](documentation/spec.md#product-spec). It may change before release.

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

The planned behavior is that the tools from this layout exist only under `/todos/**`.

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

## Security defaults

These v0.1 defaults are planned as non-negotiable. The full threat model is in [security.md](documentation/security.md).

- Opt-in only. Nothing becomes a tool without `agent()`, `tool()`, or `@agent`.
- Consequential by default. A mutation is consequential unless it is marked `readOnly`.
- `confirm: 'consequential'` by default. An in-page dialog runs before a consequential tool executes.
- Native RPC only. Tools execute through the Server Function RPC, with no new endpoints.

## Requirements

- Next.js 16.x only for v0.1. Next.js 15.5 is out of scope and will be reconsidered after v0.1 ([ADR-013](documentation/decisions.md#adr-013-supported-nextjs-versions)).
- No package is published yet, so there is no install step.

## Documentation

- [Specification](documentation/spec.md): the problem, non-goals, planned scope, public API, and CLI.
- [Architecture](documentation/architecture.md): modules, build flow, and runtime flow.
- [Security](documentation/security.md): threat model and non-negotiable defaults.
- [Testing](documentation/testing.md): test pyramid, fixtures, compatibility matrix, demo, and benchmark method.
- [Roadmap](documentation/roadmap.md): S0 spikes, tasks S1 to S6, spike results, and risks.
- [Decisions](documentation/decisions.md): ADR-001 to ADR-014.
- [Research](documentation/research.md): WebMCP, browser, framework, and schema facts, each with a date and a marker.

## Contributing

The design is open for review now. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Participation is governed by the [code of conduct](CONTRIBUTING.md#code-of-conduct).

## Security

Report vulnerabilities privately. Do not open a public issue for them. See [Reporting a vulnerability](CONTRIBUTING.md#reporting-a-vulnerability).

## License

MIT. See [LICENSE](LICENSE).
