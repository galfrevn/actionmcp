# Decisions

Architecture decision records. Until the first release, update a record in place when a decision changes. After the first release, add a new record that supersedes the old one.

## ADR-001: Codegen instead of a compiler plugin

Status: Accepted
Date: 2026-11-26
Related: [ADR-005](#adr-005-rsc-registry-and-route-scoping-by-composition)

### Context

We need to know which Server Functions are marked as tools across the whole project. The registry and the schemas, computed from TypeScript types, both depend on that. Integration options with Next.js 16:

- Turbopack (the default) does not support webpack plugins or `webpack()` in `next.config`. It supports webpack loaders through `turbopack.rules`, which transform one file at a time. It also applies automatic Babel when a Babel config exists, which deoptimizes SWC. Source: https://nextjs.org/docs/app/api-reference/turbopack (read 2026-11-26).
- SWC plugins (`experimental.swcPlugins`) are WASM modules that run per file. They often break across `swc_core` versions and have no view of the whole project.

### Decision

`actionmcp` runs its own **codegen** step (`actionmcp generate`) at build time and in dev (watch mode), through `withAgentTools()` or through scripts. It writes `.agent-tools/registry.ts` and `manifest.json`. The registry is imported through an alias (`turbopack.resolveAlias`) or passed as a prop.

### Alternatives considered

- A per-file loader that injects the registry. A loader cannot see what other files contain.
- Babel. It slows the build of the whole project.
- Discovery only at runtime (`import.meta.glob`-like). Next does not provide this for Server Functions, and it does not provide the types.

### Consequences

- The output is the same with Turbopack and with webpack, and it does not depend on compiler internals.
- The generated artifact can be inspected with `inspect` and `doctor`, and the manifest can be reviewed in pull requests.
- The pattern is familiar: `next typegen`, `.next/types`, contentlayer, and velite use it.
- Trade-off: a watcher must be maintained (spike SP4 verified it), and the registry can go stale. Mitigation: `withAgentTools()` runs `generate` during `next build` and aborts on `AT0xx` errors.
- Trade-off: the alias is one more moving part (spike SP3 verified it). The escape hatch is `<AgentTools registry={…} />`.

## ADR-002: Standard Schema first, TypeScript types as fallback

Status: Accepted. Replaces the initial "Zod first" idea.
Date: 2026-11-26

### Context

- The original plan was "schema from Zod, or from TypeScript types as a fallback".
- [Standard JSON Schema](https://standardschema.dev/json-schema) defines `schema['~standard'].jsonSchema.input({ target })`. Zod v4.2+, ArkType 2.1.28+, and Valibot 1.2 (through `toStandardJsonSchema`) implement it. The MCP TypeScript SDK v2 already accepts any Standard Schema that provides JSON Schema.
- Parsing Zod statically is fragile: composition, `.extend`, refinements, and imports all make it hard.
- A `'use server'` file can export only async functions. Schemas defined locally in those files, for example in next-safe-action or in `validatedAction` from saas-starter, cannot be imported from another module.
- TypeScript 7 (native) has been `latest` since 2026-11-25, and its JS API is in preview. `ts-json-schema-generator` 2.10 requires `typescript >=5.9 <7`.

### Decision

1. Path A (`agent()`) and path B (`tool()`) take the validator as a value. The JSON Schema is obtained **at runtime, on the server (RSC)**, through Standard JSON Schema with target `draft-2020-12`. Input validation also runs on the server, through `~standard.validate`.
2. Path C (`@agent` JSDoc) infers the schema from the types during codegen. It uses `ts-json-schema-generator` on `typescript@6.0.x`, pinned as its own dependency. There is no runtime validation (warning `AT102`).
3. `actionmcp` does not parse Zod or any other validator statically.

### Consequences

- Any modern validator works without validator-specific code.
- The schema sent to the agent matches the schema that validates input on the server. There is one source of truth.
- Trade-off: Zod 3 does not implement Standard JSON Schema, so users must migrate to Zod 4.2+. This is documented, and the saas-starter demo does the migration.
- Trade-off: path C can diverge from TypeScript 7 semantics in rare cases. This is accepted because path C is the secondary path.
- Trade-off: path B requires moving schemas into an exportable module. `doctor` explains how.

## ADR-003: Strictly opt-in exposure

Status: Accepted
Date: 2026-11-26

### Context

`webmcp-next`, the closest predecessor, exposes **all** exports of `'use server'` files as tools by default. Next.js already warns that every exported Server Action can be reached by POST. Turning those actions into named, described tools for an agent that uses the user's session multiplies the impact of a mistake, especially under prompt injection (see the [security model](security.md)).

### Decision

A Server Function is a tool only if:

- it is wrapped in `agent()`,
- it is registered with `tool()` in `defineAgentTools()`,
- or it has the `@agent` JSDoc tag.

There is no "expose all" mode and no flag that enables one.

### Consequences

- The intent is explicit and reviewable in the code and in `manifest.json`.
- Trade-off: less automatic discovery than `webmcp-next` provides. This is the intended behavior, and it is the main difference from that project.

## ADR-004: Execute through the native Server Function RPC

Status: Accepted. Spike SP1 verified it on 2026-11-26.
Date: 2026-11-26

### Context

There are two ways to execute a tool that corresponds to an action:

1. A custom dispatcher endpoint. This is what `webmcp-next` does: `POST /api/mcp/manifest { name, input }` calls the function on the server. It adds a new generic RPC with its own security model, and it bypasses the `Origin` check and the encrypted Server Action IDs.
2. Call the Server Function reference from the client. This is the same mechanism the UI uses: a POST with the encrypted ID, the `Origin`/`Host` check, encrypted closures, and an RSC response that revalidates the UI on its own.

### Decision

Option 2. The `<AgentTools />` RSC passes the Server Function reference as a prop to the client `Registrar`. The WebMCP `execute` calls it, using the FormData or safe-action adapters where they apply.

### Consequences

- No new server surface. The tool has exactly the permissions of the user.
- The UI updates after an agent action with no extra code. The demo app depends on this behavior.
- Trade-off: the tool inherits the sequential dispatch of Server Actions (one at a time per client) and the inability to cancel an action in flight. This is documented. Planned for phase 2: read-only tools through GET.
- Trade-off: the tool inherits the behavior of `redirect()`. Spike SP2 showed that the result can still be returned.
- Every exposed action is now referenced by the client. This follows from opt-in, but it must be documented: dead-code elimination no longer removes it from the bundle.

## ADR-005: RSC registry and route scoping by composition

Status: Accepted. Spikes SP1 and SP3 verified it on 2026-11-26.
Date: 2026-11-26

### Context

The initial plan generated a `'use client'` module. It imported the actions and registered the tools with an `AbortSignal` tied to the route. Two problems:

- Schemas that live on the server (Standard Schema) cannot be evaluated on the client without sending the validator to the bundle.
- Tying tools to `usePathname()` duplicates logic that the App Router already resolves with layouts.

### Decision

- `<AgentTools />` is a Server Component. It:
  - imports the registry (through the alias),
  - computes the JSON Schemas on the server and caches them at module level,
  - and passes serializable definitions, plus the Server Function references, to a client `Registrar`.
- Scope follows composition. Tools exist while the `<AgentTools />` that includes them is mounted. In `app/layout.tsx` they are global. In `app/team/layout.tsx` they exist only under `/team/**`. `include` and `exclude` filter the registry at each point.
- `agent()` metadata: the function it returns carries the metadata (options and schema) in its own symbol or WeakMap. The RSC reads it when it imports the `'use server'` module on the server.
  - Verified by SP1: the Server Component receives the same function instance, with its metadata.
  - The plan B that generated `.agent-tools/meta/*.ts` files is not needed and is not implemented.

### Consequences

- The validator never reaches the client bundle. Only JSON travels.
- The scope is explicit, and it matches what developers who know the App Router expect.
- RSC performance depends on schema computation. The schemas are cached at module level because the result is deterministic.
- The metadata depends on module identity in the RSC layer. The fixtures check this on every build.

## ADR-006: Package name

Status: Accepted
Date: 2026-11-26

### Context

Three candidate names were free on npm as of 2026-11-25. The maintainer chose `actionmcp`.

Already taken on npm: `next-webmcp`, `webmcp-next`, `webmcp-gen`, `agentable`, `agent-actions`, and `next-tools`.

Criteria:

1. Users can find the package by searching "WebMCP" and by searching "server actions".
2. The name does not look like an official Vercel package. Names such as `@vercel/*`, `next/*`, and `vercel-*` are avoided.
3. The name still fits in phase 2, when other frameworks and backend MCP servers may be supported.
4. The name is available on npm, as a GitHub organization, and as a `.dev` domain.

### Decision

The package is named `actionmcp`, with the tagline "WebMCP tools from your Server Actions".

### Alternatives considered

| Name | Pros | Cons |
|---|---|---|
| `next-agent-tools` (provisional) | Descriptive. Says "Next" and "tools for agents". | Generic. Tied to Next, although the core is meant to be framework-agnostic ([ADR-008](#adr-008-framework-agnostic-core-one-package-in-v01)). The `next-` prefix can suggest an official package. |
| `actionmcp` (chosen) | Short and memorable. Expresses "actions to MCP". Not tied to Next. | Can be confused with a backend MCP server. |
| `webmcp-actions` | Precise ("WebMCP" plus "actions"). Found by searching for WebMCP. | Long. Similar to `webmcp-next` and `next-webmcp`, which already exist. |

`next-agent-tools` remains the option if search for Next.js is the priority.

### Consequences

- Before publishing, check that the domain and the GitHub organization are available.

## ADR-007: All documentation in English

Status: Accepted
Date: 2026-11-26
Revised 2026-11-26: internal design docs were previously written in Spanish.

### Context

The original decision wrote public material in English and internal planning documents in Spanish, for the project owner. Public material includes the code, the README, the public docs, and the changelog. The audience (Vercel, Next.js, Chrome, and the open-source community) is global.

### Decision

All repository documentation is in English. This includes the design docs and the ADRs. Code, comments, error messages, the README, and commit messages are also in English.

### Consequences

- Agents that take tasks write code and public docs in English, even when the instructions are in another language.
- The snippets in these documents are already in English, so they can be copied as written.

## ADR-008: Framework-agnostic core, one package in v0.1

Status: Accepted
Date: 2026-11-26

### Context

If Next.js ships its own integration (risk R1 in [roadmap.md](roadmap.md#risks)), the parts that survive are the ones that do not depend on Next: schema conversion, result normalization, confirmation, the WebMCP adapter, and diagnostics. React Router (RSC) and TanStack Start also have server functions.

Unverified: check their APIs before phase 2.

### Decision

- v0.1 ships **one package**. Its `src/core/` folder does **not** import anything from `next/*` or `react-dom/server`. A lint rule (`no-restricted-imports`) and a test that bundles `core` in isolation enforce this.
- `src/next/` and `src/react/` depend on `core`, never the other way around.
- `core` moves into its own package (`@<scope>/core`) when a second framework is added.

### Consequences

- Pivoting or migrating is cheap if Vercel adopts or replaces the Next layer.
- Trade-off: import discipline is required from day one.

## ADR-009: The demo is a SaaS app, not a commerce app

Status: Accepted. Replaces the original plan, which was a demo on Vercel Shop.
Date: 2026-11-26

### Context

- Shopify exposes native WebMCP tools in every Liquid storefront and in Hydrogen 2026-10 (`search_catalog`, `browse_store`, `get_cart`, `update_cart`, `cancel_cart`, checkout, and `navigate_to_storefront`). Source: https://shopify.dev/docs/api/web-mcp.
- `vercel/shop` enables them with `shopify.webmcp.isEnabled`. The default is `false` in the template. Its README says "Shopify analytics, consent, and WebMCP tool registration, opt-in".
- A commerce demo would show something the platform already provides, and it would invite the reply that this already exists.

### Decision

The demo is built on a fork of `nextjs/saas-starter` (MIT, 16.3k stars on 2026-11-26, see [research](research.md#8-demo-and-benchmark)), upgraded to Next 16.4 and Zod 4, with team and account tools. Fallback plan: a minimal custom team task app.

### Consequences

- The demo shows the open space: custom apps, where no platform provides tools.
- The demo exercises the most common real-world path: FormData, `useActionState`, and Zod.
- Trade-off: the template upgrade has a cost (Next 15.6 canary to 16.4, Zod 3 to 4). Planned: publish the full diff.

## ADR-010: Client registration layer, owned and thin

Status: Accepted. Revisited on 2026-11-26, when S2 was complete.
Date: 2026-11-26

### Context

- `use-webmcp-tool` (GoogleChromeLabs, about 79k weekly downloads on 2026-11-26, see [research](research.md#competitors)) is a React hook maintained by Chrome. It "will be updated with any spec changes" and degrades to a no-op.
- `@mcp-b/react-webmcp` is another option, with a larger surface.
- The `Registrar` needs to:
  - register N tools in a batch with a single `AbortController`;
  - provide `waitForToolsUntil`;
  - wrap `execute` with confirmation and adapters;
  - and load the polyfill conditionally.

### Decision

- Write a small, owned layer in `core/webmcp.ts` (about 100 lines). It uses the types from `webmcp-types` and feature detection for each optional method.
- Do not depend on `use-webmcp-tool` in v0.1. Instead, **test compatibility**: `fixtures/coexist` registers a tool with `use-webmcp-tool` on the same page, and `e2e/specs/coexist.spec.ts` checks both.
- Revisit the decision if the spec changes more than twice during development. In that case, delegate registration to Chrome's hook to inherit its maintenance.

### Consequences

- Full control of batching, signals, and confirmation, with no runtime dependencies.
- Trade-off: the project maintains the layer itself against spec churn (R2). The end-to-end suite runs against native WebMCP in Chromium on every commit.

## ADR-011: MIT license

Status: Accepted
Date: 2026-11-26

### Context

Vercel Labs projects, agent-browser, and the WebMCP polyfill use Apache-2.0. MIT was chosen for its simplicity and broad compatibility.

### Decision

`actionmcp` is licensed under the MIT license.

### Consequences

- MIT has no patent grant clause, unlike Apache-2.0.
- Contributors license their contributions under MIT.

## ADR-012: Confirmation for consequential tools by default

Status: Accepted
Date: 2026-11-26

### Context

Agents such as ChatGPT Desktop and Chrome may show their own confirmation based on `consequentialHint`. No agent guarantees this today. The [security model](security.md) requires a human step before any consequential action.

### Decision

The default is `confirm: 'consequential'`. An in-page dialog appears before any consequential tool runs.

### Alternatives considered

- Trust the agent UI by default (`'never'`). Rejected for safety.
- `'always'`. Rejected because read-only tools do not need confirmation.

### Consequences

- In agents that also confirm, users may see two confirmations.
- Teams can set `'never'`. This triggers the warning `AT103`.

## ADR-013: Supported Next.js versions

Status: Accepted
Date: 2026-11-26

### Context

Supporting Next.js 15.5 (React 19.0 and 19.1) doubles the test matrix. That cost arrives during a period when the WebMCP spec changes weekly.

### Decision

v0.1 supports Next.js 16.x only.

### Consequences

- Users on Next.js 15.5 cannot adopt v0.1.
- Support for 15.5 will be reconsidered after v0.1, based on demand.

## ADR-014: The JSDoc `@agent` path is experimental in v0.1

Status: Accepted
Date: 2026-11-26

### Context

Path C infers schemas from TypeScript types and performs no runtime validation. The analyzer must pin TypeScript 6, because `ts-json-schema-generator` does not support TypeScript 7.

### Decision

Path C ships in v0.1 as experimental and opt-in. It is disabled by default (`jsdoc: false`). The `agent()` wrapper with Standard Schema is the primary path.

### Consequences

- If spike S1 slips, path C moves to v0.2.
- `AT102` warns on JSDoc tools that have no runtime validation.

## ADR-015: Tool failures are results, not rejections

Status: Accepted
Date: 2026-11-26

### Context

The first design rejected the `execute` Promise with a `DOMException`: `OperationError` for a failed action and `NotAllowedError` for a declined confirmation. Spike SP8 showed that consumers never see that information. Native Chromium and the polyfill replace every rejection with `OperationError: Tool execution failed.`. An agent that receives only that text cannot correct an invalid input, and cannot tell a declined confirmation from a crash.

### Decision

- `execute` resolves with one envelope for every outcome: `{ ok: true, data }` or `{ ok: false, error: { code, message, issues? } }`. This is the `AgentResult` type that `agent()` already returns.
- The codes that the client adds are `declined` (the user cancelled the confirmation), `blocked` (`onBeforeExecute` returned `false`), and `failed` (the call threw).
- `execute` rejects only when the consumer cancels the call. The rejection is an `AbortError`.
- When a tool declares an `output` schema, the registered `outputSchema` describes the envelope, with the declared schema under `data`.

### Alternatives considered

- Reject, as first designed. The agent loses the reason.
- Return the unwrapped value on success and an envelope on failure. The two shapes are ambiguous when the data itself has an `ok` field.

### Consequences

- An agent can read validation issues and retry with a corrected input.
- The AI SDK does not mark these results with `isError: true`, because nothing rejected. The model reads `ok: false` instead. The chat example states this in its instructions.
- The envelope is one more level of nesting in every result.

## ADR-016: Default routes of the navigate tool

Status: Accepted
Date: 2026-11-26

### Context

The `navigate` tool lists routes as an enum. Listing every route of `app/` by default could reveal routes that the developer did not mean to advertise, and a dynamic route gives the agent a free-form parameter.

### Decision

- `navigate` or `navigate={true}` lists the routes without dynamic segments, plus the dynamic routes whose page exports `generateStaticParams`.
- `navigate={{ routes: [...] }}` replaces the default with the routes that match the globs. `*` matches inside one segment and `**` matches across segments. The patterns match route patterns such as `/projects/[id]`.
- The tool accepts only a route from its enum. It builds the URL from `params` and `query`, and it never navigates to another origin.

### Consequences

- A dynamic route needs an explicit glob before an agent can open it.
- Static routes are listed by default. A developer who wants to hide one passes `routes`.

## ADR-017: `agent()` validates its output against the `output` schema

Status: Accepted
Date: 2026-11-26

### Context

Threat T9 in [security.md](security.md) left one question open: when a tool declares an `output` schema, should the library filter the output or only describe it.

### Decision

`agent()` validates the handler's return value with `output['~standard'].validate` on the server and returns the validated value. A validator that strips unknown keys, such as a Zod object, therefore removes undeclared fields. If validation fails, the tool returns `{ ok: false, error: { code: 'failed' } }` and none of the data.

For `tool()` and `@agent`, the action runs unchanged, so `output` only describes the result.

### Consequences

- The output schema that the agent sees and the filter that runs on the server are the same object.
- A handler can return a full record and rely on the schema to drop internal fields.
- The filtering semantics come from the validator. A validator that passes unknown keys through does not filter.
