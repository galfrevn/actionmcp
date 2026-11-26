# FormData example

A team page whose existing `useActionState` actions become WebMCP tools without any change to the actions (path B).

The actions keep their `(previousState, formData)` signature. `agent-tools.ts` lists them with `defineAgentTools()` and `fromFormDataAction()`. The browser builds a `FormData` from the agent's input and calls the same Server Function that the form calls.

| Tool | Action | Confirmation |
|---|---|---|
| `team.inviteMember` | `inviteMember` | yes |
| `team.removeMember` | `removeMember` | yes |

## Run

```bash
pnpm install
pnpm --filter actionmcp build
pnpm --filter example-formdata dev
```

Open http://localhost:3000 and select "Sign in as demo". Select "Agent tools" in the bottom right corner to list and run the tools. The panel renders only in development.

## Why the schemas live in `lib/schemas.ts`

A `'use server'` file can export only async functions, so another module cannot import a schema that is declared in it. The schemas are in `lib/schemas.ts`. The actions and `agent-tools.ts` import the same objects, so the tool schema and the validation cannot drift apart.

## Files

- `app/actions.ts`: the two actions, unchanged from a regular `useActionState` setup.
- `agent-tools.ts`: the explicit registry. `withAgentTools()` finds it by its name.
- `app/invite-form.tsx`: the form that uses `inviteMember` through `useActionState`.
