# Research

Research date: 2026-11-25 and 2026-11-26. Legend:

- **Verified:** read in the primary source (spec, repo, official docs).
- **Secondary source:** reported by a third party, such as a blog or article.
- **Unverified:** a reasonable hypothesis that a spike must confirm (see [roadmap.md](roadmap.md#s0--verification-spikes-2-days)).

---

## 1. WebMCP spec

Repo: https://github.com/webmachinelearning/webmcp (Community Group draft, not a W3C standard). Last commit read: 2026-11-24.

### Imperative API (IDL in `index.bs`) **Verified**

```webidl
partial interface Document {
  [SecureContext, SameObject] readonly attribute ModelContext modelContext;
};

[Exposed=Window, SecureContext]
interface ModelContext : EventTarget {
  Promise<undefined> registerTool(ModelContextTool tool, optional ModelContextRegisterToolOptions options = {});
  undefined waitForToolsUntil(Promise<any> promise);
  Promise<sequence<Tool>> getTools(optional ModelContextGetToolOptions options = {});
  Promise<DOMString> executeTool(Tool tool, optional object inputObject, optional ModelContextExecuteToolOptions options = {});
  attribute EventHandler ontoolchange;
  attribute EventHandler ontoolactivated;
  attribute EventHandler ontoolcancel;
};

dictionary ModelContextTool {
  required DOMString name;
  USVString title;
  required DOMString description;
  object inputSchema;
  object outputSchema;
  required ToolExecuteCallback execute;
  ToolAnnotations annotations;
};

dictionary ToolAnnotations {
  boolean readOnlyHint = false;
  boolean untrustedContentHint = false;
  boolean consequentialHint = false;
  boolean debugging = false;
};

dictionary ToolExecuteCallbackOptions { required AbortSignal signal; };
callback ToolExecuteCallback = Promise<any> (object inputObject, ToolExecuteCallbackOptions options);

dictionary ModelContextRegisterToolOptions {
  sequence<USVString> exposedTo;   // origins that the tool is exposed to within the document tree
  AbortSignal signal;              // aborting unregisters the tool
};
```

Rules that shape the design (**Verified**):

- **Name:** 1 to 128 characters, using only ASCII alphanumerics, `_`, `-`, and `.`. If the name does not match, or it is duplicated, `registerTool` rejects with `InvalidStateError`. An empty description also rejects.
- **Unregistration:** only through `AbortSignal`. There is no `unregisterTool`, and `navigator.modelContext` is an old name.
- **`waitForToolsUntil(promise)`** (added 2026-11-24, PR #373): tells consumers to wait until asynchronous registration finishes. Issue #328 proposes that `tools ready` starts as `false`.
- **`Tool` interface** (2026-11-19, PR #348): `getTools()` returns snapshots. Each `Tool` identifies one concrete registration.
- **Permissions policy `tools`:** the default is `self`. Cross-origin iframes need `allow="tools"` (Chrome docs, **Verified**).
- **Security:** the spec documents prompt injection, *misrepresentation of intent*, and *privacy leakage through over-parameterization*. It describes mitigations with `untrustedContentHint` and `consequentialHint`. It states that agents cannot rely only on the site's annotations.

### Declarative API (`declarative-api-explainer.md`) **Verified**

- Attributes on `<form>`: `toolname`, `tooldescription`, `toolautosubmit`. On controls: `toolparamdescription`. Each property name comes from the input's `name`.
- The schema synthesis algorithm is **TODO** in the explainer. Chromium implements a "loose version."
- Agent response: `SubmitEvent#respondWith(promise)` and `SubmitEvent#agentInvoked`. The response after a navigation is still under discussion (issue #135).
- Pseudo-classes: `:tool-form-active` and `:tool-submit-active`.
- ChatGPT calls only imperative tools. Chrome supports both (**Secondary source**: https://www.frase.io/blog/what-is-webmcp). This confirms that declarative forms belong in phase 2.

### Continuations (`continuations-explainer.md`) **Verified**

Today a tool call lives in one document and one Promise. If the action navigates (for example, with a `redirect()`), the agent loses the result. The `ModelContextToolInvocation` proposal, with continuation tokens, is in the explainer and is not implemented in the polyfill. This affects us directly: see [architecture.md](architecture.md#redirect-and-navigation).

### Implementation status (`implementation-status.md`, read 2026-11-26) **Verified**

| Consumer | Status |
|---|---|
| Chrome | Origin Trial from Chrome 149. Registration: https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241. For local development: `chrome://flags/#enable-webmcp-testing`. **Secondary source:** the OT runs from Chrome 149 to 156 (frase.io). |
| Edge | Origin Trial in Edge 150. |
| ChatGPT Desktop | Supported ("Site tools") in the built-in browser, for ChatGPT, Work, and Codex. Discovers tools at the top level and in same-origin and cross-origin iframes (each frame needs a secure context). `exposedTo` can be omitted. OpenAI guidance: "Keep inputs narrow, describe side effects, and return enough information to verify the result. Use your application’s existing authentication…" https://learn.chatgpt.com/docs/webmcp |
| Brave | Leo AI chat, in Brave 1.102.2 (planned for 2027-01-05). |
| Meta Ray-Ban Display | "Coming soon". |
| Firefox / Safari | Standards positions only. |

Origin Trial token: the standard Chrome mechanism is `<meta http-equiv="origin-trial" content="TOKEN">` or the `Origin-Trial: TOKEN` HTTP header. **Unverified:** whether the WebMCP OT accepts third-party tokens, and whether the `<meta>` tag that React 19 injects into `<head>` reaches the page. It should, because React 19 hoists `<meta>` to the head during SSR.

Chrome flags for e2e: AI SDK verified with `--enable-experimental-web-platform-features --enable-features=WebMCPTesting` in Chrome 157. agent-browser records that Chrome 157 removed the `WebMCPTesting` flag (closed issue #2513). **Unverified:** the correct flag must be pinned per Chrome version. Recommendation: use agent-browser for native e2e, because it already handles this.

Spec churn (evidence): Chrome 160 exposes the tool owner as `source` instead of `window`, and AI SDK had to patch for it (PR #25507, 2026-11-25). The API had already moved from `navigator` to `document` before that.

## 2. Polyfill and types

- `@w3c/webmcp-polyfill` v0.2.0 (2026-11-23), Apache-2.0, ~181k weekly downloads (**Verified**):
  - Usage: `import "@w3c/webmcp-polyfill/auto"` or `installWebMCP()`. It never replaces a native `document.modelContext`. It is SSR-safe.
  - In Next.js, import it in `instrumentation-client.ts`.
  - Covers registration, discovery, execute, cancel, `toolchange`, `toolactivated`, and `toolcancel`, plus frames with `exposedTo` and `fromOrigins`.
  - It does not implement declarative forms. Native browser agents do not see the polyfill's tools ("Connecting to a browser agent still requires native browser support").
  - `executeTool()` returns the result serialized as JSON. "Callbacks must validate their inputs".
  - Consequence: the polyfill serves the in-app chat (AI SDK) and tests, but not ChatGPT or Chrome.
- `webmcp-types` v0.2.0 (2026-11-20), ~517k weekly downloads (**Verified**): the official types from the Community Group.
- `use-webmcp-tool` (GoogleChromeLabs, 203 stars, ~79k weekly downloads) (**Verified**): a React hook maintained by Chrome that "will be updated with any spec changes". It is a no-op if the API is missing. It is a candidate for the registration primitive: see [ADR-010](decisions.md#adr-010-client-registration-layer-owned-and-thin).
- `@mcp-b/global` v6.2.0, ~247k weekly downloads: an alternative polyfill. `@mcp-b/webmcp-polyfill` is deprecated in favor of the W3C polyfill (**Verified**).

## 3. AI SDK <a id="ai-sdk"></a>

PRs in `vercel/ai`, all merged on 2026-11-23 except the last (**Verified**):

- **#25184** `Experimental_WebMCPTransport`: adapts `document.modelContext` (`getTools`/`executeTool`) to the MCP client. It preserves annotations, `structuredContent`, and cancellation. It creates stable aliases for duplicate names across frames (`getCart_2`). Tool lists are snapshots, so list them again when they change.
- **#25185** `createMCPTools(definitions)`: the backend turns definitions forwarded by the browser into tools without `execute`, for `streamText`.
- **#25186** example `examples/ai-e2e-next/app/chat/webmcp`: a cart with client-only state, with tools written by hand with `registerTool` and `z.toJSONSchema` (zod/v4).
  - The `route.ts` rejects the request if it is not local development ("WebMCP is only available in local development.") and limits it to **32 definitions** per request.
  - On the client, `useChat` with `prepareSendMessagesRequest` sends `listTools()`, and `onToolCall` runs `client.callTool` and `addToolOutput`.
- **#25507** (2026-11-25): support for the `source` owner (Chrome 160), so tools with the same name in different frames route correctly.
- **Docs** (`content/docs/03-ai-sdk-core/16-mcp-tools.mdx`): `fromOrigins` is optional. WebMCP `OperationError`s become `isError: true`. "Closing the client aborts pending calls without unregistering the page's tools."

**Implication:** AI SDK covered the consumer side. The producer side of tools is still manual. Our example chat reuses this exact pattern.

## 4. Next.js

- **PR #98443** "Add WebMCP development tools and HMR controls" (@gaojude, Next.js team): opened 2026-09-09, still a draft, with no activity since 2026-09-18 (**Verified**).
  - Registers **development** tools: `pause_hmr`, `resume_hmr`, `nextjs_inspect`, and `nextjs_compile_route`, with a Server Action lookup by ID for debugging.
  - Has a test that "preserves application tools". It does not overwrite app tools, but it does not generate them either.
  - Implication: those names must be reserved. See [architecture.md](architecture.md#reserved-names).
- **Server Action security** (https://nextjs.org/docs/app/guides/data-security) (**Verified**):
  - Encrypted, non-deterministic IDs that change between builds.
  - Unused actions are removed from the client bundle.
  - Closures are encrypted (`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`).
  - Actions accept POST only. Next compares `Origin` with `Host`/`X-Forwarded-Host` (`serverActions.allowedOrigins`).
  - Authentication and authorization go inside each action.
  - Quote: "even if a Server Action … is not imported elsewhere in your code, it can still be called externally".
- **Sequential dispatch** (**Verified**): "Next.js dispatches Server Actions one at a time per client" (https://nextjs.org/docs/app/guides/server-actions). Implication: tools that use actions queue and do not run in parallel.
- **Importing Server Functions in the client** (**Verified**): they are defined in a file with `'use server'`, and Client and Server Components can import them. A `'use server'` file can export only async functions, which is why wrapper patterns such as next-safe-action exist. **Unverified:** confirm the exact error message in Next 16.4.
- **Turbopack** (**Verified**, https://nextjs.org/docs/app/api-reference/turbopack): supports webpack loaders (`turbopack.rules`) and automatic Babel if configured. It does not support webpack plugins or `webpack()` in `next.config`. Implication: there is no compile hook with a view of the whole project, so the strategy is codegen ([ADR-001](decisions.md#adr-001-codegen-instead-of-a-compiler-plugin)).
- **Typed routes** (**Verified**): `typedRoutes` is stable since 15.5. `next typegen` generates `PageProps`, `LayoutProps`, and `RouteContext`. For the `navigate` tool, we scan `app/` ourselves (see [architecture.md](architecture.md#tool-navigate)).
- Reference version: `vercel/shop` uses `next@16.4.6` and `react@19.3.1`. We use that as the compatibility baseline.

## 5. Schema inference

- **Standard JSON Schema** (**Verified**, https://standardschema.dev/json-schema): a common interface, `schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' })`. Zod v4.2+ (current: 4.6.7), ArkType 2.1.28+ (current: 2.2.10), and Valibot 1.2 through `toStandardJsonSchema()` from `@valibot/to-json-schema` (current: 1.8.0) implement it.
  - Key decision: we support any Standard Schema validator without statically parsing Zod ([ADR-002](decisions.md#adr-002-standard-schema-first-typescript-types-as-fallback)). The MCP TypeScript SDK v2 does the same (**Verified**).
- next-safe-action v8.7.4, ~553k weekly downloads (**Verified**): `actionClient.inputSchema(schema).action(async ({ parsedInput }) => …)`. It returns `{ data, serverError, validationErrors }` and supports Standard Schema.
  - In the examples, the schema is a local constant that is not exported, so another module cannot read it at runtime. Implication: an explicit adapter is needed.
- `useActionState` / FormData pattern (**Verified**): the dominant pattern in templates. `nextjs/saas-starter` (16k stars) uses `validatedAction(schema, (data, formData) => …)`, which returns `(prevState, formData) => …`, with local Zod schemas. Implication: a `formData: true` adapter that builds FormData from the agent's input.
- TS to JSON Schema (for the JSDoc path without a validator):
  - `ts-json-schema-generator` v2.10.0 (2026-11-20), ~1.8M weekly downloads. Peer `typescript >=5.9 <7` (**Verified**).
  - `typia` v15.5.0: requires a compiler transform. It is heavy and invasive for the user's project.
  - The TypeScript compiler API directly (with or without `ts-morph` 28).
  - TypeScript 7.0.2 (native, written in Go) has been `latest` since 2026-11-25 (**Verified**). Its JS API is in preview (`@typescript/native-preview`). Implication: the analyzer must pin `typescript@6.0.x` as its own dependency, independent of the user's TypeScript.
  - Recommendation: `ts-json-schema-generator` with TypeScript 6 pinned. See [ADR-002](decisions.md#adr-002-standard-schema-first-typescript-types-as-fallback).
- Fast parser for the scan: `oxc-parser` v0.160.0 (~116M weekly downloads). It detects directives, exports, and JSDoc without the cost of the type checker.

## 6. UI SDK (vercel-labs/ui) **Verified**

- `createAgent()` and `registerTools(agent, { allow })` register three tools at component level, with names that have no prefix: `snapshot` (readOnly), `act` (consequential), and `query`. See `packages/core/src/page/agent/agent.ts`. `@ui-sdk/core` is at 0.1.0-beta.17 (2026-11-24).
- Complementarity: UI SDK says "tap button X". actionmcp says "invite this user to the team with the admin role". Both can coexist on the same page.
- Implication: we reserve `snapshot`, `act`, and `query` ([architecture.md](architecture.md#reserved-names)). Deep integration, such as falling back to `act`, is not part of v0.1.

## 7. Competitors <a id="competitors"></a>

| Project | What it does | Status / adoption | Difference from actionmcp |
|---|---|---|---|
| webmcp-next (dankelleher) | `withWebMCP()`, a route at `app/api/mcp/manifest`, and `<WebMCPScript />`. Auto-discovers all exports of `'use server'` files (opt-out). Exposes POST as tools and GET as resources. Integrates next-safe-action. | 2 stars, created and last pushed 2026-03-09, 20 downloads/month. MIT. | Exposes everything by default. Runs through a generic dispatcher endpoint (`POST {name, input}`) instead of the action's RPC. Uses `navigator.modelContext` (old API), regex parsing, no annotations or AbortSignal, and inputs typed as `Record<string,string>`. actionmcp is opt-in, uses the native RPC, `document.modelContext`, annotations, and Standard Schema. |
| next-webmcp (cristiantx) | Manual helpers on top of `@mcp-b/react-webmcp`: `defineTool`/`executeTool`, `useServerTool`, `useNavigationTool`, and an experimental route generator. | 3 stars, last push 2026-05-26, 17 downloads/month. | Everything is manual. No codegen or safe defaults. |
| webmcp-kit (nekuda-ai) | Plugin for Claude Code/Codex. Reads the repo, proposes a tool plan, and writes the tools after approval. | 51 stars, last push 2026-11-16. MIT. | Generates code once, with an agent. actionmcp is a deterministic library that stays in sync with the code. |
| agent-browser `webmcp-gen` skill (vercel-labs) | A skill that lets an agent create `webmcp.init.js`, `manifest.json`, and evals that compare against the accessibility tree. Injected with `--init-script`. | Added 2026-09-01. agent-browser has 54k stars. | Prototyping and evals on any site, not framework integration. Shows that Vercel Labs works on WebMCP tooling (see [roadmap.md](roadmap.md#risks)). |
| Sodium | Commercial. Connects a GitHub repo and generates WebMCP tools. | Commercial. | Closed and paid. actionmcp is OSS and lives in the code. |
| Hunch | Commercial, no-code. A URL plus a script tag for marketing teams. | Commercial. | Different audience (no-code). |
| fillament | Forms library with an adapter, "Expose Fillament forms as WebMCP tools". | npm (no adoption data). | Tied to its forms library. |
| @mcp-b/react-webmcp / @mcp-b/global | React hooks and a polyfill. | ~20k and ~247k weekly downloads. | Manual primitives. |
| use-webmcp-tool (Chrome) | React hook maintained by Chrome. | 203 stars, ~79k weekly downloads. | Primitive. We can build on top of it. |
| webmcp-agents.dev | `<WebAgentsProvider>` for Next, with an agent cursor, a polyfill, and devtools. Tools are written by hand. | **Unverified:** no adoption data. | Manual. Focus on the cursor and UX. |
| GoogleChromeLabs/webmcp-tools | Chrome utilities and demos (805 stars). Includes the Model Context Tool Inspector extension. | Official. | Developer tools, not framework integration. |
| Shopify (Liquid + Hydrogen 2026-10) <a id="shopify"></a> | Native tools: `search_catalog`, `browse_store`, `get_cart`, `update_cart`, `cancel_cart`, checkout, and `navigate_to_storefront`. Hydrogen loads them by default with `ShopifyScripts`. | GA. | Commerce is already covered. `vercel/shop` (MIT, 147 stars) enables it with `shopify.webmcp.isEnabled` (default `false` in the template). We do not build the demo on commerce. |
| UI SDK `registerTools` | Component-level tools. | Beta. | Complementary. |
| Next PR #98443 | Development tools. | Draft, stalled. | Complementary. The two coexist. |
| prodlint | "Production readiness" linter with a "WebMCP Tools 0/5" check. | v0.10.8. | Shows that "having WebMCP tools" is already measured as a requirement. |

Real differentiators, in order of importance:

1. **Native RPC:** the tools call the native Server Action RPC. It is the same endpoint, with the same origin check and the same UI revalidation. We create no new endpoints.
2. **Opt-in, with safe defaults:** `consequential` by default for mutations, human confirmation, and `untrustedContentHint`.
3. **Real schema:** derived from the validator (Standard Schema) or from the types (TS). No regex and no `Record<string,string>`.
4. **Per-route scope:** per composition (`<AgentTools />` in a segment layout).
5. **One set of tools** for browser agents (ChatGPT, Chrome) and for the app's own chat (AI SDK).
6. **Maintained and tested:** tested against Next 16.x and aligned with the current spec.

## 8. Demo and benchmark

- **`vercel/shop` is not a usable demo.** It already ships WebMCP through Shopify (**Verified**; see the table above).
- **Primary candidate: `nextjs/saas-starter`** (MIT, 16.3k stars, last push 2025-12-11) (**Verified**).
  - Server actions with Zod through `validatedAction`/`validatedActionWithUser` in `app/(login)/actions.ts`: `signIn`, `signUp`, `updatePassword`, `deleteAccount`, `updateAccount`, `removeTeamMember`, and `inviteTeamMember`. All use the `(prevState, formData)` signature.
  - It uses `next@15.6.0-canary.59` and `zod@^3.24`, so it must be upgraded to Next 16 and Zod 4. That upgrade is part of the demo work.
- `agent-browser` (vercel-labs, 54k stars, Apache-2.0) natively supports WebMCP (**Verified**):
  - `webmcp list/invoke/result/cancel`, and `--no-webmcp` to turn it off.
  - Announces tools when it discovers them. Catalogs with more than 4 tools are truncated to 16 tools and 4 KiB.
  - Treats everything on the page as untrusted.
  - Ships its own eval (`evals/webmcp-context.py`, with Codex and Chrome, and `hostile`, `hostile-schema`, and `hostile-result` modes).
  - Implication: the benchmark compares the same harness with and without WebMCP ([testing.md](testing.md#demo-and-benchmark)).
- Earlier external benchmark (**Secondary source**; X post of 2026-11-25, CRM with 14 tools): WebMCP used 8 times fewer tokens and was 4 times faster than clicking. A headless MCP server was 24–48% faster than WebMCP. It is not reproducible as published, but it helps compare orders of magnitude.
