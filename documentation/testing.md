# Testing

## Test levels

| Level | Tool | What it covers | Where |
|---|---|---|---|
| Unit | Vitest (Node and jsdom) | Names, schemas, results, execution, the WebMCP layer against the real polyfill, `agent()`, the registry and adapters, the analyzer, the generator, the CLI, and the React components | `packages/actionmcp/src/**/*.test.ts(x)` |
| Integration | Vitest + real `next build` | Every fixture builds with Turbopack and with webpack, the registry matches its snapshot, the alias resolves, the prerendered RSC payload contains the definitions, the build adds no routes, and server-only code is absent from the client bundles. An error-level diagnostic aborts the build. | `tests/integration` |
| Package | Vitest + `pnpm pack` + npm | The packed tarball installs in a project outside the workspace, the CLI runs, the app builds, and the server returns the definitions. Needs the network. | `tests/package` |
| End-to-end, polyfill | Playwright (Chromium) + `@w3c/webmcp-polyfill` | `getTools()` lists the right tools per route; `executeTool()` calls the action; the UI revalidates; confirmation blocks execution; tools unregister on navigation; the examples and the chat loop work | `e2e/specs`, project `polyfill` |
| End-to-end, native | Playwright (Chromium with `--enable-features=WebMCP`) | The same specs with Chromium's native WebMCP | `e2e/specs`, project `native` |
| Manual | A browser agent | Discovery and execution by a real agent | `e2e/manual/chatgpt.md` |
| Benchmark | agent-browser + a model | Agent tasks with and without WebMCP | `bench/` |

## Fixtures

Each fixture is a minimal Next.js app in `fixtures/`.

| Fixture | Cases |
|---|---|
| `basic` | `agent()` tools: read-only tool, consequential tool, validation error, auth error, output schema, UI revalidation, origin trial `<meta>`, devtools in development |
| `formdata` | `fromFormDataAction` and `fromFormAction`: both signatures, arrays, booleans, a result with `error`, the same action used by a form |
| `safe-action` | `fromSafeAction`: `serverError`, `validationErrors`, `data` |
| `jsdoc` | `@agent`: optional fields, enums, unions, per-property JSDoc; an untagged export stays private |
| `scoped` | `include`, `exclude`, and `prefix` in segment layouts; navigation changes the tools and emits `toolchange` |
| `navigate` | Static and dynamic routes, route groups, excluded folders, `routes` globs |
| `redirect` | An action that calls `redirect()`, from the root layout and from a segment that unmounts |
| `hostile` | Output with injected instructions; the confirmation blocks execution; one RPC request per call |
| `coexist` | Tools from other libraries on the same page, a taken name, and an app-installed polyfill |

## Compatibility matrix

| Dimension | What CI runs |
|---|---|
| Next.js and React | Integration on 16.4 with React 19.3 and on 16.2 with React 19.2. End-to-end on 16.4. A nightly, non-blocking job on `canary`. |
| Bundler | Turbopack and webpack for every fixture |
| Validators | Zod 4, Valibot with `@valibot/to-json-schema`, and ArkType |
| Node.js | 22 and 24, for the unit tests and for the end-to-end tests |
| Browser | Chromium with the polyfill, and Chromium with native WebMCP |

## Quality criteria

- At least 85% coverage in `core/`, `server/`, and `generator/`, enforced by the Vitest thresholds.
- Each diagnostic code has at least one positive and one negative test.
- A snapshot of the generated `registry.ts` for each fixture, in `tests/integration/__snapshots__`.
- Budgets, enforced by tests:
  - the generator handles a 500-file app in under 1.5 s cold, and in under 4 s with `@agent` tools (`src/generator/performance.test.ts`);
  - in watch mode, a change regenerates in under 300 ms (`src/generator/watch.test.ts`);
  - the client code for registration and confirmation is under 4 KB gzip, without the polyfill (`src/react/bundle-size.test.ts`).
- Unit, integration, and end-to-end tests do not use the network or a model.

## How to run

```bash
pnpm build                # build the package first; the apps import its dist folder
pnpm test                 # unit, with coverage thresholds
pnpm test:integration     # next build over the fixtures, both bundlers
pnpm build:fixtures && pnpm build:examples
pnpm test:e2e             # Playwright with the polyfill
pnpm test:e2e:native      # Playwright with Chromium's native WebMCP
pnpm test:package         # packed tarball in an npm project (needs the network)
pnpm bench:smoke          # benchmark harness without a model
```

Run `pnpm exec playwright install chromium` once before the end-to-end tests.

A change to the generated registry updates the snapshots on purpose: run `pnpm test:integration -u` and review the diff.
