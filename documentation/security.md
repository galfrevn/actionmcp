# Security

A Server Function is already a public endpoint: Next.js states that it "can still be called externally". actionmcp does not change that. What changes is the caller. An agent that holds the user's session can now find the function by name and call it, and third-party content can manipulate that agent.

The guiding principle: exposing a Server Function as a tool must not add attack surface on the server, and it must reduce client-side risk with conservative defaults.

## What actionmcp does

| Default | Effect |
|---|---|
| Opt-in only | A function is a tool only if it is wrapped in `agent()`, listed with `tool()` in `defineAgentTools()`, or tagged with `@agent`. There is no mode that exposes every action. |
| Consequential by default | A tool is marked with `consequentialHint` unless you set `readOnly: true`. |
| Human confirmation | Before a consequential tool runs, the page shows a dialog with the tool name, the description, and each field of the input. The action runs only after a click on "Allow". No tool can answer the dialog. |
| Native RPC only | A tool call is the same POST that your UI sends: the encrypted action ID, the `Origin` check, and the user's cookies. actionmcp adds no endpoint and holds no credentials. |
| Server-side input validation | `agent()` validates the input with your schema before the handler runs. |
| Literal metadata | The `name` and the `description` of a tool must be string literals in your source code. The build stops otherwise. The check does not cover the field descriptions and titles inside a schema. |
| Quiet errors | An unexpected error in an `agent()` handler returns a generic message in production and is logged on the server. Validation issues contain a message and a path, and no stack trace. An output that does not match its schema is logged on the server with the same two fields, without the values. |
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
- [ ] The field descriptions and titles in the schemas are literals in your source code, not values from a database or a request.
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
- It lists every field of the input with its value, rendered as text. A field label comes from the `title` in your input schema, never from the call.
- `confirmLabels` on `AgentToolsProvider` translates the text of the dialog.
- A cancel, Escape, or a layout that unmounts returns `{ ok: false, error: { code: 'declined' } }` to the agent. The action does not run.
- Calls queue behind one dialog. Each call needs its own click.
- You can replace the dialog with `confirmComponent` on `AgentToolsProvider`, and add your own gate with `onBeforeExecute`. A gate that throws blocks the call.

An agent that controls the pointer could click the dialog like a person would. The dialog protects against calls through the tools API, which is the channel that actionmcp adds.

## Untrusted output

Set `untrustedOutput: true` on a tool whose result can contain user-generated or third-party content. It maps to `untrustedContentHint`, which tells the agent not to follow instructions found in the result. Return structured values instead of HTML or long free text where you can.

## Actions that run unchanged

With `defineAgentTools()` and with `@agent`, actionmcp calls your action as it is. The action must validate its own input, and an `output` schema only describes the result. `actionmcp doctor` reports `AT102` for an `@agent` function without detectable validation.

## Threat model

| # | Threat | Vector | Mitigation |
|---|---|---|---|
| T1 | Prompt injection toward the agent | User-generated content in tool outputs that the agent reads as instructions | `untrustedOutput` marks the result. `AT106` flags an output schema with free strings and no flag. Human confirmation for consequential tools. |
| T2 | Unwanted consequential actions | The agent misreads the intent or is induced to run something | Consequential by default. An in-page dialog that the tools API cannot answer. `AT103` for `confirm: 'never'`. |
| T3 | Misrepresentation of intent | A description that hides what the tool does | Descriptions say what the tool does, its side effects, and what it returns. `AT108` flags short descriptions. There is no technical guarantee. |
| T4 | Privilege escalation | The tool runs with more permissions than the user | Not possible by design: the tool calls the action from the user's browser, with its cookies, through the standard RPC. There is no service token and no custom endpoint. |
| T5 | Missing authorization in the action | The action trusts IDs in its input | The action's responsibility. `AT105` flags a handler without a call to a configured auth function. |
| T6 | Cross-site requests | Another site forces the call | The `Origin` check of Server Functions applies. `exposedTo` applies only if you set it. |
| T7 | Accidental exposure | An internal action ends up as a tool | Opt-in only. `inspect` and `manifest.json` show the full list. A registry file that cannot be read statically is an error (`AT007`). An `agent()` call that the analyzer cannot register is reported (`AT109`). The `navigate` tool rejects `.` and `..` path segments, so a call cannot reach a route outside its list. |
| T8 | Over-parameterization | Tools ask for personal data that the agent fills in from its context | Request only identifiers and domain values. `AT107` flags unused personal fields. |
| T9 | Sensitive data in the output | The action returns full database records | `agent()` validates the return value against the `output` schema and returns the validated value, so a validator that strips unknown keys removes undeclared fields. |
| T10 | Quota abuse | An agent in a loop calls an expensive tool | Rate limiting inside the action. actionmcp does not limit calls. |
| T11 | Injection through tool metadata | Descriptions or schemas built from untrusted content | The `name` and the `description` of a tool come only from source code. One that is not a literal is an error (`AT001`, `AT005`) and stops the build. actionmcp does not check the schemas: the field descriptions and titles come from your validator when the app renders. Keep them literal too, because the agent reads them and the confirmation dialog shows the titles. |
| T12 | The polyfill as a false sense of coverage | A developer believes that native agents see the polyfill's tools | The devtools panel shows "native" or "polyfill". Native agents do not see tools that the polyfill registers. |

## How this is tested

- `fixtures/hostile` and `e2e/specs/hostile.spec.ts`: a tool whose output contains injected instructions is marked untrusted; a consequential tool called after reading it does not resolve until a human clicks; queued calls show one dialog and none runs without a click; no registered tool can answer the confirmation; one tool call produces one POST to the page URL with a `next-action` header.
- `tests/integration/fixtures.test.ts`: the build adds no routes, and validators, the registry, and the analyzer are absent from the client bundles.
- `src/core/execute.test.ts` and `src/react/Registrar.dom.test.tsx`: the action does not run before the confirmation settles.

## Reporting a vulnerability

Report it privately. See [SECURITY.md](../SECURITY.md).

## References

- The "Security and privacy considerations" section of the [WebMCP draft](https://webmachinelearning.github.io/webmcp/).
- [Data security](https://nextjs.org/docs/app/guides/data-security) in the Next.js documentation.
