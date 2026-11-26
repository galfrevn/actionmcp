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

Two runs exist, both through OpenRouter, with 20 runs per task and mode and 200 runs each. Every run is in the `runs.jsonl` of its folder.

| Run | Model | Commit |
|---|---|---|
| [`results/2026-11-26`](results/2026-11-26/summary.md) | `anthropic/claude-sonnet-5.5` | `7cb6bcb` |
| [`results/2026-11-26-deepseek-v4.1-flash`](results/2026-11-26-deepseek-v4.1-flash/summary.md) | `deepseek/deepseek-v4.1-flash-1017` | `27a6706` |

### `anthropic/claude-sonnet-5.5`

| Task | Success, clicks | Success, WebMCP | Median tokens, clicks | Median tokens, WebMCP | Median time, clicks | Median time, WebMCP |
|---|---|---|---|---|---|---|
| `invite-member` | 20/20 | 20/20 | 29,903 | 8,004 | 9.1 s | 4.3 s |
| `rename-account` | 20/20 | 20/20 | 18,339 | 7,973 | 10.8 s | 4.0 s |
| `remove-member` | 20/20 | 20/20 | 17,003 | 14,202 | 5.2 s | 5.6 s |
| `list-owners` | 20/20 | 20/20 | 6,273 | 9,201 | 3.0 s | 3.8 s |
| `composite` | 17/20 | 20/20 | 187,717 | 16,355 | 27.4 s | 7.5 s |

The three failures were all `composite` runs in the clicks mode. In each, the database had no invitation for `sam@example.com`.

### `deepseek/deepseek-v4.1-flash-1017`

| Task | Success, clicks | Success, WebMCP | Median tokens, clicks | Median tokens, WebMCP | Median time, clicks | Median time, WebMCP |
|---|---|---|---|---|---|---|
| `invite-member` | 20/20 | 20/20 | 26,248 | 10,191 | 8.8 s | 10.1 s |
| `rename-account` | 20/20 | 20/20 | 8,271 | 16,486 | 10.5 s | 13.2 s |
| `remove-member` | 20/20 | 20/20 | 13,691 | 14,673 | 8.6 s | 8.8 s |
| `list-owners` | 20/20 | 20/20 | 5,820 | 6,529 | 6.1 s | 5.6 s |
| `composite` | 20/20 | 20/20 | 67,199 | 16,160 | 19.5 s | 9.5 s |

### What the two runs show

For this app and these two models:

- **`composite`.** The WebMCP mode used fewer tokens and less time with both models: 11.5 times fewer tokens and 3.6 times faster with Sonnet, 4.2 times fewer tokens and 2.1 times faster with DeepSeek. Only Sonnet failed in the clicks mode, in 3 of 20 runs.
- **`invite-member`.** The WebMCP mode used fewer tokens with both models: 3.7 times fewer with Sonnet and 2.6 times fewer with DeepSeek. It was faster with Sonnet and slower with DeepSeek.
- **`rename-account`.** The models disagree. With Sonnet the WebMCP mode used 2.3 times fewer tokens. With DeepSeek it used 2.0 times more.
- **`remove-member`.** The two modes were close with both models, within 1.2 times in tokens.
- **`list-owners`.** The clicks mode used fewer tokens with both models. One page snapshot answers the question, while the WebMCP mode lists the tools first and then calls one.

The two runs agree on the multi-step task and on the read-only task. They do not support a general claim that the WebMCP mode is cheaper for a single-step mutation.

Read these numbers with the limits in each summary. During both runs the machine also ran other light commands, which can affect the times but not the token counts.

## Rules for publishing results

- Publish `runs.jsonl` with every run, including the failed ones.
- Report the median and the p90, not only the average.
- State the known bias: agent-browser announces the page tools to the agent, which favors the `webmcp` mode.
- State the limit: one app and five tasks do not generalize to other apps.
- Repeat the run with a second model from another provider before you draw a conclusion.
