# Contributing

actionmcp is in the design phase. There is no code, test suite, or release yet, so the most useful contributions change the design or test it against the spikes.

## Ways to help now

- **Discuss the design.** Open an issue or a discussion about any part of the [documentation](README.md#documentation). Name the file and the section.
- **Propose a decision change.** Edit the matching record in [`documentation/decisions.md`](documentation/decisions.md). Until the first release, records are updated in place. Explain the trade-off.
- **Run or review a spike.** The S0 spikes in the [roadmap](documentation/roadmap.md#s0--verification-spikes-2-days) check the **Unverified** items. Record each result under [Spike results](documentation/roadmap.md#spike-results) in the format shown there.

Open an issue before you start non-trivial work. In the pull request, link the issue and say what changes and why.

## Development setup

The setup below is available once the code lands. The planned tooling is pnpm, turbo, vitest, Playwright, and oxlint, as listed in [AGENTS.md](AGENTS.md). The planned commands are:

- `pnpm test`: unit tests.
- `pnpm test:integration`: `next build` over the fixtures.
- `pnpm test:e2e`: Playwright with the polyfill.
- `pnpm test:e2e:native`: agent-browser with Chrome's native WebMCP. Requires a compatible Chrome.
- `pnpm bench`: agent evals. Requires `AI_GATEWAY_API_KEY`.

The test levels and fixtures are in [testing.md](documentation/testing.md).

## Security-sensitive changes

A change to exposure, confirmation, execution, or schema handling must include the security tests described in [security.md](documentation/security.md). Name the threat (T1 to T12) that the test covers in the pull request description.

## Coding agents

Read [AGENTS.md](AGENTS.md) before you use a coding agent. You are responsible for every line you submit, including code written with an agent. Keep pull requests small, and include tests with each change.

## Commit messages

Write commit messages in the imperative mood. Conventional Commits prefixes are preferred: `feat`, `fix`, `docs`, and `chore`. For example: `docs: add security policy`.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

## Writing documentation

This guide applies to every Markdown file in this repository: the README, the files in `documentation/`, ADRs, rule docs, issue templates, and release notes. Reviewers can reject a change that breaks it.

The goal is documentation an engineer can trust and skim. Every sentence should either state a fact, give an instruction, or explain a decision.

### Rules

#### Say what is true, and only that

- Describe what exists in the present tense. Describe what does not exist yet as planned, and label it: "Planned for v0.2".
- Do not state performance numbers, adoption numbers, or compatibility claims without a source or a benchmark in this repository. Link to it.
- Mark facts by how well they are checked: **Verified** (checked against the primary source, with date), **Secondary source** (reported by a third party), or **Unverified** (needs checking; say what to check).
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
- [ ] Planned features are labeled as planned.
- [ ] No word from the table above appears, unless it is quoted from a source.
- [ ] Relative links and anchors resolve.
- [ ] Code blocks declare a language and run as written.

## Reporting a vulnerability

### Supported versions

No version is released yet, so no version is supported. After the first release, the planned policy is to support the latest minor version.

### How to report

Report vulnerabilities privately through GitHub private vulnerability reporting: https://github.com/galfrevn/actionmcp/security/advisories/new

Do not open a public issue, pull request, or discussion for a vulnerability.

Include the following in your report:

- The actionmcp version or commit, and the Next.js, browser, or agent versions you used.
- Steps to reproduce, with a minimal app or code sample if you can provide one.
- The expected result and the actual result.
- The threat from the [threat model](documentation/security.md) that the issue maps to (T1 to T12), if you know it.

The maintainer aims to acknowledge reports within 7 days.

### Scope

In scope, with examples from the [threat model](documentation/security.md):

- A tool exposed without opt-in, such as a Server Function that becomes a tool without `agent()`, `tool()`, or `@agent` (T7).
- Bypassing the confirmation dialog, so a consequential tool runs without a human click (T2).
- Execution outside the native Server Function RPC, such as a new endpoint that runs actions (T4 and the non-negotiable defaults).
- Privilege escalation beyond the user's session (T4).
- Injection through tool metadata, such as a description or schema built from untrusted data (T11).

Out of scope:

- Vulnerabilities in browsers, agents, or Next.js itself. Report them to those projects.
- Missing authorization or ownership checks inside your own action. The action owns those checks (T5).

## Code of conduct

This project adopts the [Contributor Covenant, version 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) by reference. Read that page for the full text, the standards, and the enforcement guidelines.

### Reporting

Contact the maintainer, @galfrevn. A private contact address will be added before the first release.
