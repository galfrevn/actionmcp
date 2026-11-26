# Benchmark: clicks vs WebMCP

This harness measures how a browser agent performs on the same Next.js app in two modes: operating the UI through the accessibility tree, and calling the WebMCP tools that actionmcp registers.

The harness and the demo app are in this folder. A run needs a model key.

## What it runs

- **App:** `bench/app`, a team and account app with a JSON file as its database. The seed has 30 members and is the same before every run.
- **Harness:** [agent-browser](https://github.com/vercel-labs/agent-browser) 0.44.0, the same binary in both modes.
  - `clicks`: agent-browser runs with `--no-webmcp`. The agent has `snapshot`, `open`, `click`, `fill`, `select`, and `press`.
  - `webmcp`: the agent has the same tools plus `webmcp_list` and `webmcp_invoke`.
- **Model:** one model through the Vercel AI Gateway, with `temperature: 0`.
- **Tasks:** the five tasks in `lib/tasks.ts`.
- **Success:** each task has a verifier that reads the database after the run. The agent's answer decides only the read-only task, where the verifier compares it with the owners in the database.

| Tool | Action | Annotations |
|---|---|---|
| `team.listMembers` | `listMembers` (`agent()`) | read-only, untrusted output |
| `team.inviteMember` | `inviteTeamMember` | consequential |
| `team.removeMember` | `removeTeamMember` | consequential |
| `account.update` | `updateAccount` | consequential |
| `account.delete` | `deleteAccount` | consequential |
| `navigate` | generated | none |

## Run

```bash
pnpm install
pnpm --filter actionmcp build
pnpm --filter bench-app build
pnpm --filter actionmcp-bench exec agent-browser install
```

Check the harness without a model. The smoke script performs each task with scripted WebMCP calls and runs the verifiers:

```bash
pnpm bench:smoke
```

Run the benchmark. It needs `AI_GATEWAY_API_KEY`, from the environment or from `bench/.env.local`, which git ignores:

```bash
echo 'AI_GATEWAY_API_KEY=your-key' > bench/.env.local
pnpm bench -- --model anthropic/claude-sonnet-5.5 --runs 20
pnpm --filter actionmcp-bench summarize bench/results/<date>
```

`run.ts` appends one JSON line per run to `bench/results/<date>/runs.jsonl`. The first line records the model, the harness commit, and the versions of Node.js, agent-browser, and Next.js. `summarize.ts` writes `summary.md` and `chart.svg` next to it.

Options: `--model`, `--runs`, `--tasks invite-member,composite`, `--modes clicks,webmcp`, and `--out <directory>`.

## Confirmations

The confirmation dialog needs a human click, so a benchmark run cannot pass it. `bench/app` reads `BENCH_AUTO_CONFIRM=1` and then mounts an `AgentToolsProvider` whose `confirmComponent` accepts every confirmation. The harness sets the variable. Do not copy this into an app that real users open.

The `clicks` mode shows no dialog, because the UI forms call the actions directly. This asymmetry is part of the result and must be reported with it.

## Rules for publishing results

- Publish `runs.jsonl` with every run, including the failed ones.
- Report the median and the p90, not only the average.
- State the known bias: agent-browser announces the page tools to the agent, which favors the `webmcp` mode.
- State the limit: one app and five tasks do not generalize to other apps.
- Repeat the run with a second model from another provider before you draw a conclusion.
