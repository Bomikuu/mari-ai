# Personal integration evidence — November 7, 2026

## Google through native MCP

Verified installed Codex CLI 0.160.0 with native ChatGPT authentication. Its standalone app-server reports Gmail and Google Calendar enabled and callable through `app/installed`. The actual `codex_apps` MCP catalog exposes `gmail.search_emails`, `gmail.list_labels`, and `google_calendar.search_events`; those three exact read tools are the backend allowlist. Tool schemas are checked before calls. A dedicated ephemeral read-only thread permits direct MCP requests; no model turn, email send, calendar change, or API billing fallback occurs.

One bounded live brief succeeded: 20 unread email previews plus the actual INBOX unread count, and the current Asia/Manila day's calendar. Private content was not printed or placed in review screenshots; the isolated private verification database was deleted. A separate metadata-only check through the actual Mari API → job queue → worker completed successfully, proving the project-independent job path. This check did not read messages or events.

Official documentation consulted: [app-server](https://learn.chatgpt.com/docs/app-server), [MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [configuration](https://learn.chatgpt.com/docs/config-file/config-reference). Actual availability was established by the native runtime rather than inferred from documentation.

## Pixelpop

Canonical source: `/home/micxsz/projects/pixelpop`, inspected read-only after its repository instructions. Existing `/api/v1/finance/` endpoints provide session login/logout, task deadlines, meals, nutrition profile/summary, and weight records. Pixelpop's private views use Django session authentication and CSRF, so Mari uses a dedicated backend cookie jar. No Pixelpop code or security configuration changed.

The deployed public login endpoint returned HTTP 200 JSON with CSRF support. A real account sign-in remains the user's next action in Today → Connections. Actual account records were neither read nor changed for validation. Adapter tests use fake upstream responses; browser write checks use explicitly labeled synthetic data intercepted only in the test browser. Tasks retain Pixelpop's shared-workspace scope; nutrition remains account-scoped. No hydration endpoint exists in the audited source.

## Validation and corrections

- Production build passed; the existing dynamically loaded Three.js chunk retains Vite's size advisory.
- Final full test suite: 76 passed, 0 failed.
- Native Google data read and metadata-only queued worker check passed.
- Synthetic browser checks passed for sign-in error handling, task create/edit/complete/history/delete, multi-food meal edit without losing rows, meal create/delete, goal updates, weight logging, unknown nutrition totals, and return to the original workspace.
- First bounded visual batch: 18 desktop/mobile captures across light/dark setup, overview, task editor, and meal editor states. Document width matched each viewport and computed direct-text contrast checks had no failures, excluding disabled text. No application JavaScript errors were observed. One test harness storage error occurred on `about:blank`, not in the app.
- Independent source review found repeated partial Google failures advanced an already stale source's date; the fix preserves original provider provenance and has two failure/date-rollover regressions.
- End-to-end queue validation found an undefined project task ID reached SQLite for personal jobs; the worker now guards that lookup, with a project-independent execution regression and a successful real queued metadata job.
- Independent visual review disposition: ship for the supplied surface and evidence, with no material UI fixes.

Review artifacts: `.impeccable/review/personal/checks.json`, `docs/design/personal-finish-review.md`, and `docs/research/2026-11-07-personal-code-review.md`. The local architecture graph is structural evidence only; it does not certify API access or UI behavior.
