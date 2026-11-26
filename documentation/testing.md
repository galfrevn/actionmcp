# Testing

## Test pyramid

| Level | Tool | What it covers | Where |
|---|---|---|---|
| Unit | Vitest (Node and jsdom) | `core/` (names, schema, results, execution, the WebMCP layer against the real polyfill), `server/` (`agent()`, registry, adapters), `analyzer/` (scan, types, routes, diagnostics), `generator/`, `cli/`, and the React components | `packages/actionmcp/src/**/*.test.ts(x)` |
| Integration | Vitest + real `next build` | Every fixture builds with Turbopack and with webpack, the registry matches its snapshot, the alias resolves, the prerendered RSC payload contains the definitions, the build adds no routes, and server-only code is absent from the client bundles. An `AT0xx` error aborts the build. | `tests/integration` |
| Package | Vitest + `pnpm pack` + npm | The packed tarball installs in a project outside the workspace, the CLI runs, the app builds, and the server returns the definitions. Needs the network. | `tests/package` |
| E2E (polyfill) | Playwright (Chromium) + `@w3c/webmcp-polyfill` | `getTools()` lists the right tools per route; `executeTool()` calls the action; the UI revalidates; confirmation blocks execution; tools unregister on navigation; the examples and the chat loop work | `e2e/specs/*.spec.ts`, project `polyfill` |
| E2E (native) | Playwright (Chromium with `--enable-features=WebMCP`) | The same specs with Chromium's native implementation | `e2e/specs/*.spec.ts`, project `native` |
| Manual | ChatGPT Desktop (built-in browser) | Real discovery and execution, behavior with `consequentialHint`, and ChatGPT's own confirmation. Not run yet. | checklist in `e2e/manual/chatgpt.md` |
| Agent evals | agent-browser + model via AI Gateway | End-to-end tasks: success rate, tokens, and time ([benchmark](#demo-and-benchmark)). `bench/smoke.ts` checks the harness without a model. | `bench/` |

## Fixtures (minimal Next apps)

| Fixture | Path | Cases |
|---|---|---|
| `fixtures/basic` | A (`agent()`) | Read-only tool, consequential tool, validation error, auth error, output schema, `revalidatePath` reflects the change in the UI, origin trial `<meta>`, devtools in development |
| `fixtures/formdata` | B + `fromFormDataAction` and `fromFormAction` | `(prevState, formData)` and `(formData)` signatures, arrays, booleans, `ActionState` return with `error`, the same action used by a form |
| `fixtures/safe-action` | B + `fromSafeAction` | `serverError`, `validationErrors`, `data` |
| `fixtures/jsdoc` | C (experimental, opt-in) | Optional fields, enums, unions, per-property JSDoc; `AT102`; an untagged export stays private |
| `fixtures/scoped` | Scope by route | `<AgentTools include>` in the layouts of `/a` and `/b`; navigating between routes changes `getTools()` and emits `toolchange`; a nested page keeps the registration |
| `fixtures/navigate` | `navigate` tool | Static and dynamic routes, route groups; slots, intercepted routes, private folders, and handlers are excluded; `routes` globs and `prefix` |
| `fixtures/redirect` | Action that calls `redirect()` | The tool returns `navigatedTo` from the root layout and from a segment that unmounts |
| `fixtures/hostile` | Security | Output with injected instructions; the confirmation blocks execution; one RPC request per call; no new endpoints |
| `fixtures/coexist` | Coexistence | A tool registered with `use-webmcp-tool`, hand-registered tools named like the UI SDK and Next.js devtools tools, and an app-installed polyfill. A name that is taken gets the `_2` suffix. The fixture does not install the UI SDK itself. |

## Compatibility matrix

| Dimension | What CI runs |
|---|---|
| Next.js and React | Integration on 16.4.6 with React 19.3.1 and on 16.2.12 with React 19.2.9. End-to-end on 16.4.6. A nightly, non-blocking job on `canary`. |
| Bundler | Turbopack and webpack (`next build --webpack`) for every fixture |
| Validators | Unit tests with Zod 4.6, Valibot 1.5 with `@valibot/to-json-schema` 1.8, and ArkType 2.2 |
| TypeScript | The analyzer uses its own TypeScript 6.0. The fixtures compile with 6.0. **Unverified**: a project on TypeScript 5.9 or 7.0. |
| Node | 22 and 24 for unit tests. The scripts in `bench/` need Node 22.18 or later, for type stripping. |
| E2E browser | Chromium with the polyfill, and Chromium with native WebMCP |

Next.js 15.5 is out of scope for v0.1. Next.js 16.2.12 with React 19.2.9 was also checked by hand on 2026-11-26 from the packed tarball, with the polyfill and with native WebMCP.

## Quality criteria

- Minimum 85% coverage in `core/`, `server/`, and `generator/`, enforced by the Vitest thresholds. E2E tests do not count toward coverage.
- Each `ATxxx` code has at least one positive and one negative test.
- Snapshot of the generated `registry.ts` for each fixture in `tests/integration/__snapshots__`, because codegen changes must be deliberate.
- Performance budget, enforced by tests:
  - `generate` on a 500-file app takes less than 1.5 s cold (without TS) and less than 4 s with the JSDoc path (`src/generator/performance.test.ts`). On an Apple M-series laptop on 2026-11-26 the measured times were about 120 ms and 550 ms;
  - in watch mode, the incremental time is under 300 ms (`src/generator/watch.test.ts`);
  - the client bundle of `Registrar` + `Confirm` is under 4 KB gzip without the polyfill (`src/react/bundle-size.test.ts`). It measured 3,072 bytes on 2026-11-26.
- No unit, integration, or end-to-end test depends on the network or on LLMs. The package test and the agent evals are the exceptions.

## How to run

```bash
pnpm build                # build the package first; the apps import its dist folder
pnpm test                 # unit, with coverage thresholds
pnpm test:integration     # next build over fixtures, both bundlers
pnpm build:fixtures && pnpm build:examples
pnpm test:e2e             # Playwright with the polyfill
pnpm test:e2e:native      # Playwright with Chromium's native WebMCP
pnpm test:package         # packed tarball in an npm project (needs the network)
pnpm bench:smoke          # benchmark harness without a model
pnpm bench                # agent evals (requires AI_GATEWAY_API_KEY)
```

## Demo and benchmark

### Change from the original plan

The original plan proposed a demo on Vercel Shop. **Dropped:** `vercel/shop` already registers WebMCP tools through Shopify/Hydrogen (`shopify.webmcp.isEnabled`). Shopify exposes `search_catalog`, `get_cart`, `update_cart`, and others in all its stores. See [research.md](research.md#shopify). A commerce demo would show something that already exists.

The open space is custom apps (SaaS, dashboards, internal tools). No platform gives them tools, and their actions are already Server Functions.

### Demo app in this repository

The demo that ships today is `bench/app`: the fallback from [ADR-009](decisions.md#adr-009-the-demo-is-a-saas-app-not-a-commerce-app), a minimal team and account app with the same five tools and a JSON file as its database. The fork described below is still planned.

### Planned demo app: fork of `nextjs/saas-starter`

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

- **Status:** the harness is in `bench/` and `bench/smoke.ts` passes. No model run has been done, so there are no results.
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
