# AGENTS.md

Project: **actionmcp**. It converts Server Functions and routes in Next.js App Router apps into typed, opt-in, safe-by-default WebMCP tools.

**Status:** planning only. There is no code yet.

## Start here

1. Read `documentation/spec.md` (what and why) and `documentation/architecture.md` (how).
2. Read `documentation/security.md` before you touch exposure, confirmation, or execution.
3. Take the next open task from `documentation/roadmap.md`. The S0 spikes come first. Record spike results in its "Spike results" section.
4. Check `documentation/decisions.md` before you change anything it covers. Tests and the demo are in `documentation/testing.md`.

## Conventions

- **Language:** all documentation is in **English**: the README, every file in `documentation/`, decision records, and release notes. Code, comments, error messages, and commit messages are also in English ([ADR-007](documentation/decisions.md#adr-007-all-documentation-in-english)).
- **Writing:** the "Writing documentation" section of `CONTRIBUTING.md` applies to every Markdown change. Read it before you edit a Markdown file.
- **Private notes:** `documentation/internal/` is git-ignored. It holds private notes. Never commit it, and never quote it in public files.
- **Security non-negotiables:**
  - strict opt-in;
  - `consequential` as the default for mutations;
  - human confirmation for consequential tools;
  - execution only through the native Server Function RPC, never through custom endpoints ([security.md](documentation/security.md)).
- **Architecture:** `src/core/` does not import `next/*` or `react-dom/server` ([ADR-008](documentation/decisions.md#adr-008-framework-agnostic-core-one-package-in-v01)).
- **Decisions:** if you change a decision, update its record in `documentation/decisions.md` in the same change.
- **External facts:** the WebMCP, Chrome, and AI SDK specs change every week. Before you rely on a fact in `documentation/research.md`, check its date and its marker (**Verified**, **Secondary source**, or **Unverified**).
- **Recommended tooling:** pnpm, turbo, vitest, Playwright, oxlint. Write tests with every change. Verify codegen output with snapshots.
- **Do not:**
  - expose actions by default;
  - publish to npm or post publicly without the maintainer's approval;
  - invent benchmark results.
