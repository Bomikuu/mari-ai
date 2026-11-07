# GitHub integration implementation plan

Goal: connect local project context to actual GitHub repository activity.

Architecture: project-scoped owner-protected Express routes resolve and persist repository bindings. A dedicated native MCP reader runs through the existing worker queue and stores bounded source snapshots. A lazy JSX workspace presents these sources without navigation away from the command center.

Constraints: author JavaScript/JSX only; reuse official shadcn components and theme tokens; native subscription authentication, no inference/API-billing fallback; no remote writes or local Git edits; source truth and service ownership remain separate. Use Firefox for browser verification.

Spec: `docs/specs/2026-11-07-github-integration.md`.

- [x] Verify native GitHub availability and actual read schemas.
- [x] Implement repository resolution/bindings, read worker, scoped routes, and meaningful tests.
- [x] Wire the owner-protected API and worker queue, including personal-job-safe agent creation.
- [x] Build GitHub workspace with PR/review-request, issue, and check views.
- [x] Run relevant tests/build and one bounded Firefox capture batch.
- [x] Independently review integration boundaries and supplied visual evidence; resolve material findings.
- [x] Document setup/coverage, update local architecture graph, and clean isolated QA resources.

Review focus: credential-bearing remotes; ambiguous/moved repositories; result completion after relink; CI coverage gaps; repeated partial source failures; cancellation that must leave services untouched.
