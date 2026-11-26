# Benchmark: clicks vs WebMCP

This harness measures how a browser agent performs on the same Next.js app in two modes: operating the UI through the accessibility tree, and calling the WebMCP tools that actionmcp registers.

The harness and the demo app are in this folder. A run needs a model key.

## What it runs

- **App:** `bench/app`, a team and account app with a JSON file as its database. The seed has 30 members and is the same before every run.
- **Harness:** [agent-browser](https://github.com/vercel-labs/agent-browser) 0.44.0, the same binary in both modes.
  - `clicks`: agent-browser runs with `--no-webmcp`. The agent has `snapshot`, `open`, `click`, `fill`, `select`, and `press`.
  - `webmcp`: the agent has the same tools plus `webmcp_list` and `webmcp_invoke`. `webmcp_list` returns the name, the description, the input schema, and the annotations of each tool. `webmcp_invoke` returns the output of the tool. The harness removes the frame, origin, and process fields that agent-browser adds to both answers, because they do not come from the page.
  - Every tool answer is cut at 8,000 characters in both modes.
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

`run.ts` appends one JSON line per run to `bench/results/<date>/runs.jsonl`. The first line records the model, the provider, the harness commit, whether `bench/` or the package source had uncommitted changes, and the versions of Node.js, agent-browser, and Next.js. `summarize.ts` writes `summary.md` and `chart.svg` next to it.

Options: `--model`, `--runs`, `--tasks invite-member,composite`, `--modes clicks,webmcp`, and `--out <directory>`.

Two runs can share one machine. Each run needs its own copy of the built app, because the database is a file inside the app folder, and its own port:

```bash
cp -R bench/app bench/app-second
BENCH_APP_DIRECTORY="$PWD/bench/app-second" BENCH_PORT=4401 pnpm bench --model anthropic/claude-haiku-5.5 --out "$PWD/bench/results/<name>"
```

Runs that share a machine can affect each other's times. Report it with the results.

## Confirmations

The confirmation dialog needs a human click, so a benchmark run cannot pass it. `bench/app` reads `BENCH_AUTO_CONFIRM=1` and then mounts an `AgentToolsProvider` whose `confirmComponent` accepts every confirmation. The harness sets the variable. Do not copy this into an app that real users open.

The `clicks` mode shows no dialog, because the UI forms call the actions directly. This asymmetry is part of the result and must be reported with it.

## Results

Four runs exist, all through OpenRouter, with 20 runs per task and mode and 200 runs each. Every run is in the `runs.jsonl` of its folder.

| Run | Model | Commit | Harness |
|---|---|---|---|
| [`results/2026-11-26-claude-sonnet-5.5`](results/2026-11-26-claude-sonnet-5.5/summary.md) | `anthropic/claude-sonnet-5.5` | `7e85da9` | current |
| [`results/2026-11-26-claude-haiku-5.5`](results/2026-11-26-claude-haiku-5.5/summary.md) | `anthropic/claude-haiku-5.5` | `cba8b40` | current |
| [`results/2026-11-26`](results/2026-11-26/summary.md) | `anthropic/claude-sonnet-5.5` | `7cb6bcb` | earlier |
| [`results/2026-11-26-deepseek-v4.1-flash`](results/2026-11-26-deepseek-v4.1-flash/summary.md) | `deepseek/deepseek-v4.1-flash-1017` | `27a6706` | earlier |

The earlier harness started every browser command through `pnpm exec`, which added about 0.3 s to each tool call in both modes. It also passed the whole answer of agent-browser to the model in the WebMCP mode, with the frame, origin, and process fields. Do not compare the times of an earlier run, or its WebMCP token counts, with a current run.

### `anthropic/claude-sonnet-5.5`, current harness

| Task | Success, clicks | Success, WebMCP | Median tokens, clicks | Median tokens, WebMCP | Median time, clicks | Median time, WebMCP |
|---|---|---|---|---|---|---|
| `invite-member` | 20/20 | 20/20 | 29,870 | 6,949 | 7.7 s | 3.6 s |
| `rename-account` | 20/20 | 20/20 | 9,331 | 6,904 | 6.1 s | 3.4 s |
| `remove-member` | 20/20 | 20/20 | 17,013 | 12,224 | 4.5 s | 5.0 s |
| `list-owners` | 20/20 | 20/20 | 6,273 | 8,122 | 2.6 s | 3.4 s |
| `composite` | 19/20 | 20/20 | 212,401 | 13,479 | 25.3 s | 6.6 s |

The failure was a `composite` run in the clicks mode. The database had no invitation for `sam@example.com`, and the agent reported that it could not confirm the invitation.

### `anthropic/claude-haiku-5.5`, current harness

| Task | Success, clicks | Success, WebMCP | Median tokens, clicks | Median tokens, WebMCP | Median time, clicks | Median time, WebMCP |
|---|---|---|---|---|---|---|
| `invite-member` | 20/20 | 20/20 | 44,338 | 6,994 | 7.4 s | 3.2 s |
| `rename-account` | 19/20 | 20/20 | 14,178 | 6,906 | 6.7 s | 3.0 s |
| `remove-member` | 20/20 | 20/20 | 25,897 | 12,275 | 5.4 s | 4.3 s |
| `list-owners` | 20/20 | 20/20 | 5,263 | 9,325 | 2.1 s | 3.5 s |
| `composite` | 20/20 | 20/20 | 200,641 | 13,419 | 17.9 s | 5.8 s |

The failure was a `rename-account` run in the clicks mode. It was a failure of the harness and not of the agent: the browser commands returned "Resource temporarily unavailable (os error 35)", and the agent stopped after five tool calls.

### `anthropic/claude-sonnet-5.5`, earlier harness

| Task | Success, clicks | Success, WebMCP | Median tokens, clicks | Median tokens, WebMCP | Median time, clicks | Median time, WebMCP |
|---|---|---|---|---|---|---|
| `invite-member` | 20/20 | 20/20 | 29,903 | 8,004 | 9.1 s | 4.3 s |
| `rename-account` | 20/20 | 20/20 | 18,339 | 7,973 | 10.8 s | 4.0 s |
| `remove-member` | 20/20 | 20/20 | 17,003 | 14,202 | 5.2 s | 5.6 s |
| `list-owners` | 20/20 | 20/20 | 6,273 | 9,201 | 3.0 s | 3.8 s |
| `composite` | 17/20 | 20/20 | 187,717 | 16,355 | 27.4 s | 7.5 s |

The three failures were all `composite` runs in the clicks mode. In each, the database had no invitation for `sam@example.com`.

### `deepseek/deepseek-v4.1-flash-1017`, earlier harness

| Task | Success, clicks | Success, WebMCP | Median tokens, clicks | Median tokens, WebMCP | Median time, clicks | Median time, WebMCP |
|---|---|---|---|---|---|---|
| `invite-member` | 20/20 | 20/20 | 26,248 | 10,191 | 8.8 s | 10.1 s |
| `rename-account` | 20/20 | 20/20 | 8,271 | 16,486 | 10.5 s | 13.2 s |
| `remove-member` | 20/20 | 20/20 | 13,691 | 14,673 | 8.6 s | 8.8 s |
| `list-owners` | 20/20 | 20/20 | 5,820 | 6,529 | 6.1 s | 5.6 s |
| `composite` | 20/20 | 20/20 | 67,199 | 16,160 | 19.5 s | 9.5 s |

### What the runs show

For this app and these three models:

- **`composite`.** The WebMCP mode used fewer tokens and less time in all four runs. With the current harness it used 15.8 times fewer tokens and was 3.8 times faster with Sonnet, and it used 15.0 times fewer tokens and was 3.1 times faster with Haiku. With the earlier harness the difference in tokens was 11.5 times with Sonnet and 4.2 times with DeepSeek. The only failures of an agent were in the clicks mode of this task, in 4 of the 40 runs with Sonnet.
- **`invite-member`.** The WebMCP mode used fewer tokens in all four runs: 4.3 times fewer with Sonnet and 6.3 times fewer with Haiku on the current harness, and 3.7 times and 2.6 times fewer on the earlier one. It was faster in three runs and slower with DeepSeek.
- **`rename-account` and `remove-member`.** The WebMCP mode used fewer tokens in three of the four runs, by 1.2 to 2.3 times. With DeepSeek it used 2.0 times more on `rename-account` and 1.1 times more on `remove-member`. On `remove-member` the times were within 1.3 times in every run.
- **`list-owners`.** The clicks mode used fewer tokens in all four runs, by 1.1 to 1.8 times. One page snapshot answers the question, while the WebMCP mode lists the tools first and then calls one.

Between the two Sonnet runs, the median tokens of the WebMCP mode fell by 12% to 18% on every task, and its median time fell by 0.4 s to 0.9 s. The clicks mode also changed between those runs on `rename-account`, from a median of 11 tool calls to 6, with no change to its tools.

The four runs agree on the multi-step task, on the invitation task, and on the read-only task. They do not support a general claim that the WebMCP mode is cheaper for every single-step mutation.

Read these numbers with the limits in each summary, and with these:

- The two runs on the current harness use models from one provider. The run with a model from another provider used the earlier harness.
- The Haiku run started while the Sonnet run was on its second task, and the two ran at the same time on one machine from then on. This can affect the times but not the token counts. The Haiku run had the one harness failure.
- During the two earlier runs the machine also ran other light commands.

## Rules for publishing results

- Publish `runs.jsonl` with every run, including the failed ones.
- Report the median and the p90, not only the average.
- State the known bias: agent-browser announces the page tools to the agent, which favors the `webmcp` mode.
- State the limit: one app and five tasks do not generalize to other apps.
- Repeat the run with a second model from another provider before you draw a conclusion.
