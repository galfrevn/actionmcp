# Benchmark: clicks vs WebMCP

This harness measures how a browser agent performs on the same Next.js app in two modes: operating the UI through the accessibility tree, and calling the WebMCP tools that actionmcp registers.

The harness and the demo app are in this folder. A run needs a model key.

## What it runs

- **App:** `bench/app`, a team and account app with a JSON file as its database. The seed has 30 members and is the same before every run.
- **Harness:** [agent-browser](https://github.com/vercel-labs/agent-browser) 0.44.0, the same binary in both modes.
  - `clicks`: agent-browser runs with `--no-webmcp`. The agent has `snapshot`, `open`, `click`, `fill`, `select`, and `press`.
  - `webmcp`: the agent has the same tools plus `webmcp_list` and `webmcp_invoke`.
- **Model:** one model through OpenRouter or the Vercel AI Gateway, with `temperature: 0`. Both use the same model identifiers, such as `anthropic/claude-sonnet-5.5`.
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

Run the benchmark. It needs `OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY`, from the environment or from a `.env` or `.env.local` file in `bench/` or in the repository root. Git ignores those files. If both keys are set, OpenRouter is used:

```bash
echo 'OPENROUTER_API_KEY=your-key' > .env
pnpm bench --model anthropic/claude-sonnet-5.5 --runs 20
pnpm --filter actionmcp-bench summarize bench/results/<date>
```

`run.ts` appends one JSON line per run to `bench/results/<date>/runs.jsonl`. The first line records the model, the provider, the harness commit, and the versions of Node.js, agent-browser, and Next.js. `summarize.ts` writes `summary.md` and `chart.svg` next to it.

Options: `--model`, `--runs`, `--tasks invite-member,composite`, `--modes clicks,webmcp`, and `--out <directory>`.

## Confirmations

The confirmation dialog needs a human click, so a benchmark run cannot pass it. `bench/app` reads `BENCH_AUTO_CONFIRM=1` and then mounts an `AgentToolsProvider` whose `confirmComponent` accepts every confirmation. The harness sets the variable. Do not copy this into an app that real users open.

The `clicks` mode shows no dialog, because the UI forms call the actions directly. This asymmetry is part of the result and must be reported with it.

## Results

One run exists so far: [`results/2026-11-26`](results/2026-11-26/summary.md), with `anthropic/claude-sonnet-5.5` through OpenRouter, 20 runs per task and mode, 200 runs in total. The raw log is [`runs.jsonl`](results/2026-11-26/runs.jsonl).

| Task | Success, clicks | Success, WebMCP | Median tokens, clicks | Median tokens, WebMCP | Median time, clicks | Median time, WebMCP |
|---|---|---|---|---|---|---|
| `invite-member` | 20/20 | 20/20 | 29,903 | 8,004 | 9.1 s | 4.3 s |
| `rename-account` | 20/20 | 20/20 | 18,339 | 7,973 | 10.8 s | 4.0 s |
| `remove-member` | 20/20 | 20/20 | 17,003 | 14,202 | 5.2 s | 5.6 s |
| `list-owners` | 20/20 | 20/20 | 6,273 | 9,201 | 3.0 s | 3.8 s |
| `composite` | 17/20 | 20/20 | 187,717 | 16,355 | 27.4 s | 7.5 s |

What the run shows, for this app and this model:

- On the two single-step mutations and on the composite task, the WebMCP mode used between 2.3 and 11.5 times fewer tokens and was between 2.1 and 3.6 times faster at the median.
- On `remove-member` the two modes were close: 1.2 times fewer tokens with WebMCP, and a slightly longer median time.
- On the read-only task `list-owners`, the clicks mode was cheaper and faster. One page snapshot answers the question, while the WebMCP mode lists the tools first and then calls one.
- The three failures were all `composite` runs in the clicks mode. In each, the database had no invitation for `sam@example.com`.

Read these numbers with the limits below. The run has not been repeated with a second model, and the machine also ran other light commands during the run, which can affect the times but not the token counts.

## Rules for publishing results

- Publish `runs.jsonl` with every run, including the failed ones.
- Report the median and the p90, not only the average.
- State the known bias: agent-browser announces the page tools to the agent, which favors the `webmcp` mode.
- State the limit: one app and five tasks do not generalize to other apps.
- Repeat the run with a second model from another provider before you draw a conclusion.
