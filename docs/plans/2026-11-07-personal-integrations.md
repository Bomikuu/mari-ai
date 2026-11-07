# Personal integrations implementation plan

Goal: manage the user's day from Mari using real Google MCP and Pixelpop APIs.

Architecture: existing owner-authenticated Express routes expose bounded adapters. Google reads run in the existing worker queue; Pixelpop uses a private backend session. The frontend opens Today in the existing page context. Application code remains JavaScript/JSX, with no new provider billing or TypeScript.

Spec: `docs/specs/2026-11-07-personal-integrations.md`.

- [x] Inspect actual native Google tools and Pixelpop auth/data contracts.
- [x] Add Pixelpop session adapter and task, meal, goal, weight endpoints with contract tests.
- [x] Add read-only Google MCP worker, status/refresh/cancel routes, and failure tests.
- [x] Mount adapters after owner/CSRF protections and dispatch real Google jobs in the worker.
- [x] Add Today overview, tasks, nutrition, and connections UI using existing shadcn components.
- [x] Run focused/full tests and build, then a bounded desktop/mobile browser batch.
- [x] Independently review current screenshots and integration boundaries; apply one material fix batch if required.
- [x] Document connection setup, limitations, and refresh/restart instructions; refresh the local architecture snapshot.

Review focus: credentials never appear in JSON/logs; Google cannot call write tools; bills cannot be edited as tasks; null nutrition totals stay unknown; cached/partial/offline summaries do not claim freshness. Existing project processes and design approvals remain separate.
