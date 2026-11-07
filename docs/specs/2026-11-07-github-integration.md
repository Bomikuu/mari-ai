# GitHub project integration

Add the recommended GitHub integration to Mari's existing single-page workspace. The selected local project should show open pull requests, the signed-in user's review requests, open issues, and observable checks for the local commit. Preserve the existing palette, avatar, project service controls, Google/Pixelpop features, and exact-image target implementation approvals.

Use the actual native Codex GitHub MCP connection and an exact read-tool allowlist. Do not start a model turn or copy OAuth credentials. No GitHub mutation, merge, comment, approval, or workflow rerun is included. Bound pull requests/issues to twenty each and review requests to ten; expose truncation. CI coverage must name the actual data read: legacy commit statuses and the connector's bounded PR-triggered workflow runs do not prove that every check passed.

Resolve GitHub.com repositories from registered project remotes, preferring an unambiguous origin. Support common HTTPS, SCP-style SSH, and SSH URL forms without returning embedded credentials. Ambiguous remotes require an explicit choice. Manual repository bindings persist per project without editing local Git configuration. Source association, commit identity, and cached results remain separate: changing the binding or commit cannot relabel an old snapshot as fresh data for a different repository.

Run GitHub reads in the existing worker queue with factual agent actions and cancellation. Preserve partial source results with their original fetch time; failures cannot refresh stale provenance. Project service jobs and Google jobs remain independent. Routes inherit owner pairing and CSRF protections, validate the project/repository, and return sanitized errors.

The GitHub context opens through horizontal workspace controls, with project selection available in place. Use official installed shadcn JSX controls and existing design tokens. Show connection state, repository/source, branch/commit, source links, bounds, freshness, and explicit refresh/cancel actions. Missing project/repository/access and offline/stale sources have clear recovery states. Do not automatically fetch account data simply because the pane is opened.

Validate parser boundaries, project scoping, relink/commit races, partial-source provenance, read-tool restrictions, cancellation, and worker execution without a task. Verify native metadata and one bounded public-repository read without publishing private data. Browser checks use Firefox and clearly labeled synthetic fixtures across desktop/mobile and light/dark states.
