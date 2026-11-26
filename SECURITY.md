# Security policy

## Supported versions

No version is released yet, so no version is supported. After the first release, the planned policy is to support the latest minor version.

## How to report

Report vulnerabilities privately through GitHub private vulnerability reporting: https://github.com/galfrevn/actionmcp/security/advisories/new

Do not open a public issue, pull request, or discussion for a vulnerability.

Include the following in your report:

- The actionmcp version or commit, and the Next.js, browser, or agent versions you used.
- Steps to reproduce, with a minimal app or code sample if you can provide one.
- The expected result and the actual result.
- The threat from the [threat model](documentation/security.md) that the issue maps to (T1 to T12), if you know it.

The maintainer aims to acknowledge reports within 7 days.

## Scope

In scope, with examples from the [threat model](documentation/security.md):

- A tool exposed without opt-in, such as a Server Function that becomes a tool without `agent()`, `tool()`, or `@agent` (T7).
- Bypassing the confirmation dialog, so a consequential tool runs without a human click (T2).
- Execution outside the native Server Function RPC, such as a new endpoint that runs actions (T4 and the non-negotiable defaults).
- Privilege escalation beyond the user's session (T4).
- Injection through tool metadata, such as a description or schema built from untrusted data (T11).

Out of scope:

- Vulnerabilities in browsers, agents, or Next.js itself. Report them to those projects.
- Missing authorization or ownership checks inside your own action. The action owns those checks (T5).
