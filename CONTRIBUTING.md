# Contributing

Contributions to the code, the tests, and the documentation are welcome.

## Ways to help

- **Report a bug or propose a feature.** Use the issue forms. For a bug, include the output of `npx actionmcp doctor`.
- **Test with a real agent.** The checklist in [`e2e/manual/chatgpt.md`](e2e/manual/chatgpt.md) covers discovery, confirmation, and navigation. Open an issue with what you find.
- **Run the benchmark.** The harness is in [`bench/`](bench/README.md). It needs a model key. Follow the publishing rules in that README.

Open an issue before you start non-trivial work. In the pull request, link the issue and say what changes and why.

## Development setup

You need Node.js 22.18 or later and pnpm 11.

```bash
pnpm install
pnpm build
pnpm test
```

The package is in `packages/actionmcp`. The fixture and example apps import its `dist` folder, so run `pnpm build` after you change the package and before you run the commands below.

| Command | What it runs |
|---|---|
| `pnpm lint` | oxlint, including the rule that keeps `src/core` free of framework imports |
| `pnpm typecheck` | TypeScript for the package and the end-to-end specs |
| `pnpm test` | Unit tests with coverage thresholds |
| `pnpm test:integration` | `next build` over every fixture, with Turbopack and with webpack |
| `pnpm build:fixtures && pnpm build:examples` | Production builds that the end-to-end tests serve |
| `pnpm test:e2e` | Playwright with the polyfill. Run `pnpm exec playwright install chromium` once. |
| `pnpm test:e2e:native` | Playwright with Chromium's native WebMCP |
| `pnpm test:package` | The packed tarball in an npm project. Needs the network. |
| `pnpm bench:smoke` | The benchmark harness without a model |
| `pnpm bench` | Agent evals. Requires `OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY`. |

The test levels and fixtures are in [testing.md](documentation/testing.md).

### Code conventions

- TypeScript, strict mode, ES modules.
- No comments in source files. Names, types, and tests carry the intent. A decision that needs an explanation goes in the "Design decisions" section of `documentation/architecture.md`.
- `src/core` does not import `next/*`, `react`, or the other layers.
- Every change comes with tests. A new diagnostic code needs one positive and one negative test.
- A change to the generated registry updates the snapshots in `tests/integration/__snapshots__` on purpose: run `pnpm test:integration -u` and review the diff.

## Security-sensitive changes

A change to exposure, confirmation, execution, or schema handling must include security tests. Name the threat from the [threat model](documentation/security.md#threat-model) that the test covers in the pull request description.

## Coding agents

Read [AGENTS.md](AGENTS.md) before you use a coding agent. You are responsible for every line you submit, including code written with an agent. Keep pull requests small, and include tests with each change.

## Commit messages

Write commit messages in the imperative mood, in lowercase, with a Conventional Commits prefix: `feat`, `fix`, `docs`, `test`, `ci`, `build`, or `chore`. Keep each commit to one change. For example: `docs: add security policy`.

## Releasing

Releases are published from GitHub Actions, never from a local machine. The `Release` workflow verifies the code, publishes `actionmcp` to npm with provenance, and creates the GitHub release.

1. Update `version` in `packages/actionmcp/package.json` and add the version to `CHANGELOG.md`. Merge the change to `main`.
2. Push a tag that matches the version:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. Approve the deployment to the `npm` environment when GitHub asks. The workflow then publishes and creates the release.

A version with a hyphen, such as `0.2.0-beta.1`, is published under the `next` dist-tag. Any other version is published under `latest`.

To check a release without publishing, run the workflow by hand with `dry-run` enabled:

```bash
gh workflow run release.yml -f dry-run=true
```

The workflow holds no npm token. It publishes with [trusted publishing](https://docs.npmjs.com/trusted-publishers): npm accepts the OIDC token of the run. The settings of `actionmcp` on npmjs.com must list a trusted publisher with this repository, the workflow file `release.yml`, and the environment `npm`.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

## Writing documentation

This guide applies to every Markdown file in this repository: the README, the files in `documentation/`, issue templates, and release notes. Reviewers can reject a change that breaks it.

The goal is documentation an engineer can trust and skim. Every sentence should either state a fact, give an instruction, or explain a decision.

### Rules

#### Say what is true, and only that

- Describe what exists, in the present tense. Do not document plans, phases, or the history of how something was built.
- Do not state performance numbers, adoption numbers, or compatibility claims without a source or a benchmark in this repository. Link to it.
- If you do not know something, write that you do not know it and what would settle it.

#### Lead with the point

- Put the conclusion or the instruction in the first sentence of a section.
- One idea per paragraph. Paragraphs of one to four sentences.
- Prefer short sentences. Split any sentence that needs more than one comma-separated clause to be understood.
- Use the active voice and name the actor: "The analyzer reads `'use server'` files", not "`'use server'` files are read".

#### Be concrete

- Prefer an example, a file path, an API name, or a number over an adjective.
- Commands must be copy-pasteable. Code blocks must declare a language.
- Put identifiers, file names, commands, and config keys in backticks.

#### Formatting

- Headings in sentence case: "Release process", not "Release Process".
- Use a list only for items that are parallel. Use a table only when readers compare items across the same columns.
- Bold is for a term being defined or for a warning that prevents damage. At most one bold phrase per paragraph.
- No emoji, in headings or in prose. Status markers are words (see above).
- No exclamation marks and no rhetorical questions.
- Use periods and commas instead of chains of em dashes.
- Dates in ISO format: `2026-11-26`. American English spelling.
- Link text describes the target: "see the [documentation index](README.md#documentation)", not "click [here](README.md#documentation)".

#### Do not pad

- No introductions that restate the title, no "Overview" that repeats the next section, no closing summary that repeats the document.
- No "Key takeaways", "In conclusion", or "TL;DR" sections in technical docs. The first paragraph already serves that purpose.
- Do not explain what the reader already knows from the heading.

### Words and phrases to avoid

These words usually signal filler or marketing. Replace them with the concrete claim, or delete them.

| Avoid | Write instead |
|---|---|
| blazing fast, lightning fast, blazingly | the measured number, with a link to the benchmark |
| seamless, seamlessly, effortless, frictionless | describe the actual steps |
| powerful, robust, cutting-edge, state-of-the-art, next-generation, world-class, best-in-class | what it does |
| leverage, utilize, harness | use |
| delve, dive into, deep dive | read, explain, look at |
| comprehensive, holistic, end-to-end (as praise) | list what is covered |
| streamline, supercharge, elevate, empower, unlock, unleash, revolutionize, game-changer | the specific effect |
| simply, just, easily, obviously, of course | delete |
| it's worth noting that, it's important to note that | delete, then state the fact |
| plays a crucial / pivotal / vital role | what it does |
| in today's fast-paced world, in the ever-evolving landscape | delete |
| rich ecosystem, vibrant community | name the projects or people |
| a testament to, navigate the complexities of | delete or rewrite |
| Moreover, Furthermore, Additionally (stacked) | start a new sentence or a new paragraph |

### Checklist before you open a pull request

- [ ] Every claim about speed, size, adoption, or compatibility has a source or a benchmark link.
- [ ] The text describes what exists, not what is planned.
- [ ] No word from the table above appears, unless it is quoted from a source.
- [ ] Relative links and anchors resolve.
- [ ] Code blocks declare a language and run as written.

## Reporting a vulnerability

Report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Code of conduct

Participation is governed by the [code of conduct](CODE_OF_CONDUCT.md).
