# Roadmap

Each task has an ID, its dependencies, and acceptance criteria (AC). An agent can take any task whose dependencies are closed. Week estimates are approximate: the priority is to ship quickly (see [Risks](#risks)).

## S0 · Verification spikes (2 days)

Goal: resolve the **Unverified** items that could invalidate the architecture **before** building. Each spike adds a short note under [Spike results](#spike-results) with the result, evidence, and decision.

| ID | Question | AC |
|---|---|---|
| SP1 | Can a Server Function be passed as a prop from an RSC to a Client Component and called from a WebMCP `execute` in Next 16.4? Is the metadata attached by `agent()` (symbol/WeakMap) visible in the RSC that imports the `'use server'` module? | Minimal app: the `execute` calls the action and the UI revalidates; the metadata is read in the RSC. If the metadata is not visible, the alternative is documented (see the `agent()` note in [ADR-005](decisions.md#adr-005-rsc-registry-and-route-scoping-by-composition)). |
| SP2 | What happens to the action's Promise if it calls `redirect()`? Does the `Registrar` of the segment unmount before the Promise resolves? | Table with the behavior (resolves, rejects, or stays pending) and the chosen mitigation. |
| SP3 | Does `turbopack.resolveAlias` resolve `actionmcp/registry` when the import lives inside `node_modules/actionmcp`? And with webpack? | Green build with Turbopack and with webpack. If it fails, the fallback (explicit `registry` prop) is documented. |
| SP4 | Does the watcher started from `withAgentTools()` survive `next dev` config restarts without duplicating? | Ten consecutive edits produce a single process; the incremental time is under 300 ms. |
| SP5 | Native E2E: which Chrome flag or channel exposes WebMCP today (Chrome 157+ without `WebMCPTesting`)? Does agent-browser handle it automatically? | A script that runs `agent-browser webmcp list` against a fixture and lists the tools. |
| SP6 | ChatGPT Desktop: does it discover tools registered late (after hydration)? Does it show its own confirmation for `consequentialHint`? Does it respect the page's dialog? | Video or screenshots, plus notes in `e2e/manual/chatgpt.md`. |
| SP7 | Does a `<meta http-equiv="origin-trial">` rendered by React 19 from an RSC activate the origin trial? Is the header needed? | Test token on a preview deployment; `document.modelContext` available in stable Chrome without flags. |

## S1 · Server core and analyzer

The JSDoc `@agent` path (T1.6 and T1.7) ships in v0.1 as experimental and opt-in (`jsdoc: false` by default). If S1 slips, the JSDoc path moves to v0.2 ([ADR-014](decisions.md#adr-014-the-jsdoc-agent-path-is-experimental-in-v01)).

| ID | Task | Deps | AC |
|---|---|---|---|
| T1.1 | Monorepo scaffold (pnpm, turbo, tsup/tsdown, vitest, oxlint), `actionmcp` package with `exports` | — | `pnpm build` and `pnpm test` pass; MIT license ([ADR-011](decisions.md#adr-011-mit-license)) and a placeholder README in English |
| T1.2 | `core/names.ts`: spec validation (1–128 characters, `[A-Za-z0-9_.-]`), reserved names, prefixes | T1.1 | Tests for every case in the spec; `AT001`/`AT002` |
| T1.3 | `core/schema.ts`: Standard JSON Schema → draft-2020-12; sanitizes `$schema`, `$defs`, and descriptions | T1.1 | Tests with Zod 4.6, Valibot (`toStandardJsonSchema`), and ArkType. The example schemas from the AI SDK example produce the same output as `z.toJSONSchema`. |
| T1.4 | `server/agent.ts`: `agent()` with `~standard.validate` validation, `AgentResult`, `AgentToolError`, and `AGENT_META` metadata | T1.3, SP1 | The wrapper is a valid `'use server'` export (fixture build). An invalid input returns `invalid_input` without calling the handler. |
| T1.5 | `server/registry.ts`: `tool()`, `defineAgentTools()`, `createRegistry()`, `fromFormDataAction()`, `fromSafeAction()` | T1.4 | Adapter tests with real signatures (saas-starter and next-safe-action 8.7) |
| T1.6 | `analyzer/scan.ts` with oxc-parser: directives, `agent(` calls with import resolution, JSDoc `@agent`, and modifiers | T1.1 | Code fixtures: detects 100% of the cases in the table in `spec.md`; `AT004` |
| T1.7 | `analyzer/types.ts`: pinned TS 6 + ts-json-schema-generator for the JSDoc path, with a hash-based cache. Experimental and opt-in. | T1.6 | Optional fields, enums, discriminated unions, and per-property JSDoc; `AT101` for FormData; time within budget |
| T1.8 | `generator/`: emits `registry.ts` and `manifest.json` | T1.5–T1.7 | Snapshots per fixture; deterministic output (two runs produce identical bytes) |

## S2 · Browser runtime and navigation

| ID | Task | Deps | AC |
|---|---|---|---|
| T2.1 | `core/webmcp.ts`: feature detection, `registerTool` with signal, optional `waitForToolsUntil`, polyfill loading | T1.2 | Tests with the polyfill; silent no-op without the API |
| T2.2 | `react/AgentTools.tsx` (RSC) + `react/Registrar.tsx` (client) | T1.8, T2.1, SP1, SP3 | Fixture `basic`: `getTools()` lists the tools; `executeTool` runs the action and the UI revalidates |
| T2.3 | Route scoping and `include` / `exclude` / `prefix` | T2.2 | Fixture `scoped`: tools change on navigation and `toolchange` is emitted |
| T2.4 | Default `Confirm` (`<dialog>`) + `AgentToolsProvider` (`onBeforeExecute` / `onAfterExecute` / `confirmComponent`) | T2.2 | Fixture `hostile`: a consequential tool does not run without a human click; axe reports no violations |
| T2.5 | Result and error normalization (`OperationError`, `NotAllowedError`, `AbortError`) | T2.2 | Validation, auth, and safe-action errors are mapped; the AI SDK sees them as `isError: true` |
| T2.6 | `navigate` tool (scan of `app/` + `router.push`) | T1.6, T2.2 | Fixture `navigate`; exclusions are correct; `routes` globs |
| T2.7 | `originTrialToken` → `<meta>` | T2.2, SP7 | Visible in the SSR HTML |
| T2.8 | `redirect()` behavior according to SP2 | T2.5, SP2 | Fixture `redirect` with the documented and tested behavior |

## S3 · DX: config, CLI, and devtools

| ID | Task | Deps | AC |
|---|---|---|---|
| T3.1 | `withAgentTools()`: generate on build, watch in dev, `resolveAlias` | T1.8, SP3, SP4 | Fixtures with Turbopack and webpack. An `AT0xx` error aborts the build with a message and `file:line`. |
| T3.2 | CLI `generate` / `inspect` / `doctor` with all `ATxxx` codes | T1.8 | Stable `--json`; every code has its test; `doctor` suggests the fix |
| T3.3 | `<AgentToolsDevtools />` | T2.2 | Lists native, polyfill, and third-party tools; runs tools with JSON input; keeps a history |
| T3.4 | `examples/chat` with AI SDK (transport + `createMCPTools`) | T2.5 | A working chat with the polyfill; the 32-tool limit is respected; example README |
| T3.5 | `basic`, `formdata`, `safe-action`, and `jsdoc` examples | T2.x | Each runs with `pnpm dev` and has its own README |

## S4 · Demo, benchmark, and hardening

| ID | Task | Deps | AC |
|---|---|---|---|
| T4.1 | Fork of `nextjs/saas-starter`: upgrade to Next 16.4 + Zod 4; tools via `defineAgentTools` | T3.1 | The 5 tools in [testing.md](testing.md#demo-and-benchmark) work in ChatGPT Desktop (SP6) and with agent-browser |
| T4.2 | Benchmark harness (agent-browser with and without WebMCP, same model, N=20) | T4.1, SP5 | Raw logs, reproducible script, results table |
| T4.3 | Security tests (`hostile` fixture + hostile modes) | T2.4 | No consequential tool runs without confirmation in any mode |
| T4.4 | Performance and bundle size | T2.x, T3.x | Within the budget in [testing.md](testing.md) |
| T4.5 | Public docs: Getting started, Security model, API reference, FAQ ("why don't you expose everything?", "does it work in Safari?") | T3.x | Copy review in English; all snippets compile |

## S5 · Launch

| ID | Task | Deps | AC |
|---|---|---|---|
| T5.0 | Community files before the repository goes public: `SECURITY.md` and `CODE_OF_CONDUCT.md` (their text is in the last two sections of `CONTRIBUTING.md`), issue forms, and a pull request template | None | GitHub shows the security policy and the code of conduct in the community profile |
| T5.1 | Publish v0.1.0 to npm (with provenance) and announce the release | All of S1–S4, T5.0 | `npm i actionmcp` + quickstart in under 5 minutes, verified by someone outside the project |
| T5.2 | Publish the demo app and the benchmark results | T4.1, T4.2 | Raw logs and the demo app linked from the README |
| T5.3 | Upstream: Discussion in `vercel/next.js` and an example PR, or issues in `vercel/ai` if bugs are found | T5.1 | Links published |

## S6 · Phase 2 (driven by adoption)

In order of value:

1. Declarative forms (`toolname` / `tooldescription` / `toolparamdescription`) for Chrome.
2. Read-only tools through GET route handlers (to avoid the Server Action queue).
3. Backend MCP route from the same definitions.
4. `useAgentToolsChat()`.
5. Adapters for React Router / TanStack Start.
6. UI SDK integration.
7. Continuations.

## Spike results

Results of the [S0 spikes](#s0--verification-spikes-2-days). Add one subsection per spike below, in this format. If a result changes a decision, update [decisions.md](decisions.md) in the same change.

### Format

```md
# SPn · <question>

- Date:
- Versions: next@…, react@…, Chrome/ChatGPT …, node@…
- Result: Verified | Refuted | Partial

## Evidence
(reproducible steps, minimal code, logs, or screenshots)

## Decision
(what changes in the plan; which ADR or document was updated)
```

If a spike refutes a hypothesis, update the affected ADR and the matching **Unverified** entry in `research.md` in the same change.

## Risks

Scale: Probability (P) and Impact (I), from 1 to 5.

| # | Risk | P | I | Early signal | Mitigation |
|---|---|---|---|---|---|
| R1 | **Next.js or Vercel ships a similar feature first.** PR #98443 evolves into application tools, AI SDK adds a helper, or vercel-labs turns `webmcp-gen` into an integration. | 4 | 5 | New commits on #98443; issues or PRs in `vercel/ai` about "server actions" + WebMCP; a new repo in vercel-labs | Keep the public API small so it can be upstreamed or replaced. Design the shape (`SerializableToolDef`) so Next.js can adopt it as is. Open the upstream Discussion on release day. If the feature ships natively, position the project as a security and DX layer (confirmation, doctor, adapters) or migrate to the native API. |
| R2 | **Spec churn.** The spec already moved from `navigator` to `document`, from `window` to `source` in Chrome 160, and `waitForToolsUntil` was added. | 5 | 3 | Commits in webmachinelearning/webmcp; releases of `webmcp-types` | Thin layer in `core/webmcp.ts` with feature detection. Types from `webmcp-types`. Nightly job against Chrome Canary. Evaluate building on `use-webmcp-tool`, maintained by Chrome ([ADR-010](decisions.md#adr-010-client-registration-layer-owned-and-thin)). |
| R3 | **Low real-world adoption of WebMCP.** Only the origin trial and ChatGPT Desktop support it today; Safari and Firefox do not. | 3 | 4 | Feedback like "I can't try it" | The in-app chat with AI SDK works today in any browser through the polyfill, so there is value without depending on browser support. Document ChatGPT Desktop as the main way to try it. |
| R4 | **Fragile type inference (JSDoc path).** Native TS 7 has no stable JS API, and ts-json-schema-generator requires TS `<7`. | 4 | 2 | Bugs with complex types | Path A (Standard Schema) is the recommended path. The analyzer pins TS 6. The JSDoc path is experimental and opt-in ([ADR-014](decisions.md#adr-014-the-jsdoc-agent-path-is-experimental-in-v01)). For an unsupported type: `AT101`, register without `inputSchema`, and suggest `agent()`. |
| R5 | **`redirect()` and navigation lose the results of tools.** | 4 | 3 | Spike SP2 | Mitigate or document. Design the demo tools without redirects. Continuations in phase 2. |
| R6 | **The sequential Server Action queue makes read-only tools slow.** | 3 | 2 | The benchmark shows high latency on readOnly tools | Document it. Phase 2: readOnly tools through GET route handlers. |
| R7 | **Double confirmation (agent and page) annoys users, and they set `confirm: 'never'`.** | 3 | 3 | Issues asking to disable it | Compact dialog. Global configuration. Document the reason. `AT103` as a warning, not an error. |
| R8 | **A security incident in an app that uses the library.** | 2 | 5 | Reports | The security model states explicitly what we do not cover (auth and IDOR). Checklist per tool. A security policy with a private reporting channel. No expose-all mode. |
| R9 | **`withAgentTools` is fragile across Next.js versions** (alias, watcher). | 3 | 3 | Breaks on canary | Nightly job against canary. Escape hatch: the explicit `registry` prop, and `generate` via scripts. |
| R10 | **Perception of "yet another wrapper"** (webmcp-next and next-webmcp already exist). | 3 | 3 | Comments like "this already exists" | Show the concrete differences: opt-in, native RPC, security, Standard Schema, active maintenance. Be respectful of prior projects. |
| R11 | **Scope creep** (backend MCP, frameworks, UI SDK) before launch. | 4 | 4 | S5 starts | Freeze the v0.1 scope in [spec.md](spec.md#product-spec). Everything else is phase 2. |

### What not to do

- Do not expose actions by default or offer an "expose all" mode, even if requested.
- Do not create custom endpoints to execute tools.
- Do not sell the polyfill as "works in all browsers": native agents do not see it.
- Do not publish benchmarks without raw logs or pick the best runs.
- Do not build a commerce demo: Shopify already covers that case.
- Do not promise API stability while the spec is a draft.
