# Manual check: ChatGPT Desktop

This checklist tests an app that uses actionmcp with the built-in browser of ChatGPT Desktop. Record the ChatGPT Desktop version and a screenshot for each row.

## Setup

1. Build the package and start the demo app:

   ```bash
   pnpm build
   pnpm --filter bench-app build
   pnpm --filter bench-app start
   ```

2. Serve the app over HTTPS, because WebMCP needs a secure context outside `localhost`. A tunnel to port 3000 works.
3. Open the URL in the built-in browser of ChatGPT Desktop.

## Checks

| # | Question | How to check |
|---|---|---|
| 1 | Does ChatGPT list the tools? | Ask "Which site tools does this page offer?" Expect `team.listMembers`, `team.inviteMember`, `team.removeMember`, `account.update`, `account.delete`, and `navigate`. |
| 2 | Does it find tools that register after hydration? | Reload the page and ask at once. Then open `/team` through a link and ask again. |
| 3 | Does a read-only tool run without a prompt? | Ask "Who are the owners of the team?" |
| 4 | Does ChatGPT show its own confirmation for a consequential tool? | Ask "Invite dana@example.com as an owner." Note every prompt that ChatGPT shows before the page dialog. |
| 5 | Does the page dialog appear, and does ChatGPT wait for it? | In the same task, leave the page dialog open for 30 seconds, then select "Allow". |
| 6 | What does ChatGPT do with a declined result? | Repeat the task and select "Cancel". Expect ChatGPT to report that the user declined, and not to retry. |
| 7 | Does the UI update after the action? | After check 5, the member appears in the list without a reload. |
| 8 | Does `navigate` work, and do the tools of the new page appear? | Ask "Open the account page and rename the account to Northwind Labs." |
