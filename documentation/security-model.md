# Security model

A Server Function is already a public endpoint: Next.js states that it "can still be called externally". actionmcp does not change that. What changes is the caller. An agent that holds the user's session can now find the function by name and call it, and third-party content can manipulate that agent.

This page states what actionmcp does about that, and what it leaves to you. The full threat model, T1 to T12, is in [security.md](security.md).

## What actionmcp does

| Default | Effect |
|---|---|
| Opt-in only | A function is a tool only if it is wrapped in `agent()`, listed with `tool()` in `defineAgentTools()`, or tagged with `@agent`. There is no mode that exposes every action. |
| Consequential by default | A tool is marked with `consequentialHint` unless you set `readOnly: true`. |
| Human confirmation | Before a consequential tool runs, the page shows a dialog with the tool name, the description, and the input. The action runs only after a click on "Allow". No tool can answer the dialog. |
| Native RPC only | A tool call is the same POST that your UI sends: the encrypted action ID, the `Origin` check, and the user's cookies. actionmcp adds no endpoint and holds no credentials. |
| Server-side input validation | `agent()` validates the input with your schema before the handler runs. |
| Literal metadata | Descriptions and names must be string literals in your source code. The build stops otherwise. |
| Quiet errors | An unexpected error in an `agent()` handler returns a generic message in production. Validation issues contain a message and a path, and no stack trace. |
| Devtools in development only | `<AgentToolsDevtools />` renders nothing in a production build. |

## What actionmcp does not do

- **Authentication.** Each action must check the session itself. A tool call arrives with the user's cookies, exactly like a call from your UI.
- **Authorization and ownership checks.** An action that trusts an ID from its input lets one user change another user's data. This is the same bug with or without actionmcp.
- **Rate limiting.** An agent in a loop can call a tool many times. Limit expensive actions inside the action.
- **Defending the agent against prompt injection.** actionmcp marks untrusted output and asks a human before consequential actions. It cannot stop an agent from reading a hostile comment.

## Checklist for each tool

- [ ] The action checks the session before it does anything else.
- [ ] The action checks that the signed-in user owns every resource that the input names.
- [ ] The action returns only the fields that the caller needs. With `agent()`, declare an `output` schema to enforce this.
- [ ] `untrustedOutput: true` is set if the output can contain text written by users or third parties.
- [ ] The description says what the tool does, its side effects, and what it returns. An optimistic description misleads the agent and the person who reads the confirmation dialog.
- [ ] The input asks for identifiers and domain values, not for personal data that the handler does not need.
- [ ] `confirm: 'never'` is not set on a consequential tool, unless you have decided to rely on the agent's own confirmation.

`npx actionmcp doctor` checks part of this list with heuristics:

| Code | Check |
|---|---|
| `AT103` | A consequential tool has `confirm: 'never'`. |
| `AT105` | The handler calls none of the configured auth functions. |
| `AT106` | The `output` schema has free-form strings and the tool is not marked `untrustedOutput`. |
| `AT107` | The input has a personal field, such as `email` or `phone`, that the handler does not use. |
| `AT108` | The description is shorter than 20 characters. |

A heuristic can miss a problem and can flag correct code. The checklist is the requirement.

## The confirmation dialog

- It is a native `<dialog>` opened with `showModal()`. The focus starts on "Cancel", so Enter does not approve.
- A cancel, Escape, or a layout that unmounts returns `{ ok: false, error: { code: 'declined' } }` to the agent. The action does not run.
- Calls queue behind one dialog. Each call needs its own click.
- You can replace the dialog with `confirmComponent` on `AgentToolsProvider`, and add your own gate with `onBeforeExecute`.

An agent that controls the pointer could click the dialog like a person would. The dialog protects against calls through the tools API, which is the channel that actionmcp adds.

## Untrusted output

Set `untrustedOutput: true` on a tool whose result can contain user-generated or third-party content. It maps to `untrustedContentHint`, which tells the agent not to follow instructions found in the result. Return structured values instead of HTML or long free text where you can.

## Paths B and C run your action unchanged

With `defineAgentTools()` and with `@agent`, actionmcp calls your action as it is. The action must validate its own input. `actionmcp doctor` reports `AT102` for an `@agent` function without detectable validation.

## Reporting a vulnerability

Report it privately. See [SECURITY.md](../SECURITY.md).

## References

- The "Security and privacy considerations" section of the [WebMCP draft](https://webmachinelearning.github.io/webmcp/).
- [Data security](https://nextjs.org/docs/app/guides/data-security) in the Next.js documentation.
