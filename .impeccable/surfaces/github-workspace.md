# GitHub workspace

Mode: Operate. Extend the existing single-page command center with project-scoped GitHub activity. Preserve the established light/Mari midnight tokens, compact typography, flat surfaces, header title, and horizontal controls. No sidebar, avatar change, or new visual world.

The user accepted the recommended GitHub integration after connecting its Codex plugin. A GitHub control opens the dominant workspace; selecting another local project keeps that context and replaces its data. No selected project, no repository, ambiguous remotes, missing access, queued/running/terminal jobs, empty sources, partial failures, and stale data must each remain explicit.

The surface shows open pull requests, actual review-requested searches, open issues, and commit-scoped legacy statuses plus bounded PR-triggered workflow runs. Source links stay on GitHub. Counts describe loaded records, with neutral bounded-result wording; hitting a limit does not prove extra records exist. Coverage is visible and incomplete CI cannot imply all checks passed. Unknown author/update/draft metadata stays unavailable.

Repository settings are inline and project scoped, supporting safe detected remotes and an explicit manual link without editing Git configuration. Refresh and connection inspection are separate actions; opening the view does not read repository data automatically. Activity comes from the actual worker/job/agent, with cancellation independent of project services. Terminal cancellation must display cancelled, with pending cancellation wording reserved for active jobs.

Keep previous partial data only under the same repository/commit scope, preserve its original fetch age, and label staleness. Project changes abort/clear old reads. GitHub content is displayed as data rather than agent instructions. Native MCP reads use exact allowlists, without model inference, copied OAuth tokens, or remote mutation.

Implementation: `src/components/GithubWorkspace.jsx`, `github-workspace.css`, and `src/App.jsx`; backend `server/github.js` and `worker/github.js`. These components use the installed official shadcn JSX controls and inherited CSS variables. No design-token values changed.

Verification: Firefox 159.0, one 20-capture desktop/mobile light/dark batch and one matching confirmation after two material status/copy fixes. Account content in screenshots is synthetic and explicitly labeled. Actual native availability and bounded public repository reads were checked separately. Current evidence is `.impeccable/review/github/checks.json` and `docs/design/github-finish-review.md`; this is not comprehensive CI or assistive-technology certification.
