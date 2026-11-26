# Testing

## Test pyramid

| Level | Tool | What it covers | Where |
|---|---|---|---|
| Unit | Vitest | `core/` (names, schema, results), `server/` (`agent()`, adapters), `analyzer/` (scan and types over code fixtures), `generator/` (snapshots of `registry.ts` and `manifest.json`) | `packages/actionmcp/src/**/*.test.ts` |
| Integration | Vitest + real `next build` | Fixture apps on Next 16.x: the build passes, the registry is generated, the alias resolves, and the RSC emits the expected definitions (checked in the HTML/RSC payload) | `fixtures/*` |
| E2E (polyfill) | Playwright (stable Chromium) + `@w3c/webmcp-polyfill` | `getTools()` lists the right tools per route; `executeTool()` calls the action; the UI revalidates; confirmation blocks execution; tools unregister on navigation | `e2e/polyfill/*.spec.ts` |
| E2E (native) | agent-browser (`webmcp list/invoke`) on Chrome with WebMCP enabled | The same checks as the polyfill, but with Chrome's native implementation (origin trial or flag) | `e2e/native/*.sh` or `.ts` |
| Manual | ChatGPT Desktop (built-in browser) | Real discovery and execution, behavior with `consequentialHint`, and ChatGPT's own confirmation | checklist in `e2e/manual/chatgpt.md` |
| Agent evals | agent-browser + model via AI Gateway | End-to-end tasks: success rate, tokens, and time ([testing.md](#demo-and-benchmark)) | `bench/` |

## Fixtures (minimal Next apps)

| Fixture | Path | Cases |
|---|---|---|
| `fixtures/basic` | A (`agent()`) | Read-only tool, consequential tool, validation error, auth error, `revalidatePath` reflects the change in the UI |
| `fixtures/formdata` | B + `fromFormDataAction` | `(prevState, formData)` signature, arrays, booleans, `ActionState` return with `error` |
| `fixtures/safe-action` | B + `fromSafeAction` | `serverError`, `validationErrors`, `data` |
| `fixtures/jsdoc` | C (experimental, opt-in) | Optional fields, enums, unions, per-property JSDoc; `AT102` |
| `fixtures/scoped` | Scope by route | `<AgentTools include>` in the layouts of `/a` and `/b`; navigating between routes changes `getTools()` and emits `toolchange` |
| `fixtures/navigate` | `navigate` tool | Static and dynamic routes, route groups; slots and intercepted routes are excluded |
| `fixtures/redirect` | Action that calls `redirect()` | Documented behavior of the result (see the open question in `architecture.md`) |
| `fixtures/hostile` | Security | Output with injected instructions; the confirmation blocks execution; no new endpoints |
| `fixtures/coexist` | Coexistence | UI SDK `registerTools` + our tools + Next.js Devtools: no name clashes |

## Compatibility matrix (CI)

| Dimension | Values |
|---|---|
| Next.js | 16.x only ([ADR-013](decisions.md#adr-013-supported-nextjs-versions)): 16.2.x, 16.4.x (baseline, the version used by `vercel/shop`), `canary` (nightly job, non-blocking) |
| React | 19.2, 19.3 |
| Bundler | Turbopack (default), webpack (`next build --webpack`) |
| Validators | Zod 4.2+ (4.6.x), Valibot 1.2+ with `@valibot/to-json-schema`, ArkType 2.1.28+ |
| User TypeScript | 5.9, 6.0, 7.0 (the analyzer uses its own pinned TS 6) |
| Node | 22, 24 |
| E2E browser | Chromium + polyfill (always); Chrome with native WebMCP (separate job). **Unverified**: pin the flag for each version. Chrome 157 removed `WebMCPTesting`. |

Next.js 15.5 is out of scope for v0.1.

## Quality criteria

- Minimum 85% coverage in `core/`, `server/`, and `generator/`. E2E tests do not count toward coverage.
- Each `ATxxx` code has at least one positive and one negative test.
- Snapshot of the generated `registry.ts` for each fixture, because codegen changes must be deliberate.
- Performance budget:
  - `generate` on a 500-file app takes less than 1.5 s cold (without TS) and less than 4 s with the JSDoc path;
  - in watch mode, the incremental time is under 300 ms;
  - the client bundle of `Registrar` + `Confirm` is under 4 KB gzip (without the polyfill).
- No test depends on the network or on LLMs. The agent evals are the exception, and they run in a manual or nightly job.

## How to run (once the code exists)

```bash
pnpm test                 # unit
pnpm test:integration     # next build over fixtures
pnpm test:e2e             # Playwright + polyfill
pnpm test:e2e:native      # agent-browser + Chrome WebMCP (requires a compatible Chrome)
pnpm bench                # agent evals (requires AI_GATEWAY_API_KEY)
```

## Demo and benchmark

### Change from the original plan

The original plan proposed a demo on Vercel Shop. **Dropped:** `vercel/shop` already registers WebMCP tools through Shopify/Hydrogen (`shopify.webmcp.isEnabled`). Shopify exposes `search_catalog`, `get_cart`, `update_cart`, and others in all its stores. See [research.md](research.md#shopify). A commerce demo would show something that already exists.

The open space is custom apps (SaaS, dashboards, internal tools). No platform gives them tools, and their actions are already Server Functions.

### Demo app: fork of `nextjs/saas-starter`

- MIT license, 16.3k stars. It is the reference SaaS template in the Next.js ecosystem: auth, teams, roles, Stripe.
- Its actions (`app/(login)/actions.ts`) use `validatedAction` / `validatedActionWithUser` with Zod and the `(prevState, formData)` signature. This is the most common real-world pattern, so the demo exercises path B (`defineAgentTools` + `fromFormDataAction`).
- Preparatory work:
  - upgrade from `next@15.6.0-canary.59` to Next 16.4 and from `zod@3` to Zod 4 (decision recorded in ADR-009);
  - move the schemas to `lib/schemas.ts` so they can be exported.
  - The full diff is published, because the cost in lines of code is part of the result.
- Fallback if the upgrade proves difficult: a minimal custom app (team tasks) with the same flows.

#### Tools exposed in the demo

| Tool | Original action | Annotations | Confirmation |
|---|---|---|---|
| `team.listMembers` | new `agent()` | readOnly | no |
| `team.inviteMember` | `inviteTeamMember` | consequential | yes |
| `team.removeMember` | `removeTeamMember` | consequential | yes |
| `account.update` | `updateAccount` | consequential | yes (default) |
| `account.delete` | `deleteAccount` | consequential | yes |
| `navigate` | generated | — | no |

### Benchmark: clicks vs WebMCP

#### Question

How much does a real browser agent improve (tokens, time, success rate) when a Next.js app exposes its Server Actions as WebMCP tools, compared with operating the same UI through the accessibility tree?

#### Design

- **Harness:** agent-browser (vercel-labs), which supports WebMCP natively.
  - **Mode A (baseline):** `--no-webmcp` (accessibility tree snapshot + clicks).
  - **Mode B:** WebMCP enabled (`webmcp list/invoke`).
  - Same binary, same Chrome version, and same model. The only variable is WebMCP.
- **Model:** one fixed model via AI Gateway, with a fixed `temperature` if the provider allows it. As a second check, the run is repeated with a second model from another provider.
- **App:** the demo fork, with the database reset to a fixed seed before each run.
- **Tasks (5):**
  1. invite a member with a role;
  2. change the account name;
  3. remove a specific member from a list of 30;
  4. "who are the admins?" (read-only);
  5. a composite task of 3 steps.
- **N = 20 runs per task and mode** (200 in total per model).
- **Metrics:**
  - **Success:** verified **in the database** by a script, not by what the agent says.
  - Input and output tokens.
  - Wall-clock time.
  - Steps: agent-browser commands or tool calls.
  - Unrecoverable errors.
- **Confirmations:** in mode B, the confirmation dialog is auto-accepted with a documented test hook, so human latency is not measured. Mode A has no dialog. If this introduces asymmetry, it is reported.

#### Methodological honesty (required)

- Raw logs, prompts, the seed, the harness commit, and the versions (Chrome, agent-browser, model, Next.js) are published.
- **All** runs are published, including failed ones, with the median and p90, not only the average.
- The known bias is stated: agent-browser announces the tools to the agent, which favors mode B. A real agent with WebMCP would do the same, but the bias must be disclosed.
- The limit is stated: this is one app and 5 tasks. The numbers do not generalize to "WebMCP is N times better."
- As an external reference (not comparable), a third-party benchmark published on X on 2026-11-25 is cited: 8 times fewer tokens and 4 times faster on a CRM with 14 tools.
- The method follows the `webmcp-gen` skill of agent-browser: success, tool calls, latency, and token usage against the accessibility tree fallback, plus one contaminated case.

#### Deliverables

- `bench/README.md` with the steps to reproduce the benchmark.
- `bench/results/<date>/` with the raw JSONL and `summary.md`.
- An SVG chart of median bars with p10–p90 whiskers.
