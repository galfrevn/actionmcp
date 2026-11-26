# JSDoc example

Two Server Functions become WebMCP tools with the `@agent` JSDoc tag (path C).

Path C is experimental and opt-in. `next.config.ts` enables it with `withAgentTools({ jsdoc: true })`.

| Tool | Tag | Confirmation |
|---|---|---|
| `searchTasks` | `@agent readonly untrusted-output` | no |
| `task.rename` | `@agent consequential name=task.rename` | yes |

During `generate`, actionmcp infers each input schema from the type of the first parameter. Property descriptions come from the JSDoc of each property.

**actionmcp does not validate the input of a path C tool.** Each action in this example parses its input with Zod. If an action does not validate, `actionmcp doctor` reports `AT102`.

## Run

```bash
pnpm install
pnpm --filter actionmcp build
pnpm --filter example-jsdoc dev
```

Open http://localhost:3000 and select "Sign in as demo". Select "Agent tools" in the bottom right corner to list and run the tools. The panel renders only in development.

Run `pnpm --filter example-jsdoc inspect task.rename` to print the inferred schema.

## Files

- `app/actions.ts`: the two tagged functions and their input types.
- `next.config.ts`: `jsdoc: true`.
