# GitHub integration evidence — November 7, 2026

## Verified native capability

The installed native Codex app-server reports GitHub enabled and callable. The actual `codex_apps` catalog exposes read-only `github.get_repo`, `github.search_prs`, `github.search_issues`, `github.get_commit_combined_status`, and `github.fetch_commit_workflow_runs`. Mari validates the exact tool and its current input schema before calling it, using a dedicated ephemeral read-only MCP thread and no model turn.

A bounded public `openai/codex` sample succeeded for repository metadata, PR/issue lists, and real HEAD commit statuses/workflow runs. Anonymous read-only Git remote lookup supplied the public HEAD SHA for the CI probe. Only response field names, statuses, and counts were reported; no private repository content was copied into review artifacts. The native workflow response omitted a browser URL, so the reader constructs a validated repository Actions URL from its numeric run ID.

The actual Mari owner-protected API → queue → worker connection-inspection job also completed successfully, proving the project-scoped no-task execution path. It read native availability/catalog metadata without repository content. Native credentials remained in Codex storage.

## Scope and bounds

- PRs: up to 20 open records; actual review-requested search: up to 10; open issues: up to 20.
- Checks: up to 40 legacy statuses plus 40 first-page PR-triggered workflow runs for the local commit. This does not cover every workflow or check-run API. Empty or successful legacy statuses do not establish comprehensive CI success.
- Only GitHub.com repository links/remotes are supported in this version. Remote credentials are discarded before public data, jobs, settings, or events; manual credential-bearing URLs are rejected.
- Manual repository choices persist per project without local Git edits. In-flight reads validate their captured project path, binding version, repository and commit; relinking cancels only that project's GitHub work.
- Partial failures preserve original per-source cache age, with no reuse of check results from a different commit. Raw connector contents and diagnostics are excluded from agent logs.

## Validation

Production build passed. The full suite passed 98 tests. New tests cover owner/CSRF protection, remote parser boundaries, detached worktrees, ambiguous remotes, unchanged local Git configuration, concurrent queue deduplication, project cancellation boundaries, no-task worker execution, native read/schema restrictions, partial cache provenance, relink/HEAD changes, source normalization and CI coverage.

Firefox 159.0 verified the interface at 1440px desktop and 390px mobile in light/dark themes. One 20-state capture batch plus one matching confirmation had no horizontal document overflow, direct-text contrast failures (excluding disabled controls), or application JavaScript errors. Browser fixtures explicitly identify synthetic repository records and do not perform remote GitHub writes. UI controls tested repository linking, project switching without old-data leakage, PR/review/issue/check filters, cancellation, and stale source labels.

Independent source review identified a missing `startup_failure` attention classification; it was fixed before capture and verified in Firefox. The finite visual review identified two wording defects—terminal cancellation labeling and unproven extra-result claims. Both were fixed in one batch, rebuilt, and scored resolved in the confirmation verdict. No other material finding was identified within those review scopes.

Evidence: `.impeccable/review/github/checks.json`, archived first round under its `round1/`, `docs/design/github-finish-review.md`, and `docs/research/2026-11-07-github-code-review.md`. Architecture graph refresh used local AST extraction only, with zero model/provider calls; its structural snapshot does not certify runtime integration behavior.
