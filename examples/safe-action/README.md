# next-safe-action example

A profile page whose `next-safe-action` action becomes a WebMCP tool with `fromSafeAction()`.

The adapter unwraps the result of the action:

| next-safe-action result | Tool result |
|---|---|
| `{ data }` | `{ ok: true, data }` |
| `{ validationErrors }` | `{ ok: false, error: { code: 'invalid_input', issues } }` |
| `{ serverError }` | `{ ok: false, error: { code: 'failed', message } }` |

## Run

```bash
pnpm install
pnpm --filter actionmcp build
pnpm --filter example-safe-action dev
```

Open http://localhost:3000 and select "Sign in as demo". Select "Agent tools" in the bottom right corner to list and run the tools. The panel renders only in development.

In the devtools panel, run `profile.update` with `{"displayName": "a"}` to see the validation issues, and with `{"displayName": "admin"}` to see the server error.

## Files

- `lib/safe-action.ts`: the action client, with a middleware that requires a session.
- `app/actions.ts`: the action. It is not changed for actionmcp.
- `lib/schemas.ts`: the schema, in a regular module so `agent-tools.ts` can import it.
- `agent-tools.ts`: the explicit registry.
