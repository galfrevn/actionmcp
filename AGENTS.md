# AGENTS.md

Project: **actionmcp**. It converts Server Functions and routes in Next.js App Router apps into typed, opt-in, safe-by-default WebMCP tools.

The package is in `packages/actionmcp`. The fixture apps, the examples, and the benchmark import its `dist` folder.

## Start here

1. Read `documentation/architecture.md` (how it works and why) and `documentation/api-reference.md` (the public API).
2. Read `documentation/security.md` before you touch exposure, confirmation, or execution.
3. Read the "Development setup" section of `CONTRIBUTING.md` for the commands. Tests are described in `documentation/testing.md`.

## Conventions

- **Language:** documentation, code, error messages, and commit messages are in English.
- **Writing:** the "Writing documentation" section of `CONTRIBUTING.md` applies to every Markdown change. Documentation describes what exists. It has no roadmap, phases, status notes, or personal notes.
- **Code style:** no comments in source files. Write tests with every change. Verify codegen output with snapshots.
- **Commits:** lowercase Conventional Commits, one change per commit.
- **Security non-negotiables:**
  - strict opt-in;
  - `consequential` as the default for mutations;
  - human confirmation for consequential tools;
  - execution only through the native Server Function RPC, never through custom endpoints.
- **Architecture:** `src/core/` does not import `next/*`, `react`, or the other layers. A design decision that changes updates the "Design decisions" section of `documentation/architecture.md` in the same change.
- **External facts:** the WebMCP draft, browsers, and the AI SDK change often. Check the primary source before you rely on a fact about them.
- **Tooling:** pnpm, turbo, tsdown, vitest, Playwright, oxlint.
- **Do not:**
  - expose actions by default;
  - publish to npm from a local machine. Releases go through the `Release` workflow, as described in the "Releasing" section of `CONTRIBUTING.md`;
  - post publicly without the maintainer's approval;
  - invent benchmark results.
